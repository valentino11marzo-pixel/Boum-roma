// tests/finish/run.mjs — LA RIFINITURA: la calma non deve costare la verità.
//
// Il passo di design tocca la superficie più vista del portale (le righe,
// le strisce statistiche, i filtri) e lo fa in DUE posti: un foglio di
// finitura (css/portal-finish.css) e la composizione della riga contratto
// in portal-app.js. I modi in cui può rompersi in silenzio:
//   · una regola che inventa un COLORE nuovo → un secondo brand;
//   · un selettore che non matcha niente → una rifinitura che nessuno vede;
//   · la riga ridisegnata che perde un handler o un data-attribute →
//     filterContracts smette di filtrare, il layer mobile smette di
//     trasformare, e sembrano bug di ALTRI file.
// Qui ogni promessa è pinnata sul sorgente.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const finish = read('css/portal-finish.css');
const app = read('js/portal-app.js');
const html = read('portal.html');
const sw = read('sw.js');
const base = read('css/portal.css');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

// ── 1. Cablaggio: dopo il sistema, PRIMA dei layer strutturali ──────────
const iBase = html.indexOf('/css/portal.css');
const iFin = html.indexOf('/css/portal-finish.css');
const iMob = html.indexOf('/css/portal-mobile.css');
ok(iBase > -1 && iFin > iBase, 'portal-finish.css carica DOPO portal.css (la finitura raffina, non fonda)');
ok(iFin < iMob, 'portal-finish.css carica PRIMA dei layer M2/D1 (strutturale batte visivo)');
ok(sw.includes('/css/portal-finish.css'), 'sw.js: la rifinitura viaggia con gli asset del portale');
ok(/nofinish/.test(html) && /boom_no_finish/.test(html), 'kill switch presente (?nofinish=1 / localStorage)');

