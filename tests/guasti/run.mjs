// tests/guasti/run.mjs — i tre guasti letti nei log di Vercel il 4/10/2026,
// e le guardie che impediscono loro di tornare.
//
// 1. IL COMMERCIALE FERMO: `ReferenceError: pickChannel is not defined`, 49
//    giri su 49 nella finestra dei log. pickChannel era dichiarata DENTRO
//    run() e chiamata da due funzioni esterne; le prime risposte cadevano
//    nel `.catch` (contate come «errore AI», mai dette), il primo follow-up
//    faceva cadere il giro intero. Nessun test eseguiva quel percorso: qui
//    il giro VERO, prima risposta e follow-up, su Firestore in memoria.
// 2. ✍️ FIRMO IO SENZA REGOLA: il server entra in Firestore come UTENTE
//    admin, quindi le regole valgono anche per lui; `operatorSignatures` non
//    ne aveva → 403 al primo salvataggio (1/10, tre tentativi). La guardia di
//    CLASSE: ogni collection usata da `api/` deve avere il suo `match` in
//    firestore.rules (la sesta volta: propertyLocks, signTokens, portalPubs,
//    rendiconti, viewings, operatorSignatures).
// 3. LA RAFFICA DI LOGIN: a token scaduto ogni lettura parallela faceva il
//    PROPRIO signInWithPassword (~190 in scan-replies) → QUOTA_EXCEEDED
//    sull'intero progetto. Qui: 50 letture concorrenti = UN login, un login
//    fallito non resta in memoria, e reminder-cron / stripe-webhook usano
//    il login condiviso.
// Uso: node tests/guasti/run.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.CRON_SECRET = 'cron-guasti';
process.env.ANTHROPIC_API_KEY = 'test-key-guasti';
process.env.TELEGRAM_BOT_TOKEN = 'tg';
process.env.TELEGRAM_CHAT_ID = '1';

let passed = 0, failed = 0;
const bad = [];
const check = (name, cond) => { cond ? passed++ : (failed++, bad.push(name)); console.log((cond ? 'PASS ' : 'FAIL ') + name); };
const ROOT = new URL('../../', import.meta.url);
const src = (p) => readFileSync(new URL(p, ROOT), 'utf8');

// ── Firestore in memoria + conteggio dei login ──────────────────────────
const store = new Map();
let signIns = 0, signInFail = 0, signInDelay = 0;
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
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = fromFs(x); return o; }
  return null;
}
const fromFsFields = (f) => { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = fromFs(v); return o; };
let aiCalls = 0;

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('identitytoolkit') && url.includes('signInWithPassword')) {
    signIns++;
    if (signInDelay) await new Promise(r => setTimeout(r, signInDelay));
    if (signInFail > 0) { signInFail--; return okJson({ error: { code: 400, message: 'QUOTA_EXCEEDED : Exceeded quota for verifying passwords.' } }); }
    return okJson({ idToken: 'tok-' + signIns, localId: 'svc' });
  }
  if (url.startsWith('https://api.telegram.org/')) return okJson({ ok: true, result: {} });
  if (url.startsWith('https://api.anthropic.com/')) {
    aiCalls++;
    return okJson({ content: [{ type: 'text', text: JSON.stringify({ subject: 'Your enquiry', body: 'Hi Anna, the flat is still available — want a video tour?' }) }], model: 'claude-opus-4-8', usage: { input_tokens: 300, output_tokens: 60 }, stop_reason: 'end_turn' });
  }
  if (url.includes('firestore.googleapis.com')) {
    const path = url.slice(url.indexOf('/documents') + 10).replace(/^\//, '').split('?')[0];
    const qs = new URL(url).searchParams;
    if (path.startsWith(':commit')) return okJson({ writeResults: [] });
    if (path.startsWith(':runQuery')) {
      const sq = (JSON.parse(opts.body || '{}') || {}).structuredQuery || {};
      const col = ((sq.from || [])[0] || {}).collectionId || '';
      const ff = (sq.where || {}).fieldFilter;
      const rows = [];
      for (const [k] of store) {
        if (!k.startsWith(col + '/') || k.slice(col.length + 1).includes('/')) continue;
        if (ff && (store.get(k) || {})[ff.field.fieldPath] !== fromFs(ff.value)) continue;
        rows.push({ document: { name: 'projects/p/databases/(default)/documents/' + k, fields: toFsFields(store.get(k)), updateTime: '2026-01-01T00:00:00Z' } });
        if (sq.limit && rows.length >= sq.limit) break;
      }
      return okJson(rows.length ? rows : [{}]);
    }
    if (opts.method === 'POST') {
      const docId = qs.get('documentId') || 'auto_' + (store.size + 1);
      const key = path + '/' + docId;
      if (qs.get('documentId') && store.has(key)) return new Response('conflict', { status: 409 });
      store.set(key, fromFsFields(JSON.parse(opts.body).fields));
      return okJson({ name: 'projects/p/databases/(default)/documents/' + key });
    }
    if (opts.method === 'PATCH') {
      const cur = store.get(path) || {};
      Object.assign(cur, fromFsFields(JSON.parse(opts.body).fields));
      store.set(path, cur);
      return okJson({ name: 'projects/p/databases/(default)/documents/' + path });
    }
    const doc = store.get(path);
    if (!doc) return new Response('not found', { status: 404 });
    return okJson({ name: 'projects/p/databases/(default)/documents/' + path, fields: toFsFields(doc), updateTime: '2026-01-01T00:00:00Z' });
  }
  throw new Error('fetch non stubbata: ' + url);
};

