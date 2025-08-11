const DEFAULT_ALLOWED = ["*"]; // For MVP, allow all. Tighten later to your domains.

export function cors(origin: string | null) {
  // In production, replace with your domains:
  // const allowed = process.env.CORS_ORIGINS?.split(",") ?? DEFAULT_ALLOWED;
  const allowed = DEFAULT_ALLOWED;
  const isAllowed = allowed.includes("*") || (origin ? allowed.some(a => origin.endsWith(a)) : false);

  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  });

  if (isAllowed && origin) {
    headers.set("Access-Control-Allow-Origin", origin);
  } else if (allowed.includes("*")) {
    headers.set("Access-Control-Allow-Origin", "*");
  }

  return headers;
}

export function handleOptions(request: Request) {
  const origin = request.headers.get("origin");
  const headers = cors(origin);
  return new Response(null, { status: 204, headers });
}
