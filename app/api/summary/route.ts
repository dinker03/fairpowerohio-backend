export const runtime = "nodejs";

import { cors, handleOptions } from "../../../lib/cors";
import { Pool } from "pg";

export async function OPTIONS(request: Request) {
  return handleOptions(request);
}

const pooledUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
const pool = new Pool({ connectionString: pooledUrl });

type Row = { date: string; ptc: number; best_fixed: number; median_fixed: number };

async function runSummary(dateCol: "date" | "day", utility: string, term: number) {
  // NOTE: we inject the column name (validated) into the SQL strings
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

  // Join PT C on date (same day)
  const ptcByDate = new Map(ptcRows.map((r) => [r.date, r.ptc]));
  const points: Row[] = offerRows.map((r) => ({
    date: r.date,
    best_fixed: r.best_fixed,
    median_fixed: r.median_fixed,
    ptc: ptcByDate.get(r.date) ?? null,
  })) as any;

  return points;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const utility = searchParams.get("utility") || "aep-ohio";
  const term = Number(searchParams.get("term") || "12");
  const debug = searchParams.get("debug") === "1";

  const origin = request.headers.get("origin");
  const headers = cors(origin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=86400");

    try {
    let points: Row[];

    // Try with `date` first; if *anything* fails, retry with `day`
    try {
      points = await runSummary("date", utility, term);
    } catch (e: any) {
      console.warn("summary(date) failed, retrying with day:", e?.message || e);
      points = await runSummary("day", utility, term);
    }

    return new Response(JSON.stringify({
      utility,
      term: String(term),
      points: points.map(p => ({
        date: p.date,
        ptc: p.ptc,
        bestFixed: p.best_fixed,
        medianFixed: p.median_fixed,
      })),
    }), { status: 200, headers });

  } catch (err: any) {
    console.error("summary error:", err?.message || err);
    const body = (searchParams.get("debug") === "1")
      ? { error: "failed to build summary", detail: err?.message || String(err) }
      : { error: "failed to build summary" };
    return new Response(JSON.stringify(body), { status: 500, headers });
  }
}

    return new Response(JSON.stringify({
      utility,
      term: String(term),
      points: points.map(p => ({
        date: p.date,
        ptc: p.ptc,
        bestFixed: p.best_fixed,
        medianFixed: p.median_fixed,
      })),
    }), { status: 200, headers });

  } catch (err: any) {
    console.error("summary error:", err?.message || err);
    const body = debug ? { error: "failed to build summary", detail: err?.message || String(err) }
                       : { error: "failed to build summary" };
    return new Response(JSON.stringify(body), { status: 500, headers });
  }
}
