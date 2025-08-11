// lib/cors.ts
const ALLOWED = new Set([
  "https://YOURPROJECT.webflow.io",       // Webflow staging site (replace!)
  "https://www.fairenergyohio.com"        // Your future Webflow custom domain
]);

export function cors(origin: string | null) {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  });

  if (!origin) return headers;

  if (ALLOWED.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

export function handleOptions(request: Request) {
  const origin = request.headers.get("origin");
  const headers = cors(origin);
  // preflight OK
  return new Response(null, { status: 204, headers });
}
