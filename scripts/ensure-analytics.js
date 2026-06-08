#!/usr/bin/env node
/* ───────────────────────────────────────────────────────────────────────
   scripts/ensure-analytics.js
   Idempotent guard: makes sure every public / funnel page carries the GA4
   bootstrap tag AND the site-wide conversion layer (js/boom-track.js).

   - Inserts the gtag snippet right after the opening <head> if the GA4
     measurement id is absent.
   - Inserts <script defer src="/js/boom-track.js"> before </body> if absent.
   - Safe to run repeatedly — it only touches files that are missing a tag.

   Usage:  node scripts/ensure-analytics.js
   Internal-only tools (robots: noindex,nofollow) are intentionally excluded.
   ─────────────────────────────────────────────────────────────────────── */
'use strict';
const fs = require('fs');
const path = require('path');

const GA_ID = 'G-EYCD59RDVJ';
const ROOT = path.resolve(__dirname, '..');

// Public + funnel pages that should report into GA. (noindex,nofollow
// internal tools — compliance, relet, underwriting — are excluded on purpose.)
const TARGETS = [
  'book.html', 'booking.html', 'deals.html', 'contact.html', 'faq.html',
  '404.html', 'onboarding.html', 'canone.html', 'match.html',
  'terms.html', 'privacy.html', 'precheck.html',
  'form-landlord.html', 'form-tenant.html', 'tenant-registration.html',
];

const GA_SNIPPET =
  '    <!-- Google tag (gtag.js) -->\n' +
  '    <script async src="https://www.googletagmanager.com/gtag/js?id=' + GA_ID + '"></script>\n' +
  '    <script>\n' +
  '      window.dataLayer = window.dataLayer || [];\n' +
  '      function gtag(){dataLayer.push(arguments);}\n' +
  '      gtag(\'js\', new Date());\n' +
  '      gtag(\'config\', \'' + GA_ID + '\');\n' +
  '    </script>\n';

const TRACK_SNIPPET = '    <script defer src="/js/boom-track.js"></script>\n';

let changed = 0;
const report = [];

for (const rel of TARGETS) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) { report.push(`SKIP (missing)  ${rel}`); continue; }
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  const actions = [];

  // 1) GA4 bootstrap — insert immediately after the first <head>
  if (!html.includes(GA_ID)) {
    const m = html.match(/<head\b[^>]*>\s*\n/i);
    if (m) {
      const idx = m.index + m[0].length;
      html = html.slice(0, idx) + GA_SNIPPET + html.slice(idx);
      actions.push('+GA4');
    } else {
      actions.push('!no-<head>');
    }
  }

  // 2) Conversion layer — insert before the last </body>
  if (!/boom-track\.js/.test(html)) {
    const close = html.lastIndexOf('</body>');
    if (close !== -1) {
      html = html.slice(0, close) + TRACK_SNIPPET + html.slice(close);
      actions.push('+track');
    } else {
      actions.push('!no-</body>');
    }
  }

  if (html !== before) {
    fs.writeFileSync(file, html);
    changed++;
    report.push(`UPDATED  ${rel.padEnd(26)} ${actions.join(' ')}`);
  } else {
    report.push(`ok       ${rel.padEnd(26)} (already tagged)`);
  }
}

console.log(report.join('\n'));
console.log(`\n${changed} file(s) updated.`);
