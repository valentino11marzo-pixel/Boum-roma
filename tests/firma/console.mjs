// tests/firma/console.mjs — LA CONSOLE PRE-AGREEMENT RENDE LO STATO VERO.
//
// Il caso Inês (12/09/2026): contratto firmato da entrambi e attivo, e la
// riga della console ferma su «paid · 🖊 Reinvia Magic Sign · dopo la firma
// dell'inquilino…». Qui si MONTA la console vera (i suoi <script>) in un
// contesto Node con un DOM minimo e un Firestore finto, si consegnano
// quattro deal nei quattro stati possibili e si legge l'HTML che paRow
// produce davvero — non una regex sulla sorgente:
//   A  contratto creato, nessuna firma      → 🖊 Reinvia Magic Sign
//   B  l'inquilino ha firmato               → link del proprietario, MAI Reinvia
//   C  firmato da entrambi (delega)         → PDF firmato + certificato
//   D  contratto non (ancora) letto         → il ripiego: la stampa sulla proposta
// Uso: node tests/firma/console.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(ROOT, 'pre-agreement-admin.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);

// ── DOM minimo: solo ciò che la console tocca al boot e nel render ──
const els = {};
const mkEl = (id) => els[id] || (els[id] = {
  id, innerHTML: '', textContent: '', style: {}, value: '',
  classList: { toggle() {}, add() {}, remove() {} },
  querySelectorAll: () => [], querySelector: () => ({ textContent: '' }),
  addEventListener() {}, scrollIntoView() {}, getAttribute() { return null; },
});
const chipI = {};
const chips = ['all', 'open', 'close', 'paid', 'signed', 'nocontract', 'reserve', 'revoked'].map(f => ({
  getAttribute: () => f, querySelector: () => (chipI[f] || (chipI[f] = { textContent: '' })), classList: { toggle() {} },
}));
mkEl('fchips').querySelectorAll = () => chips;

// ── Firestore finto: consegna gli snapshot quando il test decide ──
let paApply = null; const cWatch = {}; const updates = [];
const firestore = () => ({ collection: (name) => ({
  orderBy: () => ({ limit: () => ({ onSnapshot: (fn) => { paApply = fn; }, get: async () => { throw new Error('offline'); } }) }),
  doc: (id) => ({
    onSnapshot: (fn) => { cWatch[id] = fn; }, get: async () => { throw new Error('offline'); },
    update: async (patch) => { updates.push({ name, id, patch }); },
  }),
  limit: () => ({ get: async () => ({ forEach() {} }) }),
}) });
const ctx = {
  console, setTimeout, clearTimeout, Promise, JSON, Math, Date, String, Number, Array, Object,
  encodeURIComponent, decodeURIComponent, parseFloat, parseInt, isNaN, Intl, RegExp, Error,
  document: { getElementById: mkEl, addEventListener() {}, createElement: () => mkEl('tmp' + Math.random()), body: { appendChild() {} }, querySelectorAll: () => [], head: { appendChild() {} } },
  location: { origin: 'https://www.boomrome.com', hash: '' }, navigator: { clipboard: { writeText() {} } },
  localStorage: { getItem: () => null, setItem() {} }, alert() {}, prompt: () => null,
  firebase: { firestore },
  BoomPortal: { requireAuth: () => ({ then: (fn) => { fn({ user: { email: 'op@x', uid: 'u1', getIdToken: async () => 't' } }); return { catch() {} }; } }) },
  fetch: async () => ({ json: async () => ({ ok: true }) }),
};
ctx.window = ctx; ctx.self = ctx;
vm.createContext(ctx);
for (const s of scripts) vm.runInContext(s, ctx);
if (!paApply) { console.error('FAIL la console non si è agganciata a preAgreements'); process.exit(1); }

