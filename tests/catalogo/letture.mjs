// tests/catalogo/letture.mjs — LE CAMERE CON UNA REGOLA SOLA, SU OGNI
// SUPERFICIE (suite `letture`).
//
// IL DIFETTO (15/10/2026). Ogni superficie leggeva `num(l.beds || l.bedrooms)`
// o una sua variante: `beds` è il testo libero del bot («Living , 1 bedroom
// with balcony , 1 bedroom, 1 bath and kitchen », «1BR + Loft», «3» su un
// bilocale) e il primo numero lì dentro vinceva sul campo strutturato. Così
// «Capri 2 Bed» (wvX0h0lBoNKOMuTuHkVI, bedrooms 2) usciva «1 bedroom» e il
// bilocale di Via dei Cappellari (OLLVsiKhPrhpT1fx8XmB, bedrooms 1, beds «3»)
// «3 bedrooms» — sulla scheda, nell'inventario per le AI, nel feed per i
// portali, nel digest email del Segugio, al telefono, nei prompt del
// Commerciale e della Segretaria, nelle guide di quartiere.
//
// La regola è UNA: FACTS.bedroomsOf (js/listing-facts.js). Questa suite guida
// gli handler VERI sul catalogo vero (fixture-listings-2026-10-15.json: i 27
// annunci pubblici di Firestore, campi grezzi) più UN monolocale sintetico
// (bedrooms 0: il catalogo di oggi non ne ha uno pubblicabile) con un
// Firestore finto in memoria — si simula solo la rete — e pretende che ogni
// superficie dica lo stesso numero, e che lo zero taccia dove non ha una
// parola. Più la copia inline delle guide di quartiere, che deve dare lo
// stesso numero della regola, il criterio «Studio» del Segugio sul giro vero
// di api/search/save.js, e la regola di classe: nessun file api/** legge più
// `beds` di una casa.
//
// MUTAZIONI (verificate a mano, 15/10/2026; ognuna fa uscire la suite con 1):
//  · api/listing.js con `num(d.beds || d.bedrooms)` → cadono «SSR Capri 2»,
//    «SSR Cappellari 1», la parità SSR sul catalogo e la regola di classe;
//  · api/publisher/_state.js con `num(l.beds || l.bedrooms)` → cadono il
//    payload (Capri null), la coda degli update e la regola di classe;
//  · api/feed/immobiliare.js con `<rooms>` = camere (localiOf → bedroomsOf)
//    → cadono «ogni <rooms> è localiOf», «Cappellari 2 locali» e la regola
//    ridetta sul catalogo; con localiOf che torna a «camere + 1 salvo
//    contraddizione» (la stima) → cadono Capri, Angelico/Duplex e la regola;
//  · api/search/matcher.js con `${l.beds || 'Studio'} bed` → cadono il
//    digest e la regola di classe; col filtro di prima `if (c.beds && …)`
//    → cadono le due prove del criterio «Studio» (beds 0 = qualsiasi);
//  · lo zero (il monolocale sintetico): llms con `if (beds != null)`,
//    concierge con `if (beds != null)`, Pubblicista senza num(), Commerciale
//    e Segretaria con `camere != null`, scheda SSR e card di quartiere con
//    `beds != null`, telefono con `bedroomsOf(l) || null` → cadono i
//    rispettivi controlli sul monolocale; il Segugio che conta le camere
//    ignote come uno studio (`|| 0` nel ramo Studio) → cade «Studio non
//    prende una casa di cui non si sanno le camere»;
//  · api/wizard/interpret.js con `cur[k]` per le camere → cade il riepilogo;
//  · apartments-in/*.html con la vecchia card `l.beds||l.bedrooms` (o la
//    copia inline senza il campo strutturato) → cadono la parità inline e le
//    card del quartiere;
//  · api/phone/agent-tools.js con `number(l.bedrooms ?? l.beds)` → cade la
//    regola di classe (sul catalogo di oggi i numeri coincidono: è la
//    regola che lo tiene fermo).
//
// Esegui: node tests/catalogo/letture.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const require = createRequire(import.meta.url);
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

// le credenziali del server PRIMA di caricare i moduli (homie/_lib le legge
// al caricamento); tutte finte: la rete è il fetch qui sotto
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'admin@test.boom';
process.env.FIREBASE_ADMIN_PASS = 'x';
process.env.HOMIE_SECRET = 'letture-secret';
process.env.FEED_AGENCY_EMAIL = 'agenzia@boomrome.com';
process.env.ANTHROPIC_API_KEY = 'test-key';
delete process.env.WIZARD_SECRET;   // il bot cade su HOMIE_SECRET, come in produzione

const FACTS = require('../../js/listing-facts.js');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? '  — ' + String(detail).slice(0, 500) : '')); }
}

// ── il catalogo vero ────────────────────────────────────────────────────
const FIX = JSON.parse(readFileSync(join(here, 'fixture-listings-2026-10-15.json'), 'utf8'));
const DOCS = new Map(FIX.map(({ _id, ...rest }) => [_id, rest]));
// IL MONOLOCALE (bedrooms 0). Nel catalogo di oggi non ce n'è uno
// pubblicabile — l'unico «Studio» (Via degli Avignonesi) è affittato e porta
// ancora bedrooms 1 —, quindi il «taci» dello zero era provato solo sulla
// scheda: tre mutazioni che stampavano «0 bedroom» (llms, concierge,
// payload) passavano la suite intera (revisione del 15/10/2026). Un annuncio
// SINTETICO, pubblicabile, sta nel Firestore finto per TUTTA la suite: ogni
// superficie che scorre il catalogo lo incontra, e i controlli espliciti
// pretendono che ci sia davvero (un controllo su una casa assente è vuoto).
const MONO = 'sintetico_monolocale';
DOCS.set(MONO, {
  name: 'Monolocale Sintetico Monti', type: 'Studio', status: 'available', availableDate: 'Subito',
  price: 950, zone: 'Monti', sqm: 28, bedrooms: 0, beds: 'Studio', bathrooms: 1, furnished: 'yes',
  description: 'A bright studio flat in Monti.', descriptionIt: 'Un monolocale luminoso a Monti.',
});
const withId = (id) => ({ id, ...DOCS.get(id) });
const ALL = [...DOCS.keys()].map(withId);
const REALI = ALL.filter((l) => l.id !== MONO);   // il catalogo vero, senza il sintetico
const CAPRI = 'wvX0h0lBoNKOMuTuHkVI';       // «Capri 2 Bed»: bedrooms 2, beds «Living , 1 bedroom…»
const CAPPELLARI = 'OLLVsiKhPrhpT1fx8XmB';  // bilocale: bedrooms 1, beds «3»
const E = (id) => FACTS.bedroomsOf(DOCS.get(id));
const bedWord = (n) => n + (n > 1 ? ' bedrooms' : ' bedroom');

// la lettura di prima, com'era scritta in api/listing.js e llms-listings.js
const numVecchia = (v) => { const m = String(v == null ? '' : v).match(/\d+(?:\.\d+)?/); const n = m ? Number(m[0]) : 0; return n > 0 ? n : null; };
const vecchia = (l) => numVecchia(l.beds || l.bedrooms);

