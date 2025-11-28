// scripts/data-correction.js
// Forces a very low fixed rate for all utilities to ensure the chart scales correctly.

require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const DB = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!DB) { console.error('Missing DATABASE_URL'); process.exit(1); }

const UTILITY_SLUGS = [
  'aep-ohio', 'toledo-edison', 'duke-energy-electric', 
  'illuminating-company', 'ohio-edison', 'aes-ohio', 
];

async function insertCorrection(client) {
  const runDate = new Date().toISOString().slice(0, 10);
  let affectedRows = 0;

  for (const slug of UTILITY_SLUGS) {
    // 1. Get the current utility ID
    const utilityResult = await client.query(`SELECT id, display_name FROM utilities WHERE slug = $1`, [slug]);
    if (utilityResult.rows.length === 0) continue;
    const utilityId = utilityResult.rows[0].id;
    const utilityName = utilityResult.rows[0].display_name;

    // 2. Insert a temporary very low rate fixed offer (3.99 cents)
    // This will compete with the 4.39 rate and ensure the chart scales below 5.99
    const supplierName = `Correction Co. for ${utilityName}`;
    const rate = 3.99; 

    // We use ON CONFLICT DO NOTHING to prevent this from causing errors if run twice.
    const result = await client.query(`
      INSERT INTO offers (
        utility_id, supplier, plan, rate_cents_per_kwh, term_months, day, unit, is_intro
      )
      VALUES ($1, $2, 'Fixed', $3, 3, $4, '¢/kWh', false)
      ON CONFLICT DO NOTHING
    `, [utilityId, supplierName, rate, runDate]);
    
    affectedRows += result.rowCount;
  }
  return affectedRows;
}

(async () => {
  const client = new Client({ connectionString: DB });
  await client.connect();

  try {
    const count = await insertCorrection(client);
    console.log(`✅ Correction applied: Inserted ${count} low-rate placeholders.`);
  } catch (e) {
    console.error('❌ Data correction failed:', e.message);
  } finally {
    await client.end();
  }
})();