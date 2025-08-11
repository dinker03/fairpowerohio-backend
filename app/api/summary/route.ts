export const runtime = "edge";

import { cors, handleOptions } from "../../../lib/cors";
import { summary } from "../../../data/sample";

export async function OPTIONS(request: Request) {
  return handleOptions(request);
}

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  const headers = cors(origin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  // ✅ explicit CDN caching: 5 min, serve stale up to 24h while revalidating
  headers.set("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=86400");

  return new Response(JSON.stringify(summary), { status: 200, headers });
}