const snap = (rows) => ({ forEach: (fn) => rows.forEach(r => fn({ id: r.id, data: () => r })) });
const base = {
  status: 'paid', paidEur: 1450, paidAt: '2026-08-20', ref: 'BOOM-X', createdAt: '2026-08-10',
  tenant: { fullName: 'Ines Test', phone: '+39333' }, landlord: { name: 'Giulia', phone: '+39334' },
  property: { address: 'Viale Angelico 9' }, money: { rent: 1450, dueAtSigning: 2000 },
  lease: { months: 12, startDate: '2026-09-01' }, propertyId: 'p1', signSentAt: '2026-08-21',
  tenantSignUrl: 'https://www.boomrome.com/sign?sign=T', landlordSignUrl: 'https://www.boomrome.com/sign?sign=L',
};
paApply(snap([
  { ...base, id: 'A', contractId: 'pa_A' },
  { ...base, id: 'B', contractId: 'pa_B' },
  { ...base, id: 'C', contractId: 'pa_C', delegated: true },
  { ...base, id: 'D', contractId: 'pa_D', contractSignatureStatus: 'partial', tenantSignedAt: '2026-09-01T10:00:00Z' },
  /* E · la proposta ORFANA (Léa): pagata, senza contractId, ma contracts/pa_E esiste ed è firmato */
  { ...base, id: 'E', contractId: undefined, propertyId: 'p1' },
  /* F · il binario morto: pagata 40 giorni fa, nessun contratto, nessun immobile nel portal */
  { ...base, id: 'F', contractId: undefined, propertyId: null, signSentAt: null, paidAt: new Date(Date.now() - 40 * 86400000).toISOString() },
  /* G · accettata NON pagata (la proposta di prova che restava lì per sempre) */
  { ...base, id: 'G', status: 'accepted', paidEur: null, paidAt: null, contractId: undefined, propertyId: null, signSentAt: null },
]));
const before = els.paRows.innerHTML;
cWatch['pa_A']({ exists: true, data: () => ({ signatureStatus: 'none', generatedPDF: 'https://st/contracts/pa_A/contract.pdf' }) });
cWatch['pa_B']({ exists: true, data: () => ({ tenantSignature: 'x', tenantSignedAt: '2026-09-02T09:00:00Z', signatureStatus: 'partial' }) });
cWatch['pa_C']({ exists: true, data: () => ({ tenantSignature: 'x', landlordSignature: 'y', tenantSignedAt: '2026-09-02T09:00:00Z', landlordSignedAt: '2026-09-03T09:00:00Z', fullySignedAt: '2026-09-03T09:00:00Z', signatureStatus: 'complete', signedPdfUrl: 'https://s/signed.pdf', signingCertificateUrl: 'https://s/cert.pdf', finalizedAt: 'x' }) });
cWatch['pa_E']({ exists: true, data: () => ({ tenantSignature: 'x', landlordSignature: 'y', tenantSignedAt: '2026-08-14T09:00:00Z', landlordSignedAt: '2026-08-14T10:00:00Z', fullySignedAt: '2026-08-14T10:00:00Z', signatureStatus: 'complete', signedPdfUrl: 'https://s/lea.pdf', finalizedAt: 'x' }) });
cWatch['pa_F']({ exists: false, data: () => null });
cWatch['pa_G']({ exists: false, data: () => null });
await new Promise(r => setTimeout(r, 200));   // scheduleRender è debounced

const rows = els.paRows.innerHTML.split('<div class="parow').slice(1);
const has = (i, re) => re.test(rows[i] || '');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n); } };

ok(rows.length === 7 && Object.keys(cWatch).length === 7, 'sette deal renderizzati, sette contratti in ascolto (anche pa_<id> per chi non ha contractId)');
ok(before.split('<div class="parow').length === 8 && !/chip signed/.test(before) && /chip signing">✍ firmato inquilino/.test(before),
  'PRIMA che i contratti arrivino la lista è intera e il ripiego (stampa sulla proposta) già parla');
ok(has(0, /Reinvia Magic Sign/) && has(0, /Firma su WhatsApp/) && !has(0, /chip sign/),
  'A · nessuna firma: 🖊 Reinvia Magic Sign + Firma su WhatsApp, nessun chip firma');
ok(has(0, /href="https:\/\/st\/contracts\/pa_A\/contract\.pdf"[^>]*>📄 Contratto \(PDF, non firmato\)/) && !has(2, /non firmato/) && !has(1, /non firmato/),
  'A · il contratto GENERATO si apre dalla console prima della firma (generatedPDF); a firme complete (C) o senza PDF letto (B) il link non c’è');