// ── Firestore finto ─────────────────────────────────────────────────────
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  const fields = {}; for (const k in v) fields[k] = toFs(v[k]);
  return { mapValue: { fields } };
}
function fromFs(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = fromFs(x); return o; }
  return null;
}
const fsDoc = (coll, id, data) => {
  const fields = {}; for (const k in data) fields[k] = toFs(data[k]);
  return { name: `projects/boom-property-dashboards/databases/(default)/documents/${coll}/${id}`,
    fields, updateTime: '2026-10-15T09:00:00.000000Z' };
};
const COLLS = { listings: DOCS, portalPubs: new Map() };
const ANTHROPIC = [];
let AI_PLAN = null;          // la risposta del modello per wizard/interpret
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('https://identitytoolkit.googleapis.com/')) return json({ idToken: 'T', expiresIn: '3600', localId: 'admin' });
  if (u.startsWith('https://api.anthropic.com/')) {
    const body = JSON.parse(opts.body);
    ANTHROPIC.push(body);
    const sys = Array.isArray(body.system) ? body.system.map((b) => b.text || '').join('\n') : String(body.system || '');
    const text = /interprete comandi/.test(sys) && AI_PLAN ? JSON.stringify(AI_PLAN) : 'Fine.';
    return json({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, model: body.model, stop_reason: 'end_turn' });
  }
  const path = u.split('?')[0];
  // i contatori della Centrale AI: accettati e dimenticati
  if (/:commit$/.test(path)) return json({ writeResults: [], commitTime: '2026-10-15T09:00:00Z' });
  if (/:runQuery$/.test(path)) {
    const q = JSON.parse(opts.body).structuredQuery || {};
    const coll = COLLS[q.from && q.from[0] && q.from[0].collectionId] || new Map();
    let rows = [...coll].map(([id, d]) => ({ id, d }));
    const ff = q.where && q.where.fieldFilter;
    if (ff && ff.op === 'EQUAL') rows = rows.filter((r) => r.d[ff.field.fieldPath] === fromFs(ff.value));
    rows = rows.slice(0, q.limit || rows.length);
    return json(rows.length ? rows.map((r) => ({ document: fsDoc(q.from[0].collectionId, r.id, r.d), readTime: 'x' })) : [{ readTime: 'x' }]);
  }
  // le creazioni (fsCreate): la ricerca salvata di api/search/save.js e il
  // suo activityLog. Si conservano, così il test legge ciò che è stato scritto
  if ((opts.method || 'GET') === 'POST' && /\/documents\/[^/:]+$/.test(path)) {
    const coll = path.match(/\/documents\/([^/:]+)$/)[1];
    if (!COLLS[coll]) COLLS[coll] = new Map();
    const id = 'auto_' + (COLLS[coll].size + 1);
    const fields = JSON.parse(opts.body).fields || {};
    const d = {}; for (const [k, v] of Object.entries(fields)) d[k] = fromFs(v);
    COLLS[coll].set(id, d);
    return json({ name: `projects/boom-property-dashboards/databases/(default)/documents/${coll}/${id}`, fields });
  }
  if (/\/documents\/listings$/.test(path)) {
    return json({ documents: [...DOCS].map(([id, d]) => fsDoc('listings', id, d)) });
  }
  const one = path.match(/\/documents\/([^/:]+)\/([^/:]+)$/);
  if (one) {
    const [, coll, rawId] = one;
    const id = decodeURIComponent(rawId);
    const d = COLLS[coll] && COLLS[coll].get(id);
    return d ? json(fsDoc(coll, id, d)) : json({ error: { code: 404, status: 'NOT_FOUND' } }, 404);
  }
  return json({ error: { code: 404 } }, 404);  // settings/ai, :commit, … — assenti
};

function mkRes() {
  return {
    statusCode: 200, headers: {}, body: '', data: null,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.data = o; this.body = JSON.stringify(o); return this; },
    send(b) { this.body = Buffer.isBuffer(b) ? b.toString('utf8') : String(b); return this; },
    end(b) { if (b != null) this.body = String(b); return this; },
  };
}

// ═══ 0. il difetto è nei dati ══════════════════════════════════════════
console.log('\n0 · il catalogo vero porta il difetto, la regola lo legge giusto');
check('il fixture ha i 27 annunci, Capri e Cappellari compresi',
  FIX.length === 27 && REALI.length === 27 && DOCS.has(CAPRI) && DOCS.has(CAPPELLARI), FIX.length);
check('…più il monolocale sintetico: bedrooms 0, pubblicabile, nessun annuncio vero porta lo stesso id',
  DOCS.size === 28 && E(MONO) === 0 && !FIX.some((l) => l._id === MONO), DOCS.size + ' / ' + E(MONO));
check('con la lettura di prima Capri = 1 camera (il primo numero di «Living , 1 bedroom…»)', vecchia(DOCS.get(CAPRI)) === 1, vecchia(DOCS.get(CAPRI)));
check('con la lettura di prima Cappellari = 3 camere (il «3» del testo libero)', vecchia(DOCS.get(CAPPELLARI)) === 3, vecchia(DOCS.get(CAPPELLARI)));
check('bedroomsOf: Capri = 2, Cappellari = 1', E(CAPRI) === 2 && E(CAPPELLARI) === 1, E(CAPRI) + ' / ' + E(CAPPELLARI));
// «cambiano numero», non «la lettura di prima sbagliava»: su due di queste
// case (Angelico Loft 1→2, lo Studio di Via degli Avignonesi muto→1) il
// numero giusto lo scrivono le correzioni di js/catalogo-correzioni.js —
// la regola legge il campo strutturato, non lo corregge (revisione 15/10)
const CAMBIATE = REALI.filter((l) => vecchia(l) !== FACTS.bedroomsOf(l)).map((l) => l.id);
check('le case del catalogo vero che cambiano numero con la regola unica sono note (fra loro Capri e Cappellari)',
  CAMBIATE.includes(CAPRI) && CAMBIATE.includes(CAPPELLARI), CAMBIATE.join(', '));

