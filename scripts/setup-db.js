require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const DB = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!DB) {
  console.error("❌ Missing DATABASE_URL in .env.local");
  process.exit(1);
}

const sql = `
-- 1. DROP EVERYTHING (Clean Slate)
-- We drop 'offers' first because it depends on 'utilities'
DROP TABLE IF EXISTS offers CASCADE;
DROP TABLE IF EXISTS utilities CASCADE;

-- 2. Create 'utilities' table
CREATE TABLE utilities (
    id SERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    display_name TEXT,
    name TEXT,
    commodity TEXT DEFAULT 'electric',
    customer_class TEXT DEFAULT 'residential',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create 'offers' table
CREATE TABLE offers (
    id SERIAL PRIMARY KEY,
    utility_id INTEGER REFERENCES utilities(id), -- This works now because utilities is brand new
    supplier TEXT NOT NULL,
    plan TEXT NOT NULL,
    rate_cents_per_kwh NUMERIC NOT NULL,
    term_months INTEGER,
    early_termination_fee NUMERIC,
    monthly_fee NUMERIC,
    day DATE DEFAULT CURRENT_DATE,
    source TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint for upserting
    CONSTRAINT unique_daily_offer UNIQUE (utility_id, supplier, plan, term_months, day)
);

-- 4. Create Index
CREATE INDEX idx_offers_day ON offers(day);
`;

(async () => {
  const client = new Client({ connectionString: DB });
  try {
    await client.connect();
    console.log("🔌 Connected to database...");
    console.log("💥 Dropping old tables and recreating...");
    
    await client.query(sql);
    
    console.log("✅ Database reset successfully!");
  } catch (e) {
    console.error("❌ Setup failed:", e.message);
  } finally {
    await client.end();
  }
})();