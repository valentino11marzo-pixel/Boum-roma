// tests/consoleux/run.mjs — LA RIGA DELLA CONSOLE CHE DICE DOV'È IL DEAL.
//
// 3/11/2026. Misurato a 390px: una riga della console proposte portava fino
// a 18 bottoni dello stesso peso (780px di riga) e finiva alla firma —
// registrazione, chiavi e provvigione vivevano in altre pagine, e un deal
// «firmato» poteva restare fermo un mese senza che la console lo dicesse.
// Qui si MONTA la console vera (i suoi <script>) in un contesto Node con un
// DOM minimo, un Firestore finto e un orologio fermo, e si prova:
//   1. IL PERCORSO — sette tappe dai FATTI (proposta + contratto): mai una
//      tappa spuntata per stima, il contratto non letto è «?», un fatto
//      assente si dice per quello che è («nessuna registrazione segnata»),
//      a contratto concluso nessun allarme;
//   2. LA SCADENZA RLI — la copia della console coincide con
//      FIELDS.rliFacts().registrationDeadline sugli stessi contratti;
//   3. LE AZIONI — nessuna sparisce: ognuna compare UNA volta, o in vista o
//      in «⋯ Altre azioni»; in vista la primaria, le vie d'uscita e al
//      massimo le mosse di contesto; il menu aperto resta aperto;
//   4. IL FILTRO «Fermi» conta i deal con una tappa ferma;
//   5. MUTAZIONI — ogni difetto reintrodotto nella console fa cadere un check.
// Uso: node tests/consoleux/run.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import FIELDS from '../../js/contract-fields.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HTML = readFileSync(join(ROOT, 'pre-agreement-admin.html'), 'utf8');
const NOW = Date.parse('2026-11-03T10:00:00Z');

/* ── i deal (oggi = 3/11/2026, ora di Roma) ─────────────────────────── */
const base = {
  status: 'paid', paidEur: 2000, paidAt: '2026-10-01T10:00:00Z', acceptedAt: '2026-09-30T10:00:00Z', ref: 'BOOM-X', createdAt: '2026-09-28',
  tenant: { fullName: 'Ines Test', phone: '+39333' }, landlord: { name: 'Giulia', phone: '+39334' },
  property: { address: 'Viale Angelico 9' }, money: { rent: 1000, dueAtSigning: 2000 },
  lease: { months: 12, startDate: '2026-10-15' }, propertyId: 'p1', signSentAt: '2026-10-02',
  convertedAt: '2026-10-01T12:00:00Z',
};
const signed = (x) => ({ tenantSignature: 'x', landlordSignature: 'y', signatureStatus: 'complete', finalizedAt: '2026-10-10', ...x });
const DEALS = [
  { id: 'S', ...base, status: 'sent', paidAt: null, paidEur: 0, acceptedAt: null, contractId: undefined },
  { id: 'P', ...base, status: 'accepted', paidAt: null, paidEur: 0, acceptedAt: '2026-10-30T10:00:00Z', contractId: undefined, signSentAt: null },
  { id: 'N', ...base, paidAt: '2026-10-25T10:00:00Z', contractId: undefined, propertyId: null, signSentAt: null },
  { id: 'R1', ...base, contractId: 'pa_R1' },
  { id: 'R2', ...base, contractId: 'pa_R2' },
  { id: 'G', ...base, contractId: 'pa_G', money: { rent: 1000, dueAtSigning: 2000, feeTotal: 1464, feeDue: 'move-in' }, lease: { months: 12, startDate: '2026-10-01' } },
  { id: 'K', ...base, contractId: 'pa_K', money: { rent: 1000, dueAtSigning: 2000, feeTotal: 1464, feeDue: 'move-in' }, feePaidAt: '2026-10-02T09:00:00Z' },
  { id: 'O', ...base, contractId: 'pa_O' },
  { id: 'U', ...base, contractId: 'pa_U', tenantSignUrl: 'https://www.boomrome.com/sign?sign=T' },
  { id: 'FS', ...base, contractId: 'pa_FS', money: { rent: 1000, dueAtSigning: 3464, feeTotal: 1464, feeDue: 'signing' } },
  { id: 'Q', ...base, contractId: 'pa_Q', lease: { months: 12, startDate: '2026-11-01' } },
];
const CONTRACTS = {
  pa_R1: signed({ fullySignedAt: '2026-10-10T09:00:00Z', startDate: '2026-10-15' }),
  pa_R2: signed({ fullySignedAt: '2026-09-01T09:00:00Z', startDate: '2026-09-01' }),
  pa_G: signed({ fullySignedAt: '2026-09-25T09:00:00Z', startDate: '2026-10-01', registrationStatus: 'registered', rliRegisteredAt: '2026-10-05', verbaleConsegna: { at: '2026-10-01T17:00:00Z', url: 'https://st/v.pdf' } }),
  pa_K: signed({ fullySignedAt: '2026-09-25T09:00:00Z', startDate: '2026-10-01', registrationStatus: 'registered', rliRegisteredAt: '2026-10-05', verbaleConsegna: { at: '2026-10-01T17:00:00Z' } }),
  pa_O: signed({ fullySignedAt: '2025-09-01T09:00:00Z', startDate: '2025-09-01', endDate: '2026-10-31' }),
  pa_FS: signed({ fullySignedAt: '2026-10-28T09:00:00Z', startDate: '2026-12-01' }),
  pa_Q: signed({ fullySignedAt: '2026-10-20T09:00:00Z', startDate: '2026-11-01', registrationStatus: 'sent', aspiRequestedAt: '2026-10-20T15:00:00Z' }),
  // pa_U: il contratto non arriva mai (canale muto)
};

