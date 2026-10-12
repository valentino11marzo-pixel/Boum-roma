// tests/rendiconto/mutazioni.mjs — i difetti dell'audit, RIMESSI, devono cadere.
//
// Per ogni correzione importante si costruisce un mutante del file vero
// (api/owners/rendiconto.js o api/_pdfbrand.js) con il difetto di prima
// rimesso, in una cartella temporanea con gli import resi assoluti, e si
// pretende due cose: il file vero passa il controllo, il mutante no. Se una
// mutazione non si applica più (il codice è cambiato), il test lo dice:
// una guardia che non morde più non deve restare verde in silenzio.
// Uso: node tests/rendiconto/mutazioni.mjs
import { register, createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
register('./loader.mjs', import.meta.url);

process.env.FIREBASE_API_KEY = 'k'; process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c'; process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj'; process.env.CRON_SECRET = 'cron-test-secret';
process.env.GMAIL_USER = 'sistema@example.invalid'; process.env.GMAIL_APP_PASS = 'x';
process.env.ADMIN_NOTIFY_EMAIL = 'operatore@example.invalid';
delete process.env.TELEGRAM_BOT_TOKEN;

const F = await import('./_fake.mjs');
F.install();
const require = createRequire(import.meta.url);
const P = require('../../js/palazzo-engine.js');

let passed = 0, failed = 0; const bad = [];
const check = (n, c) => { c ? passed++ : (failed++, bad.push(n)); console.log((c ? 'PASS ' : 'FAIL ') + n); };
const mails = () => globalThis.__mails || [];

const API = new URL('../../api/', import.meta.url);
const PDFLIB = import.meta.resolve('pdf-lib');
let seq = 0;
async function mutant(rel, pairs) {
  const fileUrl = new URL(rel, API);
  let src = readFileSync(fileUrl, 'utf8');
  for (const [a, b] of pairs) {
    if (!src.includes(a)) return { stale: a.slice(0, 70) };
    src = src.split(a).join(b);
  }
  src = src.replace(/from '(\.{1,2}\/[^']+)'/g, (m, p) => `from '${new URL(p, fileUrl).href}'`).replace(/from 'pdf-lib'/g, `from '${PDFLIB}'`);
  const dir = mkdtempSync(join(tmpdir(), 'rendiconto-mut-'));
  const out = join(dir, `m${++seq}.mjs`);
  writeFileSync(out, src);
  try { return { mod: await import(pathToFileURL(out).href) }; }
  finally { rmSync(dir, { recursive: true, force: true }); }   // il modulo è già in memoria
}
const original = { rend: await import('../../api/owners/rendiconto.js'), brand: await import('../../api/_pdfbrand.js') };
// La guardia: vero sul file vero, falso sul mutante.
async function guard(name, rel, pairs, probe) {
  const m = await mutant(rel, pairs);
  if (m.stale) { check(`mutazione «${name}»: applicabile (il codice è cambiato: aggiorna la mutazione)`, false); console.log('  non trovato: ' + m.stale); return; }
  const key = rel.includes('_pdfbrand') ? 'brand' : 'rend';
  const okReal = await probe(original[key]);
  const okMut = await probe(m.mod);
  check(`mutazione «${name}»: il file vero passa, il difetto rimesso cade`, okReal === true && okMut === false);
}
const mkRes = () => ({ code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } });
const drive = async (mod, query = {}) => { const res = mkRes(); await mod.default({ method: 'POST', headers: { authorization: 'Bearer cron-test-secret' }, query, body: {} }, res); return res; };

