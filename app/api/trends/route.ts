import { NextResponse } from "next/server";
// CORRECTION: Only use 3 sets of dots here
import { dbQuery } from "../../../lib/db";
import { cors } from "../../../lib/cors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  const headers = cors(origin);

  try {
    // We updated the DB to remove 'product_type', so we must remove it here too.
    const sql = `
      WITH daily_stats AS (
        SELECT
          u.slug AS utility,
          o.day,
          
          -- Best Fixed Rate (Minimum)
          MIN(CASE 
            WHEN (o.plan ILIKE '%fixed%') 
            AND o.rate_cents_per_kwh > 0.1
            AND o.unit = '¢/kWh' -- Only calculate trends for Electric (Cents)
            THEN o.rate_cents_per_kwh 
          END) as best_fixed,
          
          -- Median Fixed Rate
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY o.rate_cents_per_kwh) 
            FILTER (
              WHERE (o.plan ILIKE '%fixed%') 
              AND o.rate_cents_per_kwh > 0.1
              AND o.unit = '¢/kWh'
            ) 
            as median_fixed,

          -- Price to Compare (PTC)
          MAX(CASE 
            WHEN o.supplier ILIKE '%Standard Offer%' 
            AND o.unit = '¢/kWh'
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

    // Transform DB Rows into Chart Format
    const trendsData: Record<string, any[]> = {};
    const latestByUtility: Record<string, any> = {};

    for (const row of rows) {
      const dateStr = new Date(row.day).toISOString().slice(0, 10);
      const key = `${row.utility}:elec:res:term12`;

      if (!trendsData[key]) {
        trendsData[key] = [];
      }

      trendsData[key].push({
        date: dateStr,
        ptc: Number(row.ptc_rate) || null,
        bestFixed: Number(row.best_fixed) || 0,
        medianFixed: Number(row.median_fixed) || 0,
      });

      latestByUtility[row.utility] = {
        utility: row.utility,
        bestFixed: Number(row.best_fixed) || 0,
        medianFixed: Number(row.median_fixed) || 0,
        ptc: Number(row.ptc_rate) || 0,
        updatedAt: dateStr,
      };
    }

    const responseData = {
      sampleTrends: trendsData,
      summary: {
        updatedAt: new Date().toISOString().slice(0, 10),
        utilities: Object.values(latestByUtility),
      },
    };

    return NextResponse.json(responseData, { headers });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500, headers }
    );
  }
}

export async function OPTIONS(request: Request) {
  // CORRECTION: Use 3 sets of dots here too
  const { handleOptions } = await import("../../../lib/cors");
  return handleOptions(request);
}