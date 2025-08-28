// app/api/debug/route.ts
export async function GET() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