// ═══ 1. UN SOLO LOGIN IN VOLO ═══════════════════════════════════════════
{
  // istanza fresca del modulo (cache vuota): l'URL con la query è un altro modulo
  const L = await import('../../api/homie/_lib.js?guasti=1');
  store.set('leads/x', { name: 'x' });
  signIns = 0; signInDelay = 25;
  const reads = await Promise.all(Array.from({ length: 50 }, () => L.fsGet('leads/x')));
  check('login: 50 letture parallele a cache vuota = UN solo signInWithPassword (prima: 50)',
    signIns === 1 && reads.every(r => r && r.name === 'x'));
  await L.fsGet('leads/x');
  check('login: col token in cache la lettura dopo non rifà il login', signIns === 1);

  const L2 = await import('../../api/homie/_lib.js?guasti=2');
  signIns = 0; signInFail = 1;
  const r1 = await Promise.allSettled(Array.from({ length: 20 }, () => L2.getAdminToken()));
  check('login: un login che fallisce (QUOTA_EXCEEDED) è condiviso dai 20 in attesa — una sola chiamata, venti rifiuti',
    signIns === 1 && r1.every(x => x.status === 'rejected' && /QUOTA_EXCEEDED/.test(String(x.reason && x.reason.message))));
  const t2 = await L2.getAdminToken();
  check('login: il fallimento NON resta in memoria — la chiamata dopo riprova e ottiene il token',
    signIns === 2 && /^tok-/.test(t2));
  signInDelay = 0;

  // le copie che firmavano per conto proprio ora passano dal login condiviso
  const rc = src('api/reminder-cron.js'), sw = src('api/stripe-webhook.js');
  const rcFn = rc.slice(rc.indexOf('async function getFirebaseToken()'), rc.indexOf('async function getFirebaseToken()') + 400);
  const swFn = sw.slice(sw.indexOf('async function firebaseIdToken()'), sw.indexOf('async function firebaseIdToken()') + 200);
  check('login: reminder-cron usa il login condiviso (niente signInWithPassword proprio)',
    /getAdminToken\(\)/.test(rcFn) && !/signInWithPassword/.test(rc));
  check('login: stripe-webhook usa il login condiviso (prima: un login per OGNI lettura/scrittura dell\'evento)',
    /getAdminToken\(\)/.test(swFn) && !/signInWithPassword/.test(sw));
  // Il resto delle copie sono le pagine pubbliche che firmano SOLO su 403
  // (catalogo leggibile da anonimi): un file nuovo col suo login fa cadere il test.
  const walk = (d) => readdirSync(d).flatMap(f => { const p = join(d, f); if (f === 'node_modules') return []; return statSync(p).isDirectory() ? walk(p) : (p.endsWith('.js') ? [p] : []); });
  const apiDir = new URL('api', ROOT).pathname;
  const ownLogin = walk(apiDir).filter(p => /signInWithPassword/.test(readFileSync(p, 'latin1')))
    .map(p => p.slice(apiDir.length - 3)).sort();
  const PUBLIC_403_FALLBACK = ['api/ask-listing.js', 'api/listing.js', 'api/listings.js', 'api/llms-listings.js', 'api/sitemap-listings.js'];
  check('login: fuori da homie/_lib solo le pagine pubbliche col ripiego su 403 hanno un login proprio (' + ownLogin.join(', ') + ')',
    JSON.stringify(ownLogin) === JSON.stringify(['api/homie/_lib.js', ...PUBLIC_403_FALLBACK].sort()));
}

