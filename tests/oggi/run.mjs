// tests/oggi/run.mjs — OGGI: la coda delle decisioni dice il vero.
//
// Tre promesse, tre modi di romperle in silenzio:
//  1. il PUNTEGGIO — se l'ordine sbaglia, l'operatore decide le cose
//     sbagliate per prime e la pagina è peggio di niente;
//  2. le AZIONI — ogni {fn} dichiarata dal motore deve esistere in
//     portal-app.js (la disciplina del Prontuario): un bottone che non fa
//     niente insegna a non fidarsi della coda;
//  3. il CABLAGGIO — motore caricato PRIMA dell'uso, router, sidebar,
//     landing admin, service worker.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const E = require(join(ROOT, 'js', 'oggi-engine.js'));
const app = readFileSync(join(ROOT, 'js/portal-app.js'), 'utf8');
const html = readFileSync(join(ROOT, 'portal.html'), 'utf8');
const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

const NOW = '2026-08-19T10:00:00Z';
const S = {
  payments: [
    { id: 'p1', status: 'pending', amount: 900, dueDate: '2026-08-01', month: 'Ago 2026', contractId: 'c1' },
    { id: 'p2', status: 'pending', amount: 2200, dueDate: '2026-07-05', month: 'Lug 2026', contractId: 'c2' },
    { id: 'p3', status: 'paid', amount: 1450, paidDate: '2026-08-02' },
    { id: 'p4', status: 'pending', amount: 980, dueDate: '2026-08-24' },
  ],
  contracts: [
    { id: 'c1', status: 'active', propertyId: 'x1', tenantId: 't1', endDate: '2027-08-31' },
    { id: 'c2', status: 'active', propertyId: 'x2', tenantId: 't2', endDate: '2026-09-10', signatureStatus: 'partial' },
  ],
  users: [{ id: 't1', name: 'Emma' }, { id: 't2', name: 'Lucas' }],
  properties: [{ id: 'x1', name: 'Cavour' }, { id: 'x2', name: 'Pigneto' }],
  viewingRequests: [{ id: 'v1', status: 'pending', clientName: 'Sara', propertyName: 'Prati', createdAt: '2026-08-18T09:00:00Z' }],
  leads: [
    { id: 'l1', status: 'new', grade: 'A', name: 'Marco', createdAt: '2026-08-18T20:00:00Z' },
    { id: 'l2', status: 'new', grade: 'C', name: 'Tizio', createdAt: '2026-08-10' },
    { id: 'l3', status: 'contacted', grade: 'A', name: 'GiàSentito' },
  ],
  maintenance: [{ id: 'm1', priority: 'urgent', status: 'open', title: 'Caldaia', propertyId: 'x1', createdAt: '2026-08-17' }],
  actionQueue: [{ id: 'q1', status: 'pending', title: 'Risposta AI a Marco', createdAt: '2026-08-19T08:00:00Z' }],
};
const r = E.build(S, NOW);
const ids = r.decisions.map((d) => d.id);

// ── 1. Il contenuto: chi DEVE esserci c'è, chi non deve NO ─────────────
ok(ids.includes('aq_q1'), 'una proposta AI pendente entra in coda');
ok(ids.includes('vw_v1'), 'una visita da confermare entra in coda');
ok(ids.includes('pay_all') && ids.includes('pay_p1') && ids.includes('pay_p2'), 'i ritardi entrano: quadro + peggiori per nome');
ok(!ids.includes('pay_p4'), 'una rata NON scaduta non è una decisione');
ok(ids.includes('lead_l1') && !ids.includes('lead_l3'), 'lead nuovi sì, già contattati no');
ok(ids.includes('mnt_m1'), 'la manutenzione urgente entra');
ok(ids.includes('sig_c2'), 'la firma a metà entra');
ok(ids.includes('exp_c2'), 'il contratto in scadenza ≤30gg entra');

// ── 2. L'ordine è il costo del ritardo ─────────────────────────────────
const pos = (id) => ids.indexOf(id);
ok(pos('aq_q1') < pos('lead_l2'), 'una risposta AI ferma batte un lead C');
ok(pos('vw_v1') < pos('sig_c2'), 'una visita da confermare batte una firma a metà');
ok(pos('pay_p2') < pos('pay_p1'), 'tra i ritardi, giorni×importo comanda (45gg×2200 prima di 18gg×900)');
ok(r.decisions.every((d, i) => i === 0 || r.decisions[i - 1].score >= d.score), 'la lista è davvero ordinata per punteggio');

// ── 3. Il polso dei soldi fa i conti giusti ────────────────────────────
ok(r.cash.paidMonth === 1450, `incassato mese = 1450 (trovato ${r.cash.paidMonth})`);
ok(r.cash.overdueTotal === 3100 && r.cash.overdueCount === 2, 'ritardi: totale e conteggio esatti');
ok(r.cash.dueMonth === 900 + 980, 'in arrivo nel mese = rate pending con scadenza nel mese');
ok(r.cash.next7 === 980, 'prossimi 7 giorni = solo la rata del 24');

// ── 4. Robustezza: S vuoto o mancante non esplode mai ──────────────────
const empty = E.build({}, NOW);
ok(empty.decisions.length === 0 && empty.cash.paidMonth === 0, 'snapshot vuoto → coda vuota, zero NaN');
ok(!JSON.stringify(empty).includes('NaN'), 'nessun NaN in uscita');

// ── 5. Ogni azione dichiarata ESISTE in portal-app.js ──────────────────
const fns = [...new Set(r.decisions.flatMap((d) => (d.actions || []).map((a) => a.fn)))];
for (const fn of fns) {
  ok(new RegExp(`function ${fn}\\s*\\(|window\\.${fn}\\s*=`).test(app), `azione "${fn}" è una funzione vera del portale`);
}
ok(r.decisions.every((d) => (d.actions || []).every((a) => (a.args || []).every((v) => typeof v === 'string' || typeof v === 'number'))),
  'gli args sono solo stringhe/numeri: mai codice, mai oggetti da serializzare');

// ── 6. Il cablaggio ────────────────────────────────────────────────────
ok(app.includes("case 'oggi':"), 'router: la sezione oggi esiste');
ok(app.includes("goTo('oggi')"), 'sidebar: la voce ⚡ Oggi esiste');
ok(/isAdmin\(\) \? 'oggi'/.test(app), "landing: l'admin senza hash atterra su Oggi");
ok(/window\.BOOM_OGGI/.test(app) && /return adminDashboard\(\)/.test(app.slice(app.indexOf('function oggiPage'), app.indexOf('function oggiPage') + 600)),
  'oggiPage legge il motore e senza motore ricade sulla dashboard (mai una pagina vuota)');
const iEng = html.indexOf('/js/oggi-engine.js');
ok(iEng > -1 && iEng < html.indexOf('<script src="/js/portal-mobile.js">'), 'portal.html carica il motore');
ok(sw.includes('/js/oggi-engine.js'), 'sw.js: il motore viaggia con gli asset del portale');
// il ponte oggiRun invoca per RIFERIMENTO (disciplina Prontuario)
ok(/window\[a\.fn\]/.test(app) && /f\.apply\(window, a\.args/.test(app), 'oggiRun invoca per riferimento, mai per stringa');

console.log('');
console.log(fail ? `${pass} passed, ${fail} failed` : `La coda dice il vero — ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
