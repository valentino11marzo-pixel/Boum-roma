// tests/marketing/run.mjs — IL CREATIVO: genera da solo, pubblica MAI da solo.
//
// Il primo dipendente del reparto Marketing spende crediti veri (Higgsfield)
// e produce materiale che finisce davanti ai clienti. I due modi in cui può
// costare caro, entrambi testati per mutazione:
//   · pubblicare da solo → la vetrina cambia senza un tap dell'operatore
//     (la riga rossa n.1 dello studio): qui si pretende che il handler non
//     scriva MAI su `listings`, né in codice né a runtime
//   · spendere senza freni → tetto settimanale contato su Firestore, un
//     fallimento non si ritenta da solo, un rerun non sottomette due volte
//     (l'id È l'impronta delle foto)
//
// Si guida il handler VERO su un Firestore in memoria (si intercetta fetch,
// l'unica porta di homie/_lib) con Higgsfield e Telegram finti.
//
// Esegui: node tests/marketing/run.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ME from '../../js/marketing-engine.js';
import * as HF from '../../api/marketing/_higgsfield.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

let fails = 0;
const ok = (name, cond, detail) => {
  console.log(cond ? `PASS ${name}` : `FAIL ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!cond) fails++;
};

const L = (over = {}) => ({
  id: 'lA', name: 'Trilocale Pigneto', status: 'available', zone: 'Pigneto',
  type: 'Trilocale', price: 1400,
  image: 'https://x.test/a1.jpg',
  images: ['https://x.test/a1.jpg', 'https://x.test/a2.jpg', 'https://x.test/a3.jpg', 'https://x.test/a4.jpg'],
  ...over,
});

// ── 1. il motore: chi ha bisogno di un reel, e chi NO (col perché) ────────
{
  ok('un disponibile senza video con galleria vera è eleggibile', ME.needsCreative(L(), {}).ok === true);

  const rented = ME.needsCreative(L({ status: 'rented' }), {});
  ok('un affittato non è materiale marketing', rented.ok === false && /non disponibile/.test(rented.why), rented);

  const hasVideo = ME.needsCreative(L({ videoUrl: 'https://v.test/x.mp4' }), {});
  ok('chi ha già un video tour non ne riceve un altro', hasVideo.ok === false && /già un video/.test(hasVideo.why));
  ok('anche uno youtubeUrl conta come video', ME.needsCreative(L({ youtubeUrl: 'https://youtu.be/x' }), {}).ok === false);

  const poor = ME.needsCreative(L({ image: 'https://x.test/a1.jpg', images: [] }), {});
  ok('galleria povera → prima tocca al Fotografo', poor.ok === false && /Fotografo/.test(poor.why), poor);

  const dataUri = ME.needsCreative(L({ image: 'data:image/jpeg;base64,xxx', images: ['data:1', 'data:2', 'data:3'] }), {});
  ok('i data: URI non sono foto di marketing', dataUri.ok === false);

  ok('ogni esclusione DICE perché — mai un no muto',
    [rented, hasVideo, poor].every(v => v.why && v.why.length > 5));

  const id = ME.creativeId(L());
  const prev = {}; prev[id] = { id, status: 'submitted' };
  ok('già in lavorazione → non si ricandida', ME.needsCreative(L(), prev).ok === false);
  prev[id] = { id, status: 'ready' };
  ok('reel pronto in attesa di pubblicazione → non se ne genera un secondo', ME.needsCreative(L(), prev).ok === false);
  prev[id] = { id, status: 'failed' };
  const failed = ME.needsCreative(L(), prev);
  ok('un fallimento NON si ritenta da solo (crediti)', failed.ok === false && /cambiano le foto/.test(failed.why), failed);
}

// ── 2. l'id È l'impronta delle foto ───────────────────────────────────────
{
  ok('stesse foto → stesso id (un rerun non sottomette due volte)', ME.creativeId(L()) === ME.creativeId(L()));
  const changed = ME.creativeId(L({ images: [...L().images, 'https://x.test/a5.jpg'] }));
  ok('foto nuove → id nuovo → l\'annuncio si ricandida da solo', changed !== ME.creativeId(L()));
  ok('l\'id è un doc id Firestore valido', /^crea_[\w-]+_[a-z0-9]+$/.test(ME.creativeId(L())), ME.creativeId(L()));
}

// ── 3. la worklist: ordine, tetti, settimana ISO ──────────────────────────
{
  const rich = L({ id: 'rich', images: Array.from({ length: 9 }, (_, i) => `https://x.test/r${i}.jpg`) });
  const mid = L({ id: 'mid' });
  const now = new Date('2026-08-28T10:00:00Z');

  const w = ME.pickWork([mid, rich], [], { maxPerRun: 1, weeklyCap: 5 }, now);
  ok('gallerie ricche prima (la lezione sweepOrder)', w.todo.length === 1 && w.todo[0].id === 'rich', w.todo);
  ok('gli esclusi dal giro restano eleggibili, non spariti', w.eligible === 2);

  const w2 = ME.pickWork([mid, rich], [], { maxPerRun: 5, weeklyCap: 5 }, now);
  ok('maxPerRun alza il giro', w2.todo.length === 2);

  const spentThisWeek = Array.from({ length: 5 }, (_, i) => ({ id: 'c' + i, status: i === 0 ? 'failed' : 'ready', createdAt: '2026-08-26T10:00:00Z' }));
  const capped = ME.pickWork([mid, rich], spentThisWeek, { maxPerRun: 5, weeklyCap: 5 }, now);
  ok('il tetto settimanale ferma la spesa — e i FALLITI contano (la spesa c\'è stata)',
    capped.todo.length === 0 && capped.budgetLeft === 0, capped);

  const lastWeek = spentThisWeek.map(c => ({ ...c, createdAt: '2026-08-18T10:00:00Z' }));
  const fresh = ME.pickWork([mid, rich], lastWeek, { maxPerRun: 5, weeklyCap: 5 }, now);
  ok('la settimana scorsa non conta: il tetto è settimanale', fresh.todo.length === 2, fresh.weeklyCount);

  ok('weekOf è una settimana ISO', ME.weekOf(new Date('2026-08-28')) === '2026-W35', ME.weekOf(new Date('2026-08-28')));
}

// ── 4. il brief: solo fatti veri, MAI il prezzo nei pixel ─────────────────
{
  const b = ME.buildBrief(L());
  ok('la copertina è la prima foto (l\'ordine del Fotografo)', b.imageUrl === 'https://x.test/a1.jpg');
  ok('la zona vera entra nel brief', b.prompt.includes('Pigneto'));
  ok('IL PREZZO NON ENTRA MAI NEI PIXEL', !b.prompt.includes('1400') && !b.prompt.includes('€'), b.prompt);
  ok('niente testo cotto nel video', /no text/.test(b.prompt));

  const bare = ME.buildBrief({ id: 'x', status: 'available', image: 'https://x.test/1.jpg', images: [] });
  ok('un campo assente non diventa "undefined" nel prompt', !/undefined|null/.test(bare.prompt), bare.prompt);
  ok('senza zona resta Roma, non si inventa un quartiere', bare.prompt.includes('Rome'));
}

// ── 5. la card Telegram: il binario di pubblicazione esistente ────────────
{
  const msg = ME.readyMessage(L(), 'https://storage.test/v.mp4');
  ok('la card porta il comando /video del bot (l\'approvazione È quel binario)',
    msg.includes('/video lA https://storage.test/v.mp4'), msg);
  ok('la card dice che la vetrina non è toccata', /non lo pubblichi tu/.test(msg));
  const evil = ME.readyMessage(L({ name: 'Casa <b>&figa' }), 'u');
  ok('il nome è HTML-escapato (la lezione delle card)', evil.includes('&lt;b&gt;&amp;'), evil);
}

// ── 6. il client: auth, body, verdetto del job set ────────────────────────
{
  delete process.env.HIGGSFIELD_API_KEY;
  delete process.env.HIGGSFIELD_API_SECRET;
  ok('senza chiavi configured() lo DICE', HF.configured() === false);

  process.env.HIGGSFIELD_API_KEY = 'kid';
  process.env.HIGGSFIELD_API_SECRET = 'ksec';
  ok('auth ufficiale: Key <id>:<secret>, mai Bearer', HF.authHeader() === 'Key kid:ksec');

  const body = HF.submitBody({ imageUrl: 'https://x.test/a.jpg', prompt: 'p', model: 'dop-lite' });
  ok('il body porta la foto come image_url', body.params.input_images[0].image_url === 'https://x.test/a.jpg');
  ok('il modello è per-request', body.params.model === 'dop-lite');

  ok('job in coda → pending', HF.jobSetStatus({ jobs: [{ status: 'queued' }] }).status === 'pending');
  ok('job set vuoto → pending, mai "finito"', HF.jobSetStatus({ jobs: [] }).status === 'pending');
  const done = HF.jobSetStatus({ jobs: [{ status: 'completed', results: { raw: { url: 'https://hf.test/v.mp4' } } }] });
  ok('completed porta l\'URL', done.status === 'completed' && done.videoUrl === 'https://hf.test/v.mp4');
  const noUrl = HF.jobSetStatus({ jobs: [{ status: 'completed', results: {} }] });
  ok('"completed senza file" è un guasto, non un successo', noUrl.status === 'failed', noUrl);
  const nsfw = HF.jobSetStatus({ jobs: [{ status: 'completed' }, { status: 'nsfw' }] });
  ok('nsfw rende il set fallito, col motivo detto', nsfw.status === 'failed' && /nsfw/.test(nsfw.reason));
}

// ── 7. le giunzioni, asserite sulla sorgente ──────────────────────────────
{
  const src = readFileSync(join(root, 'api/marketing/creativo.js'), 'utf8');
  ok('LA RIGA ROSSA: il Creativo non scrive MAI su listings (né patch né create)',
    !/fsPatch\(\s*['"`]listings\//.test(src) && !/fsCreate\(\s*['"`]listings['"`/]/.test(src));
  ok('le manopole dichiarate sono lette davvero', src.includes('k.maxPerRun') && src.includes('k.weeklyCap'));

  const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  ok('il cron esiste in vercel.json', vercel.crons.some(c => c.path === '/api/marketing/creativo'));
  ok('la funzione ha il maxDuration per il download video', vercel.functions['api/marketing/creativo.js']?.maxDuration === 60);

  const rules = readFileSync(join(root, 'firestore.rules'), 'utf8');
  ok('marketingCreatives è admin-only nelle rules (la lezione propertyLocks)',
    /match \/marketingCreatives\/\{x\}\s*\{ allow read, write: if isAdmin\(\); \}/.test(rules));

  const reg = readFileSync(join(root, 'js/squadra-registry.js'), 'utf8');
  ok('il Creativo è nell\'organigramma col suo cron', reg.includes("'/api/marketing/creativo'"));
}

// ── 8. il handler VERO su un Firestore in memoria ─────────────────────────
const DB = new Map();
const TG = [];
const HF_CALLS = { submits: 0, polls: 0 };
const STORAGE = new Map();
let jobSetState = { jobs: [{ status: 'queued' }] };

const enc = v => {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
  return { stringValue: String(v) };
};
const dec = f => {
  if (!f) return null;
  if ('nullValue' in f) return null;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('timestampValue' in f) return f.timestampValue;
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(dec);
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  return null;
};
const toDoc = (path, data) => ({ name: `projects/p/databases/(default)/documents/${path}`, fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) });

let autoId = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o), arrayBuffer: async () => new ArrayBuffer(8) });

  if (u.includes('identitytoolkit')) return json({ idToken: 'fake', localId: 'admin', users: [{ localId: 'admin' }] });

  if (u.includes('api.telegram.org')) {
    TG.push(JSON.parse(opts.body).text);
    return json({ ok: true });
  }

  if (u.includes('api.higgsfield.ai')) {
    if (u.includes('/v1/image2video')) { HF_CALLS.submits++; return json({ id: 'js_' + HF_CALLS.submits }); }
    if (u.includes('/v1/job-sets/')) { HF_CALLS.polls++; return json(jobSetState); }
    return json({ error: 'unknown' }, 404);
  }

  if (u.includes('firebasestorage.googleapis.com')) {
    const name = decodeURIComponent(u.match(/name=([^&]+)/)[1]);
    STORAGE.set(name, opts.body);
    return json({ name });
  }

  if (u.includes('hf-result.test')) {
    // il video "generato" da scaricare
    return { ok: true, status: 200, arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer, text: async () => '' };
  }

  const body = opts.body ? JSON.parse(opts.body) : null;
  const m = u.match(/documents\/([^?:]+)/);
  const path = m ? decodeURIComponent(m[1]) : '';

  if (u.includes(':runQuery')) {
    const q = body.structuredQuery;
    const coll = q.from[0].collectionId;
    const filter = q.where && q.where.fieldFilter;
    const rows = [...DB.entries()]
      .filter(([k]) => k.startsWith(coll + '/'))
      .filter(([, v]) => !filter || String(v[filter.field.fieldPath]) === String(dec(filter.value)));
    return json(rows.map(([k, v]) => ({ document: toDoc(k, v) })));
  }
  if (opts.method === 'PATCH') {
    const prev = DB.get(path) || {};
    const next = { ...prev, ...Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])) };
    DB.set(path, next);
    return json(toDoc(path, next));
  }
  if (opts.method === 'POST') {
    const qid = u.match(/documentId=([^&]+)/);
    const id = qid ? decodeURIComponent(qid[1]) : 'doc' + (++autoId);
    const key = `${path}/${id}`;
    if (qid && DB.has(key)) return json({ error: { status: 'ALREADY_EXISTS' } }, 409);
    DB.set(key, Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])));
    return json(toDoc(key, DB.get(key)));
  }
  if (opts.method === 'DELETE') { DB.delete(path); return json({}); }
  if (DB.has(path)) return json(toDoc(path, DB.get(path)));
  return json({ error: { status: 'NOT_FOUND' } }, 404);
};

process.env.CRON_SECRET = 'cs';
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.TELEGRAM_BOT_TOKEN = 'tt';
process.env.TELEGRAM_CHAT_ID = 'cc';

const { default: handler } = await import('../../api/marketing/creativo.js');

const call = async (auth = 'Bearer cs', query = {}) => {
  const req = { method: 'POST', url: '/api/marketing/creativo' + (query.dry ? '?dry=1' : ''), query, headers: auth ? { authorization: auth } : {} };
  let out = null, code = 0;
  const res = { setHeader() {}, status(c) { code = c; return this; }, json(o) { out = o; return this; }, end() { return this; } };
  await handler(req, res);
  return { code, ...(out || {}) };
};
const creatives = () => [...DB.entries()].filter(([k]) => k.startsWith('marketingCreatives/'));
const snapshot = () => JSON.stringify([...DB.entries()].sort());

// il catalogo: due candidati (rich > lA), un affittato, uno già con video
DB.set('listings/lA', L());
DB.set('listings/rich', L({ id: 'rich', name: 'Attico Prati', zone: 'Prati', images: Array.from({ length: 9 }, (_, i) => `https://x.test/r${i}.jpg`) }));
DB.set('listings/rented1', { id: 'rented1', status: 'rented', image: 'https://x.test/z.jpg', images: [] });
DB.set('listings/hasvid', L({ id: 'hasvid', videoUrl: 'https://v.test/x.mp4' }));

// 8a. senza auth: 401 e ZERO scritture
{
  const before = snapshot();
  const r = await call(null);
  ok('senza auth: 401', r.code === 401);
  ok('…e zero scritture', snapshot() === before);
}

// 8b. senza chiavi Higgsfield: non è un guasto, e lo dice UNA volta sola
{
  delete process.env.HIGGSFIELD_API_KEY;
  delete process.env.HIGGSFIELD_API_SECRET;
  const r = await call();
  ok('run ok anche senza chiavi', r.code === 200 && r.ok === true, r);
  ok('configured:false dichiarato', r.configured === false);
  ok('nessun creativo nasce senza chiavi', creatives().length === 0);
  ok('il battito è verde (scelta, non guasto)', (DB.get('teamHealth/creativo') || {}).ok === true);
  const said = TG.filter(t => t.includes('senza chiavi')).length;
  ok('lo dice su Telegram', said === 1, TG);
  await call();
  ok('…e UNA VOLTA SOLA (il secondo giro tace)', TG.filter(t => t.includes('senza chiavi')).length === 1);
}

// 8c. dry run con chiavi: calcola tutto, non scrive niente, non chiama nessuno
{
  process.env.HIGGSFIELD_API_KEY = 'kid';
  process.env.HIGGSFIELD_API_SECRET = 'ksec';
  const before = snapshot();
  const r = await call('Bearer cs', { dry: '1' });
  ok('dry: la worklist è visibile', r.todo.length === 1 && r.todo[0].id === 'rich', r.todo);
  // il 'rented' non arriva nemmeno al motore: la query del handler filtra
  // già status==available — qui si vede l'escluso che PASSA dalla query
  ok('dry: gli esclusi col motivo', r.skipped.some(s => s.id === 'hasvid') && r.skipped.every(s => s.why), r.skipped);
  ok('dry: zero scritture', snapshot() === before);
  ok('dry: zero chiamate Higgsfield', HF_CALLS.submits === 0 && HF_CALLS.polls === 0);
}

// 8d. il giro vero: sottomette il più ricco, idempotente per costruzione
{
  const r = await call();
  ok('sottomette UN reel (maxPerRun default 1) e il più ricco', r.submitted.length === 1 && r.submitted[0].listingId === 'rich', r.submitted);
  ok('una chiamata Higgsfield, non due', HF_CALLS.submits === 1);
  const [, doc] = creatives()[0];
  ok('il doc porta jobSetId e stato submitted', doc.status === 'submitted' && doc.jobSetId === 'js_1', doc);

  const r2 = await call();
  ok('il secondo giro NON risottomette rich (in lavorazione)', r2.submitted.every(s => s.listingId !== 'rich'), r2.submitted);
  ok('…ma sottomette il secondo candidato', r2.submitted.length === 1 && r2.submitted[0].listingId === 'lA');
  ok('il job in coda viene pollato, non dichiarato finito', HF_CALLS.polls >= 1 && creatives().every(([, c]) => c.status === 'submitted'));
}

// 8e. il reel pronto: Storage nostro, card col comando, vetrina INTATTA
{
  jobSetState = { jobs: [{ status: 'completed', results: { raw: { url: 'https://hf-result.test/v.mp4' } } }] };
  const r = await call();
  ok('i reel completati vengono consegnati', r.ready.length >= 1, r);
  const readyDocs = creatives().filter(([, c]) => c.status === 'ready');
  ok('i doc passano a ready con l\'URL parcheggiato', readyDocs.length === 2, creatives().map(([, c]) => c.status));
  ok('il file sta su Storage NOSTRO, nel path del Media Studio',
    [...STORAGE.keys()].every(p => /^listings\/enhanced\/(rich|lA)\/video\/boom-reel-crea_/.test(p)), [...STORAGE.keys()]);
  const card = TG.find(t => t.includes('/video rich '));
  ok('la card Telegram porta il comando di pubblicazione', !!card, TG);
  ok('LA RIGA ROSSA A RUNTIME: listings è INTATTO — nessun videoUrl scritto',
    !DB.get('listings/rich').videoUrl && !DB.get('listings/lA').videoUrl);
}

// 8f. un fallimento (nsfw) non si ritenta da solo
{
  DB.set('listings/lB', L({ id: 'lB', name: 'Bilocale Monti', zone: 'Monti' }));
  jobSetState = { jobs: [{ status: 'nsfw' }] };
  await call();                       // sottomette lB
  const r = await call();             // polla lB → nsfw → failed
  const found = creatives().find(([, c]) => c.listingId === 'lB');
  const doc = found ? found[1] : {};
  ok('il doc è failed col motivo', doc.status === 'failed' && /nsfw/.test(doc.error), doc);
  ok('l\'operatore lo sa', TG.some(t => t.includes('non riuscito')), r);
  const before = HF_CALLS.submits;
  await call();
  const again = creatives().filter(([, c]) => c.listingId === 'lB');
  ok('il giro dopo NON riprova lB (si riprova solo se cambiano le foto)',
    again.length === 1 && HF_CALLS.submits === before, again.length);
}

// 8g. kill switch e manopole della Direzione
{
  DB.set('settings/marketing', { enabled: false });
  DB.set('listings/lC', L({ id: 'lC' }));
  const r = await call();
  ok('kill switch: stop totale', r.killSwitch === true && r.submitted === undefined, r);
  DB.delete('settings/marketing');

  DB.set('settings/squadra', { creativo: { weeklyCap: 0 } });
  // api/_squadra.js tiene una cache di 30s sul doc: in produzione ogni run è
  // un'invocazione fredda, qui si forza il refresh come farebbe il tempo.
  const { loadSquadraSettings } = await import('../../api/_squadra.js');
  await loadSquadraSettings({ fresh: true });
  const r2 = await call();
  ok('weeklyCap a 0: il Creativo osserva e basta', (r2.submitted || []).length === 0 && r2.budgetLeft === 0, r2);
  DB.delete('settings/squadra');
}

console.log(fails ? `\n${fails} FAILED` : '\nAll green.');
process.exit(fails ? 1 : 0);