/* ── montaggio della console (stesso schema di tests/firma/console.mjs) ── */
/* la logica della console vive in una IIFE: l'aggancio per il test si
   aggiunge SOLO alla copia montata qui, mai alla pagina servita */
const HOOK = "window.__t={dealJourney:dealJourney,rliDeadlineUi:rliDeadlineUi,actsBar:actsBar};\n})();";
function hooked(html) {
  const i = html.lastIndexOf('})();');
  return html.slice(0, i) + HOOK + html.slice(i + 5);
}
async function mount(html0) {
  const html = hooked(html0).replace('function actsBar(html,o){', 'function actsBar(html,o){if(window.__rawActs)window.__rawActs[o&&o.id]=html;');
  const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const els = {};
  const mkEl = (id) => els[id] || (els[id] = {
    id, innerHTML: '', textContent: '', style: {}, value: '',
    classList: { toggle() {}, add() {}, remove() {} },
    querySelectorAll: () => [], querySelector: () => ({ textContent: '' }),
    addEventListener() {}, scrollIntoView() {}, getAttribute() { return null; }, remove() {},
  });
  const chipI = {};
  const chips = ['all', 'open', 'close', 'paid', 'signed', 'nocontract', 'stuck', 'reserve', 'revoked'].map(f => ({
    getAttribute: () => f, querySelector: () => (chipI[f] || (chipI[f] = { textContent: '' })), classList: { toggle() {} },
  }));
  mkEl('fchips').querySelectorAll = () => chips;
  let paApply = null; const cWatch = {};
  const firestore = () => ({ collection: () => ({
    orderBy: () => ({ limit: () => ({ onSnapshot: (fn) => { paApply = fn; }, get: async () => { throw new Error('offline'); } }) }),
    doc: (id) => ({ onSnapshot: (fn) => { cWatch[id] = fn; }, get: async () => { throw new Error('offline'); }, update: async () => {} }),
    limit: () => ({ get: async () => ({ forEach() {} }) }),
  }) });
  class FakeDate extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, Promise, JSON, Math, Date: FakeDate, String, Number, Array, Object,
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
  if (!paApply) throw new Error('la console non si è agganciata a preAgreements');
  // le azioni grezze, prima dello smistamento: per provare che nessuna sparisce
  const raw = ctx.__rawActs = {};
  ctx.dealJourney = ctx.__t.dealJourney; ctx.rliDeadlineUi = ctx.__t.rliDeadlineUi;
  paApply({ forEach: (fn) => DEALS.forEach(r => fn({ id: r.id, data: () => r })) });
  for (const [id, c] of Object.entries(CONTRACTS)) if (cWatch[id]) cWatch[id]({ exists: true, data: () => c });
  await new Promise(r => setTimeout(r, 150));
  return { ctx, els, raw, chipI };
}

