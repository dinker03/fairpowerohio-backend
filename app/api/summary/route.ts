export const runtime = "nodejs";

import { Pool } from "pg";
import { cors, handleOptions } from "../../../lib/cors";

export async function OPTIONS(request: Request) {
  return handleOptions(request);
}

const pooledUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
const pool = new Pool({ connectionString: pooledUrl });

// Validate simple identifiers like "utility", "utility_id", "date", "day", "captured_at::date"
function idPart(id: string) {
  if (!/^[a-z_]+(?:::[a-z_]+)?$/i.test(id)) throw new Error("invalid identifier");
  return id;
}

type OffersDayVariant = ["utility" | "utility_id", "date" | "day" | "captured_at::date"];
const OFFER_TRIES: OffersDayVariant[] = [
  ["utility", "date"],
  ["utility", "day"],
  ["utility", "captured_at::date"],
  ["utility_id", "date"],
  ["utility_id", "day"],
  ["utility_id", "captured_at::date"],
];

type PtcVariant = [
  "ptc" | "ptc_snapshots",
  "utility" | "utility_id",
  "date" | "day" | "captured_at::date",
  "cents_per_kwh" | "ptc_cents_per_kwh"
];
const PTC_TRIES: PtcVariant[] = [
  ["ptc", "utility", "date", "cents_per_kwh"],
  ["ptc", "utility", "day", "cents_per_kwh"],
  ["ptc", "utility", "captured_at::date", "cents_per_kwh"],
  ["ptc", "utility_id", "date", "cents_per_kwh"],
  ["ptc", "utility_id", "day", "cents_per_kwh"],
  ["ptc", "utility_id", "captured_at::date", "cents_per_kwh"],
  ["ptc_snapshots", "utility", "date", "ptc_cents_per_kwh"],
  ["ptc_snapshots", "utility", "day", "ptc_cents_per_kwh"],
  ["ptc_snapshots", "utility", "captured_at::date", "ptc_cents_per_kwh"],
  ["ptc_snapshots", "utility_id", "date", "ptc_cents_per_kwh"],
  ["ptc_snapshots", "utility_id", "day", "ptc_cents_per_kwh"],
  ["ptc_snapshots", "utility_id", "captured_at::date", "ptc_cents_per_kwh"],
];

// 1) Find latest offers day for utility+term using schema variants
async function findLatestOffersDay(
  utilityVal: string,
  termMonths: number
): Promise<{ day: string; utilCol: OffersDayVariant[0]; dateExpr: OffersDayVariant[1] } | null> {
  for (const [utilCol, dateExpr] of OFFER_TRIES) {
    const sql = `
      SELECT to_char(MAX(${idPart(dateExpr)}), 'YYYY-MM-DD') AS day
      FROM offers
      WHERE ${idPart(utilCol)} = $1 AND term_months = $2
    `;
    try {
      const { rows } = await pool.query(sql, [utilityVal, termMonths]);
      const day = rows[0]?.day as string | null;
      if (day) return { day, utilCol, dateExpr };
    } catch {
      // try next variant
    }
  }
  return null;
}

// 2) Compute best + median for that exact offers day
async function getOfferStatsForDay(
  utilityVal: string,
  termMonths: number,
  utilCol: OffersDayVariant[0],
  dateExpr: OffersDayVariant[1],
  day: string
): Promise<{ best: number | null; median: number | null }> {
  const sql = `
    SELECT
      MIN(o.rate_cents_per_kwh)::float AS best,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY o.rate_cents_per_kwh)::float AS median
    FROM offers o
    WHERE o.${idPart(utilCol)} = $1
      AND o.term_months = $2
      AND to_char(o.${idPart(dateExpr)}, 'YYYY-MM-DD') = $3
  `;
  const { rows } = await pool.query(sql, [utilityVal, termMonths, day]);
  return { best: rows[0]?.best ?? null, median: rows[0]?.median ?? null };
}

// 3) Get PTC from the closest previous-or-equal day
async function findClosestPtcOnOrBefore(
  utilityVal: string,
  offersDay: string
): Promise<number | null> {
  for (const [table, utilCol, dateExpr, valueCol] of PTC_TRIES) {
    const util = `p.${idPart(utilCol)}`;
    const dateE = `p.${idPart(dateExpr)}`;
    const val = `p.${idPart(valueCol)}`;

    const sql = `
      SELECT ${val}::float AS ptc
      FROM ${table} p
      WHERE ${util} = $1
        AND to_char(${dateE}, 'YYYY-MM-DD') <= $2
      ORDER BY ${dateE} DESC
      LIMIT 1
    `;
    try {
      const { rows } = await pool.query(sql, [utilityVal, offersDay]);
      if (rows.length) return rows[0].ptc as number;
    } catch {
      // try next variant
    }
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const utility = (searchParams.get("utility") || "aep-ohio").toLowerCase();
  const term = parseInt(searchParams.get("term") || "12", 10);

  const origin = request.headers.get("origin");
  const headers = cors(origin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=86400");

  try {
    const latest = await findLatestOffersDay(utility, term);
    if (!latest) {
      // legacy shape with empty utilities array
      return new Response(JSON.stringify({
        updatedAt: new Date().toISOString().slice(0,10),
        utilities: []
      }), { status: 200, headers });
    }

    const { day, utilCol, dateExpr } = latest;
    const stats = await getOfferStatsForDay(utility, term, utilCol, dateExpr, day);
    const ptc = await findClosestPtcOnOrBefore(utility, day);

    // === Legacy-compatible payload ===
    const payload = {
      updatedAt: day,
      utilities: [{
        utility,
        commodity: "electric",
        customerClass: "residential",
        bestFixedCentsPerKwh: stats.best ?? null,
        medianFixedCentsPerKwh: stats.median ?? null,
        ptcCentsPerKwh: ptc ?? null,
        // If you want, we can compute this later from ptc history:
        daysSinceLastChange: null
      }],
      // convenience extras for future use (won't break old code)
      current: {
        date: day,
        bestFixed: stats.best ?? null,
        medianFixed: stats.median ?? null,
        ptc: ptc ?? null
      }
    };

    return new Response(JSON.stringify(payload), { status: 200, headers });
  } catch (err: any) {
    console.error("summary error:", err?.message || err);
    const debug = searchParams.get("debug") === "1";
    return new Response(
      JSON.stringify(debug ? { error: "failed to build summary", detail: err?.message || String(err) } : { error: "failed to build summary" }),
      { status: 500, headers }
    );
  }
}
