export default function Page() {
  return (
    <main style={{padding: 24, fontFamily: "ui-sans-serif, system-ui"}}>
      <h1>FairPower Ohio – API</h1>
      <p>This project exposes JSON endpoints for Webflow embeds.</p>
      <ul>
        <li><a href="/api/summary">/api/summary</a></li>
        <li><a href="/api/trends?utility=aep-ohio&term=12">/api/trends?utility=aep-ohio&term=12</a></li>
      </ul>
    </main>
  );
}
