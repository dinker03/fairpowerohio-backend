export const runtime = "edge";

import { cors, handleOptions } from "../../../lib/cors";
import { sampleTrends } from "../../../data/sample";

export async function OPTIONS(request: Request) {
  return handleOptions(request);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const utility = searchParams.get("utility") || "aep-ohio";
  const term = searchParams.get("term") || "12";
  const key = `${utility}:elec:res:term${term}`;

  const origin = request.headers.get("origin");
  const headers = cors(origin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  // ✅ same caching policy
  headers.set("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=86400");

  const data = (sampleTrends as Record<string, any[]>)[key];
  if (!data) {
    return new Response(JSON.stringify({ error: "No data for given params." }), { status: 404, headers });
  }
  return new Response(JSON.stringify({ utility, term, points: data }), { status: 200, headers });
}
