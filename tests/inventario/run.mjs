// tests/inventario/run.mjs — L'INVENTARIO DAL VIDEO, blindato.
//
// Due metà. La prima è il MOTORE (js/inventario-engine.js), puro: le sue
// regole si verificano per mutazione, perché sono regole che costano soldi
// veri a qualcuno tra diciotto mesi. La seconda è il HANDLER REALE
// (api/contracts/inventario.js) guidato su un Firestore in memoria, con
// pdf-lib VERO, Anthropic e Whisper stubbati e nodemailer mockato dal
// loader della suite notify.
//
// LE REGOLE CHE QUESTA SUITE DIFENDE:
//  · il video NON dichiara "buono stato" — può affermare solo ciò che si
//    vede (un difetto, un oggetto nuovo); il resto resta "non dichiarata",
//    e l'operatore lo sa perché glielo si scrive;
//  · una condizione non dichiarata alla consegna non può diventare un
//    DANNO alla riconsegna: finisce fra i "non verificabili";
//  · un elenco che nessuno ha riguardato non diventa un documento;
//  · analyze NON scrive niente (una proposta non è un fatto);
//  · un owner non fa l'inventario dell'immobile di un altro;
//  · quando l'inventario c'è, il VERBALE smette di dire "completa degli
//    arredi e delle dotazioni pattuite" e stampa l'elenco.
//
// Uso: node tests/inventario/run.mjs
import { register } from 'node:module';
register('../notify/loader.mjs', import.meta.url);

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.HOMIE_SECRET = 'test-secret-inventario';
process.env.GMAIL_USER = 'sistema@test.it';
process.env.GMAIL_APP_PASS = 'x';
process.env.ANTHROPIC_API_KEY = 'sk-test';
delete process.env.OPENAI_API_KEY;
delete process.env.ADMIN_NOTIFY_EMAIL;

const E = (await import('../../js/inventario-engine.js')).default;

let passed = 0, failed = 0;
const bad = [];
const check = (name, cond) => { cond ? passed++ : (failed++, bad.push(name)); console.log((cond ? 'PASS ' : 'FAIL ') + name); };
const mails = () => globalThis.__mails || [];

// ═══════════════════════════════════════════════════════════════════════
//  PARTE 1 — IL MOTORE
// ═══════════════════════════════════════════════════════════════════════

// ── Il lessico delle stanze: normalizza, ma non indovina ──
{
  check('salotto → Soggiorno', E.normalizeRoom('salotto').key === 'soggiorno');
  check('living room → Soggiorno', E.normalizeRoom('Living Room').key === 'soggiorno');
  check('bedroom 2 → Camera 2 (il numero sopravvive)', E.normalizeRoom('bedroom 2').label === 'Camera 2');
  check('camera da letto → Camera', E.normalizeRoom('camera da letto').key === 'camera');
  check('parola intera: "telecamera" NON è una camera', E.normalizeRoom('telecamera').key === 'altro');
  check('stanza sconosciuta resta sé stessa, non diventa soggiorno', E.normalizeRoom('mansarda').label === 'Mansarda');
  const due = E.normalizeProposal([{ room: 'camera', items: [{ name: 'Letto' }] }, { room: 'camera 2', items: [{ name: 'Letto' }] }]);
  check('camera e camera 2 restano DUE ambienti', due.counts.rooms === 2);
}

