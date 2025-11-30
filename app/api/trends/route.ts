import { NextResponse } from "next/server";
import { dbQuery } from "../../../lib/db";
import { cors } from "../../../lib/cors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  const headers = cors(origin);

  try {
    // QUERY 1: Daily Market Trends
    const dailySql = `
      SELECT
        u.slug AS utility_slug,
        u.display_name AS utility_name,
        o.supplier,
        o.day,
        o.unit,
        MIN(o.rate_cents_per_kwh) as min_rate,
        AVG(o.rate_cents_per_kwh) as avg_rate,
        MAX(o.rate_cents_per_kwh) as max_rate,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY o.rate_cents_per_kwh) as median_rate,
        COUNT(*) as offer_count
      FROM offers o
      JOIN utilities u ON o.utility_id = u.id
      WHERE 
        o.rate_cents_per_kwh > 0.1
        AND (o.term_months >= 3 OR o.supplier ILIKE '%Standard Offer%')
      GROUP BY u.slug, u.display_name, o.supplier, o.day, o.unit
      ORDER BY o.day ASC;
    `;

    // QUERY 2: Historical PTC (Re-added)
    const historySql = `
      SELECT 
        utility_slug,
        start_date,
        end_date,
        price,
        unit,
        year
      FROM historical_ptc
      ORDER BY start_date ASC;
    `;

    const [dailyRows, historyRows] = await Promise.all([
      dbQuery(dailySql),
      dbQuery(historySql)
    ]);

    // Process Daily Trends
    const dateMap = new Map<string, any>();
    for (const row of dailyRows) {
      const dateStr = new Date(row.day).toISOString().slice(0, 10);
      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, { date: dateStr });
      }
      const entry = dateMap.get(dateStr);

      const baseKey = `${row.utility_slug}|${row.supplier}`;
      entry[`${baseKey}|min`] = Number(row.min_rate);
      entry[`${baseKey}|avg`] = Number(row.avg_rate);
      entry[`${baseKey}|max`] = Number(row.max_rate);
      entry[`${baseKey}|median`] = Number(row.median_rate);
      entry[`${baseKey}|unit`] = row.unit;
    }
    
    const trendsData = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Process History & Normalize Slugs
    const historyData: Record<string, any[]> = {};
    
    // Helper: "Illuminating Company" -> "illuminating-company"
    const toSlug = (str: string) => str.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    for (const row of historyRows) {
      let slug = row.utility_slug;
      // If it looks like a name (has spaces), slugify it
      if (slug.includes(' ')) slug = toSlug(slug);

      if (!historyData[slug]) historyData[slug] = [];
      
      // Handle price conversion if CSV was in dollars (0.07) but chart needs cents (7.0)
      const priceVal = Number(row.price);
      const finalPrice = (row.unit === '¢/kWh' || row.unit === 'kWh') && priceVal < 1 ? priceVal * 100 : priceVal;

      historyData[slug].push({
        date: new Date(row.start_date).toISOString().slice(0, 10),
        price: finalPrice,
        unit: row.unit,
        year: row.year
      });
    }

    const suppliers = Array.from(new Set(dailyRows.map(r => r.supplier))).sort();
    const utilities = Array.from(new Set(dailyRows.map(r => r.utility_slug))).sort();

    return NextResponse.json({ 
        trends: trendsData,
        history: historyData, // <--- Included in response
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