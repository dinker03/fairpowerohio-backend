// app/api/trends/route.ts
import { cors, handleOptions } from "../../../lib/cors";
import { dbQuery } from "../../../lib/db";

export async function OPTIONS(request: Request) {
  return handleOptions(request);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const utility = (searchParams.get("utility") || "aep-ohio").toLowerCase();
  const term = parseInt(searchParams.get("term") || "12", 10);

  const origin = request.headers.get("origin");
  const headers = cors(origin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=86400");

  // Pull last 12 weeks, bucketed by week, with best/median offer for the given term
  // and the PTC (averaged within each week).
  const rows = await dbQuery<{
    date: string;
    best_fixed: number | null;
    median_fixed: number | null;
    ptc: number | null;
  }>(
    `
    with weeks as (
      select
        date_trunc('week', o.captured_at) as wk,
        min(o.rate_cents_per_kwh) as best,
        percentile_cont(0.5) within group (order by o.rate_cents_per_kwh) as median
      from offers o
      where o.utility_id = $1
        and o.product_type = 'fixed'
        and o.term_months = $2
      group by 1
      order by 1 desc
      limit 12
    ),
    ptc as (
      select
        date_trunc('week', p.captured_at) as wk,
        avg(p.ptc_cents_per_kwh) as ptc
      from ptc_snapshots p
      where p.utility_id = $1
      group by 1
    )
    select
      to_char(w.wk, 'YYYY-MM-DD') as date,
      round(w.best::numeric, 3)   as best_fixed,
      round(w.median::numeric, 3) as median_fixed,
      round(p.ptc::numeric, 3)    as ptc
    from weeks w
    left join ptc p on p.wk = w.wk
    order by date asc
    `,
    [utility, term]
  );

  // Map DB columns -> API shape expected by the frontend
  const points = rows.map(r => ({
    date: r.date,
    bestFixed: r.best_fixed ?? null,
    medianFixed: r.median_fixed ?? null,
    ptc: r.ptc ?? null,
  }));

  // If there’s no data yet, return a friendly 200 with empty points
  return new Response(JSON.stringify({ utility, term: String(term), points }), {
    status: 200,
    headers,
  });
}



