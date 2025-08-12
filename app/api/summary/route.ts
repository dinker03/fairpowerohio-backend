export const runtime = "edge";

import { cors, handleOptions } from "../../../lib/cors";
import { summary } from "../../../data/sample";

export async function OPTIONS(request: Request) {
  return handleOptions(request);
}

import { cors, handleOptions } from "../../../lib/cors";
import { dbQuery } from "../../../lib/db";

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  const headers = cors(origin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=86400");

  const utility = "aep-ohio";
  const term = 12;

  // 1) Latest capture day that has any offers for this utility
  const latest = await dbQuery<{ d: string }>(
    `select date_trunc('day', max(captured_at)) as d
     from offers
     where utility_id = $1`,
    [utility]
  );
  const day = latest[0]?.d;

  if (!day) {
    return new Response(JSON.stringify({
      updatedAt: new Date().toISOString().slice(0,10),
      utilities: []
    }), { status: 200, headers });
  }

  // 2) Best & median for that day (fixed 12-month)
  const stats = await dbQuery<{ best: number|null; median: number|null }>(
    `with latest_offers as (
       select rate_cents_per_kwh
       from offers
       where utility_id = $1
         and product_type = 'fixed'
         and term_months = $2
         and date_trunc('day', captured_at) = $3::timestamptz
     )
     select
       min(rate_cents_per_kwh) as best,
       percentile_cont(0.5) within group (order by rate_cents_per_kwh) as median
     from latest_offers`,
    [utility, term, day]
  );

  // 3) Latest PTC snapshot (any time)
  const ptc = await dbQuery<{ ptc: number }>(
    `select ptc_cents_per_kwh as ptc
     from ptc_snapshots
     where utility_id = $1
     order by captured_at desc
     limit 1`,
    [utility]
  );

  const payload = {
    updatedAt: new Date().toISOString().slice(0,10),
    utilities: [{
      utility,
      commodity: "electric",
      customerClass: "residential",
      bestFixedCentsPerKwh: stats[0]?.best ?? null,
      medianFixedCentsPerKwh: stats[0]?.median ?? null,
      ptcCentsPerKwh: ptc[0]?.ptc ?? null,
      daysSinceLastChange: null
    }]
  };

  return new Response(JSON.stringify(payload), { status: 200, headers });
}

}
