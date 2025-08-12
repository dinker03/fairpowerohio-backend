// scripts/ingest.js
// Minimal ingest that writes one PTC and two offers for today.
// Later: replace buildMockData() with real scraping logic.

const { Client } = require("pg");

function buildMockData() {
  // pretend these came from a scraper
  return {
    utility_id: "aep-ohio",
    ptc_cents_per_kwh: 11.489,
    offers: [
      { supplier: "Supplier A", product_type: "fixed", term_months: 12, rate_cents_per_kwh: 10.457 },
      { supplier: "Supplier B", product_type: "fixed", term_months: 12, rate_cents_per_kwh: 12.246 },
    ],
  };
}

// normalize to stable keys and "capture_day" at midnight UTC
function prepareRows(src) {
  const captureDay = new Date();
  captureDay.setUTCHours(0, 0, 0, 0); // daily dedupe anchor

  const offers = src.offers.map(o => ({
    utility_id: src.utility_id,
    supplier: o.supplier,
    product_type: o.product_type,
    term_months: o.term_months ?? null,
    rate_cents_per_kwh: o.rate_cents_per_kwh,
    offer_uid: `${src.utility_id}|${o.supplier}|${o.product_type}|${o.term_months ?? ""}|${o.rate_cents_per_kwh}`,
    captured_at: captureDay.toISOString(),
  }));

  const ptc = {
    utility_id: src.utility_id,
    ptc_cents_per_kwh: src.ptc_cents_per_kwh,
    captured_at: captureDay.toISOString(),
  };

  return { offers, ptc };
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL / DATABASE_URL_UNPOOLED is not set");

  const db = new Client({ connectionString: url });
  await db.connect();

  const src = buildMockData();
  const { offers, ptc } = prepareRows(src);

  // ensure utility exists (idempotent)
  await db.query(
    `insert into utilities (id, commodity, display_name)
     values ($1, 'electric', 'AEP Ohio')
     on conflict (id) do nothing`,
    [src.utility_id]
  );

  // insert PTC snapshot for today
  await db.query(
    `insert into ptc_snapshots (utility_id, ptc_cents_per_kwh, captured_at)
     values ($1, $2, $3)`,
    [ptc.utility_id, ptc.ptc_cents_per_kwh, ptc.captured_at]
  );

  // insert offers; dedupe by (offer_uid, captured_at). captured_at is the same midnight for all rows today.
  for (const o of offers) {
    await db.query(
      `insert into offers
       (utility_id, supplier, product_type, term_months, rate_cents_per_kwh, offer_uid, captured_at)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (offer_uid, captured_at) do nothing`,
      [o.utility_id, o.supplier, o.product_type, o.term_months, o.rate_cents_per_kwh, o.offer_uid, o.captured_at]
    );
  }

  console.log(`ingest ok: offers=${offers.length} ptc=1 day=${ptc.captured_at.slice(0,10)}`);
  await db.end();
}

main().catch(err => {
  console.error("ingest failed:", err.message);
  process.exit(1);
});