// ═══ 2. OGNI COLLECTION DEL SERVER HA LA SUA REGOLA ═════════════════════
{
  const walk = (d) => readdirSync(d).flatMap(f => { const p = join(d, f); if (f === 'node_modules') return []; return statSync(p).isDirectory() ? walk(p) : (p.endsWith('.js') ? [p] : []); });
  const apiDir = new URL('api', ROOT).pathname;
  const used = new Map();
  const add = (n, f) => { if (!used.has(n)) used.set(n, new Set()); used.get(n).add(f.slice(apiDir.length - 3)); };
  for (const f of walk(apiDir)) {
    const s = readFileSync(f, 'latin1');
    // fsGet('coll/…') · fsCreate('coll', …) · collectionId: 'coll' · 'coll/' + id · `coll/${id}`
    for (const m of s.matchAll(/\bfs[A-Z]\w*\(\s*['"`]([a-z][A-Za-z0-9]*)(?:[/'"`])/g)) add(m[1], f);
    for (const m of s.matchAll(/collectionId:\s*['"`]([a-z][A-Za-z0-9]*)['"`]/g)) add(m[1], f);
    for (const m of s.matchAll(/['"`]([a-z][A-Za-z0-9]*)\/['"`]\s*\+/g)) add(m[1], f);
    for (const m of s.matchAll(/`([a-z][A-Za-z0-9]*)\/\$\{/g)) add(m[1], f);
    // la collection dichiarata in una costante (TOKEN_COLLECTION, COLL, QUEUE…)
    for (const m of s.matchAll(/const [A-Z_]*(?:COLL|COLLECTION|QUEUE)[A-Z_]* = ['"`]([a-z][A-Za-z0-9]*)['"`]/g)) add(m[1], f);
  }
  const ruledIn = (rulesText) => new Set([...rulesText.matchAll(/match \/([A-Za-z0-9]+)\//g)].map(m => m[1]));
  const storage = new Set([...src('storage.rules').matchAll(/match \/([A-Za-z0-9_-]+)\//g)].map(m => m[1]));
  const uncovered = (rulesText) => {
    const ruled = ruledIn(rulesText);
    return [...used.keys()].filter(n => !ruled.has(n) && !storage.has(n)).sort();
  };
  const rules = src('firestore.rules');
  check('regole: lo scandaglio trova davvero le collection del server (> 40, anche quelle dichiarate in una costante)',
    used.size > 40 && ['operatorSignatures', 'signTokens', 'propertyLocks', 'operatorTasks', 'scrivanoProposals'].every(n => used.has(n)));
  const miss = uncovered(rules);
  check('regole: OGNI collection usata da api/ ha il suo match in firestore.rules' + (miss.length ? ' — mancano: ' + miss.map(n => n + ' (' + [...used.get(n)].join(', ') + ')').join('; ') : ''),
    miss.length === 0);
  // mutazione: le regole di main (senza operatorSignatures) devono essere prese
  const mutated = rules.replace(/\n\s*match \/operatorSignatures\/\{x\}[^\n]*\n/, '\n');
  check('regole (mutazione): togliendo la riga di operatorSignatures la guardia la nomina',
    mutated !== rules && JSON.stringify(uncovered(mutated)) === JSON.stringify(['operatorSignatures']));
  check('regole: operatorSignatures è admin-only (lettura e scrittura), mai pubblica',
    /match \/operatorSignatures\/\{x\}\s*\{\s*allow read, write: if isAdmin\(\);\s*\}/.test(rules));
}

// ═══ 3. IL COMMERCIALE, IL GIRO VERO ════════════════════════════════════
{
  const H = 3600_000;
  const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
  store.clear();
  store.set('settings/squadra', {});
  // lead nuovo da un'ora (fuori dalla finestra umana di 20'), arrivato dal sito
  store.set('leads/L1', { name: 'Anna Expat', email: 'anna@expat.com', status: 'new', source: 'web', message: 'Hi, is the flat in Prati still available? I move in October.', createdAt: iso(1 * H) });
  // lead caldo fermo da 3 giorni, scritto su WhatsApp, prima risposta GIÀ proposta
  store.set('leads/L2', { name: 'Marco Rossi', phone: '+393331234567', status: 'new', source: 'whatsapp', grade: 'A', message: 'Ciao, cerco un bilocale a Trastevere', createdAt: iso(72 * H) });
  store.set('action_queue/a_first_L2', { contextHash: 'commerciale:first:L2', status: 'pending', proposedBy: 'commerciale' });

  const { default: commerciale, pickChannel } = await import('../../api/employees/commerciale.js');
  const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } };
  aiCalls = 0;
  await commerciale({ method: 'POST', headers: { authorization: 'Bearer cron-guasti' }, query: {}, body: {} }, res);
  const actions = [...store.entries()].filter(([k]) => k.startsWith('action_queue/')).map(([k, v]) => ({ id: k, ...v }));
  const first = actions.find(a => a.contextHash === 'commerciale:first:L1');
  const fu = actions.find(a => a.contextHash === 'commerciale:followup:L2');
  check('commerciale: il giro termina (200), senza errori AI nascosti — prima il 100% dei giri cadeva',
    res.code === 200 && res.body && res.body.ok === true && res.body.counts.aiErrors === 0);
  check('commerciale: la prima risposta al lead nuovo nasce (bozza del modello, canale email)',
    aiCalls === 1 && !!first && first.payload.channel === 'email' && first.payload.to === 'anna@expat.com' && /video tour/.test(first.payload.draft));
  check('commerciale: il follow-up al lead caldo fermo da 48h+ nasce sul canale da cui ha scritto (WhatsApp)',
    !!fu && fu.payload.channel === 'whatsapp' && fu.payload.phone === '+393331234567' && /Stai ancora cercando casa a Roma\?/.test(fu.payload.subject));
  check('commerciale: i conteggi dicono quello che è successo (1 prima risposta, 1 follow-up, 1 già proposta)',
    res.body.counts.firstReplies === 1 && res.body.counts.followups === 1 && res.body.counts.dedupSkipped === 1);
  check('commerciale: il battito di salute registra un giro RIUSCITO',
    (store.get('teamHealth/commerciale') || {}).ok === true || (store.get('teamHealth/commerciale') || {}).status === 'ok' || (store.get('teamHealth/commerciale') || {}).consecutiveErrors === 0);
  check('commerciale: pickChannel — WhatsApp a chi ha scritto su WhatsApp, email altrimenti, mai un canale irraggiungibile',
    pickChannel({ source: 'whatsapp', phone: '+39', email: 'a@b' }) === 'whatsapp'
    && pickChannel({ source: 'web', phone: '+39', email: 'a@b' }) === 'email'
    && pickChannel({ source: 'whatsapp', email: 'a@b' }) === 'email'
    && pickChannel({ source: 'web', phone: '+39' }) === 'whatsapp');
  // Le funzioni a cui il giro si appoggia stanno al livello del modulo, non
  // dentro un'altra funzione (il difetto era un merge che le aveva annidate).
  const com = src('api/employees/commerciale.js');
  const topLevel = (name) => new RegExp('^(?:export )?(?:async )?function ' + name + '\\(', 'm').test(com);
  check('commerciale: pickChannel, propertyContext e alternatives sono funzioni del modulo, non annidate',
    topLevel('pickChannel') && topLevel('propertyContext') && topLevel('alternatives')
    && !/^\s+(?:async )?function (pickChannel|propertyContext|alternatives)\(/m.test(com));
}

console.log('\n────────────────────────────────────────────────');
console.log(`Guasti: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLITI:\n - ' + bad.join('\n - ')); process.exit(1); }
console.log('Il Commerciale lavora, ✍️ Firmo io salva la firma, un login solo per raffica.');
