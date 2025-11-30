require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DB = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!DB) { console.error("❌ Missing DATABASE_URL"); process.exit(1); }

// Path to your CSV file
const CSV_PATH = path.join(process.cwd(), 'historical_data.csv');

// Helper: "January 1" + "2025" -> "2025-01-01"
function parseDateStr(monthDay, year) {
  if (!monthDay || !year) return null;
  const dateStr = `${monthDay}, ${year}`;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

// Helper: "Illuminating Company" -> "illuminating-company"
function toSlug(str) {
  if (!str) return '';
  return str.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

(async () => {
  // 1. Check for CSV
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ Could not find file: ${CSV_PATH}`);
    console.error("   Please make sure 'historical_data.csv' is in the root folder of your project.");
    process.exit(1);
  }

  const client = new Client({ connectionString: DB });
  await client.connect();
  console.log("🔌 Connected to Neon.");

  try {
    // 2. Clear old partial data
    console.log("🧹 Clearing old history table...");
    await client.query("TRUNCATE TABLE historical_ptc;");

    // 3. Read CSV
    console.log("📖 Reading CSV file...");
    const rawData = fs.readFileSync(CSV_PATH, 'utf8');
    // Split by new line, filter out empty lines
    const lines = rawData.split(/\r?\n/).filter(l => l.trim().length > 0);

    console.log(`   Found ${lines.length} lines (including header).`);

    let insertedCount = 0;

    // 4. Loop through lines (Skip index 0 which is the Header)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Handle simple CSV parsing (splitting by comma)
      const cols = line.split(',');

      // Ensure we have enough columns (Utility, Start, End, Price, Unit, Year)
      if (cols.length < 6) continue;

      const rawSlug = cols[0].trim();
      const startDateStr = cols[1].trim();
      const endDateStr = cols[2].trim();
      const rawPrice = cols[3].trim();
      const unit = cols[4].trim();
      const year = cols[5].trim();

      // Transform Data
      const slug = toSlug(rawSlug);
      const startDate = parseDateStr(startDateStr, year);
      const endDate = parseDateStr(endDateStr, year);
      
      // Price Logic: 
      // If unit is Electric (kWh) and price is small (e.g. 0.0799), convert to Cents (7.99)
      let price = parseFloat(rawPrice);
      const isElectric = unit.includes('kWh') || unit.includes('kwh') || unit === '¢/kWh';
      
      if (isElectric && price < 0.50) {
         price = price * 100;
      }

      if (slug && startDate && endDate && !isNaN(price)) {
        await client.query(`
          INSERT INTO historical_ptc 
          (utility_slug, start_date, end_date, price, unit, year)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [slug, startDate, endDate, price, unit, year]);
        insertedCount++;
      }
    }

    console.log(`✅ Success! Inserted ${insertedCount} historical records.`);

  } catch (e) {
    console.error("❌ Error seeding history:", e);
  } finally {
    await client.end();
  }
})();
