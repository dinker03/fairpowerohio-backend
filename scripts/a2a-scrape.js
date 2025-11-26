#!/usr/bin/env node
/**
 * scripts/a2a-scrape.js
 * Scrapes ALL major Ohio Electric AND Natural Gas Utilities.
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');

// ----------------------- Config -----------------------

const TARGETS = [
  // --- ELECTRIC (¢/kWh) ---
  { id: 2, slug: 'aep-ohio', name: 'AEP Ohio', commodity: 'electric' },
  { id: 3, slug: 'toledo-edison', name: 'Toledo Edison', commodity: 'electric' },
  // RENAMED:
  { id: 4, slug: 'duke-energy-electric', name: 'Duke Energy Ohio', commodity: 'electric' },
  { id: 6, slug: 'illuminating-company', name: 'The Illuminating Company', commodity: 'electric' },
  { id: 7, slug: 'ohio-edison', name: 'Ohio Edison', commodity: 'electric' },
  { id: 9, slug: 'aes-ohio', name: 'AES Ohio', commodity: 'electric' },

  // --- NATURAL GAS ($/Mcf or $/Ccf) ---
  { id: 1, slug: 'dominion-energy', name: 'Dominion Energy Ohio', commodity: 'gas' }, 
  { id: 8, slug: 'columbia-gas', name: 'Columbia Gas of Ohio', commodity: 'gas' },    
  // RENAMED:
  { id: 10, slug: 'duke-energy-gas', name: 'Duke Energy Ohio', commodity: 'gas' },   
  { id: 11, slug: 'centerpoint-energy', name: 'CenterPoint Energy', commodity: 'gas' } 
];

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
    // Gas URLs use "NaturalGas", Electric use "Electric"
    const category = target.commodity === 'gas' ? 'NaturalGas' : 'Electric';
    const url = `https://energychoice.ohio.gov/ApplesToApplesComparision.aspx?Category=${category}&TerritoryId=${target.id}&RateCode=1`;
    
    console.log(`\n📡 Fetching: ${target.name} (${target.commodity})...`);

    try {
      let html = await zyteGetBrowserHtml(url);
      
      if (!html || html.length < 5000) {
        console.log('   ⚠️ HTML too small, retrying once...');
        await new Promise(r => setTimeout(r, 2000));
        html = await zyteGetBrowserHtml(url);
      }

      // Parse Data
      let offers = [];
      let debug = {};
      try {
        const parsed = parseA2A(html, { 
          utility: target.slug, 
          utilityName: target.name, 
          commodity: target.commodity, // Important: Tells parser NOT to convert Gas prices to cents
          customerClass: CUSTOMER_CLASS 
        });
        offers = parsed.offers || [];
        debug = parsed._debug;
      } catch (e) {
        console.error(`   ❌ Parse error for ${target.name}:`, e.message);
      }

      const jsonOut = {
        date: new Date().toISOString().slice(0, 10),
        utility: target.slug,
        commodity: target.commodity,
        offers,
        _debug: debug
      };
      
      const jsonFile = path.join(TMP_DIR, `offers-${target.slug}.json`);
      fs.writeFileSync(jsonFile, JSON.stringify(jsonOut, null, 2), 'utf8');
      
      console.log(`   ✅ Saved ${offers.length} offers -> ${path.relative(process.cwd(), jsonFile)}`);

    } catch (err) {
      console.error(`   ❌ Failed to scrape ${target.name}:`, err.message);
    }

    // Polite delay
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log('\n✨ All scrapes complete.');
})();