#!/usr/bin/env node
// scripts/a2a-parse.js
require('dotenv').config({ path: '.env.local' });
const cheerio = require('cheerio');

// --------------------------- HELPERS ---------------------------
function normSpace(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

function parseRate(raw, commodity) {
  if (!raw) return null;
  let s = String(raw).toLowerCase().trim();
  const n = Number(s.replace(/[^0-9.]+/g, ''));
  if (!Number.isFinite(n)) return null;
  // Electric < 0.50 -> likely dollars ($0.06), convert to cents (6.0)
  if (commodity === 'electric' && n < 0.50) return Math.round(n * 100 * 100) / 100;
  return n;
}

function parseTermMonths(raw) {
  if (!raw) return null;
  // If it says "Month to Month", return 1
  if (String(raw).toLowerCase().includes('month')) {
     if (String(raw).toLowerCase().includes('to')) return 1;
  }
  const n = parseInt(String(raw).replace(/[^\d]+/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function cleanPlan(raw) {
  const s = (raw || '').toLowerCase();
  if (s.includes('fixed')) return 'Fixed';
  if (s.includes('variable')) return 'Variable';
  return 'Variable';
}

function cleanIntro(raw) {
  // Aggressive: If "yes" appears anywhere, it's an intro
  return (raw || '').toLowerCase().includes('yes');
}

function cleanDollar(raw) {
  if (!raw) return null;
  const n = Number(String(raw).replace(/[^\d.]+/g, ''));
  return Number.isFinite(n) ? n : null;
}

function cleanSupplier(raw) {
  let s = normSpace(raw);

  // 1. INJECT SPACES into "Mashed" Strings
  // Existing rules...
  s = s.replace(/(LLC)(\d)/gi, '$1 $2');
  s = s.replace(/(Inc)(\d)/gi, '$1 $2');
  s = s.replace(/(Energy)(PO)/gi, '$1 $2');
  s = s.replace(/(Electric)(P\.?O)/gi, '$1 $2');
  s = s.replace(/(LLC)(P\.?O)/gi, '$1 $2');
  s = s.replace(/(Inc)(P\.?O)/gi, '$1 $2');

  // --- NEW RULES FOR GAS SUPPLIERS ---
  s = s.replace(/LLCOne/gi, 'LLC One');       // Fixes "Nordic...LLCOne"
  s = s.replace(/HomeP\.?O/gi, 'Home PO');    // Fixes "NRG HomeP.O."
  s = s.replace(/GasP\.?O/gi, 'Gas PO');      // Fixes "Ohio Natural GasP.O."
  s = s.replace(/ProvisionP\.?O/gi, 'Provision PO'); // Fixes "ProvisionP.O."

  // 2. Strip obvious UI fragments
  s = s.replace(/Company Url.*$/i, '').trim();
  s = s.replace(/Offer Details.*$/i, '').trim();
  s = s.replace(/Terms of Service.*$/i, '').trim();
  s = s.replace(/Sign Up.*$/i, '').trim();

  // 3. Cut off once address/phone patterns begin
  const cutTokens = [
    /\bP\.?\s*O\.?\s*Box\b/i,
    /\bSuite\b/i, /\bSte\b/i,
    /\bStreet\b/i, /\bSt\b/i,
    /\bRoad\b/i, /\bRd\b/i,
    /\bAve\b/i, /\bBlvd\b/i, /\bLane\b/i, /\bDr\b/i,
    /\d{3}[-\s.]?\d{3}[-\s.]?\d{4}/, // Phone numbers
    /\d{1,5}\s+[a-zA-Z]/,            // Street addresses (123 Main)
  ];

  for (const rx of cutTokens) {
    const m = s.match(rx);
    if (m && m.index > 0) {
      s = s.slice(0, m.index).trim();
    }
  }

  // 4. Final Cleanup
  s = s.replace(/\s{2,}/g, ' ').replace(/[|]+/g, '').trim();
  s = s.replace(/[.,]+$/, ''); 

  return s;
}

function detectUnit(commodity, headers) {
  if (commodity === 'electric') return '¢/kWh';
  const headerStr = (headers || []).join(' ').toLowerCase();
  if (headerStr.includes('mcf')) return '$/Mcf';
  return '$/Ccf';
}

// --------------------------- SMART TABLE FINDER ---------------------------

const HEADER_ALIASES = {
  supplier: [/supplier/i], 
  rate: [/\$\/kwh/i, /\$\/ccf/i, /\$\/mcf/i, /^\$\/unit/i],
  plan: [/rate type/i, /^type$/i],
  intro: [/intro/i],
  
  // FIX: Check for "Early Term" (ETF) BEFORE checking for "Term"
  etf: [/early/i, /termination/i],
  
  // FIX: Strict Regex for Term (Must start with 'term' or 'length', NO 'early')
  // This prevents "Early Term Fee" from being caught here.
  term: [/^term/i, /length/i], 
  
  fee: [/monthly/i],
};

function normalizeHeader(label) {
  const l = normSpace(label).toLowerCase();
  // Iterate keys in order. Since we put 'etf' before 'term', it should catch it first.
  // But Object key order isn't guaranteed in all environments, so let's be explicit:
  const keys = ['supplier', 'rate', 'plan', 'intro', 'etf', 'term', 'fee'];
  
  for (const key of keys) {
    for (const rx of HEADER_ALIASES[key]) {
      if (rx.test(l)) return key;
    }
  }
  return null;
}

function pickLikelyTable($, commodity) {
  let best = null;
  $('table').each((i, el) => {
    const $t = $(el);
    let headerRow = $t.find('thead tr').first();
    if (!headerRow.length) headerRow = $t.find('tr').first();
    let headerCells = headerRow.find('th,td');
    
    const headers = headerCells.map((_, th) => normSpace($(th).text())).get().filter(Boolean);
    const mapped = headers.map(normalizeHeader);
    const have = new Set(mapped.filter(Boolean));

    if (!have.has('supplier') || !have.has('term')) return;

    const score = have.size;
    if (!best || score > best.score) best = { table: $t, headers, mapped, score };
  });
  return best;
}

// --------------------------- CORE PARSE ---------------------------

function parseOffersFromHtml(html, opts = {}) {
  const { utility = 'unknown', utilityName = '', commodity = 'electric' } = opts;
  const $ = cheerio.load(html);

  const pick = pickLikelyTable($, commodity);
  const rows = [];
  let unit = '¢/kWh';

  if (pick) {
    const { table, headers, mapped } = pick;
    unit = detectUnit(commodity, headers);
    const idx = {}; 
    mapped.forEach((k, i) => { if (k) idx[k] = i; });

    const trs = table.find('tr');
    trs.each((ri, tr) => {
      if (ri === 0 && $(tr).find('th').length > 0) return;
      const cells = $(tr).find('td');
      if (!cells.length) return; 

      const get = (key) => { const i = idx[key]; return (i != null) ? cells.eq(i).text() : ''; };

      const supplier = cleanSupplier(get('supplier'));
      const rate = parseRate(get('rate'), commodity);
      const plan = cleanPlan(get('plan'));
      const isIntro = cleanIntro(get('intro'));
      const term = parseTermMonths(get('term'));
      const etf = cleanDollar(get('etf'));
      const fee = cleanDollar(get('fee'));

      if (supplier && rate !== null && term !== null) {
        rows.push({ utility, commodity, supplier, plan, rate_cents_per_kwh: rate, unit, term_months: term, is_intro: isIntro, early_termination_fee: etf, monthly_fee: fee });
      }
    });
  }

  const bodyText = $('body').text().replace(/\s+/g, ' ');
  const ptcMatch = bodyText.match(/Price to Compare.*?is\s*(\$?\d+(?:\.\d+)?)/i);
  if (ptcMatch) {
    const ptcVal = parseRate(ptcMatch[1], commodity);
    if (ptcVal) {
      rows.push({ utility, commodity, supplier: `${utilityName} (Standard Offer)`, plan: 'Variable', rate_cents_per_kwh: ptcVal, unit, term_months: 1, is_intro: false, early_termination_fee: 0, monthly_fee: 0 });
    }
  }
  return { offers: rows };
}

module.exports = { parseOffersFromHtml, parseA2A: parseOffersFromHtml };