import { NextResponse } from "next/server";
import { dbQuery } from "../../../lib/db";
import { cors } from "../../../lib/cors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  const headers = cors(origin);

  try {
    const sql = `
      WITH utility_daily_stats AS (
        SELECT
          u.slug AS utility,
          o.day,
          
          -- 1. LOCAL MEDIAN (The "Market Average" for this area)
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY o.rate_cents_per_kwh) 
            FILTER (
              WHERE (o.plan ILIKE '%fixed%') 
              AND o.rate_cents_per_kwh > 0.1
              AND o.unit = '¢/kWh'
              AND o.term_months >= 3
            ) 
            as median_fixed,

          -- 2. LOCAL MINIMUM (The "Best Price" for this area)
          MIN(CASE 
            WHEN (o.plan ILIKE '%fixed%') 
            AND o.rate_cents_per_kwh > 0.1
            AND o.unit = '¢/kWh'
            AND o.term_months >= 3
            THEN o.rate_cents_per_kwh 
          END) as local_min_fixed,

          -- 3. PRICE TO COMPARE (The Default Rate)
          MAX(CASE 
            WHEN o.supplier ILIKE '%Standard Offer%' 
            AND o.unit = '¢/kWh'
            THEN o.rate_cents_per_kwh 
          END) as ptc_rate

        FROM offers o
        JOIN utilities u ON o.utility_id = u.id
        
        WHERE o.unit = '¢/kWh' -- Electric Trends Only for now
        GROUP BY u.slug, o.day
        ORDER BY o.day ASC
      )
      SELECT uds.* FROM utility_daily_stats uds
      WHERE uds.median_fixed IS NOT NULL;
    `;

    const rows = await dbQuery(sql);

    // Transform DB Rows into Chart Format
    const trendsData: Record<string, any[]> = {};
    for (const row of rows) {
      const dateStr = new Date(row.day).toISOString().slice(0, 10);
      const key = row.utility;

      if (!trendsData[key]) { trendsData[key] = []; }
      
      trendsData[key].push({
        date: dateStr,
        ptc: Number(row.ptc_rate) || null,
        utilityMedian: Number(row.median_fixed) || 0,
        localBestFixed: Number(row.local_min_fixed) || 0, 
      });
    }

    return NextResponse.json({ trends: trendsData }, { headers });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500, headers });
  }
}

export async function OPTIONS(request: Request) {
  const { handleOptions } = await import("../../../lib/cors");
  return handleOptions(request);
}