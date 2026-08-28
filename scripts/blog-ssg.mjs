#!/usr/bin/env node
// scripts/blog-ssg.mjs — la proiezione statica dei blog interattivi.
//
// LA SCOPERTA DEL 2026-08-28: i 5 articoli "sottili" dell'audit non erano
// sottili — erano INVISIBILI. Il contenuto vero (7 truffe da ~200 parole
// l'una, 47 passi completi, 13 risposte legali con gli articoli di legge,
// 12 schede quartiere, le tabelle costi) vive in array JS renderizzati
// client-side: un crawler che non esegue JS (e i motori di risposta in
// larga parte non lo fanno) leggeva ~300 parole su pagine che ne
// contengono 1.500+.
//
// La soluzione NON è riscrivere: è proiettare. Questo script legge GLI
// STESSI array dalla pagina e rigenera un blocco statico dentro la regione
// sentinella <!-- BOOM_SSG:START --> … <!-- BOOM_SSG:END -->. Il JS della
// pagina rimuove il blocco al boot (progressive enhancement: stesso
// contenuto, veste interattiva per chi ha JS) — tranne dove il blocco è
// complementare (la tabella costi) e resta per tutti.
//
// Una copia sola: i dati sono la fonte, la proiezione non può divergere —
// tests/seo/run.mjs rigenera in memoria e confronta col file.
//
//   node scripts/blog-ssg.mjs           # riscrive le regioni sentinella
//   node scripts/blog-ssg.mjs --check   # esce 1 se un file è fuori sync

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(new URL('.', import.meta.url).pathname, '..');
const OPEN = '<!-- BOOM_SSG:START -->';
const CLOSE = '<!-- BOOM_SSG:END -->';

/* ── estrazione del letterale: scanner bracket-aware (le stringhe possono
      contenere parentesi — un regex qui sotto-conta in silenzio) ───────── */
export function extractLiteral(source, assignRe) {
  const m = source.match(assignRe);
  if (!m) throw new Error(`assegnazione non trovata: ${assignRe}`);
  let i = m.index + m[0].length;
  while (i < source.length && /\s/.test(source[i])) i++;
  const openCh = source[i];
  if (openCh !== '[' && openCh !== '{') throw new Error(`atteso [ o { dopo ${assignRe}`);
  let depth = 0, inStr = null;
  for (let j = i; j < source.length; j++) {
    const c = source[j];
    if (inStr) {
      if (c === '\\') { j++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) return source.slice(i, j + 1);
    }
  }
  throw new Error('letterale mai chiuso');
}

