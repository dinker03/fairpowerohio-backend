import { NextResponse } from "next/server";
import { dbQuery } from "../../../lib/db"; // Ensure this path matches where you put db.ts
import { cors } from "../../../lib/cors"; // Ensure this matches where you put cors.ts

export const dynamic = "force-dynamic"; // Prevent Vercel from caching this forever

export async function GET(request: Request) {
  // 1. Handle CORS
  const origin = request.headers.get("origin");
  const headers = cors(origin);

  try {
    // 2. Run the "Trends" Query
    // This calculates daily stats for Fixed plans (term >= 6 months)
    const sql = `
      WITH daily_stats AS (
        SELECT
          u.slug AS utility,
          o.day,
          -- Best Fixed Rate (Minimum)
          MIN(CASE 
            WHEN (o.plan ILIKE '%fixed%' OR o.product_type ILIKE '%fixed%') 
            AND o.rate_cents_per_kwh > 0.0  -- <-- ADD THIS CHECK
            THEN o.rate_cents_per_kwh 
          END) as best_fixed,
          
          -- Median Fixed Rate (Statistical Middle)
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY o.rate_cents_per_kwh) 
            FILTER (WHERE (o.plan ILIKE '%fixed%' OR o.product_type ILIKE '%fixed%')) 
            as median_fixed,

          -- "Price to Compare" (PTC)
          -- We assume the utility itself (e.g. 'AEP Ohio') is the PTC provider.
          -- Adjust 'AEP Ohio' string if the scraper saves it differently.
          MAX(CASE WHEN o.supplier ILIKE 'AEP Ohio%' THEN o.rate_cents_per_kwh END) as ptc_rate
        FROM offers o
        JOIN utilities u ON o.utility_id = u.id
        WHERE (o.term_months >= 6 OR o.supplier ILIKE 'AEP Ohio%') -- Filter out short-term/variable noise
        GROUP BY u.slug, o.day
        ORDER BY o.day ASC
      )
      SELECT * FROM daily_stats;
    `;

    const rows = await dbQuery(sql);

    // 3. Transform DB Rows into 'sample.ts' Format
    const trendsData: Record<string, any[]> = {};
    const latestByUtility: Record<string, any> = {};

    for (const row of rows) {
      // Helper to format date as YYYY-MM-DD
      const dateStr = new Date(row.day).toISOString().slice(0, 10);
      
      // Construct the key (e.g., 'aep-ohio:elec:res:term12')
      // Note: We hardcode :elec:res:term12 for now to match your frontend expectation,
      // but you could make this dynamic later.
      const key = `${row.utility}:elec:res:term12`;

      if (!trendsData[key]) {
        trendsData[key] = [];
      }

      // Add the point
      trendsData[key].push({
        date: dateStr,
        ptc: Number(row.ptc_rate) || 0,
        bestFixed: Number(row.best_fixed) || 0,
        medianFixed: Number(row.median_fixed) || 0,
      });

      // Track latest stats for the summary
      latestByUtility[row.utility] = {
        utility: row.utility,
        commodity: "electric",
        customerClass: "residential",
        bestFixedCentsPerKwh: Number(row.best_fixed) || 0,
        medianFixedCentsPerKwh: Number(row.median_fixed) || 0,
        ptcCentsPerKwh: Number(row.ptc_rate) || 0,
        updatedAt: dateStr,
      };
    }

    // 4. Build the Final JSON
    const responseData = {
      sampleTrends: trendsData, // Renamed to match your frontend prop? Or keep as 'trends'?
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

// 5. Handle OPTIONS (Pre-flight check for CORS)
export async function OPTIONS(request: Request) {
  const { handleOptions } = await import("../../../lib/cors");
  return handleOptions(request);
}