/* ── i controlli: una funzione, così le mutazioni la riusano ─────────── */
async function checks(html) {
  const out = [];
  const ok = (c, n) => out.push({ c: !!c, n });
  let M;
  try { M = await mount(html); } catch (e) { ok(false, 'la console si monta (' + e.message + ')'); return out; }
  const { ctx, els, raw, chipI } = M;
  const J = (id) => ctx.dealJourney(DEALS.find(d => d.id === id));
  const step = (j, k) => j && j.steps.find(s => s.k === k);
  const rows = els.paRows.innerHTML.split('<div class="parow').slice(1);
  const rowOf = (id) => rows[DEALS.findIndex(d => d.id === id)] || '';

  // 1 · IL PERCORSO
  ok(J('S') === null && !/class="journey"/.test(rowOf('S')), 'S · proposta solo inviata: nessun percorso (non è ancora un deal)');
  const p = J('P');
  ok(p && p.cur && p.cur.k === 'pay' && step(p, 'pay').late === 'accettata 4 gg fa, non pagata' && step(p, 'acc').state === 'done',
    'P · accettata e non pagata da 4 giorni: tappa «Pagato» ferma, detta in giorni');
  const n = J('N');
  ok(n && n.cur.k === 'ctr' && step(n, 'ctr').late === 'pagato 9 gg fa, contratto non creato' && step(n, 'reg').state === 'todo',
    'N · pagato senza contratto: tappa «Contratto» ferma');
  ok(!/<span class="jlate">[^<]*contratto non creato/.test(rowOf('N')) && /contratto NON ancora creato nel sistema/.test(rowOf('N')) && !/class="nextstep"/.test(rowOf('N')),
    'N · il ritardo lo dice UNA volta (l’avviso della riga), non tre: niente jlate né prossimo passo ripetuti');
  const r1 = J('R1');
  ok(r1 && r1.cur.k === 'reg' && /nessuna registrazione segnata · entro il 09\/11/.test(step(r1, 'reg').note) && step(r1, 'reg').late === 'RLI entro il 09/11 — 6 gg',
    'R1 · firmato il 10/10, ingresso il 15/10: RLI entro il 9/11 (30 gg da min(stipula, decorrenza)), a 6 giorni = ferma');
  ok(step(r1, 'key').late === 'ingresso del 15/10, nessun verbale di consegna' && !step(r1, 'fee'),
    'R1 · ingresso passato senza verbale: anche «Chiavi» ferma; nessuna provvigione da incassare = nessuna tappa');
  ok(/RLI entro il 09\/11/.test(rowOf('R1')) && /href="\/portal#aspi=pa_R1"[^>]*>🏛 Apri la registrazione/.test(rowOf('R1')),
    'R1 · la riga lo dice e porta alla registrazione del contratto giusto (/portal#aspi=)');
  const r2 = J('R2');
  ok(step(r2, 'reg').late === 'scadenza RLI passata il 01/10 (nessuna registrazione segnata)' && !/non registrato/i.test(rowOf('R2')),
    'R2 · scadenza passata: «nessuna registrazione segnata», mai «non registrato» (il fatto assente non è un fatto)');
  const g = J('G');
  ok(g && g.cur.k === 'fee' && step(g, 'reg').state === 'done' && step(g, 'key').state === 'done'
    && step(g, 'fee').late === 'provvigione €1,464 aperta da 33 gg dall’ingresso',
    'G · registrato e consegnato, provvigione all’ingresso aperta da 33 giorni: tappa «Provvigione» ferma');
  ok(/Registrazione ✓ il 05\/10\. Prossimo passo: <b>provvigione<\/b>/.test(rowOf('G')) && !/Prossimo passo: <b>registrazione<\/b>/.test(rowOf('G')),
    'G · il prossimo passo segue il percorso: a registrazione fatta non dice più «registrazione»');
  const k = J('K');
  ok(k && !k.cur && !k.late && /✓ <b>Percorso completo<\/b>/.test(rowOf('K')) && /Registrazione ✓ il 05\/10 — percorso completo/.test(rowOf('K')),
    'K · tutte le tappe fatte: «Percorso completo», nessun allarme');
  const o = J('O');
  ok(o && o.over && !o.late && /contratto concluso/i.test(rowOf('O')),
    'O · contratto concluso (fine il 31/10): si racconta, non si allarma — anche senza registrazione segnata');
  const u = J('U');
  ok(step(u, 'reg').state === 'unk' && step(u, 'key').state === 'unk' && !(u.late || []).some(s => s.k === 'reg' || s.k === 'key'),
    'U · contratto non ancora letto: Registrazione e Chiavi «?» — mai spuntate, mai in ritardo');
  ok(!step(J('FS'), 'fee') && step(J('FS'), 'pay').state === 'done',
    'FS · provvigione pagata alla firma: niente tappa a parte, è dentro «Pagato»');
  const q = J('Q');
  ok(step(q, 'reg').note === 'inviata il 20/10 · entro il 19/11' && !step(q, 'reg').late,
    'Q · registrazione inviata: «inviata il … · entro il …», non ferma a 16 giorni dalla scadenza');
  ok(/<ol class="jsteps" aria-label="Percorso del deal">/.test(rowOf('R1')) && (rowOf('G').match(/<li class="js /g) || []).length === 7 && (rowOf('R1').match(/<li class="js /g) || []).length === 6,
    'il percorso è una lista ordinata accessibile: 7 tappe con la provvigione, 6 senza');

  // 2 · LA SCADENZA RLI (parità con FIELDS.rliFacts)
  const sample = [
    { fullySignedAt: '2026-10-10T09:00:00Z', startDate: '2026-10-15' }, { fullySignedAt: '2026-10-20T09:00:00Z', startDate: '2026-10-01' },
    { fullySignedAt: '2026-01-31', startDate: '2026-03-01' }, { fullySignedAt: '2028-01-30T23:30:00Z', startDate: '2028-02-15' },
    { fullySignedAt: '2026-12-15', startDate: '2027-01-01' }, { signatureDate: '2026-06-01', startDate: '2026-07-01' },
    { startDate: '2026-11-20' }, { fullySignedAt: '2026-09-09' }, {},
  ];
  const mism = sample.filter(c => ctx.rliDeadlineUi(c) !== FIELDS.rliFacts(c).registrationDeadline);
  ok(mism.length === 0, 'la scadenza RLI della console = FIELDS.rliFacts().registrationDeadline su ' + sample.length + ' contratti (fine mese, anno nuovo, bisestile, solo decorrenza, niente)' + (mism.length ? ' — diverge su ' + JSON.stringify(mism) : ''));

  // 3 · LE AZIONI: nessuna sparisce, in vista solo il necessario
  const items = (h) => String(h || '').match(/<(button|a)\b[\s\S]*?<\/\1>/g) || [];
  let lost = [], dup = [], over = [];
  for (const d of DEALS) {
    const r = rowOf(d.id), acts = r.slice(r.indexOf('<div class="acts">'));
    for (const it of items(raw[d.id])) {
      const c = acts.split(it).length - 1;
      if (c === 0) lost.push(d.id + ': ' + it.slice(0, 60)); else if (c > 1) dup.push(d.id);
    }
    const vis = acts.split('<details')[0];
    const nVis = items(vis).filter(h => !/class="pbtn prim/.test(h) && !/resolvePA\(/.test(h)).length;
    const max = (d.status === 'sent' || d.status === 'viewed' || d.status === 'revoked') ? 4 : 2;
    if (nVis > max) over.push(d.id + ':' + nVis);
  }
  ok(Object.keys(raw).length === DEALS.length && lost.length === 0 && dup.length === 0,
    'nessuna azione sparisce né si sdoppia: ogni bottone della riga compare UNA volta, in vista o in «⋯ Altre azioni»' + (lost.length ? ' — persi: ' + lost.join(' | ') : '') + (dup.length ? ' — doppi: ' + dup.join(',') : ''));
  ok(over.length === 0, 'in vista: la primaria, le vie d’uscita e al massimo 2 mosse di contesto (4 su una proposta non accettata)' + (over.length ? ' — troppe: ' + over.join(',') : ''));
  const rN = rowOf('N'), visN = rN.slice(rN.indexOf('<div class="acts">')).split('<details')[0];
  ok(/>→ Contratto</.test(visN) && /uploadSigned\('N'/.test(visN) && /sendLandlordScheda\('N'/.test(visN) && !/feeLinkFor|resendCopy|dupPA/.test(visN),
    'N · pagato senza contratto: in vista → Contratto, 📎 Carica firmato, 📋 Scheda proprietario (le tre mosse che l’avviso nomina)');
  ok(/<span class="mgl">Firma<\/span>[\s\S]*?askMandateFor\('N'\)/.test(rN) && /<span class="mgl">Soldi<\/span><div class="mgb"><button class="pbtn" onclick="feeLinkFor|<span class="mgl">Proposta<\/span>[\s\S]*resendCopy\('N'/.test(rN),
    '«⋯ Altre azioni» raggruppa per Firma · Contratto · Soldi · Proposta');
  const rR1 = rowOf('R1'), visR1 = rR1.slice(rR1.indexOf('<div class="acts">')).split('<details')[0];
  ok(/#aspi=pa_R1/.test(visR1) && !/uploadRevision|completaDati|sendSign/.test(rR1),
    'R1 · firmato: in vista 🏛 Registrazione e documenti (la tappa del momento), e niente più mosse della firma');
  ctx.moreTog('N', true); ctx.renderList();
  const rN2 = els.paRows.innerHTML.split('<div class="parow').slice(1)[DEALS.findIndex(d => d.id === 'N')];
  ctx.moreTog('N', false); ctx.renderList();
  const rN3 = els.paRows.innerHTML.split('<div class="parow').slice(1)[DEALS.findIndex(d => d.id === 'N')];
  ok(/<details class="more" open ontoggle="moreTog\('N',this\.open\)">/.test(rN2) && /<details class="more" ontoggle=/.test(rN3),
    'il menu aperto resta aperto quando la riga si ridisegna (a ogni firma, a ogni snapshot), e si richiude quando lo chiudi');

  // 4 · IL FILTRO «Fermi»
  const stuck = DEALS.filter(d => { const j = ctx.dealJourney(d); return j && j.late; }).map(d => d.id).sort();
  ok(JSON.stringify(stuck) === JSON.stringify(['G', 'N', 'P', 'Q', 'R1', 'R2']) && chipI.stuck && chipI.stuck.textContent === 6,
    'filtro «Fermi»: P, N, R1, R2, G, Q — mai K (completo), O (concluso), U (non letto), FS, S (got: ' + stuck.join(',') + ', chip ' + (chipI.stuck && chipI.stuck.textContent) + ')');
  ctx.setFilter('stuck', { classList: { toggle() {} } });
  const onlyStuck = els.paRows.innerHTML.split('<div class="parow').slice(1).length;
  ctx.setFilter('all', { classList: { toggle() {} } });
  ok(onlyStuck === 6, 'il filtro «Fermi» mostra esattamente quei sei deal');
  return out;
}

/* ── giro vero ─────────────────────────────────────────────────────── */
let pass = 0, fail = 0;
for (const r of await checks(HTML)) { if (r.c) { pass++; console.log('PASS ' + r.n); } else { fail++; console.log('✗ FAIL ' + r.n); } }

/* ── mutazioni: ogni difetto reintrodotto deve far cadere almeno un check ── */
const MUT = [
  ['scadenza RLI a 31 giorni', "t.setUTCDate(t.getUTCDate()+30);return t.toISOString().slice(0,10);", "t.setUTCDate(t.getUTCDate()+31);return t.toISOString().slice(0,10);"],
  ['allarme anche a contratto concluso', "var lateIf=function(cond,msg){return (!over&&cond)?msg:'';};", "var lateIf=function(cond,msg){return cond?msg:'';};"],
  ['contratto non letto trattato come «da fare»', "else if(!cl)add('reg','Registrazione','unk');", "else if(!cl)add('reg','Registrazione','todo','','nessuna registrazione segnata','scadenza');"],
  ['il menu perde un\'azione', "var by={};more.forEach", "more.shift();var by={};more.forEach"],
  ['tutte le azioni in vista', "items.forEach(function(h){(/class=\"pbtn prim/.test(h)||/resolvePA\\(/.test(h)?vis:more).push(h);});", "items.forEach(function(h){vis.push(h);});"],
  ['il contesto ignora il tetto', "if(room<=0)return;", "if(false)return;"],
  ['il menu si richiude a ogni ridisegno', "(MORE_OPEN[o.id]?' open':'')", "''"],
  ['«non registrato» invece di «nessuna registrazione segnata»', "'scadenza RLI passata il '+fmtD(dl)+' (nessuna registrazione segnata)'", "'scadenza RLI passata il '+fmtD(dl)+' (non registrato)'"],
  ['il prossimo passo ripete «registrazione» a registrazione fatta', "if(!reg||reg.state!=='done')return", "if(true)return"],
  ['provvigione alla firma contata due volte', "if(feeT>0&&m.feeDue!=='signing'){", "if(feeT>0){"],
];
let caught = 0;
for (const [name, a, b] of MUT) {
  if (!HTML.includes(a)) { fail++; console.log('✗ FAIL mutazione «' + name + '»: ancora assente dalla sorgente'); continue; }
  const res = await checks(HTML.replace(a, b));
  if (res.some(r => !r.c)) { caught++; console.log('PASS mutazione presa: ' + name); }
  else { fail++; console.log('✗ FAIL mutazione NON presa: ' + name); }
}
pass += caught;
console.log((fail ? '✗' : '✓') + ' console UX: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
