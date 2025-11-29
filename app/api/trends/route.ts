import { NextResponse } from "next/server";
import { dbQuery } from "../../../lib/db";
import { cors } from "../../../lib/cors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  const headers = cors(origin);

  try {
    // 1. Fetch DAILY STATS for every Supplier + Utility combination
    // We group by Utility AND Supplier to allow detailed filtering.
    const sql = `
      SELECT
        u.slug AS utility_slug,
        u.display_name AS utility_name,
        o.supplier,
        o.day,
        o.unit,
        
        -- METRICS
        MIN(o.rate_cents_per_kwh) as min_rate,
        AVG(o.rate_cents_per_kwh) as avg_rate,
        MAX(o.rate_cents_per_kwh) as max_rate,
        
        -- Median Calculation (Approximate for performance)
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY o.rate_cents_per_kwh) as median_rate,

        -- Count offers to filter out noise if needed
        COUNT(*) as offer_count

      FROM offers o
      JOIN utilities u ON o.utility_id = u.id
      
      WHERE 
        o.rate_cents_per_kwh > 0.1  -- Ignore zero/bad data
        AND (o.term_months >= 3 OR o.supplier ILIKE '%Standard Offer%') -- Filter short terms
        -- Note: We allow all units (Gas/Electric) and filter in Frontend

      GROUP BY u.slug, u.display_name, o.supplier, o.day, o.unit
      ORDER BY o.day ASC;
    `;

    const rows = await dbQuery(sql);

    // 2. Organize Data for Frontend
    // Structure: { date: "2023-01-01", [key]: value, ... }
    // Key format: "utilitySlug|supplierName|metric"
    
    const dateMap = new Map<string, any>();

    for (const row of rows) {
      const dateStr = new Date(row.day).toISOString().slice(0, 10);
      
      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, { date: dateStr });
      }
      const entry = dateMap.get(dateStr);

      // Create unique keys for plotting
      // Format: "aep-ohio|Energy Harbor|min"
      const baseKey = `${row.utility_slug}|${row.supplier}`;
      
      entry[`${baseKey}|min`] = Number(row.min_rate);
      entry[`${baseKey}|avg`] = Number(row.avg_rate);
      entry[`${baseKey}|max`] = Number(row.max_rate);
      entry[`${baseKey}|median`] = Number(row.median_rate);
      entry[`${baseKey}|unit`] = row.unit; // Store unit to filter Gas vs Electric later
    }

    // Convert Map to Array
    const trendsData = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Extract Unique Lists for Filters
    const suppliers = Array.from(new Set(rows.map(r => r.supplier))).sort();
    const utilities = Array.from(new Set(rows.map(r => r.utility_slug))).sort();

    return NextResponse.json({ 
        trends: trendsData,
        meta: { suppliers, utilities }
    }, { headers });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500, headers });
  }
}

export async function OPTIONS(request: Request) {
  const { handleOptions } = await import("../../../lib/cors");
  return handleOptions(request);
}