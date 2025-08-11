import { cors, handleOptions } from "@/lib/cors";
import { summary } from "@/data/sample";

export async function OPTIONS(request: Request) {
  return handleOptions(request);
}

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  const headers = cors(origin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(summary), { status: 200, headers });
}