// ── Dati: un mese con la rata del mese scaduta, una segnalata vecchia,
//    un contratto da caricare, interni presi in carico (date relative) ─────
const NOW = new Date();
const CUR = P.day(NOW).slice(0, 7), M = P.monthAdd(CUR, -1), M0 = P.monthAdd(M, -1);
function seed({ imported = true, gd = M0, mode } = {}) {
  F.reset();
  F.put('users/own1', { role: 'landlord', name: 'Chiara Prova', email: 'chiara@example.invalid', ...(mode ? { rendicontoMode: mode } : {}) });
  const src = imported ? { source: 'palazzo-import' } : {};
  for (const n of ['7', '11', '14']) F.put(`properties/p${n}`, { ownerId: 'own1', address: 'Piazzale Finto 42, Roma', interno: n, name: `Piazzale Finto 42 int. ${n}`, gestioneDal: gd, ...src });
  F.put('contracts/c7', { propertyId: 'p7', tenantName: 'Иван Тестов', landlordName: 'Prova Immobiliare S.r.l.', rent: 1500, oneriQuota: 120, status: 'active', startDate: M0 + '-01', ...src });
  F.put('contracts/c11', { propertyId: 'p11', tenantName: 'Olga Prova', landlordName: 'Prova Immobiliare S.r.l.', rent: 1600, status: 'active', startDate: M0 + '-01', ...src });
  F.put('contracts/c14', { propertyId: 'p14', tenantName: 'Pavel Prova', status: 'active', contractMissing: true, ...src });
  F.put(`payments/c7_${M}`, { contractId: 'c7', propertyId: 'p7', type: 'rent', amount: 1620, rentAmount: 1500, oneriAmount: 120, month: M, dueDate: M + '-05', status: 'pending' });
  F.put(`payments/c11_${M0}`, { contractId: 'c11', propertyId: 'p11', type: 'rent', amount: 1600, month: M0, dueDate: M0 + '-05', status: 'pending', tenantReported: true, tenantReportDate: M0 + '-04' });
  F.put(`payments/c11_${M}`, { contractId: 'c11', propertyId: 'p11', type: 'rent', amount: 1600, month: M, dueDate: M + '-05', status: 'paid', paidDate: M + '-04', paidVia: 'bonifico' });
}
const rendOf = async (mod) => { seed(); const out = await mod.run({ dry: true }); return out.results[0] || {}; };
const pdfOf = async (mod) => { seed({ mode: 'auto' }); await mod.run({}); const m = mails()[0]; return m ? F.pdfText(m.attachments[0].content) : ''; };

// ═══ Rilievo 7: la rata scaduta del mese chiuso È un arretrato ════════════
await guard('arretrati senza la rata del mese chiuso', 'owners/rendiconto.js',
  [['arrears: ar.amount, arrearsCount', 'arrears: round2(ar.amount - (um.lateAmount || 0)), arrearsCount']],
  async (mod) => (await rendOf(mod)).arrears === 1620);

// ═══ Rilievo 7: un bonifico segnalato non è un arretrato ═════════════════
await guard('«pending = in ritardo» (il segnalato tra gli arretrati)', 'owners/rendiconto.js',
  [["const late = other.filter((r) => r.state === 'overdue');", "const late = other.filter((r) => r.state !== 'paid' && r.dueDate && r.dueDate < asOf);"]],
  async (mod) => { const t = (await pdfOf(mod)).replace(/\n/g, ' '); const u11 = t.split('Int. 11')[1] || ''; return /bonifico segnalato/.test(u11) && !/Arretrato: rata di [^,]+, scaduta/.test(u11.split('Int. 14')[0]); });

// ═══ Rilievo 7: il contratto da caricare non ha €0 ════════════════════════
await guard('contratto da caricare a €0/mese', 'owners/rendiconto.js',
  [["if (placeholder) facts.push({ k: 'Contratto', v: 'in arrivo da BOOM' });", "if (placeholder) facts.push({ k: 'Contratto', v: eur(rent || 0) + '/mese' });"]],
  async (mod) => { const t = await pdfOf(mod); return /in arrivo da BOOM/.test(t) && !/€0(?![\d.,])/.test(t); });

// ═══ Rilievo 7: titoli tutti uguali (l'indirizzo senza interno) ═══════════
await guard('titoli di sezione = indirizzo ripetuto', 'owners/rendiconto.js',
  [["dedupeNames(sections, 'title', (s) => s.subtitle);", 'sections.forEach((s) => { s.title = s.address; });']],
  async (mod) => { const t = await pdfOf(mod); return /^Int\. 7/m.test(t) && /^Int\. 11/m.test(t) && /^Int\. 14/m.test(t); });

