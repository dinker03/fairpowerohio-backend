export const runtime = "nodejs";

import { cors, handleOptions } from "../../../lib/cors";
import { Pool } from "pg";

export async function OPTIONS(request: Request) {
  return handleOptions(request);
}

// Prefer pooled URL; fall back to unpooled if needed
const pooledUrl =
  process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;

const pool = new Pool({ connectionString: pooledUrl });

type Row = {
  date: string;
  ptc: number | null;
  best_fixed: number;
  median_fixed: number;
};

/**
 * Build summary rows for the most-recent day that has data.
 * We support either a real "date" column or a "day" column,
 * chosen by the `dateCol` argument.
 */
async function runSummary(
  dateCol: "date" | "day",
  utility: string,
  term: number
): Promise<Row[]> {
  // latest offers (min + median) for that day
  const latestOffersSQL = `
    WITH latest AS (
      SELECT MAX(${dateCol}) AS d
      FROM offers
      WHERE utility = $1 AND term_months = $2
    )
    SELECT
      to_char(o.${dateCol}, 'YYYY-MM-DD') AS date,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY o.rate_cents_per_kwh)::float AS median_fixed,
      MIN(o.rate_cents_per_kwh)::float AS best_fixed
    FROM offers o, latest
    WHERE o.utility = $1 AND o.term_months = $2 AND o.${dateCol} = latest.d
    GROUP BY o.${dateCol}
    ORDER BY o.${dateCol} ASC
  `;

  // latest PTC for that day (same day join)
  const latestPtcSQL = `
    WITH latest AS (
      SELECT MAX(${dateCol}) AS d
      FROM ptc
      WHERE utility = $1
    )
    SELECT
      to_char(p.${dateCol}, 'YYYY-MM-DD') AS date,
      p.cents_per_kwh::float AS ptc
    FROM ptc p, latest
    WHERE p.utility = $1 AND p.${dateCol} = latest.d
  `;

  const [{ rows: offerRows }, { rows: ptcRows }] = await Promise.all([
    pool.query(latestOffersSQL, [utility, term]),
    pool.query(latestPtcSQL, [utility]),
  ]);

  const ptcByDate = new Map<string, number>(
    ptcRows.map((r: any) => [r.date as string, r.ptc as number])
  );

  const points: Row[] = offerRows.map((r: any) => ({
    date: r.date as string,
    best_fixed: r.best_fixed as number,
    median_fixed: r.median_fixed as number,
    ptc: ptcByDate.get(r.date) ?? null,
  }));

  return points;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const utility = searchParams.get("utility") ?? "aep-ohio";
  const term = parseInt(searchParams.get("term") ?? "12", 10);

  const origin = request.headers.get("origin");
  const headers = cors(origin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set(
    "Cache-Control",
    "public, max-age=0, s-maxage=300, stale-while-revalidate=86400"
  );

  try {
    let points: Row[];

    // Try with `date`; if it fails (e.g., column doesn’t exist), retry with `day`
    try {
      points = await runSummary("date", utility, term);
    } catch (e: any) {
      console.warn("summary(date) failed, retrying with day:", e?.message || e);
      points = await runSummary("day", utility, term);
    }

    return new Response(
      JSON.stringify({
        utility,
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
