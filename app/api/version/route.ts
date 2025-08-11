// app/api/version/route.ts

export async function GET() {
  const payload = {
    env: process.env.VERCEL_ENV || "unknown",
    sha: process.env.VERCEL_GIT_COMMIT_SHA || "unknown",
    ref: process.env.VERCEL_GIT_COMMIT_REF || "unknown",
    msg: process.env.VERCEL_GIT_COMMIT_MESSAGE || "",
    deployedAt: new Date().toISOString()
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=60"
    }
  });
}