// ═══ Modalità: chi ha interni presi in carico parte in anteprima ═════════
await guard('nessuna anteprima per la presa in carico (tutto «auto»)', 'owners/rendiconto.js',
  [["return { mode: imported ? 'preview' : 'auto'", "return { mode: 'auto'"]],
  async (mod) => { seed(); await mod.run({}); return mails().length === 1 && mails()[0].to === 'operatore@example.invalid'; });

// ═══ Lacuna 2: lo stato «inviato» solo DOPO l'invio ══════════════════════
await guard('segnaposto scritto prima dell\'invio, mai corretto', 'owners/rendiconto.js',
  [["status: 'sending', phase: 'building'", "status: 'sent', phase: 'building'"],
    ["if (claimed) await mark(docId, { status: uncertain ? 'uncertain' : 'failed'", "if (false) await mark(docId, { status: uncertain ? 'uncertain' : 'failed'"]],
  async (mod) => {
    seed({ mode: 'auto' });
    globalThis.__mailHook = () => { throw new Error('smtp down'); };
    await mod.run({});
    globalThis.__mailHook = null;
    await mod.run({});
    return mails().length === 1 && mails()[0].to === 'chiara@example.invalid';
  });

// ═══ gestioneDal: un mese prima della gestione non parte ═════════════════
await guard('rendiconto per un mese prima della gestione BOOM', 'owners/rendiconto.js',
  [['if (gd && month < gd) { before.push({ ...names, gestioneDal: gd }); continue; }', '']],
  async (mod) => { seed({ gd: CUR, mode: 'auto' }); await mod.run({}); return mails().length === 0; });

// ═══ Rilievo 33: il locatore società detto ════════════════════════════════
await guard('locatore società taciuto', 'owners/rendiconto.js',
  [['if (lnames.length === 1 && norm(lnames[0]) !== norm(ownerName)) landlordLine = lnames[0];', '']],
  async (mod) => /Locatore: Prova Immobiliare S\.r\.l\. · alla c\.a\. di Chiara Prova/.test(await pdfOf(mod)));

// ═══ Rilievo 34: euro deterministici col punto delle migliaia ═════════════
await guard('euro senza separatore delle migliaia', 'owners/rendiconto.js',
  [["return (neg ? '-' : '') + '€' + i.replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.') + (d === '00' ? '' : ',' + d);", "return '€' + String(Math.round(v));"]],
  async (mod) => mod.eur(1620) === '€1.620' && mod.eur(1234.5) === '€1.234,50');

// ═══ Rilievo 34: il canale in parole ═════════════════════════════════════
await guard('canale grezzo («bank», «stripe»)', 'owners/rendiconto.js',
  [['const v = VIA[norm(p && p.paidVia)] || \'\'', 'const v = str(p && p.paidVia)']],
  async (mod) => mod.viaText({ paidVia: 'stripe' }) === 'carta, tramite BOOM' && mod.viaText({ paidVia: 'bank' }) === 'bonifico');

// ═══ Lacuna 4: i nomi non latini traslitterati, mai vuoti ══════════════════
await guard('wa() che cancella invece di traslitterare', '_pdfbrand.js',
  [['    out += latinOf(ch, chars[i - 1], chars[i + 1]);', '    out += \'\';'],
    ["if (/\\p{L}/u.test(src) && !/[A-Za-z0-9\\u00C0-\\u00FF]/.test(out)) return '(testo in caratteri non stampabili)';", '']],
  async (mod) => mod.wa('Иван Петров') === 'Ivan Petrov' && mod.wa('Şükrü Yılmaz') === 'Sükrü Yilmaz' && mod.wa('王小明') !== '');

console.log(`\nRendiconto · mutazioni: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLITI: ' + bad.join(' | ')); process.exit(1); }
process.exit(0);
