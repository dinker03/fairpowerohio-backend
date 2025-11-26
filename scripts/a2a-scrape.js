#!/usr/bin/env node
/**
 * scripts/a2a-scrape.js
 * Scrapes ALL major Ohio Electric Utilities.
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');

// ----------------------- Config -----------------------

// Verified Territory IDs for Ohio
const TARGETS = [
  { id: 2, slug: 'aep-ohio', name: 'AEP Ohio' },
  { id: 3, slug: 'toledo-edison', name: 'Toledo Edison' },
  { id: 4, slug: 'duke-energy', name: 'Duke Energy' },
  { id: 6, slug: 'illuminating-company', name: 'The Illuminating Company' },
  { id: 7, slug: 'ohio-edison', name: 'Ohio Edison' },
  { id: 9, slug: 'aes-ohio', name: 'AES Ohio' },
];

const COMMODITY = 'electric';
const CUSTOMER_CLASS = 'residential';
const TMP_DIR = path.join(process.cwd(), 'tmp');

// ----------------------- Guards -----------------------

const ZYTE_KEY = process.env.ZYTE_API_KEY;
if (!ZYTE_KEY) {
  console.error('Missing ZYTE_API_KEY in environment.');
  process.exit(1);
}

// Load parser
let parseA2A;
try {
  const mod = require('./a2a-parse');
  parseA2A = mod.parseA2A || mod.default || mod;
} catch (e) {
  console.error('Could not load scripts/a2a-parse.js:', e.message);
  process.exit(1);
}

// Ensure tmp/ exists
fs.mkdirSync(TMP_DIR, { recursive: true });

// ----------------------- Zyte helpers -----------------------

async function zyteGetBrowserHtml(url) {
  const r = await fetch('https://api.zyte.com/v1/extract', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${ZYTE_KEY}:`).toString('base64'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, browserHtml: true }),
  });
  if (!r.ok) throw new Error(`Zyte failed: ${r.status} ${r.statusText}`);
  const json = await r.json();
  return json.browserHtml || '';
}

// ----------------------- Main Loop -----------------------

(async () => {
  console.log(`🚀 Starting scrape for ${TARGETS.length} utilities...`);
  
  for (const target of TARGETS) {
    const url = `https://energychoice.ohio.gov/ApplesToApplesComparision.aspx?Category=Electric&TerritoryId=${target.id}&RateCode=1`;
    const safeSlug = target.slug;
    
    console.log(`\n📡 Fetching: ${target.name} (ID: ${target.id})...`);

    try {
      // 1. Fetch HTML
      let html = await zyteGetBrowserHtml(url);
      
      // Simple retry if empty
      if (!html || html.length < 5000) {
        console.log('   ⚠️ HTML too small, retrying once...');
        await new Promise(r => setTimeout(r, 2000));
        html = await zyteGetBrowserHtml(url);
      }

      // 2. Save HTML for debugging
      const htmlFile = path.join(TMP_DIR, `page-${safeSlug}.html`);
      fs.writeFileSync(htmlFile, html || '', 'utf8');

      // 3. Parse Data
      let offers = [];
      let debug = {};
      try {
        // Pass the specific utility name so the parser can find the correct PTC
        const parsed = parseA2A(html, { 
          utility: safeSlug, 
          utilityName: target.name, // Used for detecting PTC text
          customerClass: CUSTOMER_CLASS 
        });
        offers = parsed.offers || [];
        debug = parsed._debug;
      } catch (e) {
        console.error(`   ❌ Parse error for ${target.name}:`, e.message);
      }

      // 4. Save JSON
      const jsonOut = {
        date: new Date().toISOString().slice(0, 10),
        utility: safeSlug,
        commodity: COMMODITY,
        offers,
        _debug: debug
      };
      
      const jsonFile = path.join(TMP_DIR, `offers-${safeSlug}.json`);
      fs.writeFileSync(jsonFile, JSON.stringify(jsonOut, null, 2), 'utf8');
      
      console.log(`   ✅ Saved ${offers.length} offers -> ${path.relative(process.cwd(), jsonFile)}`);

    } catch (err) {
      console.error(`   ❌ Failed to scrape ${target.name}:`, err.message);
    }

    // Polite delay between requests
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log('\n✨ All scrapes complete.');
})();