// ── REGOLA 1: il video non emette giudizi ──
{
  const ai = E.normalizeProposal([{ room: 'cucina', items: [
    { name: 'Frigorifero', condition: 'buono' },
    { name: 'Forno', condition: 'usato' },
    { name: 'Lavastoviglie', condition: 'danneggiato', note: 'anta crepata' },
    { name: 'Cappa', condition: 'nuovo' },
    { name: 'Piano cottura', condition: 'perfetto' },
  ] }], { source: 'ai' });
  const by = {}; ai.rooms[0].items.forEach(i => { by[i.name] = i.condition; });
  check('AI: "buono" → non dichiarata', by.Frigorifero === null);
  check('AI: "usato" → non dichiarata', by.Forno === null);
  check('AI: "danneggiato" resta (è un fatto visibile)', by.Lavastoviglie === 'danneggiato');
  check('AI: "nuovo" resta', by.Cappa === 'nuovo');
  check('AI: valore fuori lessico → non dichiarata', by['Piano cottura'] === null);
  check('e il declassamento viene DETTO, non fatto in silenzio', ai.warnings.some(w => /non dichiarata/.test(w)));

  const um = E.normalizeProposal([{ room: 'cucina', items: [{ name: 'Frigorifero', condition: 'buono' }] }], { source: 'human' });
  check('l\'operatore invece PUÒ dichiarare "buono" (l\'ha guardato lui)', um.rooms[0].items[0].condition === 'buono');

  const nud = E.normalizeItem({ name: 'Divano' }, { source: 'human' });
  check('condizione assente resta null, MAI un default "buono"', nud.condition === null);
  check('quantità assente vale 1 (l\'oggetto c\'è), mai un numero inventato', nud.qty === 1);
  check('condizione non dichiarata si stampa per quello che è', E.conditionLabel(null) === 'non dichiarata');
}

// ── Igiene della proposta ──
{
  const p = E.normalizeProposal([{ room: 'Cucina', items: [
    { name: 'Lavastoviglie Bosch', qty: 1 },
    { name: 'lavastoviglie bosch', qty: 2, condition: 'danneggiato', note: 'guarnizione' },
    { name: '  ' },
    { name: 'Sedie', qty: '6' },
    { name: 'Tavolo', qty: -3 },
  ] }], { source: 'ai' });
  const items = p.rooms[0].items;
  check('lo stesso oggetto visto due volte è UN oggetto', items.length === 3);
  check('fondendo tiene la quantità maggiore e il difetto rilevato', items[0].qty === 2 && items[0].condition === 'danneggiato' && /guarnizione/.test(items[0].note));
  check('voce senza nome scartata, e lo dice', p.warnings.some(w => /senza nome/.test(w)));
  check('quantità testuale "6" letta come 6', items.find(i => i.name === 'Sedie').qty === 6);
  check('quantità negativa → 1', items.find(i => i.name === 'Tavolo').qty === 1);

  const flat = E.normalizeProposal([{ room: 'bagno', name: 'Specchio', qty: 1 }, { room: 'bagno', name: 'Lavatrice' }]);
  check('accetta anche una lista piatta (il modello sbaglia forma prima della sostanza)', flat.counts.items === 2 && flat.rooms[0].key === 'bagno');
  check('risposta illeggibile → nessuna voce e un motivo', E.normalizeProposal('boh').warnings[0] === 'nessuna_proposta');

  const many = E.normalizeProposal([{ room: 'soggiorno', items: Array.from({ length: 60 }, (_, i) => ({ name: 'Oggetto ' + i })) }]);
  check('tetto per stanza rispettato', many.rooms[0].items.length === E.MAX_ITEMS_PER_ROOM);
  check('REGOLA 4: il taglio non è mai silenzioso', many.warnings.some(w => /oltre il tetto/.test(w)));
}

// ── framePlan ──
{
  const plan = E.framePlan(42, 10);
  check('10 istanti su 42 secondi', plan.length === 10);
  check('nessun fotogramma oltre la fine del video', plan.every(t => t < 42));
  check('né sul primo istante (mano sulla maniglia)', plan[0] > 0.3);
  check('crescenti', plan.every((t, i) => i === 0 || t > plan[i - 1]));
  check('video di 3 secondi: pochi istanti, non dieci', E.framePlan(3, 10).length <= 2);
  check('durata sconosciuta → nessun piano (e la pagina lo dice)', E.framePlan(0, 10).length === 0 && E.framePlan(NaN, 10).length === 0);
}

