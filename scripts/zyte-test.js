#!/usr/bin/env node
// scripts/zyte-test.js

// 1) load env from .env.local
require('dotenv').config({ path: '.env.local' });

// 2) optional fetch polyfill for older Node versions
(async () => {
  if (typeof fetch === 'undefined') {
    global.fetch = (await import('node-fetch')).default;
  }

  const ZYTE_KEY = process.env.ZYTE_API_KEY;
  if (!ZYTE_KEY) {
    console.error('Missing ZYTE_API_KEY in .env.local');
    process.exit(1);
  }

  // The AEP Ohio – Residential page you gave
  const TARGET_URL =
    'https://energychoice.ohio.gov/ApplesToApplesComparision.aspx?Category=Electric&TerritoryId=6&RateCode=1';

  // Zyte v1/extract uses HTTP Basic: username = API key, password = empty
  const authHeader = 'Basic ' + Buffer.from(`${ZYTE_KEY}:`).toString('base64');

  try {
    const resp = await fetch('https://api.zyte.com/v1/extract', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: TARGET_URL,
        // Ask Zyte to render and return the browser HTML
        browserHtml: true,
        // Don’t return raw response body (saves bytes)
        httpResponseBody: false
      })
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error('Zyte error:', resp.status, resp.statusText, text);
      process.exit(1);
    }

    const data = await resp.json();
    console.log('Zyte ok:', 'status', resp.status, 'keys:', Object.keys(data));

    // If you want to inspect the HTML Zyte rendered:
    const html =
      data?.browserHtml?.html ||
      data?.browserHtml ||
      data?.page?.content || // just in case different field names
      null;

    if (html) {
      const fs = require('fs');
      const out = 'tmp/zyte-sample.html';
      fs.mkdirSync('tmp', { recursive: true });
      fs.writeFileSync(out, html);
      console.log('Saved rendered HTML to', out);
    } else {
      console.log('No browserHtml returned; payload keys:', Object.keys(data));
    }
  } catch (e) {
    console.error('Zyte request failed:', e.message || e);
    process.exit(1);
  }
})();
