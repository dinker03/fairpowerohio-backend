// scripts/ingest.js
// Usage:
//   node scripts/ingest.js --dry     (prints parsed offers, no DB writes)
//   node scripts/ingest.js           (writes to DB if DATABASE_URL_UNPOOLED is set)
//
// NOTES:
// - All requests go through Zyte to protect your own IP.
// - We try plain HTTP via Zyte first (cheaper/faster), then automatically fall back to Zyte browser rendering if needed.
// - Update TARGETS[0].url to the exact Apples-to-Apples page you want to parse.
// - Update parseOffers() selectors after inspecting the real DOM in your browser.
//
// ENV VARS:
//   ZYTE_API_KEY              (required) Your Zyte API token
//   DATABASE_URL_UNPOOLED     (optional for local writes; GH Actions should already have this secret)

import 'dotenv/config';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { Client } from 'pg';

const ZYTE_KEY = process.env.ZYTE_API_KEY;
const DB_URL   = process.env.DATABASE_URL_UNPOOLED;
const dry = process.argv.includes('--dry');

if (!ZYTE_KEY) {
  console.error('Missing ZYTE_API_KEY (set in .env.local or GitHub Actions secrets)');
  process.exit(1);
}
if (!dry && !DB_URL) {
  console.error('Missing DATABASE_URL_UNPOOLED for DB writes (or run with --dry)');
  process.exit(1);
}

// ======= CONFIG =======
const TARGETS = [
  {
    utility: 'aep-ohio',
    termMonths: 12,
    // TODO: Replace with the actual Apples-to-Apples page you want to scrape first.
    // You can add more entries later for other utilities/terms.
    url: 'https://energychoice.ohio.gov/ApplesToApplesCategory.aspx?Category=Electric'
  }
];

// Polite, identifiable UA (good citizenship)
const USER_AGENT = 'FairEnergyOhioBot/1.0 (+contact: you@example.com)';

// Random polite pacing to avoid bursty behavior
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function jitter(minMs, maxMs) {
  const span = maxMs - minMs;
  return minMs + Math.floor(Math.random() * span);
}

// === Zyte HTML fetcher ===
async function zyteGetHtml(url, { render = false, timeoutMs = 60000 } = {}) {
  const res = await fetch('https://api.zyte.com/v1/extract', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ZYTE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url,
      httpResponseBody: true,     // return the original HTML body
      browserHtml: !!render,      // when true, return rendered DOM (headless browser)
      httpRequestHeaders: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9'
      }
      // If you need US geo: location: { country: 'US' },
    }),
    timeout: timeoutMs
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Zyte ${res.status} ${res.statusText}: ${txt.slice(0,200)}`);
  }

  const data = await res.json();

  // Prefer rendered DOM if available
  if (data.browserHtml && typeof data.browserHtml === 'string' && data.browserHtml.length > 0) {
    return data.browserHtml;
  }
  // Fallback: raw response body (base64)
  if (data.httpResponseBody) {
    const buf = Buffer.from(data.httpResponseBody, 'base64');
    return buf.toString('utf8');
  }

  // Some plans return "extracted" fields
  if (data.extracted?.html) return data.extracted.html;

  throw new Error('Zyte returned no HTML fields');
}

// === Parser ===
// IMPORTANT: You MUST adjust selectors to match the real page structure.
// Use your browser’s DevTools → Inspect the offers list → identify the row/card selector
// and the inner selectors for supplier, rate (¢/kWh), and term (months).
function parseOffers(html, { utility, termMonths }) {
  const $ = cheerio.load(html);
  const out = [];

  // ----- PLACEHOLDER SELECTORS -----
  // Replace this with the actual offers table or card markup.
  // Example skeleton for a table:
  $('table tr').each((_, tr) => {
    const tds = $(tr).find('td');
    const supplier = tds.eq(0).text().trim();
    const rateTxt  = tds.eq(1).text().trim();  // e.g., "10.45 ¢/kWh"
    const termTxt  = tds.eq(2).text().trim();  // e.g., "12 months"
    if (!supplier || !rateTxt) return;

    const rate = parseFloat(rateTxt.replace(/[^\d.]/g, ''));               // => 10.45
    const term = parseInt(termTxt.replace(/[^\d]/g, ''), 10) || termMonths; // => 12
    if (!rate) return;

    out.push({
      utility,
      commodity: 'electric',
      customer_class: 'residential',
      supplier_name: supplier,
      rate_cents_per_kwh: rate,
      term_months: term
    });
  });

  return out;
}

// === DB write ===
// Ignores exact duplicates for the same day (simple safety).
async function writeOffers(client, offers) {
  if (!offers.length) return { inserted: 0 };
  const today = new Date().toISOString().slice(0,10);

  const sql = `
    INSERT INTO offers
      (utility, commodity, customer_class, supplier_name, rate_cents_per_kwh, term_months, day, source)
    VALUES
      ${offers.map((_, i) =>
        `($${i*8+1}, $${i*8+2}, $${i*8+3}, $${i*8+4}, $${i*8+5}, $${i*8+6}, $${i*8+7}, $${i*8+8})`
      ).join(',')}
    ON CONFLICT DO NOTHING
  `;

  const vals = [];
  for (const o of offers) {
    vals.push(
      o.utility,
      o.commodity,
      o.customer_class,
      o.supplier_name,
      o.rate_cents_per_kwh,
      o.term_months,
      today,
      'energychoice.ohio.gov'
    );
  }

  const res = await client.query(sql, vals);
  return { inserted: res.rowCount || 0 };
}

// === Main ===
(async () => {
  const client = dry ? null : new Client({ connectionString: DB_URL });

  try {
    if (client) await client.connect();

    let total = 0;

    for (const t of TARGETS) {
      let html;
      try {
        // 1) Try non-rendered fetch first (lighter/faster/cheaper)
        html = await zyteGetHtml(t.url, { render: false });
      } catch (e) {
        // 2) If blocked or the page is JS-driven, fall back to browser rendering
        console.warn('Non-rendered fetch failed; retrying with browser rendering:', e.message || e);
        html = await zyteGetHtml(t.url, { render: true });
      }

      const offers = parseOffers(html, t);

      if (dry) {
        console.log(`[dry] ${t.utility} term=${t.termMonths}: parsed ${offers.length} offers`);
        console.log(offers.slice(0, 5)); // sample
      } else {
        const { inserted } = await writeOffers(client, offers);
        console.log(`ingest: ${t.utility} term=${t.termMonths} parsed=${offers.length} inserted=${inserted}`);
      }

      total += offers.length;

      // polite pacing (0.8–1.8s) between pages
      await sleep(jitter(800, 1800));
    }

    console.log(dry ? `[dry] done, total parsed=${total}` : `ingest ok: total parsed=${total}`);
  } catch (err) {
    console.error('ingest failed:', err.message || err);
    process.exitCode = 1;
  } finally {
    if (client) await client.end();
  }
})();