// ── Fusione di due passaggi ──
{
  const primo = E.normalizeProposal([{ room: 'cucina', items: [{ name: 'Frigorifero' }] }], { source: 'ai' });
  primo.rooms[0].items[0].condition = 'buono';
  primo.rooms[0].items[0].source = 'human';           // l'operatore l'ha guardato
  const secondo = E.normalizeProposal([
    { room: 'cucina', items: [{ name: 'Frigorifero', condition: 'danneggiato' }] },
    { room: 'cantina', items: [{ name: 'Scaffale' }] },
  ], { source: 'ai' });
  const m = E.mergeInventory(primo, secondo);
  const frigo = m.rooms.find(r => r.key === 'cucina').items[0];
  check('un secondo video AGGIUNGE la stanza nuova', m.rooms.length === 2);
  check('e non sovrascrive il giudizio di un umano con quello del video', frigo.condition === 'buono');
  check('il totale è dei pezzi, non delle righe', m.counts.pieces === 2);
}

// ── REGOLA CHIAVE: il confronto consegna ⇄ riconsegna ──
{
  const consegna = E.normalizeProposal([{ room: 'soggiorno', items: [
    { name: 'Divano', condition: 'buono' },
    { name: 'Sedie', qty: 6, condition: 'buono' },
    { name: 'Lampada' },                                    // condizione MAI dichiarata
    { name: 'Tenda', condition: 'buono' },
  ] }], { source: 'human' });
  const uscita = E.normalizeProposal([{ room: 'soggiorno', items: [
    { name: 'Divano', condition: 'danneggiato', note: 'strappo bracciolo' },
    { name: 'Sedie', qty: 4, condition: 'buono' },
    { name: 'Lampada', condition: 'danneggiato' },
    { name: 'Tappeto', qty: 1 },
  ] }], { source: 'human' });
  const d = E.diffInventory(consegna, uscita);

  check('sparito del tutto → mancante', d.missing.some(x => x.name === 'Tenda'));
  check('6 sedie diventate 4 → mancano 2 (non "tutte")', d.missing.some(x => x.name === 'Sedie' && x.qty === 2));
  check('intero alla consegna e rotto all\'uscita → danno', d.damaged.some(x => x.name === 'Divano'));
  check('comparso dopo → segnalato, ma non è un danno', d.added.some(x => x.name === 'Tappeto') && !d.damaged.some(x => x.name === 'Tappeto'));
  check('LA REGOLA: senza condizione alla consegna, il danno NON si imputa', !d.damaged.some(x => x.name === 'Lampada') && d.unverifiable.some(x => x.name === 'Lampada'));

  // Mutazione: se la regola cadesse, la lampada diventerebbe un danno
  const mutato = { missing: [], damaged: [], added: [], unverifiable: [] };
  ((consegna.rooms)).forEach(r => r.items.forEach(it => {
    const now = uscita.rooms[0].items.find(x => x.name === it.name);
    if (now && now.condition === 'danneggiato' && it.condition !== 'danneggiato') mutato.damaged.push(it.name);
  }));
  check('(mutazione) senza la regola la lampada finirebbe fra i danni', mutato.damaged.includes('Lampada'));

  const uguale = E.diffInventory(consegna, consegna);
  check('nessuna differenza quando non ce ne sono', !uguale.missing.length && !uguale.damaged.length && !uguale.added.length && uguale.intact === 4);
}

// ── Il cancello del salvataggio ──
{
  check('elenco vuoto: non salvabile', E.saveable({ rooms: [], reviewed: true }).error === 'inventario_vuoto');
  const inv = E.normalizeProposal([{ room: 'cucina', items: [{ name: 'Frigo' }] }]);
  check('REGOLA 2: non rivisto = non è un documento', E.saveable(inv).error === 'non_rivisto');
  inv.reviewed = true;
  check('rivisto e pieno: si salva', E.saveable(inv).ok === true);
  check('summaryLine dice pezzi, ambienti e ciò che manca', /1 pezzo in 1 stanza/.test(E.summaryLine(inv)) && /senza condizione/.test(E.summaryLine(inv)));
}

