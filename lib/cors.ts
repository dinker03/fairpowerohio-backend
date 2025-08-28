// lib/cors.ts

// Allow only your sites (add/remove as needed)
const ALLOWLIST = new Set<string>([
  "https://scotts-test-site-bf43b4.webflow.io", // ← replace with your actual Webflow staging origin
  "https://www.fairenergyohio.com", // ← add later when your custom Webflow domain is live
]);

export function cors(origin: string | null) {
  // Base headers sent on all responses
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  });

  // If request has an Origin and it's allowed, echo it back
  if (origin && ALLOWLIST.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

export function handleOptions(request: Request) {
  const origin = request.headers.get("origin");
  const headers = cors(origin);
  // preflight OK (no body)
  return new Response(null, { status: 204, headers });
}
