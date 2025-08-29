#!/usr/bin/env node
/**
 * scripts/a2a-upsert.js
 *
 * Robust upsert for A2A offers:
 * - Detects DATE_COL: 'day' or 'date'
 * - Detects plan columns present: 'plan' and/or 'product_type'
 * - If both exist, writes BOTH (same value) to satisfy NOT NULL on either one
 * - Creates a unique index on a chosen plan key (product_type if present else plan)
 * - Uses SAVEPOINT per row so one failure doesn’t abort the whole batch
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DB = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!DB) {
  console.error('Missing DATABASE_URL_UNPOOLED (or DATABASE_URL) in .env.local');
  process.exit(1);
}

const jsonPath = path.resolve('tmp/offers.json');
if (!fs.existsSync(jsonPath)) {
  console.error('tmp/offers.json not found. Run `npm run a2a:scrape` first.');
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const runDate = payload.date || new Date().toISOString().slice(0, 10);
const offers = Array.isArray(payload.offers) ? payload.offers : [];
if (offers.length === 0) {
  console.error('No offers to upsert (parsed 0).');
  process.exit(2);
}

function normalizeMoney(s) {
  if (s == null) return null;
  const t = String(s).trim();
  return t || null;
}

// ---- utilities helper (UUID id, NOT NULL columns) ----
async function ensureUtility(client, {
  slug,
  displayName,
  name,
  commodity = 'electric',
  customerClass = 'residential',
}) {
  if (!slug) throw new Error('Utility slug is required');

  const finalDisplay =
    displayName ||
    name ||
    slug.replace(/-/g, ' ').replace(/\b\w/g, m => m.toUpperCase());

  // already exists?
  let r = await client.query('SELECT id FROM utilities WHERE slug = $1', [slug]);
  if (r.rows[0]) return r.rows[0].id;

  // insert or update
  r = await client.query(
    `INSERT INTO utilities (slug, display_name, name, commodity, customer_class)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (slug) DO UPDATE
       SET display_name   = EXCLUDED.display_name,
           name           = EXCLUDED.name,
           commodity      = EXCLUDED.commodity,
           customer_class = EXCLUDED.customer_class
     RETURNING id`,
    [slug, finalDisplay, name || null, commodity, customerClass]
  );
  return r.rows[0].id;
}

// ---- table sniffers ----
async function detectDateCol(client) {
  const q = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'offers' AND column_name IN ('day','date')
    ORDER BY CASE WHEN column_name='day' THEN 0 ELSE 1 END
    LIMIT 1
  `);
  if (!q.rows.length) throw new Error("Neither 'day' nor 'date' column exists on 'offers'.");
  return q.rows[0].column_name;
}

async function getOffersColumns(client) {
  const q = await client.query(`
    SELECT column_name, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'offers'
  `);
  const cols = new Map(q.rows.map(r => [r.column_name, r.is_nullable === 'YES']));
  return {
    hasPlan: cols.has('plan'),
    hasProductType: cols.has('product_type'),
    // provide nullable flags in case we want to branch later
    planNullable: cols.get('plan') ?? true,
    productTypeNullable: cols.get('product_type') ?? true,
  };
}

(async () => {
  const client = new Client({ connectionString: DB });
  await client.connect();

  try {
    const DATE_COL = await detectDateCol(client);
    const { hasPlan, hasProductType } = await getOffersColumns(client);

    if (!hasPlan && !hasProductType) {
      throw new Error("Offers table has neither 'plan' nor 'product_type' column.");
    }

    // Which column will we use in the UNIQUE index key?
    const planKey = hasProductType ? 'product_type' : 'plan';

    // derive utility info from first row
    const first = offers[0] || {};
    const utilitySlug   = String(first.utility || 'aep-ohio');
    const commodity     = String(first.commodity || 'electric');
    const customerClass = String(first.customerClass || 'residential');

    const utilityId = await ensureUtility(client, {
      slug: utilitySlug,
      displayName: first.utilityDisplay || 'AEP Ohio',
      name: first.utilityName || 'AEP Ohio',
      commodity,
      customerClass,
    });

    // unique index for upsert key (use chosen planKey)
    const idxName = `offers_uni_${DATE_COL}_uid_${planKey}`;
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE schemaname='public' AND indexname='${idxName}'
        ) THEN
          EXECUTE 'CREATE UNIQUE INDEX ${idxName}
                   ON offers (utility_id, supplier, ${planKey}, term_months, ${DATE_COL})';
        END IF;
      END$$;
    `);

    // Build column list dynamically
    const insertCols = [
      'utility_id',
      'supplier',
      ...(hasPlan ? ['plan'] : []),
      ...(hasProductType ? ['product_type'] : []),
      'rate_cents_per_kwh',
      'term_months',
      'early_termination_fee',
      'monthly_fee',
      DATE_COL,
    ];
    const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(',');

    const onConflict = `
      ON CONFLICT (utility_id, supplier, ${planKey}, term_months, ${DATE_COL})
      DO UPDATE SET
        rate_cents_per_kwh    = EXCLUDED.rate_cents_per_kwh,
        early_termination_fee = EXCLUDED.early_termination_fee,
        monthly_fee           = EXCLUDED.monthly_fee
    `;

    const insertSQL = `
      INSERT INTO offers (${insertCols.join(',')})
      VALUES (${placeholders})
      ${onConflict}
    `;

    await client.query('BEGIN');

    let ok = 0, skipped = 0, failed = 0;
    for (const o of offers) {
      const supplier = (o.supplier || '').trim();
      const planVal  = ((o.plan ?? o.product_type) || '').trim();   // single source
      const rate     = Number(o.rate_cents_per_kwh || 0);
      const term     = Number(o.term_months || 0);
      const etf      = normalizeMoney(o.early_termination_fee);
      const mfee     = normalizeMoney(o.monthly_fee);

      // Guard: required fields
      if (!supplier || !planVal || !term) { skipped++; continue; }

      const params = [
        utilityId,
        supplier,
        ...(hasPlan ? [planVal] : []),
        ...(hasProductType ? [planVal] : []), // duplicate into product_type if it exists
        rate,
        term,
        etf,
        mfee,
        runDate,
      ];

      // per-row savepoint so one failure doesn't poison the batch
      await client.query('SAVEPOINT sp_row');
      try {
        await client.query(insertSQL, params);
        await client.query('RELEASE SAVEPOINT sp_row');
        ok++;
      } catch (e) {
        failed++;
        await client.query('ROLLBACK TO SAVEPOINT sp_row');
        if (failed <= 8) {
          console.warn('[row fail]', { supplier, planVal, term, date: runDate }, e.message);
        }
      }
    }

    await client.query('COMMIT');
    console.log(
      `upsert ok: inserted/updated=${ok}, skipped=${skipped}, failed=${failed} `
      + `(DATE_COL=${DATE_COL}, planKey=${planKey}, utility_id=${utilityId})`
    );
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Upsert failed:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})().catch(e => {
  console.error('fatal:', e.message);
  process.exit(1);
});