// ═══════════════════════════════════════════════════════════════════════
//  PARTE 2 — IL HANDLER VERO
// ═══════════════════════════════════════════════════════════════════════
const store = new Map();
const storageFiles = new Map();
let aiCalls = 0, aiReply = null;
const okJson = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = toFs(x); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
const toFsFields = (o) => { const f = {}; for (const [k, v] of Object.entries(o || {})) f[k] = toFs(v); return f; };
function fromFs(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return +v.integerValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return ((v.arrayValue || {}).values || []).map(fromFs);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries((v.mapValue || {}).fields || {})) o[k] = fromFs(x); return o; }
  return null;
}
const fromFsFields = (f) => { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = fromFs(v); return o; };

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('identitytoolkit')) return okJson({ idToken: 'tok', users: [{ localId: 'caller1', email: 'op@boom.it' }] });
  if (url.includes('api.anthropic.com')) {
    aiCalls++;
    const body = JSON.parse(opts.body);
    globalThis.__lastAi = body;
    if (aiReply === 'boom') return new Response('nope', { status: 529 });
    return okJson({ content: [{ type: 'text', text: JSON.stringify(aiReply) }], stop_reason: 'end_turn' });
  }
  if (url.includes('firebasestorage.googleapis.com')) {
    if (opts.method === 'POST') {
      const name = new URL(url).searchParams.get('name');
      if (name) storageFiles.set(name, Buffer.from(opts.body));
      return okJson({ downloadTokens: 'dltok' });
    }
    return okJson({ downloadTokens: 'dltok' });
  }
  if (url.includes('firestore.googleapis.com')) {
    const path = (url.split('(default)/documents')[1] || '').replace(/^\//, '').split('?')[0];
    const qs = new URL(url).searchParams;
    if (opts.method === 'POST' && !path.startsWith(':')) {
      const docId = qs.get('documentId') || 'auto_' + (store.size + 1);
      store.set(path + '/' + docId, fromFsFields(JSON.parse(opts.body).fields));
      return okJson({ name: 'projects/p/databases/(default)/documents/' + path + '/' + docId });
    }
    if (opts.method === 'PATCH') {
      const cur = store.get(path) || {};
      Object.assign(cur, fromFsFields(JSON.parse(opts.body).fields));
      store.set(path, cur);
      return okJson({ name: 'projects/p/databases/(default)/documents/' + path });
    }
    const doc = store.get(path);
    if (!doc) return new Response('not found', { status: 404 });
    return okJson({ name: 'projects/p/databases/(default)/documents/' + path, fields: toFsFields(doc) });
  }
  throw new Error('fetch non stubbata: ' + url);
};

const JPG1 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
function seed(callerRole, ownerId, extra = {}) {
  store.clear(); storageFiles.clear(); globalThis.__mails = []; aiCalls = 0;
  store.set('users/caller1', { role: callerRole, name: 'Valentino', email: 'op@boom.it' });
  store.set('properties/p1', { ownerId, address: 'Via Lucrino 41', name: 'Lucrino 41', ...(extra.property || {}) });
  store.set('contracts/ctr1', {
    propertyId: 'p1', tenantId: 't1', type: 'transitorio',
    tenantName: 'Julie Verbrugghe', tenantEmail: 'julie@tenant.fr',
    landlordName: 'Stefano Compierchio', startDate: '2026-09-01', endDate: '2027-08-31', rent: 1400,
    ...(extra.contract || {}),
  });
}
const mkRes = () => ({ code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } });
const drive = async (body) => {
  const handler = (await import('../../api/contracts/inventario.js')).default;
  const res = mkRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer tok' }, body }, res);
  return res;
};
const rooms = () => [{ room: 'cucina', items: [
  { name: 'Lavastoviglie Bosch', qty: 1, condition: 'buono', source: 'human' },
  { name: 'Sedie', qty: 6, condition: 'buono', source: 'human' },
  { name: 'Lampadario', qty: 1, source: 'human' },
] }, { room: 'soggiorno', items: [{ name: 'Divano 3 posti', qty: 1, condition: 'danneggiato', note: 'strappo bracciolo destro →', source: 'human' }] }];