// ═══ 1. /listing/:id — la scheda servita dal server ═════════════════════
console.log('\n1 · /listing/:id (api/listing.js), su tutti i 27 annunci e il monolocale sintetico');
const listing = (await import('../../api/listing.js')).default;
const meta = (h, n) => ((h.match(new RegExp('<meta name="' + n + '" content="([^"]*)">')) || [])[1] || '');
const lds = (h) => [...h.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => { try { return JSON.parse(m[1]); } catch { return {}; } });
const noscriptOf = (h) => ((h.match(/<noscript><section[\s\S]*?<\/noscript>/) || [])[0] || '');
const SSR = {};
{
  const guai = [];
  for (const id of DOCS.keys()) {
    const res = mkRes();
    await listing({ query: { id } }, res);
    SSR[id] = res.body;
    const h = res.body, exp = E(id);
    if (res.statusCode !== 200) { guai.push(`${id}: status ${res.statusCode}`); continue; }
    const ap = lds(h).find((o) => o['@type'] === 'Apartment') || {};
    const dm = meta(h, 'description').match(/(\d+) bedrooms?\b/);
    const nm = noscriptOf(h).match(/<li>(\d+) bedrooms?\b/);
    if (exp >= 1) {
      if (ap.numberOfBedrooms !== exp) guai.push(`${id}: JSON-LD numberOfBedrooms ${ap.numberOfBedrooms} ≠ ${exp}`);
      if (!dm || +dm[1] !== exp) guai.push(`${id}: description «${dm && dm[0]}» ≠ ${bedWord(exp)}`);
      if (!nm || +nm[1] !== exp) guai.push(`${id}: noscript «${nm && nm[0]}» ≠ ${bedWord(exp)}`);
    } else if (ap.numberOfBedrooms !== undefined || dm || nm) guai.push(`${id}: ${exp} camere ma la scheda ne dichiara`);
  }
  check('ogni scheda dice le camere di bedroomsOf (description, noscript, JSON-LD)', !guai.length, guai.join(' · '));
  const c = SSR[CAPRI], o = SSR[CAPPELLARI];
  check('SSR Capri 2: «2 bedrooms» nella description e numberOfBedrooms 2, mai «1 bedroom»',
    /\b2 bedrooms\b/.test(meta(c, 'description')) && (lds(c).find((x) => x['@type'] === 'Apartment') || {}).numberOfBedrooms === 2
    && !/\b1 bedroom\b/.test(meta(c, 'description') + noscriptOf(c)), meta(c, 'description'));
  check('SSR Cappellari 1: «1 bedroom», mai «3 bedrooms» (né nel noscript né nel JSON-LD)',
    /\b1 bedroom\b/.test(meta(o, 'description')) && !/3 bedrooms/.test(meta(o, 'description') + noscriptOf(o))
    && (lds(o).find((x) => x['@type'] === 'Apartment') || {}).numberOfBedrooms === 1, meta(o, 'description'));
}
// un monolocale (0) tace: niente «0 bedrooms»; i bagni non spariscono con lui
{
  DOCS.set('studio_zero', { name: 'Studio Zero', zone: 'Monti', price: 900, status: 'available', bedrooms: 0, beds: 'Studio with Bath', bathrooms: 1 });
  const res = mkRes();
  try { await listing({ query: { id: 'studio_zero' } }, res); } finally { DOCS.delete('studio_zero'); }
  const ap = lds(res.body).find((o) => o['@type'] === 'Apartment') || {};
  check('monolocale (bedrooms 0): nessun «0 bedrooms», nessun numberOfBedrooms',
    !/0 bedrooms?/.test(meta(res.body, 'description') + noscriptOf(res.body)) && ap.numberOfBedrooms === undefined, meta(res.body, 'description'));
  check('monolocale: la riga dei bagni resta («1 bathroom»)', /<li>1 bathroom<\/li>/.test(noscriptOf(res.body)), noscriptOf(res.body).slice(0, 400));
  // e il monolocale sintetico, servito dal giro su tutto il catalogo
  const m = SSR[MONO] || '';
  check('SSR del monolocale sintetico: servita, col nome, senza «0 bedroom(s)» né numberOfBedrooms',
    m.includes('Monolocale Sintetico Monti') && !/\b0 bedrooms?\b/.test(meta(m, 'description') + noscriptOf(m))
    && (lds(m).find((x) => x['@type'] === 'Apartment') || {}).numberOfBedrooms === undefined, meta(m, 'description'));
}

// ═══ 2. /llms-listings.txt — ciò che un'AI cita ═════════════════════════
console.log('\n2 · /llms-listings.txt (api/llms-listings.js)');
{
  const llms = (await import('../../api/llms-listings.js')).default;
  const res = mkRes();
  await llms({ query: {} }, res);
  const blocks = String(res.body).split('\n## ').slice(1);
  const seen = new Map();
  for (const b of blocks) {
    const m = b.match(/https:\/\/www\.boomrome\.com\/listing\/([^\s)]+)/);
    if (m) seen.set(decodeURIComponent(m[1]), b);
  }
  const guai = [];
  for (const [id, b] of seen) {
    if (!DOCS.has(id)) continue;
    const exp = E(id), spec = (b.match(/^- Specs: (.*)$/m) || [])[1] || '';
    const m = spec.match(/(\d+) bedrooms?\b/);
    if (exp >= 1 ? (!m || +m[1] !== exp) : !!m) guai.push(`${id}: «${spec}» (attese ${exp})`);
  }
  check('l\'inventario porta Capri e Cappellari (case in vetrina, prenotabili)', seen.has(CAPRI) && seen.has(CAPPELLARI), [...seen.keys()].join(','));
  check('ogni casa dell\'inventario dice le camere di bedroomsOf', seen.size >= 15 && !guai.length, guai.join(' · ') || seen.size);
  check('Capri: «2 bedrooms»; Cappellari: «1 bedroom», mai «3 bedrooms»',
    /- Specs: [^\n]*\b2 bedrooms\b/.test(seen.get(CAPRI) || '') && /- Specs: [^\n]*\b1 bedroom\b/.test(seen.get(CAPPELLARI) || '')
    && !/3 bedrooms/.test(seen.get(CAPPELLARI) || ''), (seen.get(CAPPELLARI) || '').slice(0, 300));
  check('il monolocale sintetico è nell\'inventario e lo zero tace: nessun «0 bedroom(s)» in tutta la pagina',
    seen.has(MONO) && /- Specs: 28 m²/.test(seen.get(MONO) || '') && !/\b0 bedrooms?\b/.test(String(res.body)),
    (seen.get(MONO) || 'assente').slice(0, 300));
}

