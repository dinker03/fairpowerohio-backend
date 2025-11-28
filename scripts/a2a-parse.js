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
  if (commodity === 'electric' && n < 0.50) return Math.round(n * 100 * 100) / 100;
  return n;
}

function parseTermMonths(raw) {
  if (!raw) return null;
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
  return (raw || '').toLowerCase().includes('yes');
}

function cleanDollar(raw) {
  if (!raw) return null;
  const n = Number(String(raw).replace(/[^\d.]+/g, ''));
  return Number.isFinite(n) ? n : null;
}

function cleanSupplier(raw) {
  let s = normSpace(raw);
  // Fix mashed text
  s = s.replace(/(LLC)(\d)/gi, '$1 $2').replace(/(Inc)(\d)/gi, '$1 $2').replace(/(Energy)(PO)/gi, '$1 $2').replace(/(Electric)(P\.?O)/gi, '$1 $2').replace(/(LLC)(P\.?O)/gi, '$1 $2').replace(/(Inc)(P\.?O)/gi, '$1 $2');
  s = s.replace(/LLCOne/gi, 'LLC One').replace(/HomeP\.?O/gi, 'Home PO').replace(/GasP\.?O/gi, 'Gas PO').replace(/ProvisionP\.?O/gi, 'Provision PO');

  // Remove standard UI text
  s = s.replace(/Company Url.*$/i, '').trim();
  s = s.replace(/Offer Details.*$/i, '').trim();
  s = s.replace(/Terms of Service.*$/i, '').trim();
  s = s.replace(/Sign Up.*$/i, '').trim();

  // Cut off addresses
  const cutTokens = [/\bP\.?\s*O\.?\s*Box\b/i, /\bSuite\b/i, /\bStreet\b/i, /\bRoad\b/i, /\d{3}[-\s.]?\d{3}[-\s.]?\d{4}/, /\d{1,5}\s+[a-zA-Z]/];
  for (const rx of cutTokens) {
    const m = s.match(rx);
    if (m && m.index > 0) s = s.slice(0, m.index).trim();
  }
  return s.replace(/[.,]+$/, '').trim();
}

function detectUnit(commodity, headers) {
  if (commodity === 'electric') return '¢/kWh';
  const headerStr = (headers || []).join(' ').toLowerCase();
  if (headerStr.includes('mcf')) return '$/Mcf';
  return '$/Ccf';
}

// --------------------------- CORE PARSE ---------------------------
const HEADER_ALIASES = {
  supplier: [/supplier/i], 
  rate: [/\$\/kwh/i, /\$\/ccf/i, /\$\/mcf/i, /^\$\/unit/i],
  plan: [/rate type/i, /^type$/i],
  intro: [/intro/i],
  term: [/^term/i, /length/i], 
  etf: [/early/i, /termination/i],
  fee: [/monthly/i],
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

      const rawSupplier = get('supplier');
      const supplier = cleanSupplier(rawSupplier);
      const rate = parseRate(get('rate'), commodity);
      const plan = cleanPlan(get('plan'));
      const isIntro = cleanIntro(get('intro'));
      const term = parseTermMonths(get('term'));
      const etf = cleanDollar(get('etf'));
      const fee = cleanDollar(get('fee'));

      // --- NEW: EXTRACT SIGNUP URL ---
      let signupUrl = null;
      if (idx['supplier'] != null) {
          const cell = cells.eq(idx['supplier']);
          // Look for 'Sign Up' first, then 'Company Url'
          const link = cell.find('a').filter((i, el) => {
             const t = $(el).text().toLowerCase();
             return t.includes('sign up') || t.includes('company url');
          }).first();
          
          const href = link.attr('href');
          // Filter out javascript postbacks or empty links
          if (href && !href.toLowerCase().startsWith('javascript')) {
             signupUrl = href.startsWith('http') ? href : `https://energychoice.ohio.gov/${href}`;
          }
      }
      // -------------------------------

      if (supplier && rate !== null && term !== null) {
        rows.push({ utility, commodity, supplier, plan, rate_cents_per_kwh: rate, unit, term_months: term, is_intro: isIntro, early_termination_fee: etf, monthly_fee: fee, signup_url: signupUrl });
      }
    });
  }

  const bodyText = $('body').text().replace(/\s+/g, ' ');
  const ptcMatch = bodyText.match(/Price to Compare.*?is\s*(\$?\d+(?:\.\d+)?)/i);
  if (ptcMatch) {
    const ptcVal = parseRate(ptcMatch[1], commodity);
    if (ptcVal) {
      rows.push({ utility, commodity, supplier: `${utilityName} (Standard Offer)`, plan: 'Variable', rate_cents_per_kwh: ptcVal, unit, term_months: 1, is_intro: false, early_termination_fee: 0, monthly_fee: 0, signup_url: null });
    }
  }
  return { offers: rows };
}

module.exports = { parseOffersFromHtml, parseA2A: parseOffersFromHtml };