// ═══ A. analyze non scrive niente ═══════════════════════════════════════
{
  seed('admin', 'own1');
  aiReply = { rooms: [{ room: 'kitchen', items: [{ name: 'Frigorifero', qty: 1, condition: 'buono' }, { name: 'Forno', qty: 1, condition: 'danneggiato', note: 'vetro crepato' }] }] };
  const res = await drive({ op: 'analyze', contractId: 'ctr1', frames: [{ base64: JPG1, t: 2.4 }, { base64: JPG1, t: 7.1 }] });
  check('analyze: 200 con proposta', res.code === 200 && res.body.ok === true && res.body.proposal.counts.items === 2);
  check('analyze: la stanza inglese è normalizzata in italiano', res.body.proposal.rooms[0].label === 'Cucina');
  check('analyze: il "buono" del modello NON entra nel documento', res.body.proposal.rooms[0].items[0].condition === null);
  check('analyze: il difetto visibile resta', res.body.proposal.rooms[0].items[1].condition === 'danneggiato');
  check('analyze: NON scrive niente (né immobile, né contratto, né archivio)',
    !store.get('properties/p1').inventario && !store.get('contracts/ctr1').inventario
    && ![...store.keys()].some(k => k.startsWith('documents/')) && storageFiles.size === 0);
  check('analyze: non manda email', mails().length === 0);
  const sent = globalThis.__lastAi;
  check('analyze: al modello arrivano le immagini vere', (sent.messages[0].content || []).filter(c => c.type === 'image').length === 2);
  check('analyze: senza fotogrammi 400 e nessuna spesa AI', (await drive({ op: 'analyze', contractId: 'ctr1', frames: [] })).body.error === 'no_frames' && aiCalls === 1);
}

// ═══ B. l'AI giù non inventa un inventario ══════════════════════════════
{
  seed('admin', 'own1'); aiReply = 'boom';
  const res = await drive({ op: 'analyze', contractId: 'ctr1', frames: [{ base64: JPG1, t: 1 }] });
  check('AI giù: 502 dichiarato (mai un elenco vuoto spacciato per casa vuota)', res.code === 502 && /ai_failed/.test(res.body.error));
  const key = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
  const res2 = await drive({ op: 'analyze', contractId: 'ctr1', frames: [{ base64: JPG1, t: 1 }] });
  process.env.ANTHROPIC_API_KEY = key;
  check('AI non configurata: 501 esplicito', res2.code === 501 && res2.body.error === 'ai_unconfigured');
}