// ═══ 3. il feed Immobiliare — <rooms> sono i LOCALI ═════════════════════
console.log('\n3 · feed Immobiliare (api/feed/immobiliare.js)');
const FEED = await import('../../api/feed/immobiliare.js');
{
  const L = FEED.localiOf;
  check('localiOf: bilocale con 1 camera = 2 locali', L({ type: 'bilocale', bedrooms: 1 }) === 2);
  check('localiOf: monolocale/studio con 0 camere = 1 locale', L({ type: 'Studio', bedrooms: 0 }) === 1 && L({ type: 'monolocale', bedrooms: 0 }) === 1);
  check('localiOf: il tipo dichiarato contraddice le camere → tace (trilocale con 3 camere, Studio con 1)',
    L({ type: 'trilocale', bedrooms: 3 }) === null && L({ type: 'Studio', bedrooms: 1 }) === null);
  check('localiOf: una stanza non ha i locali della casa (tipo o nome, parola intera)',
    L({ type: 'Room', bedrooms: 1 }) === null && L({ type: 'Garden floor', name: 'Parioli Double Room with Garden', bedrooms: 1 }) === null
    && L({ type: 'Shared Room', bedrooms: 1 }) === null);
  check('localiOf: trilocale con 2 camere = 3, quadrilocale con 3 = 4 (il tipo conferma il conto)',
    L({ type: 'Trilocale', bedrooms: 2 }) === 3 && L({ type: 'quadrilocale', bedrooms: 3 }) === 4);
  // camere + 1 da sole sono una STIMA di convenzione: il portale la
  // riceverebbe come dato dell'annuncio. Il nodo esce solo se il tipo nomina
  // i locali (revisione 15/10/2026: 8 dei 9 nodi nuovi erano così)
  check('localiOf: «2 Bedroom flat» non è una stanza («Bedroom» non è «room»), ma il tipo non nomina i locali → tace',
    !FEED.isRoom({ type: ' Spacious 2 Bedroom flat ' }) && L({ type: ' Spacious 2 Bedroom flat ', bedrooms: 2 }) === null);
  check('localiOf: senza un tipo che nomini i locali si tace anche con le camere note (Loft Style, Duplex, Attic, nessun tipo)',
    [{ type: 'Loft Style', bedrooms: 2 }, { type: 'Duplex', bedrooms: 1 }, { type: 'Attic', bedrooms: 1 }, { bedrooms: 1 }]
      .every((x) => L(x) === null));
  check('localiOf: camere ignote → nessun locale, anche quando il tipo li nomina',
    L({ type: 'Loft' }) === null && L({ beds: 'Studio' }) === null && L({ type: 'bilocale' }) === null
    && L({ type: 'trilocale', beds: 'Living + kitchen' }) === null);
  check('isRoom: parola intera su tipo o nome', FEED.isRoom({ type: 'Room with private Bath ' }) && FEED.isRoom({ name: 'Endertà Room' })
    && FEED.isRoom({ type: 'Shared Room' }) && FEED.isRoom({ type: 'Stanza singola' })
    && !FEED.isRoom({ type: ' Spacious 2 Bedroom flat ' }) && !FEED.isRoom({ name: 'Showroom Loft' })
    && !FEED.isRoom({ name: 'Flat with shared garden' }));

  const res = mkRes();
  await FEED.default({ method: 'GET', query: { k: FEED.feedKey() } }, res);
  const xml = String(res.body);
  const nodes = new Map([...xml.matchAll(/<property operation="write">([\s\S]*?)<\/property>/g)].map((m) => {
    const id = (m[1].match(/<unique-id><!\[CDATA\[([^\]]*)\]\]><\/unique-id>/) || [])[1];
    return [id, m[1]];
  }));
  const rooms = (id) => { const m = (nodes.get(id) || '').match(/<rooms>(\d+)<\/rooms>/); return m ? +m[1] : null; };
  const guai = [];
  for (const id of nodes.keys()) {
    if (!DOCS.has(id)) continue;
    const exp = FEED.localiOf(withId(id));
    if (rooms(id) !== exp) guai.push(`${id}: <rooms>${rooms(id)}</rooms> ≠ ${exp}`);
  }
  check('il feed risponde e porta le case pubblicabili', res.statusCode === 200 && nodes.size >= 15 && nodes.has(CAPRI) && nodes.has(CAPPELLARI), res.statusCode + ' ' + nodes.size);
  check('ogni <rooms> è localiOf (il nodo passa dalla regola, o niente)', !guai.length, guai.join(' · '));
  // la regola scritta di nuovo qui, a parte: un localiOf che tornasse a
  // «camere + 1 salvo contraddizione» resterebbe d'accordo con sé stesso
  // ma non con questa
  const NOMINA = /\b(monolocale|studio|bilocale|trilocale|quadrilocale)\b/;
  const TAB = { monolocale: 1, studio: 1, bilocale: 2, trilocale: 3, quadrilocale: 4 };
  const fuori = [];
  let conNodo = 0;
  for (const id of nodes.keys()) {
    if (!DOCS.has(id)) continue;
    const l = withId(id), t = String(l.type || '').toLowerCase().match(NOMINA), cam = FACTS.bedroomsOf(l);
    const atteso = t && !FEED.isRoom(l) && cam != null && cam + 1 === TAB[t[1]] ? TAB[t[1]] : null;
    if (rooms(id) != null) conNodo++;
    if (rooms(id) !== atteso) fuori.push(`${id} («${l.type}», ${cam} camere): <rooms>${rooms(id)}</rooms>, atteso ${atteso}`);
  }
  check('sul catalogo vero <rooms> esce SOLO dove il tipo nomina i locali e le camere concordano (mai camere + 1 da sole)',
    conNodo >= 5 && !fuori.length, fuori.join(' · ') || conNodo);
  check('Capri: nessun <rooms> (« Spacious 2 Bedroom flat » non nomina i locali; 3 sarebbe la stima camere + 1)', rooms(CAPRI) === null, rooms(CAPRI));
  check('Angelico Loft e il Duplex di Ponte Milvio: nessun <rooms> (Loft Style, Duplex)',
    nodes.has('angelico') && rooms('angelico') === null && nodes.has('Kz9bXztv5QXmQrNhAcoU') && rooms('Kz9bXztv5QXmQrNhAcoU') === null);
  check('Cappellari 2 locali, un bilocale (prima: <rooms>3</rooms>, cioè un trilocale)', rooms(CAPPELLARI) === 2, rooms(CAPPELLARI));
  check('Pigneto Palace 3 locali (Trilocale, 2 camere)', rooms('2SwJ8yD3ITXylrEtYIlL') === 3, rooms('2SwJ8yD3ITXylrEtYIlL'));
  check('il monolocale sintetico (Studio, 0 camere) è 1 locale: il tipo lo conferma', nodes.has(MONO) && rooms(MONO) === 1, rooms(MONO));
  check('le stanze non portano <rooms> (Endertà, Tiburtina)', rooms('ilW5lAxnNn5M2TjsSHx2') === null && rooms('uHAGgEno6JKtWbgruJzU') === null);
}

