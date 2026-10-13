// tests/conto/run.mjs — IL CONTO DELLA SUA CASA: motore, porta, PDF, pagine.
//
// Il magnete dei proprietari (/canone, la porta di /owners, la barra del
// Pacchetto) dice a un proprietario quanto può chiedere a canone concordato.
// Un numero sbagliato qui è un canone nullo nella parte eccedente (art. 13
// L. 431/98) che il proprietario firma fidandosi di noi. Quindi:
//  1. il massimo non supera MAI fMax × superficie convenzionale (tutte le zone);
//  2. il server ricalcola: un numero mandato dal browser non vale;
//  3. il PDF si stampa dalla FOTO, col link firmato, senza dati personali;
//  4. le pagine non hanno un'aritmetica loro e non promettono ciò che il codice
//     non fa (Lei, «ufficiale», «60–150», il vecchio ?canone= nel Pacchetto);
//  5. in un browser vero il numero sullo schermo è quello del motore.
//
//   node tests/conto/run.mjs
import { readFileSync } from 'node:fs';
import http from 'node:http';
import zlib from 'node:zlib';
import { join, extname } from 'node:path';

const R = new URL('../../', import.meta.url).pathname;
const read = f => readFileSync(R + f, 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗ ${name}\x1b[0m${detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 500) : ''}`); }
};
const section = t => console.log(`\n\x1b[1m▸ ${t}\x1b[0m`);

process.env.HOMIE_SECRET = 'test-secret';
process.env.TELEGRAM_CHAT_ID = '42';
process.env.TELEGRAM_BOT_TOKEN = 'tg';

const CONTO = (await import('../../js/conto-engine.js')).default;
const CANONE = (await import('../../js/canone-engine.js')).default;

// ─────────────────────────────────────────────────────────────────────────
section('il motore: il massimo non supera mai la fascia, su tutte le zone');
{
  const MQ = [10, 30, 45.5, 46, 60, 70, 71, 120, 600];
  const PSETS = [null, [], [0, 1], [0, 1, 2], [0, 1, 2, 3, 4, 5, 6], Array.from({ length: 20 }, (_, i) => i)];
  const MAGS = [[], ['att', 'clA', 'eco', 'sis'], ['asc'], ['asc', 'sem'], ['clD', 'asc']];
  const TIPI = ['32', 'trans', 'stud'];
  let over = [], incoh = [], n = 0;
  for (const z of CONTO.ZONES) for (const mq of MQ) for (const p of PSETS) for (const m of MAGS) for (const t of TIPI) {
    const nn = CONTO.normalize({ z: z.cod, mq, p, m, t, bal: 6, box: mq > 60 ? 12 : 0 });
    if (!nn.ok) { incoh.push(['norm', z.cod, nn.errors]); continue; }
    const r = CONTO.conto(nn.input);
    n++;
    for (const f of ['A', 'B', 'C']) {
      const v = r.fasce[f];
      // Stretto: nemmeno un euro di arrotondamento sopra il tetto (era Math.round).
      if (v && v.max > v.fMax * r.sc + 1e-9) over.push([z.cod, mq, f, v.max, v.fMax, r.sc]);
    }
    if (r.declared && r.max > r.fMax * r.sc + 1e-9) over.push([z.cod, mq, 'decl', r.max]);
    if (r.declared && (r.max < r.min)) incoh.push([z.cod, mq, 'max<min']);
    if (!r.declared && !(r.fasce.A.max <= r.fasce.B.max && r.fasce.B.max <= r.fasce.C.max)) incoh.push([z.cod, mq, 'fasce non crescenti']);
  }
  ok(`nessun massimo sopra fMax × sc (${n} conti su ${CONTO.ZONES.length} zone)`, over.length === 0 && n > 20000, over.slice(0, 3));
  ok('fasce crescenti e minimo sotto il massimo, sempre', incoh.length === 0, incoh.slice(0, 3));
  // mutazione: se il motore lasciasse passare l'aumento oltre il tetto, il check lo prenderebbe
  const z = CANONE.ZONES.find(x => x.cod === 'C40');
  const raw = CANONE.computeCanone({ zona: z, mq: 80, parIdx: [0, 1, 2, 3], mag: ['att', 'clA'], tipo: 'trans', cfg: CANONE.DEFAULT_CFG });
  const senzaTetto = raw.fMax * raw.sc * (1 + raw.pct / 100);
  ok('mutazione: senza la regola del tetto il numero sarebbe sopra (il check morde)', senzaTetto > Math.round(raw.fMax * raw.sc) + 0.5 && raw.cMax <= raw.fMax * raw.sc + 1e-9, { senzaTetto, cMax: raw.cMax });
}
{
  const r = CONTO.conto(CONTO.normalize({ z: 'C40', mq: 65 }).input);
  ok('senza dotazioni dichiarate non si sceglie una fascia: nessun massimo singolo', r.declared === false && r.max == null && r.fasce.A.max > 0);
  const r2 = CONTO.conto(CONTO.normalize({ z: 'C40', mq: 65, p: [0, 3, 6] }).input);
  ok('tre dotazioni: fascia B, e il massimo è quello della fascia B', r2.fascia === 'B' && r2.max === r.fasce.B.max, [r2.max, r.fasce.B.max]);
  const r3 = CONTO.conto(CONTO.normalize({ z: 'C40', mq: 65, p: [0, 3, 6, 9, 8, 7, 2], n: 0 }).input);
  ok('stato non normale: fascia A qualunque sia il numero di dotazioni', r3.fascia === 'A' && r3.fasce.B === null && r3.fasce.C === null);
  const t32 = CONTO.conto(CONTO.normalize({ z: 'C40', mq: 65, p: [0, 3, 6] }).input);
  const ttr = CONTO.conto(CONTO.normalize({ z: 'C40', mq: 65, p: [0, 3, 6], t: 'trans' }).input);
  ok('il transitorio +10% non alza il massimo (gli aumenti si fermano alla fascia)', t32.max === ttr.max && ttr.sameAcrossTipi);
  ok('il pareggio col libero esiste solo per il 3+2', t32.pareggioLibero > t32.max && ttr.pareggioLibero == null);
  ok('il pareggio è il massimo × 0,90 / 0,79 (senza IMU)', t32.pareggioLibero === Math.round(t32.max * 0.9 / 0.79));
  const imu = CONTO.conto(CONTO.normalize({ z: 'C40', mq: 65, p: [0, 3, 6], imu: 1000 }).input);
  ok('IMU: il risparmio è il 25% di quella dichiarata', imu.imuRisparmio === 250);
  ok('il netto è il 90% dell\'annuo, sul mensile arrotondato all\'euro', t32.annuo === t32.max * 12 && t32.netto === t32.annuo - Math.round(t32.annuo * 0.1));
}
{
  const bad = [
    [{ z: 'XX', mq: 60 }, 'zona'], [{ z: 'C40', mq: 5 }, 'mq'], [{ z: 'C40', mq: 700 }, 'mq'],
    [{ z: 'C40', mq: 60, p: '0.20' }, 'p'], [{ z: 'C40', mq: 60, m: 'arr' }, 'm'], [{ z: 'C40', mq: 60, m: 'clA.clD' }, 'm'],
    [{ z: 'C40', mq: 60, t: 'libero' }, 't'], [{ z: 'C40', mq: 60, ask: 'tanto' }, 'ask'], [{ z: 'C40', mq: 60, bal: -3 }, 'bal'],
  ];
  const wrong = bad.filter(([raw, err]) => { const n = CONTO.normalize(raw); return n.ok || !n.errors.includes(err); });
  ok('la lista chiusa rifiuta (mai aggiusta): zona, metri, dotazioni, arredo, classi in conflitto, tipo, cifre', wrong.length === 0, wrong);
}
{
  const inputs = [
    { z: 'B14', mq: 42 }, { z: 'C40', mq: 65, p: [0, 3, 6, 9], m: ['clA'], t: 'trans', ask: 1500, imu: 900 },
    { z: 'D29', mq: 95, p: [], n: 0, m: ['asc'], bal: 8, box: 12, bp: 1, pc: 10, sc: 20, ve: 30 },
  ];
  const bad = inputs.filter(raw => {
    const a = CONTO.normalize(raw).input; const b = CONTO.decode(CONTO.encode(a));
    return !b.ok || JSON.stringify(b.input) !== JSON.stringify(a);
  });
  ok('l\'indirizzo rifà lo stesso conto (encode → decode)', bad.length === 0, bad);
  // La pagina manda al server l'input GIÀ normalizzato: rileggerlo deve dare
  // lo stesso input (prima `boxPre` si perdeva e il server contava il box a 0,50).
  const drift = inputs.filter(raw => { const a = CONTO.normalize(raw).input; const b = CONTO.normalize(a); return !b.ok || JSON.stringify(b.input) !== JSON.stringify(a); });
  ok('normalize è idempotente: il server rilegge l\'input della pagina senza perdere nulla', drift.length === 0, drift);
  ok('una versione sconosciuta si rifiuta, non si reinterpreta', CONTO.decode('v=2&z=C40&mq=60').error === 'versione');
  // Il difetto più caro trovato dalla revisione: ogni punto si toglieva, e
  // 45,5 mq nell'URL diventavano 455 (massimo dieci volte più alto).
  const nums = [['45.5', 45.5], ['45,5', 45.5], ['65', 65], ['600', 600]].filter(([v, want]) => CONTO.normalize({ z: 'C40', mq: v }).input.mq !== want);
  const imus = [['1.200', 1200], ['12.500', 12500], ['1.200,50', 1200.5], ['850.5', 850.5]].filter(([v, want]) => CONTO.normalize({ z: 'C40', mq: 60, imu: v }).input.imu !== want);
  ok('i decimali col punto restano decimali, le migliaia all\'italiana restano migliaia', nums.length === 0 && imus.length === 0, { nums, imus });
  ok('45,5 mq passano dall\'URL e tornano 45,5', CONTO.decode(CONTO.encode(CONTO.normalize({ z: 'C40', mq: 45.5 }).input)).input.mq === 45.5);
  ok('un tipo che è una chiave di Object.prototype si rifiuta', ['constructor', '__proto__', 'toString'].every(t => CONTO.normalize({ z: 'C40', mq: 60, t }).errors.includes('t')));
  ok('senza zona: niente conto, niente errore', CONTO.decode('?zona=Prati&mq=65&canone=2262').empty === true);
}
{
  const r = CONTO.conto(CONTO.normalize({ z: 'C40', mq: 65, p: [0, 3, 6] }).input);
  const t = CONTO.shareText(r, 'it', 'https://www.boomrome.com/canone?' + CONTO.encode(r.input));
  ok('il testo da condividere: zona, metri, numero e link — nessun dato personale', /Prati/.test(t) && /65 mq/.test(t) && t.includes(CONTO.fmtEur(r.max, 'it')) && !/@|\+39|\b3\d{9}\b/.test(t) && /Stima, non è l'attestazione/.test(t));
  const a0 = CONTO.conto(CONTO.normalize({ z: 'C40', mq: 65, n: 0 }).input);
  const t0 = CONTO.shareText(a0, 'it');
  ok('impianti non a norma e dotazioni non dette: un numero solo, mai «tra €X e €X»', !/tra (€[\d.]+) e \1/.test(t0) && /fino a €/.test(t0) && CONTO.rangeText(a0, 'it') === CONTO.fmtEur(a0.fasce.A.max, 'it'), t0);
  ok('migliaia deterministiche (mai toLocaleString)', CONTO.fmtEur(1288, 'it') === '€1.288' && CONTO.fmtEur(1288, 'en') === '€1,288');
}
{
  const ASPI = read('api/fiscal/_aspi.js');
  const pr = n => Number((ASPI.match(new RegExp(n + ':\\s*(\\d+)')) || [])[1]);
  const cat = read('api/_catalog.js');
  const pack = Number((cat.match(/'concordato-pack':\s*\{\s*eur:\s*(\d+)/) || [])[1]);
  ok('i prezzi del conto sono quelli del codice (ASPI_DEFAULTS, catalogo)',
    CONTO.PRICES.registrazione === pr('prezzoRegistrazione') && CONTO.PRICES.attestazione === pr('prezzoAsseverazione')
      && CONTO.PRICES.primaLocazione === pr('prezzoRegistrazione') + pr('prezzoAsseverazione') && CONTO.PRICES.pacchetto === pack,
    CONTO.PRICES);
  const RADAR = (await import('../../js/radar-engine.js')).default;
  const slugs = new Set(Object.keys(RADAR.ROME_ZONES).map(z => RADAR.normalizeZone(z)));
  const orphan = Object.entries(CONTO.MARKET_OF).filter(([cod, slug]) => !slugs.has(slug) || !CONTO.ZONES.some(z => z.cod === cod));
  ok('ogni zona del mercato esiste davvero (codice dell\'Accordo e slug del Perito)', orphan.length === 0, orphan);
  const meteo = (sample, asked = true) => ({ minSample: 8, zones: [{ slug: 'prati', zone: 'Prati', asked: asked ? { medianEurSqm: 21.4, p25: 18, p75: 25, sample } : null }] });
  ok('il mercato tace sotto il campione e senza dato', CONTO.marketFor('C40', meteo(5)) === null && CONTO.marketFor('C40', meteo(40, false)) === null && CONTO.marketFor('C40', meteo(40)).median === 21.4);
  ok('una zona senza corrispondenza netta non ha riga di mercato', CONTO.marketFor('A1', meteo(40)) === null);
}

// ─────────────────────────────────────────────────────────────────────────
section('la porta: il server ricalcola, congela, firma il link');
// Firestore in memoria, nel formato REST vero (fields tipizzati).
const store = new Map(); // path → { fields }
let calls = [], tgFail = false;
const fsv = v => (v && typeof v === 'object' && 'stringValue' in v) ? v.stringValue : null;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url); const method = opts.method || 'GET';
  const body = opts.body ? JSON.parse(opts.body) : null;
  calls.push({ u, method, body });
  if (u.includes('identitytoolkit') || u.includes('securetoken')) return { ok: true, status: 200, json: async () => ({ idToken: 't', localId: 'a', expiresIn: '3600' }) };
  if (u.includes('api.telegram.org')) return { ok: true, status: 200, json: async () => tgFail ? { ok: false, description: 'down' } : { ok: true, result: { message_id: 7 } } };
  if (u.includes('firestore.googleapis.com')) {
    const docs = u.split('/documents')[1] || '';
    if (docs.startsWith(':runQuery')) {
      const q = body.structuredQuery; const coll = q.from[0].collectionId;
      const f = q.where && q.where.fieldFilter;
      const rows = [...store.entries()].filter(([p, d]) => p.startsWith(coll + '/') && (!f || fsv(d.fields[f.field.fieldPath]) === fsv(f.value)))
        .map(([p, d]) => ({ document: { name: 'projects/p/databases/(default)/documents/' + p, fields: d.fields } }));
      return { ok: true, status: 200, json: async () => rows, text: async () => '' };
    }
    const [path, qs] = docs.replace(/^\//, '').split('?');
    if (method === 'POST') {
      const id = (qs && new URLSearchParams(qs).get('documentId')) || ('auto' + store.size);
      const p = path + '/' + id;
      if (store.has(p)) return { ok: false, status: 409, text: async () => 'exists', json: async () => ({}) };
      store.set(p, { fields: body.fields });
      return { ok: true, status: 200, json: async () => ({ name: 'projects/p/databases/(default)/documents/' + p }), text: async () => '' };
    }
    if (method === 'PATCH') {
      const prev = store.get(path) || { fields: {} };
      store.set(path, { fields: { ...prev.fields, ...body.fields } });
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    }
    if (method === 'GET') {
      const d = store.get(path);
      if (!d) return { ok: false, status: 404, json: async () => ({}), text: async () => 'nf' };
      return { ok: true, status: 200, json: async () => ({ name: 'projects/p/databases/(default)/documents/' + path, fields: d.fields }), text: async () => '' };
    }
  }
  return { ok: true, status: 200, json: async () => ({}) };
};
const { fsValToJs } = await import('../../api/homie/_lib.js');
const docJs = p => { const d = store.get(p); if (!d) return null; const o = {}; for (const [k, v] of Object.entries(d.fields)) o[k] = fsValToJs(v); return o; };
const mod = await import('../../api/owner-lead.js');
let ipSeq = 0;
async function post(body) {
  calls = [];
  let code = 0, payload = null;
  const res = { setHeader() {}, status(c) { code = c; return this; }, json(j) { payload = j; return this; }, end() { return this; }, send() { return this; } };
  await mod.default({ method: 'POST', headers: { 'x-forwarded-for': '10.7.0.' + (++ipSeq), 'user-agent': 't' }, body }, res);
  return { code, payload };
}
async function get(query) {
  calls = [];
  let code = 0, payload = null, headers = {}, sent = null;
  const res = { setHeader(k, v) { headers[k.toLowerCase()] = v; }, status(c) { code = c; return this; }, json(j) { payload = j; return this; }, send(b) { sent = b; return this; }, end() { return this; } };
  await mod.default({ method: 'GET', query, headers: { 'x-forwarded-for': '10.8.0.' + (++ipSeq) } }, res);
  return { code, payload, headers, sent };
}
const BASE = { name: 'Giulia Rossi', contact: '+39 333 123 4567', freeFrom: 'now', sourceRef: 'canone', lang: 'it', company: '' };
let first;
{
  const calc = { v: 1, z: 'C40', mq: 65, p: [0, 3, 6, 9], max: 99999, fasce: { A: { max: 99999 } } };
  const r = await post({ ...BASE, calc });
  first = r.payload;
  const leads = [...store.keys()].filter(k => k.startsWith('leads/'));
  const contoKey = [...store.keys()].find(k => k.startsWith('ownerConti/'));
  const lead = docJs(leads[0]); const conto = docJs(contoKey);
  const engine = CONTO.conto(CONTO.normalize({ z: 'C40', mq: 65, p: [0, 3, 6, 9] }).input);
  ok('200 con un riferimento CNT-XXXXXX e un link al PDF firmato', r.code === 200 && /^CNT-[A-HJ-NP-Z2-9]{6}$/.test(r.payload.ref) && /^https:\/\/www\.boomrome\.com\/api\/owner-lead\?pdf=[A-Za-z0-9]+&t=[0-9a-f]{24}$/.test(r.payload.pdfUrl), r.payload);
  ok('il numero del browser NON vale: la foto porta il conto del motore', conto && conto.result.max === engine.max && conto.result.max !== 99999, conto && conto.result.max);
  ok('la foto nasce PRIMA del lead (il lead la cita)', calls.findIndex(c => c.method === 'POST' && c.u.includes('/ownerConti')) < calls.findIndex(c => c.method === 'POST' && /\/leads(\?|$)/.test(c.u)));
  ok('la foto non porta dati personali', conto && !JSON.stringify(conto).includes('Giulia') && !JSON.stringify(conto).includes('333'));
  ok('il lead: proprietario, fonte /canone, zona e metri dal conto, riassunto del conto', lead && lead.leadType === 'landlord' && lead.intent === 'owner' && lead.sourceRef === 'canone'
    && lead.owner.zone === 'Prati (C40)' && lead.owner.sqm === 65 && lead.owner.conto.max === engine.max && lead.owner.conto.ref === r.payload.ref, lead && lead.owner);
  ok('...e il raw del lead non duplica il conto', lead && lead.raw && !('conto' in lead.raw));
  const tg = calls.find(c => c.u.includes('sendMessage'));
  const text = tg && tg.body && tg.body.text;
  ok('la card Telegram dice da dove viene e cita il conto', /calcolo \/canone/.test(text || '') && /Prati \(C40\) · 65 mq → max €/.test(text || ''), text);
  const kb = tg && tg.body && JSON.stringify(tg.body.reply_markup);
  ok('...col bottone del PDF (URL https valido)', kb && kb.includes('Il conto in PDF') && kb.includes(r.payload.pdfUrl));
  const { ownerReplyText } = await import('../../api/_market.js');
  const msg = ownerReplyText({ ...lead, owner: lead.owner });
  ok('la risposta pronta cita il conto e il PDF, col Lei, e NON richiede zona, metri o arredo', /Ho visto il conto/.test(msg) && msg.includes(r.payload.pdfUrl) && /Buongiorno Giulia/.test(msg)
    && !/in che zona|se è arredato|metri/.test(msg.replace(/65 mq/, '')), msg);
}
{
  const r = await post({ ...BASE, contact: 'mario@example.it', name: 'Mario Bianchi', calc: { z: 'XX', mq: 2 } });
  const lead = [...store.keys()].filter(k => k.startsWith('leads/')).map(docJs).find(l => l.email === 'mario@example.it');
  ok('un conto sbagliato non costa il lead: il lead nasce, senza PDF', r.code === 200 && r.payload.pdfUrl === null && lead && !lead.owner.conto);
}
{
  const before = [...store.keys()].filter(k => k.startsWith('leads/')).length;
  const r = await post({ ...BASE, calc: { v: 1, z: 'B14', mq: 42 } });
  const after = [...store.keys()].filter(k => k.startsWith('leads/')).length;
  const lead = docJs([...store.keys()].find(k => k.startsWith('leads/') && docJs(k).phone === '+39 333 123 4567'));
  ok('lo stesso numero entro 30 giorni: nessun lead nuovo, il conto si aggiunge', r.code === 200 && after === before, { before, after });
  ok('...e la risposta è uguale a quella di un lead nuovo (non dice che il lead esisteva)', !('merged' in r.payload) && !('id' in r.payload) && Object.keys(r.payload).sort().join() === 'ok,pdfUrl,ref', r.payload);
  ok('...l\'unione RIEMPIE, non sovrascrive: zona e metri restano quelli della prima casa', lead.owner.zone === 'Prati (C40)' && lead.owner.sqm === 65, lead.owner);
  ok('...l\'ultimo conto in testa, lo storico in owner.conti', lead.owner.conto.zone.cod === 'B14' && lead.owner.conti.length === 2 && lead.owner.conti[1].zone.cod === 'C40');
  ok('...e niente seconda card a pochi minuti dalla prima', !calls.some(c => c.u.includes('sendMessage')));
}
{
  // Lo stesso numero scritto in un altro modo, con l'email in più: stesso
  // lead, l'email si aggiunge, la nota si accoda.
  const r = await post({ ...BASE, contact: 'giulia@example.it 3331234567', freeFrom: 'rented', message: 'libera da gennaio', calc: { v: 1, z: 'C40', mq: 70 } });
  const leads = [...store.keys()].filter(k => k.startsWith('leads/')).map(k => [k, docJs(k)]);
  const mine = leads.filter(([, l]) => l.phoneNorm === '+393331234567' || l.phone === '+39 333 123 4567');
  ok('«3331234567» è lo stesso proprietario di «+39 333 123 4567»: un lead solo', r.code === 200 && mine.length === 1, mine.map(([k]) => k));
  ok('...l\'email che prima mancava si aggiunge, e la nota si accoda', mine[0] && mine[0][1].email === 'giulia@example.it' && /libera da gennaio/.test(mine[0][1].owner.note || ''), mine[0] && mine[0][1]);
  ok('...e una risposta già data non si sovrascrive da un invio non verificato («libera» resta «libera»)', mine[0] && mine[0][1].owner.freeFrom === 'now', mine[0] && mine[0][1].owner.freeFrom);
}
{
  // Una scrittura dell'unione che fallisce non perde il proprietario.
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => (String(url).includes('firestore') && (opts.method || 'GET') === 'PATCH')
    ? { ok: false, status: 503, text: async () => 'down', json: async () => ({}) } : origFetch(url, opts);
  const before = [...store.keys()].filter(k => k.startsWith('leads/')).length;
  const r = await post({ ...BASE, calc: { v: 1, z: 'B14', mq: 42 } });
  globalThis.fetch = origFetch;
  const after = [...store.keys()].filter(k => k.startsWith('leads/')).length;
  ok('unione fallita: nasce un lead nuovo, mai un 200 su un dato perso', r.code === 200 && after === before + 1, { before, after });
}
{
  const { ownerReplyText } = await import('../../api/_market.js');
  const c = mod.contoSummary(mod.serverConto({ z: 'C40', mq: 65 }), { pdfUrl: 'https://www.boomrome.com/api/owner-lead?pdf=x&t=y' });
  const relet = ownerReplyText({ name: 'Anna', owner: { lang: 'it', goal: 'relet', zone: 'Prati', conto: c } });
  const full = ownerReplyText({ name: 'Anna', owner: { lang: 'it', goal: 'full', zone: 'Prati', conto: c } });
  ok('chi chiede di riaffittare o di farla gestire riceve la risposta del SUO passo, col conto in una riga', /riaffittare/.test(relet) && /Ho visto anche il conto/.test(relet) && /Ho visto anche il conto/.test(full) && !/Ho visto il conto che ha fatto per la sua casa/.test(full), { relet, full });
}
{
  const id = new URL(first.pdfUrl).searchParams.get('pdf');
  const bad = await get({ pdf: id, t: '0'.repeat(24) });
  ok('link con token sbagliato: 404, e nessuna lettura', bad.code === 404 && !calls.some(c => c.u.includes('firestore')));
  const unk = await get({ pdf: 'AAAAAAAAAAAAAAAAAAAA', t: mod.contoToken('AAAAAAAAAAAAAAAAAAAA') });
  ok('un id firmato ma inesistente: 404', unk.code === 404);
  const g = await get({ pdf: id, t: new URL(first.pdfUrl).searchParams.get('t') });
  const head = g.sent ? Buffer.from(g.sent).subarray(0, 5).toString() : '';
  ok('link giusto: un PDF vero, inline, non indicizzabile né in cache', g.code === 200 && head === '%PDF-' && g.headers['content-type'] === 'application/pdf'
    && /inline/.test(g.headers['content-disposition']) && g.headers['x-robots-tag'] === 'noindex' && /no-store/.test(g.headers['cache-control']), { code: g.code, head, h: g.headers });
  // Il testo stampato: pdf-lib scrive le stringhe in esadecimale (WinAnsi).
  // pdf-lib comprime i content stream (Flate) e scrive le stringhe in
  // esadecimale (WinAnsi): si gonfiano gli stream e si leggono i Tj.
  const buf = Buffer.from(g.sent), bin = buf.toString('latin1');
  let plain = '';
  for (const m of bin.matchAll(/stream\r?\n/g)) {
    const start = m.index + m[0].length, end = bin.indexOf('endstream', start);
    try { plain += zlib.inflateSync(buf.subarray(start, end)).toString('latin1') + '\n'; } catch { /* non compresso o non testo */ }
  }
  const txt = [...plain.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)].map(m => Buffer.from(m[1], 'hex').toString('latin1')).join(' ');
  const engine = CONTO.conto(CONTO.normalize({ z: 'C40', mq: 65, p: [0, 3, 6, 9] }).input);
  ok('il PDF stampa il massimo del motore e la fonte (Accordo, protocollo)', txt.includes('\x80' + String(engine.max).replace(/\B(?=(\d{3})+(?!\d))/g, '.')) && txt.includes('RA/2023/0044852'), txt.slice(0, 300));
  ok('...dice cosa NON è, su ogni pagina, col riferimento', (txt.match(/non è l'attestazione di rispondenza né una perizia/g) || []).length >= 2 && txt.includes(first.ref));
  ok('...e non porta nome né recapiti', !/Giulia|Rossi|333 123/.test(txt));
  {
    // Pagina 2 con dotazioni non dette e una riduzione: il passaggio si scrive.
    const { buildContoPdf } = await import('../../api/owners/_conto-pdf.js');
    const rr = CONTO.conto(CONTO.normalize({ z: 'D29', mq: 95, m: ['asc'] }).input);
    const b2 = Buffer.from(await buildContoPdf({ ref: 'CNT-AAAAAA', at: '2026-10-13T09:00:00Z', result: rr, prices: CONTO.PRICES, parametri: CONTO.PARAMETRI }));
    const bin2 = b2.toString('latin1'); let pl2 = '';
    for (const m of bin2.matchAll(/stream\r?\n/g)) { const st = m.index + m[0].length; try { pl2 += zlib.inflateSync(b2.subarray(st, bin2.indexOf('endstream', st))).toString('latin1'); } catch {} }
    const t2 = [...pl2.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)].map(m => Buffer.from(m[1], 'hex').toString('latin1')).join(' ');
    ok('PDF: con una riduzione dichiarata la scheda scrive «× (1 − 10%)», il conto torna', /× \(1 [−-] 10%\) = \x80/.test(t2.replace(/\xd7/g, '×')) || /\xd7 \(1 . 10%\)/.test(t2), t2.slice(t2.indexOf('Fascia A:'), t2.indexOf('Fascia A:') + 80));
  }
  ok('...e i prezzi sono quelli del codice, IVA inclusa', txt.includes('\x80' + CONTO.PRICES.pacchetto + ' IVA inclusa') && txt.includes('\x80' + CONTO.PRICES.primaLocazione + ' IVA inclusa'));
}
{
  const src = read('api/owner-lead.js');
  ok('il conto si ricalcola sul server (normalize + conto del motore)', /CONTO\.normalize\(calc\)/.test(src) && /CONTO\.conto\(n\.input\)/.test(src));
  ok('il token si confronta a tempo costante', /timingSafeEqual/.test(src));
  const rules = read('firestore.rules');
  ok('ownerConti ha la sua regola admin-only (senza: default-deny e il PDF non nasce)', /match \/ownerConti\/\{x\}\s*\{ allow read, write: if isAdmin\(\); \}/.test(rules));
}

// ─────────────────────────────────────────────────────────────────────────
section('le pagine: un motore solo, il Lei, solo promesse vere');
const strip = h => h.replace(/<!--[\s\S]*?-->|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
{
  const can = read('canone.html'), pack = read('pacchetto-concordato.html'), own = read('owners.html');
  for (const [f, h] of [['canone.html', can], ['pacchetto-concordato.html', pack], ['owners.html', own]]) {
    ok(`${f}: carica il motore condiviso`, h.includes('src="/js/canone-engine.js"') && h.includes('src="/js/conto-engine.js"'));
  }
  ok('canone.html: nessuna aritmetica propria (tetto 1,35, tabella zone inline)', !/\*\s*1\.35|1\.35\s*\*/.test(can) && !/aMax\s*:/.test(can) && !/cod\s*:\s*'C40'/.test(can));
  ok('il Pacchetto non stampa più un numero arrivato nell\'URL (?canone=)', !/get\('canone'\)/.test(pack) && /C\.decode\(location\.search\)/.test(pack));
  const forbidden = [/\bufficial[ei]\b/i, /certificat/i, /90\+/, /60–150/, /micro-?zon/i, /3\+2 ordinario/i, /non ti scade/i, /1\.500–2\.500/];
  for (const [f, h] of [['canone.html', can], ['pacchetto-concordato.html', pack]]) {
    const v = strip(h) + ' ' + (h.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) || []).join(' ');
    const hit = forbidden.filter(re => re.test(v)).map(String);
    ok(`${f}: niente «ufficiale», «certificato», «90+ micro-zone», «60–150», «3+2 ordinario»`, hit.length === 0, hit);
    // Solo forme che col Lei non esistono («mandi», «paghi» sono anche il Lei).
    const tu = (strip(h).match(/\b(tu|ti|tuo|tua|tuoi|hai|vuoi|scrivici|rientri|dimmi|scrivimi)\b/gi) || []);
    ok(`${f}: il proprietario si tratta col Lei`, tu.length === 0, tu.slice(0, 8));
  }
  const vp = strip(pack);
  ok('Pacchetto: €349 IVA inclusa, e la tariffa dell\'organizzazione detta a parte', /€349 IVA inclusa/.test(vp) && /tariffa dell'organizzazione firmataria per l'attestazione è a parte/.test(vp));
  ok('Pacchetto: la scadenza RLI giusta (30 giorni dalla stipula o dalla decorrenza se prima)', /30 giorni dalla stipula, o dalla decorrenza se viene prima/.test(vp));
  ok('Pacchetto: la spunta contiene la presa d\'atto della perdita del recesso (art. 59 Cod. cons.) e il modo di recedere', /prendo atto che a pratica completata il recesso non sarà più possibile/.test(vp) && /con una email a hello@boom-rome\.com/.test(vp));
  ok('Pacchetto: le 48 ore partono dalla pratica, non dal pagamento', /da quando la pratica parte/.test(vp) && !/Verifica del canone<\/b><span>[^<]*entro 48 ore dai dati\.<\/span>/.test(pack));
  ok('Pacchetto: il registro senza cedolare non è detto «tutto a suo carico»', !/restano a suo carico/.test(vp));
  ok('Pacchetto: il proprietario si tratta col Lei anche nell\'email di conferma', !/rispondi a questa email|scrivici su WhatsApp — risponde/.test(read('api/stripe-webhook.js')) && /Per recedere entro 14 giorni basta una email/.test(read('api/stripe-webhook.js')));
  ok('Pacchetto: il recesso è detto, e l\'inizio immediato è una spunta SUA, mai pre-selezionata',
    /Recesso: 14 giorni/.test(vp) && /<input type="checkbox" id="sStart">/.test(pack) && /startNow:startNow/.test(pack));
  const sc = read('api/service-checkout.js'), wh = read('api/stripe-webhook.js');
  ok('...e la scelta arriva all\'operatore (metadata → messaggio del lead), solo per il Pacchetto',
    /body\.kind === 'concordato-pack' \? \{ start_now/.test(sc) && /m\.start_now === '1'/.test(wh));
  ok('Pacchetto: identità legale completa nel piede (P.IVA e REA)', /P\.IVA 17322991005 · REA RM-1710623/.test(pack));
  const vc = strip(can);
  ok('/canone: l\'Accordo è citato col deposito e il protocollo, e «non è l\'attestazione»', /27(\/07\/| luglio )2023/.test(vc) && /RA\/2023\/0044852/.test(vc) && /non è l'attestazione di rispondenza/.test(vc));
  ok('/owners: niente «documento verificato», «reddito dimostrato», «un terzo del reddito»', !/documento verificato|reddito dimostrato|un terzo del reddito|ID verified|income proven/i.test(own));
  ok('/owners: l\'ISTAT detto per quello che è (non con la cedolare)', /ISTAT \(se non c'è la cedolare\)/.test(own));
  const { faqItems, rebuild } = await import('../../scripts/owner-faq.mjs');
  for (const f of ['canone.html', 'pacchetto-concordato.html', 'owners.html']) {
    const h = read(f);
    ok(`${f}: il FAQPage è generato dalle domande visibili (${faqItems(h).length})`, faqItems(h).length >= 6 && rebuild(h) === h);
  }
}

// ─────────────────────────────────────────────────────────────────────────
section('in un browser vero: lo schermo dice il numero del motore');
let chromium = null;
try { chromium = await (await import('../_browser.mjs')).loadChromium(); } catch (e) { chromium = null; }
if (!chromium) {
  console.log('  SKIP: playwright-core non disponibile');
} else {
  const { launchOptions } = await import('../_browser.mjs');
  const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/json' };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/api/meteo') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, minSample: 8, zones: [], measuring: [] })); }
    let f = join(R, p);
    try { if (!/\.\w+$/.test(f)) f += '.html'; const b = readFileSync(f); res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(b); }
    catch { res.writeHead(404); res.end('nf'); }
  });
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const br = await chromium.launch(launchOptions());
  try {
    const page = async (path, w = 390) => {
      const pg = await br.newPage({ viewport: { width: w, height: 844 }, isMobile: w < 600, hasTouch: w < 600 });
      const errs = []; pg.on('pageerror', e => errs.push(e.message));
      let sent = null;
      await pg.addInitScript(() => { try { localStorage.setItem('boom:consent', 'min:' + Date.now()); } catch (e) {} });
      await pg.route('**/*', async r => {
        const u = r.request().url();
        if (u.includes('/api/owner-lead')) { sent = JSON.parse(r.request().postData()); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'x', ref: 'CNT-ABCDEF', pdfUrl: 'https://www.boomrome.com/api/owner-lead?pdf=x&t=y' }) }); }
        return u.startsWith(`http://localhost:${port}`) ? r.continue() : r.abort();
      });
      await pg.goto(`http://localhost:${port}${path}`, { waitUntil: 'load' });
      await pg.waitForTimeout(250);
      return { pg, errs, sent: () => sent };
    };
    {
      const engine = CONTO.conto(CONTO.normalize({ z: 'C40', mq: 65, p: [0, 3, 6, 9] }).input);
      const { pg, errs } = await page('/canone?v=1&z=C40&mq=65&p=0.3.6.9');
      const big = await pg.textContent('#rBig');
      ok('/canone dall\'indirizzo: il numero in grande è il massimo del motore', big && big.includes(CONTO.fmtEur(engine.max, 'it')), big);
      const ox = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      ok('/canone a 390px: niente scorrimento laterale, nessun errore JS', ox <= 0 && errs.length === 0, { ox, errs });
      await pg.close();
    }
    {
      const engine = CONTO.conto(CONTO.normalize({ z: 'C40', mq: 65 }).input);
      const a = await page('/pacchetto-concordato?zona=Prati&mq=65&canone=2262');
      ok('Pacchetto col vecchio ?canone=: nessuna barra, nessun numero', !(await a.pg.isVisible('#calcBar')) && a.errs.length === 0, a.errs);
      await a.pg.close();
      const b = await page('/pacchetto-concordato?v=1&z=C40&mq=65');
      const bar = await b.pg.textContent('#calcTxt');
      ok('Pacchetto col conto: la barra ricalcola dal motore', bar.includes(CONTO.fmtEur(engine.fasce.A.max, 'it')) && bar.includes(CONTO.fmtEur(engine.fasce.C.max, 'it')), bar);
      await b.pg.close();
    }
    {
      const engine = CONTO.conto(CONTO.normalize({ z: 'C40', mq: 65 }).input);
      const { pg, errs, sent } = await page('/owners');
      await pg.fill('#fZone', 'Prati'); await pg.fill('#fSqm', '65'); await pg.waitForTimeout(150);
      const chips = await pg.$$eval('#zChips button', bs => bs.map(b => b.textContent));
      const line0 = await pg.isVisible('#zLine');
      ok('/owners: «Prati» mostra le zone che lo contengono e NON sceglie da solo', chips.length >= 2 && !line0, chips);
      await pg.click('#zChips button[data-cod="C40"]'); await pg.waitForTimeout(100);
      const line = await pg.textContent('#zLine');
      ok('/owners: scelta la zona, il massimo fra fascia A e C del motore', line.includes(CONTO.fmtEur(engine.fasce.A.max, 'it')) && line.includes(CONTO.fmtEur(engine.fasce.C.max, 'it')), line);
      await pg.fill('#fName', 'Giulia Rossi'); await pg.fill('#fContact', '+39 333 123 4567');
      await pg.click('#fGo'); await pg.waitForTimeout(250);
      const s = sent();
      ok('/owners: il modulo manda la zona e i metri, mai un numero calcolato', s && s.calc && s.calc.z === 'C40' && s.calc.mq === 65 && !('max' in s.calc) && s.sourceRef === 'owners', s && s.calc);
      ok('/owners: il PDF del conto compare nel «fascicolo aperto»', await pg.isVisible('#fPdf') && errs.length === 0, errs);
      await pg.close();
    }
    {
      // Senza conto (zona fuori dall'Accordo) il server non dà un PDF: il link
      // NON deve comparire (la classe vinceva sull'attributo hidden).
      const { pg } = await page('/owners');
      await pg.route('**/api/owner-lead', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"ref":null,"pdfUrl":null}' }));
      await pg.fill('#fName', 'Giulia Rossi'); await pg.fill('#fContact', '+39 333 123 4567'); await pg.fill('#fZone', 'Fiumicino');
      await pg.click('#fGo'); await pg.waitForTimeout(250);
      ok('/owners senza conto: nessun link a un PDF che non esiste', (await pg.isVisible('#fDone')) && !(await pg.isVisible('#fPdf')));
      await pg.close();
    }
    {
      const { pg } = await page('/canone?v=1&z=C40&mq=65');
      await pg.route('**/api/owner-lead', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"ref":null,"pdfUrl":null}' }));
      await pg.fill('#gName', 'Giulia Rossi'); await pg.fill('#gContact', '+39 333 123 4567');
      await pg.click('#gGo'); await pg.waitForTimeout(250);
      ok('/canone senza PDF dal server: niente bottone «Apra il PDF» verso «#»', (await pg.isVisible('#done')) && !(await pg.isVisible('#dPdf')));
      const { pg: p2 } = await page('/canone?v=1&z=C40&mq=45.5');
      const big = await p2.textContent('#rBig');
      const e455 = CONTO.conto(CONTO.normalize({ z: 'C40', mq: 45.5 }).input);
      ok('/canone con 45,5 mq nell\'indirizzo: il numero è quello di 45,5 mq, non di 455', big.includes(CONTO.fmtEur(e455.fasce.A.max, 'it')) && e455.input.mq === 45.5, big);
      await pg.close(); await p2.close();
    }
  } finally {
    await br.close(); srv.close();
  }
}

console.log(`\n${fail ? '\x1b[31m' : '\x1b[32m'}${pass} ok, ${fail} ko\x1b[0m`);
process.exit(fail ? 1 : 0);