ok(has(1, /chip signing">✍ firmato inquilino/) && has(1, /pbtn prim wa[^>]*>📲 Firma proprietario/) && !has(1, /Reinvia Magic Sign/)
  && has(1, /L’inquilino ha firmato<\/b> il 2026-09-02/) && has(1, /non serve più/),
  'B · inquilino firmato: chip ✍, link del proprietario PRIMARIO, mai più Reinvia Magic Sign');
ok(has(2, /chip signed">✓ firmato/) && has(2, /📥 Contratto firmato/) && has(2, /Certificato FES/)
  && !has(2, /Copia link delega/) && !has(2, /Reinvia Magic Sign/) && has(2, /st-paid st-signed/)
  && has(2, /Contratto firmato da entrambi<\/b> il 2026-09-03/) && has(2, /attivo: certificato FES/),
  'C · firmato da entrambi: chip ✓, PDF firmato + certificato, niente inviti, prossimo passo = registrazione');
ok(has(3, /chip signing">✍ firmato inquilino/) && !has(3, /Reinvia Magic Sign/),
  'D · contratto non letto: la stampa sulla proposta basta a togliere il Reinvia');
/* ✎ COMPLETA I DATI + 📄 BOZZA (21/09/2026): il completamento SOLO con un
   contratto non ancora firmato da entrambi; la bozza SOLO senza contratto. */
ok(has(0, /onclick="completaDati\('A'\)"[^>]*>✎ Completa i dati/) && !has(2, /Completa i dati/) && !has(0, /Bozza contratto/),
  'A · contratto nato e non firmato: ✎ Completa i dati (mai la bozza); C · firmato da entrambi: niente da completare');
ok(has(6, /onclick="draftPdf\('G',this\)"[^>]*>📄 Bozza contratto/) && !has(6, /Completa i dati/) && has(5, /Bozza contratto/),
  'G/F · senza contratto: 📄 Bozza contratto (lo stesso impaginato, senza creare niente), mai ✎ Completa i dati');
ok(has(4, /chip signed">✓ firmato/) && has(4, /📥 Contratto firmato/) && !has(4, /→ Contratto/),
  'E · proposta orfana: il contratto pa_E viene ADOTTATO — chip ✓, PDF firmato, niente «→ Contratto»');
ok(updates.some(u => u.name === 'preAgreements' && u.id === 'E' && u.patch.contractId === 'pa_E' && u.patch.contractAdoptedAt),
  'E · il back-link viene RISCRITTO sulla proposta (contractId + contractAdoptedAt)');
ok(!updates.some(u => u.id !== 'E'), '… e solo su di lei: nessuna scrittura sulle altre');
ok(has(5, /contratto NON ancora creato nel sistema/) && has(5, /40 giorni fa/) && has(5, /→ Contratto/) && has(5, /lo crei dalla proposta con un tap/) && !has(5, /crealo prima da Immobili/) && !has(5, /Revoca</),
  'F · pagato senza contratto: la riga lo dice (da quanti giorni), la mossa è → Contratto che CREA l’immobile dalla proposta, niente Revoca su un pagato');
ok(has(6, /Revoca</) && has(6, /Pagamento ancora in sospeso/) && !has(6, /contratto NON ancora creato/),
  'G · accettato non pagato: Revoca disponibile, nessun allarme «senza contratto» (non ha pagato)');
ok(!has(0, /Revoca</) && !has(2, /Revoca</), 'A e C (pagati/contrattualizzati): mai Revoca');
ok(/^2 <small>\/ 5 creati<\/small>$/.test(els.kContr.innerHTML), 'KPI: 2 contratti firmati su 5 creati (E adottato conta)');
ok(chipI.signed.textContent === 2 || chipI.signed.textContent === '2', 'chip Firmati conta 2');
ok(chipI.nocontract.textContent === 1 || chipI.nocontract.textContent === '1', 'chip Da contratto conta 1 (solo F)');
ctx.setFilter('nocontract', chips.find(c => c.getAttribute() === 'nocontract'));
const onlyNo = els.paRows.innerHTML.split('<div class="parow').slice(1);
ok(onlyNo.length === 1 && /contratto NON ancora creato/.test(onlyNo[0]), 'filtro Da contratto → resta solo F');

// filtro Firmati: solo C
ctx.setFilter('signed', chips.find(c => c.getAttribute() === 'signed'));
const onlySigned = els.paRows.innerHTML.split('<div class="parow').slice(1);
ok(onlySigned.length === 2 && onlySigned.every(r => /chip signed/.test(r)), 'filtro Firmati → restano C ed E, i due firmati da entrambi');

console.log(`\n${fail ? '✗' : '✓'} console PA: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