// ═══ 4. il Pubblicista — payload e coda ═════════════════════════════════
console.log('\n4 · il Pubblicista (api/publisher/_state.js + queue.js)');
{
  const PUB = await import('../../api/publisher/_state.js');
  const guai = [];
  for (const l of ALL) for (const portal of PUB.PORTALS) {
    const exp = FACTS.bedroomsOf(l);
    const got = PUB.payloadFor(l, portal).beds;
    if (got !== (exp > 0 ? exp : null)) guai.push(`${l.id}/${portal}: beds ${got} ≠ ${exp}`);
  }
  check('il payload «Camere» è bedroomsOf su tutti i 27 annunci, il monolocale e i due portali (0 resta fuori, come prima)', !guai.length, guai.join(' · '));
  // lo zero NON entra nel payload: field_rows sul Mac (bot/boom_publisher.py)
  // scarta solo None, '' e [] — uno 0 diventerebbe la riga «Camere: 0»
  check('il monolocale sintetico: pubblicabile, e payload beds null su entrambi i portali (mai «Camere: 0» nel pannello)',
    PUB.publishable(withId(MONO)) && PUB.PORTALS.every((p) => PUB.payloadFor(withId(MONO), p).beds === null));
  check('Capri: beds 2; Cappellari: beds 1', PUB.payloadFor(withId(CAPRI), 'immobiliare').beds === 2
    && PUB.payloadFor(withId(CAPPELLARI), 'immobiliare').beds === 1);
  check('Idealista: Capri è un appartamento, non una stanza («2 Bedroom» non è «room»)',
    PUB.payloadFor(withId(CAPRI), 'idealista').hints.propertyType === 'appartamento');
  check('Idealista: le stanze restano stanze (tipo Room, «Room with private Bath», «Shared Room», nome «…Double Room…»)',
    ['ilW5lAxnNn5M2TjsSHx2', 'uHAGgEno6JKtWbgruJzU', 'marconi', 'qRRRV7BjXDPqgTpVchnz']
      .every((id) => PUB.payloadFor(withId(id), 'idealista').hints.propertyType === 'stanza'));

  // la coda: annunci già online con l'hash di prima. Si rimettono in coda
  // ESATTAMENTE quelli il cui numero di camere è cambiato — voluto.
  const numPub = (v) => { const n = Number(v); return isFinite(n) && n > 0 ? n : null; };
  const hashPrima = (l) => crypto.createHash('sha1').update(JSON.stringify({ ...PUB.coreContent(l), beds: numPub(l.beds || l.bedrooms) })).digest('hex');
  const live = ALL.filter((l) => PUB.publishable(l));
  for (const l of live) COLLS.portalPubs.set('immobiliare_' + l.id, { portal: 'immobiliare', listingId: l.id, status: 'live', wasLive: true, hash: hashPrima(l), attempts: 0 });
  const queue = (await import('../../api/publisher/queue.js')).default;
  const request = { method: 'GET', query: { portal: 'immobiliare', limit: '50' }, headers: { 'x-homie-secret': process.env.HOMIE_SECRET } };
  const paused = mkRes();
  await queue(request, paused);
  check('senza settings/publisher la coda resta spenta anche con aggiornamenti disponibili',
    paused.statusCode === 200 && paused.data?.enabled === false
    && Array.isArray(paused.data.actions) && paused.data.actions.length === 0, paused.body);
  // Il confronto delle camere richiede l'abilitazione esplicita del servizio
  // e del portale: una configurazione assente non autorizza pubblicazioni.
  COLLS.settings = new Map([['publisher', { enabled: true, portals: { immobiliare: { enabled: true } } }]]);
  const res = mkRes();
  await queue(request, res);
  const acts = (res.data && res.data.actions) || [];
  const upd = new Set(acts.filter((a) => a.op === 'update').map((a) => a.id));
  const attese = new Set(live.filter((l) => numPub(l.beds || l.bedrooms) !== PUB.coreContent(l).beds).map((l) => l.id));
  check('la coda esplicitamente abilitata risponde', res.statusCode === 200 && res.data?.enabled === true
    && Array.isArray(res.data.actions), res.statusCode + ' ' + res.body.slice(0, 200));
  check(`update in coda = le case online il cui numero di camere cambia (${attese.size} su ${live.length})`,
    attese.size > 0 && upd.size === attese.size && [...attese].every((id) => upd.has(id)), [...upd].join(',') + ' vs ' + [...attese].join(','));
  check('Capri e Cappellari tornano in coda col numero giusto nel payload',
    upd.has(CAPRI) && upd.has(CAPPELLARI)
    && acts.find((a) => a.id === CAPRI).payload.beds === 2 && acts.find((a) => a.id === CAPPELLARI).payload.beds === 1);
  check('una casa col numero già giusto (Corso, bedrooms 1, beds 1) non si ripubblica', !upd.has('5QAKCvswE3HN9nuuG82S'));
  COLLS.portalPubs.clear();
  delete COLLS.settings;
}

// ═══ 5. le guide di quartiere — la copia inline ═════════════════════════
console.log('\n5 · le guide di quartiere (scripts/neighborhoods-build.js → apartments-in/*.html)');
const PAGES = readdirSync(join(ROOT, 'apartments-in')).filter((f) => f.endsWith('.html') && f !== 'index.html');
const FN_RE = /function bedroomsOf\(l\)\{\n[\s\S]*?\n\}/;
{
  const copie = PAGES.map((f) => [f, (src('apartments-in/' + f).match(FN_RE) || [])[0]]);
  const fnSrc = copie[0] && copie[0][1];
  check(`ogni pagina generata (${PAGES.length}) porta la copia inline di bedroomsOf, identica`,
    PAGES.length >= 10 && copie.every(([, s]) => s && s === fnSrc), copie.filter(([, s]) => !s || s !== fnSrc).map(([f]) => f).join(','));
  check('…ed è la copia del generatore (la pagina è il suo output)', !!fnSrc && src('scripts/neighborhoods-build.js').includes(fnSrc));
  const inline = fnSrc ? vm.runInNewContext(fnSrc + '\n;bedroomsOf', {}) : () => undefined;
  const LIMITE = [
    undefined, null, {}, { bedrooms: 0 }, { bedrooms: '0' }, { bedrooms: 2 }, { bedrooms: '2' }, { bedrooms: ' 3 ' },
    { bedrooms: 2.5 }, { bedrooms: 2.5, beds: '2 BR' }, { bedrooms: -1 }, { bedrooms: 11 }, { bedrooms: 11, beds: '3' },
    { bedrooms: '' }, { bedrooms: '', beds: '1 bed ,' }, { bedrooms: null, beds: 'Living , 1 bedroom with balcony , 1 bedroom' },
    { bedrooms: true }, { bedrooms: false, beds: '2' }, { bedrooms: [2] }, { bedrooms: '1e1' }, { bedrooms: 'due' },
    { beds: 0 }, { beds: '0' }, { beds: 3 }, { beds: '11' }, { beds: 'Studio' }, { beds: '1BR + Loft' }, { beds: null },
    { beds: '٣' }, { beds: '٣ 2' }, { bedrooms: 10 }, { bedrooms: '10', beds: '1' },
  ];
  const diverse = [...ALL, ...LIMITE].filter((x) => inline(x) !== FACTS.bedroomsOf(x));
  check(`parità: la copia inline = FACTS.bedroomsOf su ${ALL.length} annunci + ${LIMITE.length} casi limite`,
    diverse.length === 0, diverse.map((x) => JSON.stringify(x && (x.id || x))).join(' · '));
  check('la copia inline: Capri 2, Cappellari 1', inline(DOCS.get(CAPRI)) === 2 && inline(DOCS.get(CAPPELLARI)) === 1);

  // la card, eseguita davvero: il loader della pagina col Firestore finto,
  // il motore vero, TUTTO il catalogo (un filtro di zona che prende tutte)
  const html = src('apartments-in/' + (PAGES.find((f) => f === 'centro-storico.html') || PAGES[0]));
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((x) => x.includes('loadZoneListings')) || '';
  // (i commenti che raccontano il difetto restano: si guarda il codice)
  const fuoriCopia = lex(script.replace(FN_RE, '')).code;
  check('nel loader della pagina nessuna lettura di `beds` fuori dalla copia della regola',
    !!script && !/\.beds\b/.test(fuoriCopia) && /const beds=bedroomsOf\(l\);/.test(fuoriCopia), (fuoriCopia.match(/.{0,40}\.beds\b.{0,40}/) || [])[0]);
  const griglia = { innerHTML: '', getAttribute: () => ' ' };
  const errori = [];
  const ctx = {
    console: { error: (...a) => errori.push(a.map(String).join(' ')), log() {} },
    firebase: { initializeApp() {}, firestore: () => ({ collection: () => ({ get: async () => ({
      docs: [...DOCS].map(([id, d]) => ({ id, data: () => ({ ...d }) })) }) }) }) },
    document: { getElementById: () => griglia, head: { querySelectorAll: () => [], appendChild() {} },
      createElement: () => ({ setAttribute() {}, type: '', textContent: '' }) },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src('js/dispo-engine.js'), ctx);
  vm.runInContext(script, ctx);
  for (let i = 0; i < 40 && !griglia.innerHTML.includes('listing-card'); i++) await new Promise((r) => setTimeout(r, 5));
  const card = new Map([...griglia.innerHTML.matchAll(/<a class="listing-card" href="\/listing\/([^"]+)">[\s\S]*?(?:<div class="listing-meta">([^<]*)<\/div>|<div class="listing-price">)/g)]
    .map((m) => [decodeURIComponent(m[1]), m[2] || '']));
  const guai = [];
  for (const [id, metaTxt] of card) {
    const exp = E(id), m = metaTxt.match(/(\d+) beds?\b/);
    if (exp >= 1 ? (!m || +m[1] !== exp || (exp > 1) !== /beds\b/.test(m[0])) : !!m) guai.push(`${id}: «${metaTxt}» (attese ${exp})`);
  }
  check('il loader gira sul catalogo vero senza errori', !errori.length && card.size >= 15, errori.join(' · ') || card.size);
  check('ogni card dice le camere di bedroomsOf («N bed(s)»)', !guai.length, guai.join(' · '));
  check('card Capri «2 beds», card Cappellari «1 bed» (prima: «Living , 1 bedroom… bed» e «3 beds»)',
    /\b2 beds\b/.test(card.get(CAPRI) || '') && /\b1 bed\b/.test(card.get(CAPPELLARI) || '') && !/Living/.test(card.get(CAPRI) || ''),
    (card.get(CAPRI) || '') + ' | ' + (card.get(CAPPELLARI) || ''));
  check('card del monolocale sintetico: c\'è, coi metri, e senza «0 bed(s)»',
    card.has(MONO) && /\b28m²/.test(card.get(MONO)) && !/\b0 beds?\b/.test(card.get(MONO)), card.get(MONO));
}