// ═══ C. save: il documento vero ═════════════════════════════════════════
{
  seed('admin', 'own1');
  const res = await drive({ op: 'save', contractId: 'ctr1', kind: 'consegna', reviewed: true, rooms: rooms(), note: 'Chiavi già in cassetta ✓', shots: [{ base64: JPG1, label: 'Secondo 2' }] });
  check('save: 200 con url', res.code === 200 && res.body.ok === true && /inventario-consegna_\d+\.pdf/.test(res.body.url));
  check('save: conta i PEZZI (6 sedie sono 6)', res.body.counts.pieces === 9 && res.body.counts.items === 4 && res.body.counts.rooms === 2);

  const pdfKey = [...storageFiles.keys()].find(k => /inventario-consegna/.test(k));
  const bytes = pdfKey && storageFiles.get(pdfKey);
  check('save: il PDF è un PDF vero (testo WinAnsi-ostile sopravvissuto)', !!bytes && bytes.slice(0, 4).toString() === '%PDF' && bytes.length > 2000);
  check('save: il PDF sta sotto contracts/<id>/', /^contracts\/ctr1\//.test(pdfKey));
  check('save: i fotogrammi restano come prova sull\'immobile', [...storageFiles.keys()].some(k => /^property-docs\/p1\/inventario\//.test(k)) && res.body.shots === 1);

  const p = store.get('properties/p1'), c = store.get('contracts/ctr1');
  check('save: inventario sull\'immobile (con le voci, non solo il link)', !!(p.inventario && p.inventario.url && p.inventario.rooms.length === 2));
  check('save: e sul contratto', !!(c.inventario && c.inventario.url));
  check('save: registra chi l\'ha fatto e quando', p.inventario.by === 'op@boom.it' && !!p.inventario.at);

  const filed = [...store.keys()].filter(k => k.startsWith('documents/')).map(k => store.get(k)).find(d => d.category === 'inventario');
  check('save: archiviato in documents (categoria inventario, agganciato a immobile e contratto)', !!filed && filed.propertyId === 'p1' && filed.contractId === 'ctr1' && filed.needsFiling === false);

  const vm = mails().filter(m => m.to === 'valentino@boom-rome.com');
  check('save: copia all\'operatore col PDF in allegato', vm.length === 1 && vm[0].attachments && Buffer.compare(vm[0].attachments[0].content, bytes) === 0);
}

// ═══ D. save: i cancelli ════════════════════════════════════════════════
{
  seed('admin', 'own1');
  const r1 = await drive({ op: 'save', contractId: 'ctr1', kind: 'consegna', rooms: rooms() });
  check('save senza conferma: 400 non_rivisto', r1.code === 400 && r1.body.error === 'non_rivisto');
  check('e nessun PDF, nessuna scrittura, nessuna email', storageFiles.size === 0 && !store.get('properties/p1').inventario && mails().length === 0);

  const r2 = await drive({ op: 'save', contractId: 'ctr1', kind: 'consegna', reviewed: true, rooms: [{ room: 'cucina', items: [{ name: '' }] }] });
  check('save di un elenco vuoto: 400', r2.code === 400 && r2.body.error === 'inventario_vuoto');

  const r3 = await drive({ op: 'save', kind: 'consegna', reviewed: true, rooms: rooms() });
  check('senza immobile né contratto: 400', r3.code === 400 && r3.body.error === 'property_required');

  const r4 = await drive({ op: 'save', contractId: 'sparito', kind: 'consegna', reviewed: true, rooms: rooms() });
  check('contratto inesistente: 404', r4.code === 404 && r4.body.error === 'contract_not_found');

  const r5 = await drive({ op: 'fai_tutto_tu', propertyId: 'p1' });
  check('operazione sconosciuta: 400, non un default silenzioso', r5.code === 400 && r5.body.error === 'unknown_op');
}

// ═══ E. autorizzazione object-level ═════════════════════════════════════
{
  seed('landlord', 'ALTRO_OWNER');
  const res = await drive({ op: 'save', contractId: 'ctr1', kind: 'consegna', reviewed: true, rooms: rooms() });
  check('landlord su immobile altrui: 403', res.code === 403 && res.body.error === 'not_your_property');
  check('403 = zero scritture, zero email, zero AI', !store.get('properties/p1').inventario && mails().length === 0 && storageFiles.size === 0 && aiCalls === 0);

  seed('landlord', 'caller1');
  const res2 = await drive({ op: 'save', propertyId: 'p1', kind: 'consegna', reviewed: true, rooms: rooms() });
  check('landlord sul PROPRIO immobile: 200 (anche senza contratto)', res2.code === 200 && res2.body.ok === true);
  check('senza contratto il PDF vive sotto property-docs/', [...storageFiles.keys()].some(k => /^property-docs\/p1\/inventario-consegna/.test(k)));
}

// ═══ F. riconsegna: il confronto è il documento ═════════════════════════
{
  seed('admin', 'own1');
  await drive({ op: 'save', contractId: 'ctr1', kind: 'consegna', reviewed: true, rooms: rooms() });
  const uscita = [{ room: 'cucina', items: [
    { name: 'Lavastoviglie Bosch', qty: 1, condition: 'buono', source: 'human' },
    { name: 'Sedie', qty: 4, condition: 'buono', source: 'human' },
    { name: 'Lampadario', qty: 1, condition: 'danneggiato', source: 'human' },
  ] }, { room: 'soggiorno', items: [{ name: 'Divano 3 posti', qty: 1, condition: 'danneggiato', source: 'human' }] }];
  const res = await drive({ op: 'save', contractId: 'ctr1', kind: 'riconsegna', reviewed: true, rooms: uscita });
  const d = res.body.diff;
  check('riconsegna: 200 col confronto in risposta', res.code === 200 && !!d);
  check('riconsegna: 2 sedie mancano', d.missing.some(x => x.name === 'Sedie' && x.qty === 2));
  check('riconsegna: il divano era GIÀ danneggiato alla consegna → non è un danno nuovo', !d.damaged.some(x => x.name === 'Divano 3 posti'));
  check('riconsegna: il lampadario senza condizione di partenza NON diventa un danno', !d.damaged.some(x => x.name === 'Lampadario') && d.unverifiable.some(x => x.name === 'Lampadario'));
  const c = store.get('contracts/ctr1');
  check('riconsegna: scritta a parte, la consegna resta intatta', !!c.inventarioUscita && c.inventario.counts.pieces === 9);
  check('riconsegna: il confronto è persistito sul contratto', !!(c.inventarioUscita.diff && c.inventarioUscita.diff.missing.length));
  check('riconsegna: il PDF esiste davvero', [...storageFiles.keys()].some(k => /inventario-riconsegna/.test(k)));
}

// ═══ G. il verbale smette di dire "arredi pattuiti" ═════════════════════
{
  const { buildVerbalePdf } = await import('../../api/contracts/verbale.js');
  const contract = { type: 'transitorio', tenantName: 'Julie', landlordName: 'Stefano', startDate: '2026-09-01', endDate: '2027-08-31' };
  const property = { address: 'Via Lucrino 41' };
  const when = { d: '01/09/2026', t: '10:30', iso: new Date().toISOString() };
  const args = { contract, property, keys: [{ label: 'Portone', qty: 2 }], meters: {}, condition: 'buono', notes: '', firme: [], photos: [], when };
  const senza = await buildVerbalePdf(args);
  const inv = E.normalizeProposal(rooms(), { source: 'human' });
  const con = await buildVerbalePdf({ ...args, inventario: { at: '2026-09-01T08:00:00Z', url: 'https://x/inv.pdf', rooms: inv.rooms } });
  check('verbale: entrambi i PDF si generano', senza.slice(0, 4).toString() === '%PDF' && con.slice(0, 4).toString() === '%PDF');
  check('verbale: con l\'inventario il documento porta più contenuto', con.length > senza.length + 400);

  const src = await (await import('node:fs/promises')).readFile(new URL('../../api/contracts/verbale.js', import.meta.url), 'utf8');
  check('verbale: il handler passa l\'inventario (contratto prima, immobile poi)', /inventario:\s*contract\.inventario\s*\|\|\s*property\.inventario/.test(src));
  check('verbale: la frase generica sopravvive SOLO senza inventario', /else\s*{\s*\n\s*paraDraw\(`Le parti danno atto[^`]*completa degli arredi e delle dotazioni pattuite/.test(src));
}

// ═══ H. La rifinitura: marchio, tipografia, piede ══════════════════════
// Il documento esce dalle mani dell'operatore e finisce dal proprietario,
// dal CAF, in una causa sul deposito. Che porti il MARCHIO e non una
// scritta, e che il piede legale ci sia su ogni pagina, non è decorazione:
// è la differenza tra un documento e un foglio.
{
  const { wa, MARK_PNG_B64 } = await import('../../api/_pdfbrand.js');
  check('wa: gli emoji fuori (StandardFonts non li conosce e FA FALLIRE il PDF)', wa('Chiavi 🔑 ok') === 'Chiavi  ok');
  check('wa: le frecce diventano ->, le spunte X', wa('a → b ✓') === 'a -> b X');
  check('wa: accenti e apostrofo tipografico RESTANO (sono WinAnsi)', wa('l\u2019unità è così') === 'l\u2019unità è così');
  check('wa: em-dash, ellissi ed euro restano', wa('Roma — 1.400 € …') === 'Roma — 1.400 € …');
  check('il marchio incorporato è un PNG vero', Buffer.from(MARK_PNG_B64, 'base64').slice(1, 4).toString() === 'PNG');

  const { PDFDocument, PDFName } = await import('pdf-lib');
  seed('admin', 'own1');
  const many = [];
  for (let i = 0; i < 9; i++) many.push({ room: 'camera ' + (i % 8 + 2), items: Array.from({ length: 8 }, (_, j) => ({ name: `Oggetto ${i}-${j}`, qty: 1, condition: 'buono', source: 'human' })) });
  await drive({ op: 'save', contractId: 'ctr1', kind: 'consegna', reviewed: true, rooms: many, shots: [{ base64: JPG1, label: 'Secondo 3' }] });
  const bytes = storageFiles.get([...storageFiles.keys()].find(k => /inventario-consegna/.test(k)));
  const doc = await PDFDocument.load(bytes);
  check('un inventario lungo impagina su più fogli', doc.getPageCount() > 1);

  let images = 0; const fonts = [];
  doc.context.enumerateIndirectObjects().forEach(([, obj]) => {
    const str = obj && obj.dict ? String(obj.dict.toString ? obj.dict.toString() : '') : '';
    if (/\/Subtype\s*\/Image/.test(str)) images++;
    const bf = obj && obj.get && obj.get(PDFName.of('BaseFont'));
    if (bf) fonts.push(String(bf));
  });
  check('e il font è quello del brand (Helvetica, come il sito), in tondo e in nero', fonts.includes('/Helvetica') && fonts.includes('/Helvetica-Bold'));
}

// ═══ I. L'email: quadro, non elenco spuntato ═══════════════════════════
{
  seed('admin', 'own1');
  await drive({ op: 'save', contractId: 'ctr1', kind: 'consegna', reviewed: true, rooms: rooms() });
  const m1 = mails().find(m => m.to === 'valentino@boom-rome.com');
  check('email consegna: il PDF viaggia in allegato, col nome datato', !!m1 && /^BOOM_Inventario_consegna_\d{4}-\d{2}-\d{2}\.pdf$/.test(m1.attachments[0].filename));
  check('email consegna: in testa il numero che conta', /9 pezzi/.test(m1.html) && /INVENTARIO/i.test(m1.html));
  check('email consegna: dice che il verbale ora stampa l\u2019elenco', /verbale di consegna<\/strong> stampa questo elenco/.test(m1.html));

  seed('admin', 'own1');
  await drive({ op: 'save', contractId: 'ctr1', kind: 'consegna', reviewed: true, rooms: rooms() });
  globalThis.__mails = [];
  // il Lampadario torna DANNEGGIATO ma alla consegna nessuno ne aveva
  // dichiarato la condizione: è il caso che l'email deve spiegare
  await drive({ op: 'save', contractId: 'ctr1', kind: 'riconsegna', reviewed: true, rooms: [{ room: 'cucina', items: [
    { name: 'Lavastoviglie Bosch', qty: 1, condition: 'buono', source: 'human' },
    { name: 'Lampadario', qty: 1, condition: 'danneggiato', source: 'human' },
  ] }] });
  const m2 = mails().find(m => m.to === 'valentino@boom-rome.com');
  check('email riconsegna: parla di SALDO DEL DEPOSITO, non del verbale', /saldo del deposito/.test(m2.html) && !/stampa questo elenco/.test(m2.html));
  check('email riconsegna: il confronto è un quadro coi numeri', /MANCANTI|Mancanti/.test(m2.html) && /Danni nuovi/.test(m2.html));
  check('email riconsegna: nessuna spunta verde accanto a una perdita', !/✓[^<]*mancant/i.test(m2.html));
  check('email riconsegna: la voce non verificabile è spiegata, non nascosta', /non verificabil/.test(m2.html));
}

// ═══ Esito ══════════════════════════════════════════════════════════════
console.log(`\nInventario: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLITI: ' + bad.join(' | ')); process.exit(1); }
