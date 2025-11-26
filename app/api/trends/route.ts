import { NextResponse } from "next/server";
import { dbQuery } from "../../../lib/db";
import { cors } from "../../../lib/cors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  const headers = cors(origin);

  try {
    const sql = `
      WITH daily_stats AS (
        SELECT
          u.slug AS utility,
          o.day,
          
          -- Best Fixed Rate (Minimum)
          MIN(CASE 
            WHEN (o.plan ILIKE '%fixed%') 
            AND o.rate_cents_per_kwh > 0.1
            THEN o.rate_cents_per_kwh 
          END) as best_fixed,
          
          -- Median Fixed Rate
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY o.rate_cents_per_kwh) 
            FILTER (
              WHERE (o.plan ILIKE '%fixed%') 
              AND o.rate_cents_per_kwh > 0.1
            ) 
            as median_fixed,

          -- Price to Compare (PTC)
          MAX(CASE 
            WHEN o.supplier ILIKE '%Standard Offer%' 
            THEN o.rate_cents_per_kwh 
          END) as ptc_rate

        FROM offers o
        JOIN utilities u ON o.utility_id = u.id
        WHERE (o.term_months >= 6 OR o.supplier ILIKE '%Standard Offer%')
        GROUP BY u.slug, o.day
        ORDER BY o.day ASC
      )
      SELECT * FROM daily_stats;
    `;

    const rows = await dbQuery(sql);

    const trendsData: Record<string, any[]> = {};

    for (const row of rows) {
      const dateStr = new Date(row.day).toISOString().slice(0, 10);
      const key = row.utility; // Key by utility slug (e.g. 'aep-ohio', 'dominion-energy')

      if (!trendsData[key]) {
        trendsData[key] = [];
      }

      trendsData[key].push({
        date: dateStr,
        ptc: Number(row.ptc_rate) || null,
        bestFixed: Number(row.best_fixed) || 0,
        medianFixed: Number(row.median_fixed) || 0,
      });
    }

    return NextResponse.json({ trends: trendsData }, { headers });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers });
  }
}

export async function OPTIONS(request: Request) {
  const { handleOptions } = await import("../../../lib/cors");
  return handleOptions(request);
}