// ═══ 6. le altre superfici che leggono le camere ════════════════════════
console.log('\n6 · le altre superfici: concierge, Commerciale, Segretaria, Segugio, ricerca rovesciata, telefono, bot');
{
  // il concierge AI: i fatti al modello
  const ask = (await import('../../api/ask-listing.js')).default;
  const factsOf = async (id, ip) => {
    ANTHROPIC.length = 0;
    const r = mkRes();
    await ask({ method: 'POST', headers: { 'x-forwarded-for': '10.7.7.' + ip }, body: { id, question: 'How many bedrooms?' } }, r);
    const b = ANTHROPIC[ANTHROPIC.length - 1];
    return b ? String(b.messages[b.messages.length - 1].content) : '';
  };
  const fc = await factsOf(CAPRI, 1), fo = await factsOf(CAPPELLARI, 2);
  check('concierge: «Bedrooms: 2» per Capri (prima: «Bedrooms: Living , 1 bedroom…»)',
    /^Bedrooms: 2$/m.test(fc) && !/^Bedrooms: Living/m.test(fc), (fc.match(/^Bedrooms:.*$/m) || [])[0]);
  check('concierge: «Bedrooms: 1» per Cappellari (prima: «Bedrooms: 3»)', /^Bedrooms: 1$/m.test(fo) && !/^Bedrooms: 3$/m.test(fo), (fo.match(/^Bedrooms:.*$/m) || [])[0]);
  const fm = await factsOf(MONO, 3);
  check('concierge, monolocale sintetico: la casa arriva al modello (Name) e nessuna riga «Bedrooms:» — lo zero tace',
    /^Name: Monolocale Sintetico Monti$/m.test(fm) && !/^Bedrooms:/m.test(fm), fm.slice(0, 300));

  // il Commerciale e la Segretaria: i fatti della casa nel prompt
  const { propertyContext } = await import('../../api/employees/commerciale.js');
  const { propertyFacts } = await import('../../api/segretaria/_core.js');
  const pc = await propertyContext({ propertyId: CAPRI }), po = await propertyContext({ propertyId: CAPPELLARI });
  const camere = (txt, n) => new RegExp('· ' + n + ' camere(?: ·|$)', 'm').test(txt || '');
  check('Commerciale: «2 camere» per Capri, mai il testo libero', camere(pc.line, 2) && !/Living/.test(pc.line || ''), pc.line);
  check('Commerciale: «1 camere» per Cappellari, mai «3 camere»', camere(po.line, 1) && !/3 camere/.test(po.line || ''), po.line);
  const sc = await propertyFacts({ propertyId: CAPRI }), so = await propertyFacts({ propertyId: CAPPELLARI });
  check('Segretaria: «2 camere» per Capri, «1 camere» per Cappellari',
    camere(sc.lines.join('\n'), 2) && camere(so.lines.join('\n'), 1) && !/3 camere/.test(so.lines.join('\n')),
    sc.lines.join(' ') + ' | ' + so.lines.join(' '));
  const pm = await propertyContext({ propertyId: MONO }), sm = await propertyFacts({ propertyId: MONO });
  check('Commerciale e Segretaria, monolocale sintetico: la casa è nei fatti e nessun «0 camere» (la parola «camere» non c\'è)',
    /Monolocale Sintetico Monti/.test(pm.line || '') && !/camere/.test(pm.line || '')
    && /Monolocale Sintetico Monti/.test(sm.lines.join('\n')) && !/camere/.test(sm.lines.join('\n')),
    (pm.line || '') + ' | ' + sm.lines.join(' '));

  // il Segugio: il filtro e il digest
  const { matches, digestHtml } = await import('../../api/search/matcher.js');
  check('Segugio: «2+ camere» esclude il bilocale di Cappellari (prima passava col «3»)', matches({ beds: 2 }, withId(CAPPELLARI)) === false);
  check('Segugio: «2+ camere» tiene Capri', matches({ beds: 2 }, withId(CAPRI)) === true);
  check('Segugio: «3+ camere» esclude una casa scritta a parole («1 bedroom»: prima NaN passava)', matches({ beds: 3 }, withId('Kz9bXztv5QXmQrNhAcoU')) === false);
  // il criterio «Studio», sul giro vero: il chip della vetrina manda beds 0,
  // api/search/save.js lo salva, il matcher lo legge. Prima lo 0 era falso e
  // valeva «qualsiasi»: chi cercava un monolocale riceveva bilocali e trilocali
  const save = (await import('../../api/search/save.js')).default;
  const sr = mkRes();
  await save({ method: 'POST', headers: { 'x-forwarded-for': '10.6.6.6' },
    body: { email: 'studio@test.boom', criteria: { beds: 0, zones: [], durationMonths: 6 } } }, sr);
  const salvata = COLLS.savedSearches && COLLS.savedSearches.get(sr.data && sr.data.id);
  check('Segugio: la ricerca «Studio» salvata da api/search/save.js porta beds 0 (non null: non diventa «qualsiasi»)',
    sr.statusCode === 200 && !!salvata && !!salvata.criteria && salvata.criteria.beds === 0,
    sr.statusCode + ' ' + JSON.stringify(salvata && salvata.criteria));
  check('La durata richiesta attraversa il vero save handler e resta nei criteri Firestore',
    salvata?.criteria?.durationMonths === 6);
  const crS = (salvata && salvata.criteria) || { beds: 0 };
  check('Segugio: con quella ricerca il monolocale passa, Capri e il bilocale di Cappellari no',
    matches(crS, withId(MONO)) === true && matches(crS, withId(CAPRI)) === false && matches(crS, withId(CAPPELLARI)) === false);
  check('Segugio: «Studio» non prende una casa di cui non si sanno le camere; «1+» non prende il monolocale; senza camere = qualsiasi',
    matches({ beds: 0 }, { id: 'u', name: 'Ignota', price: 900, status: 'available' }) === false
    && matches({ beds: 1 }, withId(MONO)) === false
    && matches({}, withId(CAPRI)) === true && matches({ beds: null }, withId(MONO)) === true);
  const dig = digestHtml({ id: 's', email: 'a@b.c' }, [withId(CAPRI), withId(CAPPELLARI)]);
  const stayDigest = digestHtml({ id: 's', email: 'a@b.c', criteria: salvata.criteria }, [withId(MONO)]);
  check('La durata è una preferenza: nessuna casa esclusa con termini ignoti, nessuna falsa compatibilità negli alert',
    matches({ durationMonths: 1 }, withId(CAPRI)) && matches({ durationMonths: 24 }, withId(CAPRI))
    && /You requested 6 months/.test(stayDigest) && /Lease length is still to be confirmed/.test(stayDigest)
    && /these alerts match your other search criteria/.test(stayDigest)
    && /\/listing\/[^"<>]+\?stay=6/.test(stayDigest) && /\/apartments\?stay=6/.test(stayDigest));
  const invalidStay = mkRes();
  await save({ method: 'POST', headers: { 'x-forwarded-for': '10.6.6.7' },
    body: { email: 'stay@test.boom', criteria: { durationMonths: '6-12', beds: 0 } } }, invalidStay);
  const rejectedStay = COLLS.savedSearches.get(invalidStay.data?.id);
  check('Un range ambiguo non diventa una durata esatta sul server',
    invalidStay.statusCode === 200 && rejectedStay?.criteria?.durationMonths === null && rejectedStay.criteria.beds === 0);
  check('digest: «2 bed» per Capri, «1 bed» per Cappellari, mai il testo libero né «3 bed»',
    /· 2 bed · /.test(dig) && /· 1 bed · /.test(dig) && !/Living|3 bed/.test(dig), (dig.match(/· [^<]*bed · /g) || []).join(' | '));
  const dz = digestHtml({ id: 's', email: 'a@b.c' }, [{ id: 'z', name: 'Zero', price: 900, bedrooms: 0 }, { id: 'u', name: 'Ignota', price: 900 }]);
  check('digest: un monolocale è «Studio», una casa senza camere note non è «Studio»',
    /Zero[\s\S]*?· Studio · /.test(dz) && !/Ignota[\s\S]*?Studio/.test(dz.slice(dz.indexOf('Ignota'))) && !/Studio bed/.test(dz), dz.replace(/\s+/g, ' ').slice(0, 600));

  // la ricerca rovesciata: la casa chiesta è il briefing
  const R = await import('../../api/leads/_reverse.js');
  const byId = new Map(ALL.map((l) => [l.id, l]));
  const crit = R.leadCriteria({ propertyId: CAPPELLARI, message: 'Hi, is it still available?' }, byId, []);
  check('ricerca rovesciata: chi ha chiesto Cappellari cerca 1 camera (prima 3)', crit.beds === 1, crit.beds);
  const sco = R.scoreLeadForListing({ budget: null, beds: 2, zones: [] }, withId(CAPRI), {});
  check('ricerca rovesciata: Capri calza a chi cerca 2 camere («2 camere ✓»)', sco.reasons.includes('2 camere ✓'), sco.reasons.join(' · '));

  // il telefono: il catalogo della receptionist
  const tools = (await import('../../api/phone/agent-tools.js')).default;
  const tr = mkRes();
  await tools({ method: 'GET', query: { op: 'catalog' }, headers: { 'x-homie-secret': process.env.HOMIE_SECRET } }, tr);
  const lst = (tr.data && tr.data.listings) || [];
  const gp = (id) => (lst.find((x) => x.id === id) || {}).bedrooms;
  check('telefono: il catalogo dice bedrooms = bedroomsOf (Capri 2, Cappellari 1)',
    tr.statusCode === 200 && gp(CAPRI) === 2 && gp(CAPPELLARI) === 1
    && lst.every((x) => x.bedrooms === E(x.id)), tr.statusCode + ' ' + JSON.stringify(lst.map((x) => [x.id, x.bedrooms])));
  check('telefono: il monolocale sintetico è nel catalogo con bedrooms 0 (alla voce lo zero è un dato, non un silenzio)',
    lst.some((x) => x.id === MONO) && gp(MONO) === 0, JSON.stringify(lst.find((x) => x.id === MONO) || 'assente'));

  // il bot: il riepilogo della modifica dice il «prima» che il sito mostrava
  const interpret = (await import('../../api/wizard/interpret.js')).default;
  AI_PLAN = { action: 'update', id: CAPRI, updates: { beds: 3 }, note: 'ok' };
  const ir = mkRes();
  await interpret({ method: 'POST', headers: { 'x-wizard-secret': process.env.HOMIE_SECRET }, body: { text: 'Capri ha 3 camere' } }, ir);
  AI_PLAN = null;
  const sum = (ir.data && ir.data.summary) || [];
  check('bot: «beds: 2 → 3» (prima: «beds: Living , 1 bedroom with balcony… → 3»), e bedrooms scritto gemello',
    ir.statusCode === 200 && sum.includes('beds: 2 → 3') && ir.data.updates.bedrooms === 3, ir.statusCode + ' ' + JSON.stringify(sum));
}

// ═══ 7. la regola di classe ═════════════════════════════════════════════
console.log('\n7 · regola di classe: nessun file api/** legge `beds` di una casa');
// Toglie commenti e TESTO dei letterali (stringhe, template, regex) tenendo
// il codice dentro ${…}: restano le letture vere. Le stringhe tornano a parte
// (per le chiavi lette per nome, come pick('beds', …)). La lunghezza resta la
// stessa del sorgente: le posizioni valgono anche per i numeri di riga.
function lex(source) {
  const N = source.length; let i = 0, out = '', last = '';
  const strs = [], depth = [];
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  const regexOk = () => !last || /[(,=:[!&|?{};+\-*%<>~^]/.test(last)
    || /(?:^|[^\w$.])(?:return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)$/.test(out.trimEnd());
  function tpl() {
    let v = '';
    while (i < N) {
      const c = source[i];
      if (c === '\\') { v += source.slice(i, i + 2); out += source[i + 1] === '\n' ? ' \n' : '  '; i += 2; continue; }
      if (c === '`') { strs.push({ value: v, at: out.length }); out += '`'; i++; last = '`'; return; }
      if (c === '$' && source[i + 1] === '{') { strs.push({ value: v, at: out.length }); out += '${'; i += 2; depth.push(0); last = '{'; return; }
      out += c === '\n' ? '\n' : ' '; v += c; i++;
    }
  }
  while (i < N) {
    const c = source[i], d = source[i + 1];
    if (c === '/' && d === '/') { const j = source.indexOf('\n', i); const e = j < 0 ? N : j; out += blank(source.slice(i, e)); i = e; continue; }
    if (c === '/' && d === '*') { const j = source.indexOf('*/', i + 2); const e = j < 0 ? N : j + 2; out += blank(source.slice(i, e)); i = e; continue; }
    if (c === '\'' || c === '"') {
      let j = i + 1, v = '';
      while (j < N && source[j] !== c && source[j] !== '\n') { if (source[j] === '\\') { v += source[j + 1]; j += 2; } else { v += source[j]; j++; } }
      strs.push({ value: v, at: out.length });
      out += c + blank(source.slice(i + 1, j)) + c; i = j + 1; last = c; continue;
    }
    if (c === '`') { out += '`'; i++; tpl(); continue; }
    if (c === '/' && regexOk()) {
      let j = i + 1, cls = false;
      while (j < N && source[j] !== '\n') { const x = source[j]; if (x === '\\') { j += 2; continue; } if (x === '[') cls = true; else if (x === ']') cls = false; else if (x === '/' && !cls) break; j++; }
      j++; while (j < N && /[a-z]/i.test(source[j])) j++;
      out += blank(source.slice(i, j)); i = j; last = '/'; continue;
    }
    if (depth.length) {
      if (c === '{') depth[depth.length - 1]++;
      else if (c === '}') {
        if (depth[depth.length - 1] === 0) { depth.pop(); out += '}'; i++; tpl(); continue; }
        depth[depth.length - 1]--;
      }
    }
    out += c; if (!/\s/.test(c)) last = c; i++;
  }
  return { code: out, strings: strs };
}
// Chi può leggere un `beds` che non è quello di una casa: i CRITERI di chi
// cerca (cosa vuole una persona, non cosa ha una casa) e il vocabolario di
// scrittura del bot (il piano del modello: `beds` è il nome del campo che il
// bot scrive, gemello di `bedrooms`). Tutto il resto passa da bedroomsOf.
const PERMESSI = {
  'api/search/save.js': { receivers: ['c'], why: 'criteri della ricerca salvata' },
  'api/search/matcher.js': { receivers: ['c'], why: 'criteri della ricerca salvata' },
  'api/leads/_reverse.js': { receivers: ['crit'], why: 'criteri del lead' },
  'api/wizard/interpret.js': { receivers: ['out', 'updates', 'F'], strings: true, why: 'il piano del modello: le chiavi che il bot scrive' },
};
const lineOf = (s, at) => s.slice(0, at).split('\n').length;
function scan(rel, source) {
  const guai = [];
  const { code, strings } = lex(source);
  const ok = PERMESSI[rel] || {};
  // 1. beds-first o due regole: `beds` con un ripiego, in qualunque ordine
  const PRIMA = [
    /\bbeds\b\s*(?:\|\||\?\?)/g,                                     // l.beds || …  ·  l.beds ?? …
    /(?:\|\||\?\?)\s*(?:[\w$]+\s*(?:\?\.|\.)\s*)?beds\b/g,            // … || l.beds  ·  … ?? l.beds
    /\bbeds\s*!==?\s*(?:null|undefined)\s*\?/g,                        // l.beds != null ? l.beds : …
  ];
  for (const re of PRIMA) for (const m of code.matchAll(re)) guai.push(`${rel}:${lineOf(code, m.index)} lettura con ripiego «${source.slice(m.index, m.index + 40).trim()}»`);
  for (let k = 0; k + 1 < strings.length; k++) {
    const a = strings[k].value, b = strings[k + 1].value;
    if (/^(beds|bedrooms)$/.test(a) && /^(beds|bedrooms)$/.test(b) && a !== b && /^['"`]\s*,\s*$/.test(code.slice(strings[k].at + a.length + 1, strings[k + 1].at)))
      guai.push(`${rel}:${lineOf(code, strings[k].at)} chiavi '${a}', '${b}' lette per nome`);
  }
  // 2. ogni `.beds` letto su qualcosa che non sono i criteri permessi
  for (const m of code.matchAll(/([A-Za-z_$][\w$]*|\]|\))\s*(?:\?\.|\.)\s*beds\b/g)) {
    if (!(ok.receivers || []).includes(m[1])) guai.push(`${rel}:${lineOf(code, m.index)} legge «${m[1]}.beds»`);
  }
  // 3. la chiave 'beds' per nome (pick('beds'), x['beds'], liste di chiavi)
  if (!ok.strings) for (const s of strings) if (s.value === 'beds') guai.push(`${rel}:${lineOf(code, s.at)} chiave 'beds' per nome`);
  return guai;
}
{
  // la trappola morde: le letture di prima, com'erano scritte, cadono tutte
  const TRAPPOLE = {
    'listing/llms': 'const beds = num(d.beds || d.bedrooms);',
    feed: 'const rooms = Number(l.beds || l.bedrooms) || 0;',
    publisher: 'beds: num(l.beds || l.bedrooms),',
    telefono: 'bedrooms: number(l.bedrooms ?? l.beds),',
    concierge: "const beds = pick('beds', 'bedrooms'); if (beds != null) lines.push(`Bedrooms: ${beds}`);",
    segretaria: 'l.bedrooms || l.beds ? `${l.bedrooms || l.beds} camere` : null,',
    commerciale: 'l.beds ? `${l.beds} camere` : null,',
    segugio: 'if (c.beds && Number(l.beds || 0) < Number(c.beds)) return false;',
    digest: "· ${l.beds || 'Studio'} bed · ",
    rovesciata: 'const b = Number(asked.beds != null ? asked.beds : asked.bedrooms);',
    quartiere: 'const beds=l.beds||l.bedrooms;',
  };
  const mancate = Object.entries(TRAPPOLE).filter(([, s]) => !scan('api/trappola.js', '`' + s.replace(/`/g, '\\`') + '`;\n' + s).length);
  check('la regola riconosce le undici letture di prima (anche dentro un template, anche dentro ${…})', !mancate.length, mancate.map(([k]) => k).join(', '));
  check('…e non scambia la regola per una lettura', !scan('api/trappola.js', 'const beds = FACTS.bedroomsOf(l); if (beds) x.push(beds + " bedrooms");').length);
  // dentro un commento o un testo la parola non è una lettura
  check('…né un commento o un prompt che nomina `beds`', !scan('api/trappola.js', '// `num(l.beds || l.bedrooms)` era sbagliata\nconst P = `campi: beds, bathrooms ${x.y}`;\n/* l.beds */').length);

  function walk(dir, acc = []) {
    for (const n of readdirSync(dir)) {
      if (n === 'node_modules' || n.startsWith('.')) continue;
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p, acc); else if (/\.(m?js|cjs)$/.test(n)) acc.push(p);
    }
    return acc;
  }
  const files = walk(join(ROOT, 'api'));
  const guai = [];
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    if (!/beds/.test(s)) continue;          // la parola non c'è: niente da leggere
    const rel = f.slice(ROOT.length + 1).split('\\').join('/');
    guai.push(...scan(rel, s));
  }
  check(`nessun file api/** (${files.length}) legge \`beds\` di una casa: solo bedroomsOf`, files.length > 100 && !guai.length, guai.join(' · '));

  // e le superfici che stampano le camere passano DAVVERO dalla regola
  const SUPERFICI = ['api/listing.js', 'api/llms-listings.js', 'api/feed/immobiliare.js', 'api/publisher/_state.js',
    'api/employees/commerciale.js', 'api/segretaria/_core.js', 'api/search/matcher.js', 'api/ask-listing.js',
    'api/leads/_reverse.js', 'api/phone/agent-tools.js', 'api/wizard/interpret.js'];
  const senza = SUPERFICI.filter((p) => {
    const { code } = lex(src(p));
    return !/FACTS\.bedroomsOf\(/.test(code) || !/listing-facts\.js/.test(src(p));
  });
  check(`le ${SUPERFICI.length} superfici importano js/listing-facts.js e chiamano FACTS.bedroomsOf`, !senza.length, senza.join(', '));
}

console.log(`\n${fail ? '✗' : '✓'} Le camere con una regola sola — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
