// app/api/offers/latest/route.ts

import { cors, handleOptions } from "../../../../lib/cors";
import { dbQuery } from "../../../../lib/db";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return handleOptions(request);
}

export async function GET(request: Request) {
  const origin = request.headers.get("origin");

  try {
    // 1. First, find the most recent date we have data for.
    const latestDayResult = await dbQuery<{ max_day: string }>(
      `SELECT MAX(day) as max_day FROM offers`
    );

    const latestDay = latestDayResult[0]?.max_day;

    // 2. If the table is empty, return an empty array.
    if (!latestDay) {
      return new Response(JSON.stringify({ offers: [] }), {
        status: 200,
        headers: cors(origin),
      });
    }

    // 3. Fetch offers for that date, IGNORING 0.00 rates
    const offers = await dbQuery(
      `SELECT * FROM offers 
       WHERE day = $1 
       AND rate_cents_per_kwh > 0.1 -- <--- SAFETY FILTER ADDED HERE
       ORDER BY rate_cents_per_kwh ASC, monthly_fee ASC, supplier ASC`,
      [latestDay]
    );

    // 4. Return the list of offers as a JSON response.
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