#!/usr/bin/env node
// scripts/a2a-parse.js
// Parses an Apples-to-Apples HTML page into normalized offers.

require('dotenv').config({ path: '.env.local' });

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

// --------------------------- helpers ---------------------------

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function normSpace(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function parseCentsPerKwh(raw) {
  // handles like "8.49", "8.49¢", "$0.0849", "9 ¢", etc.
  if (!raw) return null;
  let s = String(raw).toLowerCase().trim();
  // if it looks like dollars (starts with $ and < 0.99), convert to cents
  if (s.startsWith('$')) {
    const n = Number(s.replace(/[^0-9.]+/g, ''));
    if (Number.isFinite(n)) return Math.round(n * 10000) / 100; // dollars/kWh -> cents/kWh
  }
  // otherwise read numeric (allow decimals)
  const n = Number(s.replace(/[^0-9.]+/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseTermMonths(raw) {
  // "12", "12 mo", "12 months", "6", "N/A"
  if (!raw) return null;
  const n = parseInt(String(raw).replace(/[^\d]+/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function cleanPlan(raw) {
  const s = (raw || '').toLowerCase();
  if (s.includes('fixed')) return 'Fixed';
  if (s.includes('variable')) return 'Variable';
  if (s.includes('intro')) return 'Intro Fixed';
  return raw ? raw.trim() : null;
}

function cleanDollar(raw) {
  if (!raw) return null;
  const n = Number(String(raw).replace(/[^\d.]+/g, ''));
  return Number.isFinite(n) ? n : null;
}

function cleanSupplier(raw) {
  let s = normSpace(raw);

  // Strip obvious UI fragments appended to the supplier cell
  s = s.replace(/Company Url.*$/i, '').trim();
  s = s.replace(/Offer Details.*$/i, '').trim();
  s = s.replace(/Terms of Service.*$/i, '').trim();
  s = s.replace(/Sign Up.*$/i, '').trim();

  // Cut off once address/phone patterns begin
  const cutTokens = [
    /\bP\.?\s*O\.?\s*Box\b/i,
    /\bSuite\b/i, /\bSte\b/i,
    /\bStreet\b/i, /\bSt\b/i,
    /\bRoad\b/i, /\bRd\b/i,
    /\bAve\b/i, /\bBlvd\b/i, /\bLane\b/i, /\bDr\b/i,
    // US states (very rough)
    /\b(AL|AK|AZ|AR|CA|CO|CT|DC|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV)\b[, ]?\d{5}/i,
    // phone numbers
    /\(\d{3}\)\s*\d{3}[-\s.]?\d{4}/,
    /\d{3}[-\s.]?\d{3}[-\s.]?\d{4}/,
    // street number then word
    /\d{1,5}\s+\w/,
  ];
  for (const rx of cutTokens) {
    const m = s.match(rx);
    if (m && m.index > 0) {
      s = s.slice(0, m.index).trim();
    }
  }

  // Collapse leftover punctuation/spaces
  s = s.replace(/\s{2,}/g, ' ').replace(/[|]+/g, '').trim();
  return s;
}

// Match table columns regardless of exact spacing/case the site uses.
const HEADER_ALIASES = {
  supplier: [/^supplier$/i],
  cents: [/^\$\/?kwh$/i, /^rate\s*\$\/kwh$/i, /^\$ ?\/ ?kwh$/i, /^\$\/kwh$/i, /^price/i],
  plan: [/^rate\s*type$/i, /^type$/i],
  renew: [/^renew/i],
  intro: [/^intro/i],
  term: [/^term/i],
  etf: [/^early/i],
  fee: [/^monthly/i],
  promo: [/^promo/i],
};

function normalizeHeader(label) {
  const l = normSpace(label).toLowerCase();
  for (const key of Object.keys(HEADER_ALIASES)) {
    for (const rx of HEADER_ALIASES[key]) {
      if (rx.test(l)) return key;
    }
  }
  return null;
}

function pickLikelyTable($) {
  // Find tables with a thead (or first row) that includes the expected columns.
  let best = null;

  $('table').each((_, el) => {
    const $t = $(el);
    // try header cells from thead; fallback to first row
    let headerCells = $t.find('thead th');
    if (!headerCells.length) headerCells = $t.find('tr').first().find('th,td');
    if (!headerCells.length) return;

    const headers = headerCells
      .map((i, th) => normSpace($(th).text()))
      .get()
      .filter(Boolean);

    // map to our normalized keys
    const mapped = headers.map(normalizeHeader);
    const have = new Set(mapped.filter(Boolean));

    // score: must have supplier + cents + plan + term at minimum
    const must = ['supplier', 'cents', 'plan', 'term'];
    const hasMust = must.every((k) => have.has(k));
    if (!hasMust) return;

    // more keys = higher score
    const score = have.size;

    if (!best || score > best.score) {
      best = { table: $t, headers, mapped, score };
    }
  });

  return best;
}

// --------------------------- core parse ---------------------------

function parseOffersFromHtml(html, opts = {}) {
  const {
    utility = 'aep-ohio',
    customerClass = 'residential',
    date = todayISO(),
  } = opts;

  const $ = cheerio.load(html);
  const pick = pickLikelyTable($);
  if (!pick) {
    return {
      date,
      utility,
      commodity: 'electric',
      customerClass,
      offers: [],
      _debug: { reason: 'table_not_found' },
    };
  }

  const { table, headers, mapped } = pick;

  // Build column index map
  const idx = {}; // key -> column index
  mapped.forEach((k, i) => {
    if (k && !(k in idx)) idx[k] = i;
  });

  const rows = [];
  // data rows: skip a header row if present
  const trs = table.find('tr');
  trs.each((ri, tr) => {
    const cells = $(tr).find('td');
    if (!cells.length) return; // likely header

    const get = (colKey) => {
      const i = idx[colKey];
      if (i == null) return '';
      return normSpace($(cells.get(i)).text());
    };

    const supplier = cleanSupplier(get('supplier'));
    const plan = cleanPlan(get('plan'));
    const cents = parseCentsPerKwh(get('cents'));
    const term = parseTermMonths(get('term'));
    const etf = cleanDollar(get('etf'));
    const fee = cleanDollar(get('fee'));

    // Minimal validity
    if (!supplier || cents == null || term == null) return;

    rows.push({
      utility,
      commodity: 'electric',
      customerClass,
      supplier,
      plan,
      rate_cents_per_kwh: cents,
      term_months: term,
      early_termination_fee: etf,
      monthly_fee: fee,
    });
  });

  return {
    date,
    utility,
    commodity: 'electric',
    customerClass,
    offers: rows,
    _debug: {
      pickedHeaders: headers,
      pickedRowCount: rows.length,
    },
  };
}

// --------------------------- CLI usage ---------------------------
//   node scripts/a2a-parse.js [htmlPath] [utility=aep-ohio] [customerClass=residential]
// Writes tmp/offers.json

async function mainCLI() {
  const htmlPath = process.argv[2] || path.join('tmp', 'page.html');
  const utility = process.argv[3] || 'aep-ohio';
  const customerClass = process.argv[4] || 'residential';

  if (!fs.existsSync(htmlPath)) {
    console.error(`HTML not found: ${htmlPath}`);
    process.exit(1);
  }
  const html = fs.readFileSync(htmlPath, 'utf8');
  const out = parseOffersFromHtml(html, { utility, customerClass });

  const outDir = path.join('tmp');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'offers.json');
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`Parsed ${out.offers.length} offers -> ${outFile}`);
}

// Export for programmatic use (a2a-scrape.js can require this)
module.exports = { 
  parseOffersFromHtml,
  parseA2A: parseOffersFromHtml,   // <-- alias so old callers still work
};

// If executed directly:
if (require.main === module) {
  mainCLI().catch((e) => {
    console.error('parse failed:', e.message);
    process.exit(1);
  });
}
