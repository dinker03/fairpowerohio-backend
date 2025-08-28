// app/api/debug/db/route.ts
import { dbQuery } from "../../../../lib/db";

export async function GET() {
  try {
    const now = await dbQuery<{ now: string }>("select now()");
    return new Response(JSON.stringify({ ok: true, now: now[0].now }), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}