export function evalLiteral(text) {
  return vm.runInNewContext('(' + text + ')', {}, { timeout: 2000 });
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ── stile condiviso del blocco statico (autosufficiente: vive nel body,
      dark/gold come il resto della pagina, leggibile SENZA il JS) ─────── */
const SSG_CSS = `
<style>
.ssg{max-width:860px;margin:0 auto;padding:8px 24px 40px;position:relative;z-index:1;font-weight:300}
.ssg h2{font-size:24px;font-weight:300;letter-spacing:1px;color:#FFF;margin:36px 0 6px}
.ssg h3{font-size:16px;font-weight:500;color:#FFF;margin:0}
.ssg .ssg-note{color:#8a8a8a;font-size:13px;margin:0 0 18px}
.ssg details{border:1px solid rgba(255,255,255,.09);border-radius:12px;background:#0A0A0A;margin:8px 0;padding:0 16px}
.ssg summary{cursor:pointer;padding:14px 0;font-size:15px;color:#FFF;font-weight:400;list-style:none}
.ssg summary::-webkit-details-marker{display:none}
.ssg summary b{font-weight:500}
.ssg summary .tag{display:inline-block;margin-left:8px;font-size:10.5px;letter-spacing:1px;text-transform:uppercase;color:#D4AF37;border:1px solid rgba(212,175,55,.35);border-radius:99px;padding:2px 9px;vertical-align:1px}
.ssg .body{padding:2px 0 16px;color:#bdbdbd;font-size:14px;line-height:1.75}
.ssg .body p{margin:0 0 10px}
.ssg .body ul{margin:0 0 10px;padding-left:20px}
.ssg .body li{margin:4px 0}
.ssg .lbl{display:block;font-size:10.5px;letter-spacing:2px;text-transform:uppercase;color:#D4AF37;margin:14px 0 4px}
.ssg .warn{color:#FF9F43}
.ssg .law{color:#9ad1ff}
.ssg table{width:100%;border-collapse:collapse;margin:14px 0;font-size:14px}
.ssg th{font-size:10.5px;letter-spacing:1.6px;text-transform:uppercase;color:#D4AF37;text-align:left;padding:10px 12px;border-bottom:1px solid rgba(212,175,55,.35)}
.ssg td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.07);color:#cfcfcf}
.ssg td:first-child{color:#FFF}
</style>`;

/* ── i renderer, uno per pagina ──────────────────────────────────────── */

function renderScams(scams) {
  const rows = scams.map((s) => `
<details>
  <summary><b>${esc(s.name)}</b> — ${esc(s.summary)}<span class="tag">${esc(s.severity)} · seen ${esc(s.frequency).toLowerCase()}</span></summary>
  <div class="body">
    <p>${esc(s.description)}</p>
    <span class="lbl">Red flags</span>
    <ul>${s.redFlags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
    <span class="lbl">A real case from our files</span>
    <p>${esc(s.realCase)}</p>
    <span class="lbl">How to protect yourself</span>
    <p>${esc(s.protection)}</p>
  </div>
</details>`).join('');
  return `
<h2>The seven patterns, in full</h2>
<p class="ssg-note">The same breakdowns as the interactive cards above — every red flag, every real case, every protection rule.</p>
${rows}
<p class="ssg-note" style="margin-top:18px">The fastest protection of all: rent a home that was <a href="/apartments" style="color:#D4AF37">video-verified before it was listed</a> — or have us <a href="/deal-assistance" style="color:#D4AF37">check the deal you found</a> before any money moves. Full playbook: <a href="/rent-in-rome-without-scams" style="color:#D4AF37">how to rent in Rome without being scammed</a>.</p>`;
}

function renderPhases(phases) {
  const diff = { easy: 'easy', medium: 'medium', hard: 'hard' };
  const secs = phases.map((p) => `
<h2>${esc(p.icon)} ${esc(p.name)} <span style="font-size:13px;color:#8a8a8a;letter-spacing:0">· ${esc(p.timeframe)}</span></h2>
${p.steps.map((st) => `
<details>
  <summary><b>Step ${st.num}:</b> ${esc(st.title)}<span class="tag">${esc(st.time)} · ${esc(diff[st.difficulty] || st.difficulty)}</span></summary>
  <div class="body">
    <p>${esc(st.detail)}</p>
    ${st.warning ? `<p class="warn">⚠ ${esc(st.warning)}</p>` : ''}
  </div>
</details>`).join('')}`).join('');
  return `
<h2 style="margin-top:8px">All 47 steps, phase by phase</h2>
<p class="ssg-note">The full checklist in plain text — the interactive tracker above lets you tick steps off as you go.</p>
${secs}
<p class="ssg-note" style="margin-top:18px">Steps 13, 18 and 23–25 are where deals go wrong — and exactly what <a href="/deal-assistance" style="color:#D4AF37">Deal Assistance</a> (€249) and the <a href="/contract-check-express" style="color:#D4AF37">Contract Check Express</a> (€49) exist for. Or skip the 47 steps entirely: <a href="/apartments" style="color:#D4AF37">BOOM homes</a> arrive at step 33 pre-verified.</p>`;
}

function renderCategories(cats) {
  const secs = cats.map((c) => `
<h2>${esc(c.icon)} ${esc(c.name)}</h2>
${c.questions.map((q) => `
<details>
  <summary><b>${esc(q.q)}</b></summary>
  <div class="body">
    <p>${esc(q.answer)}</p>
    <span class="lbl">The law</span>
    <p class="law">${esc(q.law)}</p>
    <span class="lbl">How to protect yourself</span>
    <p>${esc(q.protection)}</p>
  </div>
</details>`).join('')}`).join('');
  return `
<h2 style="margin-top:8px">Every question, with the exact law</h2>
<p class="ssg-note">The same answers as the tabs above, in one continuous read — each with its Codice Civile or statute reference.</p>
${secs}
<p class="ssg-note" style="margin-top:18px">Deposit being withheld right now? Start with the <a href="/deposit-letter" style="color:#D4AF37">free formal demand letter</a> (art. 1590 c.c.) — or let us run the recovery: <a href="/deposit-recovery" style="color:#D4AF37">Deposit Recovery, €99 + 20% only on what comes back</a>.</p>`;
}

function renderZones(Z) {
  const zones = Object.values(Z);
  const stars = (v) => '★'.repeat(v) + '☆'.repeat(5 - v);
  const secs = zones.map((z) => `
<details>
  <summary><b>${esc(z.n)}</b> — ${esc(z.r)}/month<span class="tag">scam risk: ${esc(z.sl)}</span></summary>
  <div class="body">
    <p>${esc(z.v)}</p>
    <ul>
      ${Object.entries(z.rt).map(([k, r]) => `<li>${esc(k)}: ${stars(r.v)}</li>`).join('')}
    </ul>
    <span class="lbl">Best for</span><p>${esc(z.b)}</p>
    <span class="lbl">Think twice</span><p>${esc(z.a)}</p>
    <span class="lbl">Insider note</span><p>${esc(z.i)}</p>
  </div>
</details>`).join('');
  return `
<h2>The twelve zones, one by one</h2>
<p class="ssg-note">Every zone from the interactive map above — rents, scam risk, who it fits and the street-level notes.</p>
${secs}
<p class="ssg-note" style="margin-top:18px">Ten of these zones have a full BOOM guide with live listings: <a href="/apartments-in" style="color:#D4AF37">browse Rome neighbourhoods</a>.</p>`;
}

function renderCostZones(zones) {
  const eur = (n) => '€' + n.toLocaleString('en-US');
  const rows = zones.map((z) => `
<tr><td>${esc(z.name)}</td><td>${eur(z.libero[0])}–${eur(z.libero[1])}</td><td>${eur(z.concordato[0])}–${eur(z.concordato[1])}</td><td>${Math.round(z.scamPremium * 100)}%</td></tr>`).join('');
  return `
<h2>The reference table behind the calculator</h2>
<p class="ssg-note">Typical monthly asking rents for a one-bedroom in 2026, free-market (canone libero) vs regulated (canone concordato), plus how much scam-bait pricing pollutes each zone's listings.</p>
<table>
  <thead><tr><th>Zone</th><th>Free market</th><th>Canone concordato</th><th>Scam-bait share</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<h2>What actually lands on top of the rent</h2>
<div class="body">
<p>The listing price is the beginning of the number, not the number. Before keys, budget for: a <b>deposit of 2–3 months</b> (returned at the end — by law it cannot be "non-refundable"), an <b>agency fee</b> (in Rome typically one month's rent + VAT, or 10% of annual rent at BOOM — never pay to merely view an apartment), and the <b>registration tax</b> (2% of annual rent, split 50/50 with the landlord; reduced under cedolare secca and concordato).</p>
<p>Then the running costs the calculator adds for you: <b>condominio</b> (building fees, €50–150/month in most central buildings), <b>utilities</b> (€100–180/month for two people, more in winter), <b>TARI</b> (waste tax, roughly €150–300/year depending on size), and one-off <b>utility transfers</b> (voltura, €30–80 per contract). The honest rule of thumb the calculator encodes: <b>add ~30% to the listing price</b> and that is your real monthly cost in year one.</p>
<p>The regulated <b>canone concordato</b> column is why it pays to ask for it: same apartment, hundreds less per month, and the landlord gets a 10% flat tax instead of 21% — our <a href="/canone" style="color:#D4AF37">free calculator</a> shows the official bracket for any Rome address, and <a href="/pacchetto-concordato" style="color:#D4AF37">BOOM handles the whole paperwork</a> for owners.</p>
</div>`;
}

/* ── il registro delle proiezioni ────────────────────────────────────── */
export const PROJECTIONS = [
  { file: 'blog-scam-bible.html', varRe: /var scams *= */, render: renderScams, removedOnBoot: true },
  { file: 'blog-47-steps.html', varRe: /var phases *= */, render: renderPhases, removedOnBoot: true },
  { file: 'blog-tenant-rights.html', varRe: /var categories *= */, render: renderCategories, removedOnBoot: true },
  { file: 'blog-neighborhood-guide.html', varRe: /const Z *= */, render: renderZones, removedOnBoot: true },
  // La tabella costi è COMPLEMENTARE al calcolatore (non un doppione):
  // resta visibile anche con JS acceso.
  { file: 'blog-cost-calculator.html', varRe: /var zones *= */, render: renderCostZones, removedOnBoot: false },
];

export function projectOne(html, cfg) {
  const data = evalLiteral(extractLiteral(html, cfg.varRe));
  const id = 'ssg-' + cfg.file.replace(/\.html$/, '');
  const region = `${OPEN}\n<div class="ssg" id="${id}"${cfg.removedOnBoot ? ' data-ssg-remove="1"' : ''}>${SSG_CSS}${cfg.render(data)}\n</div>\n${CLOSE}`;
  const start = html.indexOf(OPEN);
  const end = html.indexOf(CLOSE);
  if (start === -1 || end === -1) throw new Error(`${cfg.file}: regione sentinella BOOM_SSG assente`);
  return html.slice(0, start) + region + html.slice(end + CLOSE.length);
}

/* ── CLI ─────────────────────────────────────────────────────────────── */
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const CHECK = process.argv.includes('--check');
  let drift = 0;
  for (const cfg of PROJECTIONS) {
    const fp = join(ROOT, cfg.file);
    const html = readFileSync(fp, 'utf8');
    const out = projectOne(html, cfg);
    if (out === html) { console.log(`[=] ${cfg.file}`); continue; }
    if (CHECK) { drift++; console.log(`[✗] ${cfg.file} — proiezione statica fuori sync coi dati (rilancia: node scripts/blog-ssg.mjs)`); continue; }
    writeFileSync(fp, out, 'utf8');
    console.log(`[✓] ${cfg.file} — proiezione rigenerata`);
  }
  process.exit(drift ? 1 : 0);
}
