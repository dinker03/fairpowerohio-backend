export const runtime = "nodejs";

import { Pool } from "pg";
import { cors, handleOptions } from "../../../lib/cors";

export async function OPTIONS(request: Request) {
  return handleOptions(request);
}

const pooledUrl =
  process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
const pool = new Pool({ connectionString: pooledUrl });

type Point = {
  date: string;
  best_fixed: number | null;
  median_fixed: number | null;
  ptc: number | null;
};

function qIdent(id: string) {
  // very small whitelist guard for dynamic identifiers
  if (!/^[a-z_]+(?:::[a-z_]+)?$/i.test(id)) throw new Error("invalid identifier");
  return id;
}

async function tryOffersSummary(opts: {
  utilityCol: "utility" | "utility_id";
  dateExpr: "date" | "day" | "captured_at::date";
  utilityValue: string;
  termMonths: number;
}): Promise<{ date: string; best_fixed: number | null; median_fixed: number | null }[]> {
  const { utilityCol, dateExpr, utilityValue, termMonths } = opts;

  const sql = `
    WITH latest AS (
      SELECT MAX(${qIdent(dateExpr)}) AS d
      FROM offers
      WHERE ${qIdent(utilityCol)} = $1 AND term_months = $2
    )
    SELECT
      to_char(o.${qIdent(dateExpr)}, 'YYYY-MM-DD') AS date,
      MIN(o.rate_cents_per_kwh)::float AS best_fixed,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY o.rate_cents_per_kwh)::float AS median_fixed
    FROM offers o, latest
    WHERE o.${qIdent(utilityCol)} = $1
      AND o.term_months = $2
      AND o.${qIdent(dateExpr)} = latest.d
    GROUP BY o.${qIdent(dateExpr)}
    ORDER BY o.${qIdent(dateExpr)} ASC
  `;

  const { rows } = await pool.query(sql, [utilityValue, termMonths]);
  return rows;
}

async function tryPtcForDay(opts: {
  table: "ptc" | "ptc_snapshots";
  utilityCol: "utility" | "utility_id";
  dateExpr: "date" | "day" | "captured_at::date";
  valueCol: "cents_per_kwh" | "ptc_cents_per_kwh";
  utilityValue: string;
}): Promise<{ date: string; ptc: number }[]> {
  const { table, utilityCol, dateExpr, valueCol, utilityValue } = opts;

  const sql = `
    WITH latest AS (
      SELECT MAX(${qIdent(dateExpr)}) AS d
      FROM ${table}
      WHERE ${qIdent(utilityCol)} = $1
    )
    SELECT
      to_char(p.${qIdent(dateExpr)}, 'YYYY-MM-DD') AS date,
      ${qIdent(`p.${valueCol}`)}::float AS ptc
    FROM ${table} p, latest
    WHERE p.${qIdent(utilityCol)} = $1
      AND p.${qIdent(dateExpr)} = latest.d
  `;

  const { rows } = await pool.query(sql, [utilityValue]);
  return rows;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const utilityParam = (searchParams.get("utility") || "aep-ohio").toLowerCase();
  const term = parseInt(searchParams.get("term") || "12", 10);

  const origin = request.headers.get("origin");
  const headers = cors(origin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set(
    "Cache-Control",
    "public, max-age=0, s-maxage=300, stale-while-revalidate=86400"
  );

  // Try offers in this order (utility column, date expression)
  const offerAttempts: Array<["utility" | "utility_id", "date" | "day" | "captured_at::date"]> = [
    ["utility", "date"],
    ["utility", "day"],
    ["utility", "captured_at::date"],
    ["utility_id", "date"],
    ["utility_id", "day"],
    ["utility_id", "captured_at::date"],
  ];

  // Try ptc in this order (table, utility col, date expr, value col)
  const ptcAttempts: Array<["ptc" | "ptc_snapshots", "utility" | "utility_id", "date" | "day" | "captured_at::date", "cents_per_kwh" | "ptc_cents_per_kwh"]> =
    [
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

  try {
    // 1) OFFERS: find best + median for the latest day that has data
    let offersRows: Array<{ date: string; best_fixed: number | null; median_fixed: number | null }> =
      [];
    let offersErr: any = null;

    for (const [utilCol, dateExpr] of offerAttempts) {
      try {
        const rows = await tryOffersSummary({
          utilityCol: utilCol,
          dateExpr,
          utilityValue: utilityParam,
          termMonths: term,
        });
        offersRows = rows;
        offersErr = null;
        if (rows.length) break;
      } catch (e: any) {
        offersErr = e;
        // try next variant
      }
    }

    if (!offersRows.length && offersErr) throw offersErr;

    // 2) PTC: fetch the most recent day (matching the offers day where possible)
    let ptcRows: Array<{ date: string; ptc: number }> = [];
    let ptcErr: any = null;

    for (const [table, utilCol, dateExpr, valueCol] of ptcAttempts) {
      try {
        const rows = await tryPtcForDay({
          table,
          utilityCol: utilCol,
          dateExpr,
          valueCol,
          utilityValue: utilityParam,
        });
        ptcRows = rows;
        ptcErr = null;
        if (rows.length) break;
      } catch (e: any) {
        ptcErr = e;
        // try next variant
      }
    }
    if (!ptcRows.length && ptcErr) {
      // not fatal — we can still return offers without ptc
      console.warn("summary: no PTC row found via known variants:", ptcErr?.message || ptcErr);
    }

    const ptcByDate = new Map(ptcRows.map((r) => [r.date, r.ptc]));
    const points: Point[] = offersRows.map((r) => ({
      date: r.date,
      best_fixed: r.best_fixed ?? null,
      median_fixed: r.median_fixed ?? null,
      ptc: ptcByDate.get(r.date) ?? null,
    }));

    return new Response(
      JSON.stringify({
        utility: utilityParam,
        term: String(term),
        points: points.map((p) => ({
          date: p.date,
          ptc: p.ptc,
          bestFixed: p.best_fixed,
          medianFixed: p.median_fixed,
        })),
      }),
      { status: 200, headers }
    );
  } catch (err: any) {
    console.error("summary error:", err?.message || err);
    const body =
      searchParams.get("debug") === "1"
        ? { error: "failed to build summary", detail: err?.message || String(err) }
        : { error: "failed to build summary" };
    return new Response(JSON.stringify(body), { status: 500, headers });
  }
}
