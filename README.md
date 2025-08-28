# FairPower Ohio – Backend (MVP)

Minimal Next.js (App Router) API-only backend exposing two JSON endpoints for Webflow embeds.

## Endpoints
- `GET /api/summary` – returns a snapshot of best/median vs PTC for AEP Ohio (sample data)
- `GET /api/trends?utility=aep-ohio&term=12` – returns a weekly 12-point series (sample data)

> CORS is permissive for MVP. Tighten `lib/cors.ts` to your domains before launch.

## Quick start (local)
```bash
npm i
npm run dev
# visit http://localhost:3000/api/summary
```

## Deploy to Vercel
1) Create a new GitHub repo and push these files.
2) Import the repo into Vercel (New Project → Framework Preset: Next.js).
3) Deploy. Test the endpoints from your browser:
   - `https://<your-project>.vercel.app/api/summary`
   - `https://<your-project>.vercel.app/api/trends?utility=aep-ohio&term=12`

## Webflow embed (example)
Place this inside an Embed block on your Webflow page (replace the domain inside `API_BASE`).

```html
<div id="fpo-summary"></div>
<canvas id="fpo-trend" width="600" height="320"></canvas>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
  (async function() {
    const API_BASE = "https://<your-project>.vercel.app";
    // Summary card
    const s = await fetch(API_BASE + "/api/summary").then(r => r.json());
    const u = s.utilities[0];
    document.getElementById("fpo-summary").innerHTML =
      `<strong>Best fixed:</strong> ${u.bestFixedCentsPerKwh}¢/kWh · ` +
      `<strong>Median:</strong> ${u.medianFixedCentsPerKwh}¢/kWh · ` +
      `<strong>PTC:</strong> ${u.ptcCentsPerKwh}¢/kWh`;

    // Trend chart (weekly points)
    const t = await fetch(API_BASE + "/api/trends?utility=aep-ohio&term=12").then(r => r.json());
    const labels = t.points.map(p => p.date);
    const best = t.points.map(p => p.bestFixed);
    const median = t.points.map(p => p.medianFixed);
    const ptc = t.points.map(p => p.ptc);

    const ctx = document.getElementById("fpo-trend").getContext("2d");
    new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Best fixed (¢/kWh)", data: best },
          { label: "Median fixed (¢/kWh)", data: median },
          { label: "PTC (¢/kWh)", data: ptc }
        ]
      },
      options: {
        responsive: true,
        scales: { y: { title: { display: true, text: "¢/kWh" }}},
        interaction: { mode: "nearest", intersect: false },
        plugins: { legend: { position: "bottom" } }
      }
    });
  })();
</script>
```

## Next steps
- Replace sample data with a database and ingestion pipeline.
- Tighten CORS to your domains.
- Add more utilities/terms and query params.
- Add caching headers on responses.
```

(Preview) last updated: Mon Aug 11 04:45:04 EDT 2025