// ── 2. Disciplina dei token: NESSUN colore nuovo ────────────────────────
// Ammessi: var(--…), veli bianco/nero, velo oro (212,175,55), parole
// chiave. Qualsiasi altro letterale è un secondo brand che entra di
// contrabbando.
const colorLits = [
  ...finish.matchAll(/#[0-9a-fA-F]{3,8}\b/g),
  ...finish.matchAll(/rgba?\([^)]*\)/g),
];
const badColors = colorLits.map((m) => m[0]).filter((c) => {
  if (/^rgba?\(\s*255\s*,\s*255\s*,\s*255/.test(c)) return false;   // velo bianco
  if (/^rgba?\(\s*0\s*,\s*0\s*,\s*0/.test(c)) return false;         // velo nero
  if (/^rgba?\(\s*212\s*,\s*175\s*,\s*55/.test(c)) return false;    // velo oro (--gold)
  return true;
});
ok(badColors.length === 0, `nessun colore inventato (solo token e veli)${badColors.length ? ' — trovati: ' + badColors.join(', ') : ''}`);
// ── 3. Nessun selettore morto: ogni classe stilata ESISTE davvero ───────
const cssCode = finish.replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/!important/.test(cssCode), 'nessun !important nel CODICE: la finitura vince per cascata e specificità, non per forza');
const classes = [...new Set([...cssCode.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((m) => m[1]))];
for (const c of classes) {
  const emitted = app.includes(c) || html.includes(c) || base.includes('.' + c);
  ok(emitted, `selettore ".${c}" matcha markup reale (mai una regola per nessuno)`);
}

// ── 4. La rifinitura non tocca i layer: indipendenza M2/D1 ──────────────
ok(!/pm-on|pd-on|pm-tabbar|pd-cmd/.test(cssCode), 'la finitura non nomina mai le classi dei layer (indipendenza totale)');

// ── 5. La riga contratto ridisegnata: NIENTE è andato perso ─────────────
const rowStart = app.indexOf('const totalInst = paidCount + pendingCount;');
ok(rowStart > -1, 'la riga ridisegnata esiste (totalInst)');
const row = app.slice(rowStart, rowStart + 3600);
ok(/class="list-item clickable contract-item"/.test(row), 'la riga resta .list-item.clickable.contract-item (M2 la trasforma in card)');
ok(/data-status="\$\{c\.status\}"/.test(row) && /data-expiring30/.test(row) && /data-expiring60/.test(row),
  'i data-attribute dei filtri sono intatti (filterContracts li legge)');
ok(/onclick="viewContract\('\$\{c\.id\}'\)"/.test(row), 'il tap sulla riga apre ancora il contratto');
ok(/refinalizeContract\('\$\{c\.id\}'\)/.test(row) && /event\.stopPropagation\(\)/.test(row),
  '"Da rifinire · Rigenera" è ancora cliccabile senza aprire la riga');
// ogni CONDIZIONE del vecchio arcobaleno sopravvive nel grappolo
ok(/overdueCount > 0 \? `<span class="li-flag red">/.test(row), 'segnale ritardi: stessa condizione, voce quieta');
ok(/c\.signatureStatus === 'none' \? `<span class="li-flag orange">Da firmare/.test(row), 'segnale "da firmare" preservato');
ok(/'partial' \? `<span class="li-flag gold">Firma parziale/.test(row), 'segnale "firma parziale" preservato');
ok(/Number\(c\.deposit\) > 0 && \(c\.tenantSignature \|\| c\.signatureStatus === 'complete'\)/.test(row),
  'la condizione del deposito è IDENTICA (né più larga né più stretta)');
ok(/c\.tenantPassGenerated && c\.landlordPassGenerated/.test(row), 'segnale pass inviati preservato');
// il metro non divide mai per zero
ok(/totalInst > 0 \|\| c\.deposit/.test(row) && /totalInst > 0 \? `<span class="li-meter-track">/.test(row),
  'il metro delle rate compare solo se c\'è qualcosa da misurare (mai una divisione per zero)');
ok(/\(c\.rent \|\| 0\)\.toLocaleString\('it-IT'\)/.test(row), 'il canone usa i separatori italiani (€1.200, non €1200)');

// ── 6. Le 4 strisce sono .stat-card del sistema, coi filtri VIVI ────────
for (const [fn, n] of [['filterContracts', 5], ['filterUsers', 5], ['filterPayments', 6], ['filterMaintenance', 5]]) {
  const hits = [...app.matchAll(new RegExp(`<div class="stat-card[^"]*" onclick="${fn}\\('([^']+)'\\)"`, 'g'))];
  ok(hits.length === n, `${fn}: ${n} stat-card, tutte cliccabili (trovate ${hits.length})`);
}
ok(!/class="card" style="padding:1[24]px;text-align:center;cursor:pointer/.test(app),
  'nessuna striscia ad-hoc rimasta: le card statistiche sono UNA specie sola');

// ── 7. I filtri-chip: le 5 famiglie dichiarate sono le 5 famiglie vere ──
for (const fam of ['contract-filter', 'payment-filter', 'user-filter', 'maintenance-filter', 'rules-filter']) {
  ok(new RegExp(`\\.btn\\.${fam}`).test(cssCode), `chip: famiglia .${fam} coperta`);
  ok(app.includes(fam), `famiglia .${fam} emessa davvero dal portale`);
}

// ── 8b. RIFINITURA II — le altre cinque righe (payments/maintenance/
//        users/invoices/docs): la conversione non perde MAI un handler,
//        un data-attribute o una condizione. Sono i selettori che i
//        filtri di sezione e il layer mobile leggono davvero. ───────────
function rowOf(marker) {
  const i = app.indexOf(marker);
  return i < 0 ? '' : app.slice(i, i + 3200);
}
const payR = rowOf('class="list-item clickable payment-item"');
ok(/data-status="\$\{p\.status\}"/.test(payR) && /data-overdue=/.test(payR) && /data-duesoon=/.test(payR) && /data-stripe=/.test(payR) && /data-search=/.test(payR),
  'payments: i 5 data-attribute dei filtri/ricerca sono intatti');
ok(/openModal\('editPayment'/.test(payR), 'payments: il tap apre ancora il modale di modifica');
ok(/showPaymentLink\('pay'/.test(payR) && /markPaymentPaid\(/.test(payR) && /sendPaymentReminder\(/.test(payR),
  'payments: link carta, segna-pagato e sollecito sopravvivono');
ok(/wa\.me\//.test(payR) && payR.includes("onclick=\"event.stopPropagation()\""),
  'payments: il WhatsApp del tenant resta un link vivo che non apre la riga');
ok(/li-money-val \$\{p\.status === 'paid' \? 'green' : isOverdueNow \? 'red' : ''\}/.test(payR),
  'payments: l\'importo parla il colore dello stato (verde incassato, rosso ritardo)');
ok(!/🚨 Diffida|⚠️ 2° Sollecito/.test(app), 'payments: i livelli di sollecito hanno perso le emoji');

const maintR = rowOf('class="list-item clickable maintenance-item"');
ok(/data-status="\$\{m\.status\}"/.test(maintR) && /data-priority="\$\{m\.priority\}"/.test(maintR),
  'maintenance: data-status e data-priority intatti');
ok(/updateMaintenanceStatus\('\$\{m\.id\}','in_progress'\)/.test(maintR) && /'resolved'\)/.test(maintR),
  'maintenance: avvia/completa lavorano ancora');
ok(/border-left:3px solid var\(--red\)/.test(maintR), 'maintenance: il filo rosso delle urgenti resta');

const userR = rowOf('class="list-item clickable user-item"');
ok(/data-role=/.test(userR) && /data-overdue=/.test(userR) && /data-incomplete=/.test(userR),
  'users: i 3 data-attribute dei filtri intatti');
ok(/viewUser\('\$\{u\.id\}'\)/.test(userR) && /sendLandlordDataRequest\(/.test(userR) && /openPerson\('\$\{u\.id\}'/.test(userR),
  'users: apri, richiesta-dati e scheda 360° sopravvivono');
ok(/li-flag \$\{score >= 80 \? 'green' : score >= 50 \? 'orange' : 'red'\}/.test(userR),
  'users: l\'affidabilità è un flag tinto per fascia (stesse soglie di prima)');

const invR = rowOf('class="list-item clickable invoice-item"');
ok(/viewInvoice\(/.test(invR) && /showPaymentLink\('inv'/.test(invR) && /downloadInvoicePDF\(/.test(invR),
  'invoices: apri, link carta e PDF sopravvivono');

const docR = rowOf('class="list-item clickable doc-item"');
ok(/data-type=/.test(docR) && /data-source=/.test(docR) && /data-shared=/.test(docR) && /data-search=/.test(docR),
  'docs: i 4 data-attribute intatti');
ok(/editDocModal\(/.test(docR) && /confirmDelete\('document'/.test(docR),
  'docs: modifica ed elimina sopravvivono');

// niente più zoo: nessun badge 9px ad-hoc nelle righe convertite
for (const [nm, r] of [['payments', payR], ['maintenance', maintR], ['users', userR], ['docs', docR]]) {
  ok(!/badge[^"]*" style="font-size:9px/.test(r), `${nm}: nessun badge 9px ad-hoc rimasto nella riga`);
}

// ── 8. Le due lezioni dello screenshot (2026-08-19) ─────────────────────
// La prima fotografia del ridisegno ha mostrato due difetti che nessun
// check sul sorgente aveva preso: un'etichetta mangiata dal pulitore di
// emoji ("31–60 giorni" → "gg") e il metro VUOTO a ogni percentuale —
// il fill era un inline dentro il track, e su un inline la width in %
// viene ignorata. Qui restano pinnati.
ok(!/class="stat-label">gg</.test(app), 'nessuna etichetta mangiata dal pulitore (il caso "gg")');
ok(/\.li-meter-fill\s*\{[^}]*display:\s*block/.test(cssCode), 'il fill del metro è display:block (un inline ignora la width)');

console.log('');
console.log(fail ? `${pass} passed, ${fail} failed` : `La calma non è costata la verità — ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
