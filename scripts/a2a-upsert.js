#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DB = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!DB) { console.error('Missing DATABASE_URL'); process.exit(1); }

const TMP_DIR = path.join(process.cwd(), 'tmp');

function getOfferFiles() {
  if (!fs.existsSync(TMP_DIR)) return [];
  return fs.readdirSync(TMP_DIR)
    .filter(f => f.startsWith('offers-') && f.endsWith('.json'))
    .map(f => path.join(TMP_DIR, f));
}

async function upsertFile(client, filePath) {
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const offers = payload.offers || [];
  if (!offers.length) return console.log(`   ⏩ Skipping ${path.basename(filePath)}`);

  const runDate = payload.date;
  const utilitySlug = payload.utility;
  
  const utilRes = await client.query(`
    INSERT INTO utilities (slug, display_name) 
    VALUES ($1, $2)
    ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name
    RETURNING id
  `, [utilitySlug, utilitySlug.replace(/-/g, ' ').toUpperCase()]);
  
  const utilityId = utilRes.rows[0].id;

  let saved = 0;
  for (const o of offers) {
    if (!o.rate_cents_per_kwh || o.rate_cents_per_kwh === 0) continue; 
    if (!o.term_months && o.term_months !== 0) continue; 

    await client.query(`
      INSERT INTO offers (
        utility_id, supplier, plan, rate_cents_per_kwh, 
        term_months, early_termination_fee, monthly_fee, day, source, unit, is_intro
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'energychoice.ohio.gov', $9, $10)
      ON CONFLICT (utility_id, supplier, plan, term_months, is_intro, day) 
      DO UPDATE SET rate_cents_per_kwh = EXCLUDED.rate_cents_per_kwh
    `, [
      utilityId, o.supplier, o.plan, o.rate_cents_per_kwh, 
      o.term_months, o.early_termination_fee || 0, o.monthly_fee || 0,
      runDate, o.unit || '¢/kWh', 
      o.is_intro || false // <--- NEW FIELD
    ]);
    saved++;
  }
  console.log(`   ✅ ${path.basename(filePath)}: Upserted ${saved} rows for Utility ID ${utilityId}`);
}

(async () => {
  const files = getOfferFiles();
  if (!files.length) { console.log('No files found.'); return; }

  const client = new Client({ connectionString: DB });
  await client.connect();
  console.log(`📦 Processing ${files.length} files...`);
  
  for (const file of files) {
    try { await upsertFile(client, file); } 
    catch (e) { console.error(`   ❌ Error ${path.basename(file)}:`, e.message); }
  }

  await client.end();
  console.log('✨ Database update complete.');
})();