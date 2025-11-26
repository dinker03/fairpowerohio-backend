import { cors, handleOptions } from "../../../../lib/cors";
import { dbQuery } from "../../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = request.headers.get("origin");

  try {
    // 1. Get the latest date
    const latestDayResult = await dbQuery<{ max_day: string }>(
      `SELECT MAX(day) as max_day FROM offers`
    );
    const latestDay = latestDayResult[0]?.max_day;

    if (!latestDay) {
      return new Response(JSON.stringify({ offers: [] }), {
        status: 200,
        headers: cors(origin),
      });
    }

    // 2. Fetch Offers + Utility Name (The JOIN fixes the ID issue)
    const offers = await dbQuery(
      `SELECT 
         o.*, 
         u.display_name as utility_name, 
         u.commodity as utility_type
       FROM offers o
       JOIN utilities u ON o.utility_id = u.id
       WHERE o.day = $1 
       AND o.rate_cents_per_kwh > 0.1
       ORDER BY o.rate_cents_per_kwh ASC, o.monthly_fee ASC, o.supplier ASC`,
      [latestDay]
    );

    return new Response(JSON.stringify({ offers }), {
      status: 200,
      headers: cors(origin),
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: cors(origin),
    });
  }
}

export async function OPTIONS(request: Request) {
  return handleOptions(request);
}