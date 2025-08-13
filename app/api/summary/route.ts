export const runtime = "nodejs"; // pg needs Node, not Edge

import { Pool } from "pg";
import { cors, handleOptions } from "../../../lib/cors";

const pooledUrl =
  process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
const pool = new Pool({ connectionString: pooledUrl });

export async function OPTIONS(req: Request) {
  return handleOptions(req);
}

export async function GET(req: Request) {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  // cache at the edge for 5m; allow stale while revalidating for a day
  headers.set(
    "Cache-Control",
    "public, max-age=0, s-maxage=300, stale-while-revalidate=86400"
  );

  // For now we support a single utility; add more later as we ingest them
  const utility = "aep-ohio";
  const termMonths = 12;

  try {
    // 1) latest “market day” we have in offers for this utility/term
    const { rows: d1 } = await pool.query(
      `
      SELECT MAX(date) as max_day
      FROM offers
      WHERE utility = $1 AND term_months = $2
      `,
      [utility, termMonths]
    );
    const latestOffersDay: string | null = d1[0]?.max_day ?? null;

    // 2) best & median fixed for that day (if we have it)
    let bestFixed: number | null = null;
    let medianFixed: number | null = null;

    if (latestOffersDay) {
      const { rows: d2 } = await pool.query(
        `
        SELECT
          MIN(rate_cents_per_kwh)::float AS best_fixed,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rate_cents_per_kwh)::float AS median_fixed
        FROM offers
        WHERE utility = $1 AND term_months = $2 AND date = $3
        `,
        [utility, termMonths, latestOffersDay]
      );
      bestFixed = d2[0]?.best_fixed ?? null;
      medianFixed = d2[0]?.median_fixed ?? null;
    }

    // 3) current PTC and “days since last change”
    const { rows: p1 } = await pool.query(
      `
      SELECT date, cents_per_kwh::float AS ptc
      FROM ptc
      WHERE utility = $1
      ORDER BY date DESC
      LIMIT 1
      `,
      [utility]
    );

    const ptc = p1[0]?.ptc ?? null;
    const ptcDate: string | null = p1[0]?.date ?? null;

    // Find when PTC last changed (latest row where value differs from previous)
    // If we have window funcs available (Postgres 14+), this works great:
    const { rows: p2 } = await pool.query(
      `
      WITH diffs AS (
        SELECT
          date,
          cents_per_kwh,
          LAG(cents_per_kwh) OVER (ORDER BY date) AS prev_ptc
        FROM ptc
        WHERE utility = $1
        ORDER BY date
      )
      SELECT date
      FROM diffs
      WHERE prev_ptc IS DISTINCT FROM cents_per_kwh
      ORDER BY date DESC
      LIMIT 1
      `,
      [utility]
    );

    const lastChangeDate: string | null = p2[0]?.date ?? ptcDate ?? latestOffersDay;

    // updatedAt = the freshest thing we have
    const updatedAt = [latestOffersDay, ptcDate]
      .filter(Boolean)
      .sort() // ISO dates sort lexicographically
      .pop() as string | undefined;

    // daysSinceLastChange (fallback to 0 if we’re missing dates)
    let daysSinceLastChange = 0;
    if (ptcDate && lastChangeDate) {
      const dNow = new Date(ptcDate);
      const dPrev = new Date(lastChangeDate);
      daysSinceLastChange = Math.max(
        0,
        Math.round((+dNow - +dPrev) / (1000 * 60 * 60 * 24))
      );
    }

    const payload = {
      updatedAt: updatedAt ?? new Date().toISOString().slice(0, 10),
      utilities: [
        {
          utility,
          commodity: "electric",
          customerClass: "residential",
          bestFixedCentsPerKwh: bestFixed,
          medianFixedCentsPerKwh: medianFixed,
          ptcCentsPerKwh: ptc,
          daysSinceLastChange,
        },
      ],
    };

    return new Response(JSON.stringify(payload), { status: 200, headers });
  } catch (err: any) {
    console.error("summary error:", err?.message || err);
    return new Response(
      JSON.stringify({ error: "failed to build summary" }),
      { status: 500, headers }
    );
  }
}
