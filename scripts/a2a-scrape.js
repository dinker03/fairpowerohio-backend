#!/usr/bin/env node
/**
 * scripts/a2a-scrape.js
 *
 * Fetches the Apples-to-Apples page via Zyte (rendered HTML),
 * saves HTML to tmp/page.html, parses it with scripts/a2a-parse.js,
 * and writes tmp/offers.json (+ debug).
 *
 * Usage:
 *   ZYTE_API_KEY=... npm run a2a:scrape
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');

// ----------------------- Config -----------------------

const TARGET_URL = 'https://energychoice.ohio.gov/ApplesToApplesComparision.aspx?Category=Electric&TerritoryId=6&RateCode=1';

const UTILITY = 'aep-ohio';
const COMMODITY = 'electric';
const CUSTOMER_CLASS = 'residential';

const TMP_DIR  = path.join(process.cwd(), 'tmp');
const HTML_OUT = path.join(TMP_DIR, 'page.html');
const JSON_OUT = path.join(TMP_DIR, 'offers.json');

// ----------------------- Guards -----------------------

const ZYTE_KEY = process.env.ZYTE_API_KEY;
if (!ZYTE_KEY) {
  console.error('Missing ZYTE_API_KEY in environment (.env.local).');
  process.exit(1);
}

// Load parser
let parseA2A;
try {
  const mod = require('./a2a-parse');
  parseA2A = mod.parseA2A || mod.default || mod;
  if (typeof parseA2A !== 'function') throw new Error('scripts/a2a-parse.js must export a function');
} catch (e) {
  console.error('Could not load scripts/a2a-parse.js:', e.message);
  process.exit(1);
}

// Ensure tmp/
fs.mkdirSync(TMP_DIR, { recursive: true });

// If your Node < 18.17 doesn’t have global fetch, uncomment next 2 lines:
// const fetch = global.fetch || require('node-fetch');

// ----------------------- Zyte helpers -----------------------

function zyteAuthHeader(key) {
  return 'Basic ' + Buffer.from(`${key}:`).toString('base64');
}

// 1) Browser-rendered HTML only
async function zyteGetBrowserHtml(url) {
  const r = await fetch('https://api.zyte.com/v1/extract', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${ZYTE_KEY}:`).toString('base64'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      browserHtml: true, // ✅ no browserHtmlOptions here
    }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Zyte browserHtml failed: ${r.status} ${r.statusText} :: ${txt}`);
  }
  const json = await r.json();
  return json.browserHtml || '';
}


// 2) Plain HTTP HTML only (fallback)
async function zyteGetHttpHtml(url) {
  const r = await fetch('https://api.zyte.com/v1/extract', {
    method: 'POST',
    headers: {
      'Authorization': zyteAuthHeader(ZYTE_KEY),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      httpResponseBody: true,
    }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Zyte httpResponseBody failed: ${r.status} ${r.statusText} :: ${txt}`);
  }
  const json = await r.json();
  if (json.httpResponseBody?.html) return json.httpResponseBody.html;
  if (json.httpResponseBody?.data) {
    return Buffer.from(json.httpResponseBody.data, 'base64').toString('utf8');
  }
  return '';
}

// ----------------------- Main -----------------------

(async () => {
  const url = TARGET_URL;

  // First: try rendered HTML
  let html = await zyteGetBrowserHtml(url);

  // Quick retry if tiny
  if (!html || html.length < 2000) {
    await new Promise(res => setTimeout(res, 1200));
    const retryHtml = await zyteGetBrowserHtml(url).catch(() => '');
    if (retryHtml && retryHtml.length > (html?.length || 0)) html = retryHtml;
  }

  // Fallback: plain HTML
  if (!html || html.length < 2000) {
    const plainHtml = await zyteGetHttpHtml(url).catch(() => '');
    if (plainHtml && plainHtml.length > (html?.length || 0)) html = plainHtml;
  }

  // Persist HTML (even if small) for inspection
  fs.writeFileSync(HTML_OUT, html || '', 'utf8');

  // Parse -> offers
  let offers = [];
  let debug = {};
  try {
    const parsed = parseA2A(html, { utility: UTILITY, customerClass: CUSTOMER_CLASS });
    offers = Array.isArray(parsed?.offers) ? parsed.offers : [];
    debug = parsed?._debug || {};
  } catch (e) {
    debug = { ...debug, parseError: String(e?.message || e) };
  }

  // Reason code
  const reason =
    !html ? 'no_html'
  : html.length < 2000 ? 'html_too_short'
  : !Array.isArray(offers) ? 'offers_not_array'
  : offers.length === 0 ? (debug?.reason || 'no_offers_parsed')
  : 'ok';

  const out = {
    date: new Date().toISOString().slice(0, 10),
    utility: UTILITY,
    commodity: COMMODITY,
    customerClass: CUSTOMER_CLASS,
    offers,
    _debug: {
      reason,
      htmlSize: html ? html.length : 0,
      pickedHeaders: debug?.pickedHeaders,
      pickedRowCount: debug?.pickedRowCount,
      parseError: debug?.parseError,
    },
  };

  fs.writeFileSync(JSON_OUT, JSON.stringify(out, null, 2), 'utf8');

  console.log(`Parsed ${offers.length} offers -> ${path.relative(process.cwd(), JSON_OUT)}`);
  console.log(`Saved rendered HTML -> ${path.relative(process.cwd(), HTML_OUT)} (size: ${out._debug.htmlSize})`);
})().catch(err => {
  console.error('scrape error:', err.message || err);
  // Still write a minimal artifact so downstream scripts don't explode
  const fallback = {
    date: new Date().toISOString().slice(0, 10),
    utility: UTILITY,
    commodity: COMMODITY,
    customerClass: CUSTOMER_CLASS,
    offers: [],
    _debug: { reason: 'exception', error: String(err?.message || err) },
  };
  try {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    fs.writeFileSync(JSON_OUT, JSON.stringify(fallback, null, 2), 'utf8');
  } catch {}
  process.exit(1);
});
