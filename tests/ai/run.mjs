// tests/ai/run.mjs — LA CENTRALE AI.
//
// Le regole che contano, tutte verificabili senza un modello vero:
//  1. Coi DEFAULT (nessun documento settings/ai) OGNI scopo va in cloud come
//     prima: il deploy non cambia comportamento su clienti veri.
//  2. Uno scopo `localOk:false` (l'inventario dal video) non va in locale
//     nemmeno se qualcuno lo scrive nel documento: rifiutato, dichiarato.
//  3. Un PDF forza il cloud; un'immagine esige un modello locale con visione.
//  4. In modalità local, un locale giù/lento/illeggibile RICADE sul cloud e
//     lo dice (fallback:true + contatori); con fallback spento è un errore.
//  5. In ombra la risposta è SEMPRE quella del cloud; il locale si misura
//     (accordo sui soli campi dichiarati) e un suo guasto non tocca nulla;
//     un guasto del CLOUD non viene "salvato" dal locale.
//  6. I contatori sono incrementi atomici (:commit) con il costo dal listino;
//     un contatore che fallisce non fa mai fallire una risposta ottenuta.
//  7. Nei log della centrale non entra mai contenuto.
//  8. Anti-deriva: ogni chiamante dichiara uno scopo del registro, ogni
//     scopo ha un chiamante, ogni scopo diretto si conta da solo.
//  9. La porta HTTP: 401 senza auth, POST solo admin, un valore impossibile
//     torna 400 e non si scrive.

process.env.FIREBASE_API_KEY = 'fb-key';
process.env.FIREBASE_PROJECT_ID = 'p';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'x';
process.env.CRON_SECRET = 'cron-secret';
process.env.HOMIE_SECRET = 'homie-secret';
process.env.ANTHROPIC_API_KEY = 'anthropic-key';
delete process.env.OPENAI_API_KEY;
delete process.env.LOCAL_AI_URL; delete process.env.LOCAL_AI_MODEL; delete process.env.LOCAL_AI_VISION_MODEL;
delete process.env.LOCAL_AI_TOKEN; delete process.env.LOCAL_STT_URL; delete process.env.ANTHROPIC_MODEL;

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (f) => readFileSync(join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 300) : '')); } };

const REG = (await import('../../js/ai-registry.js')).default;
const { toFsFields, fsValToJs } = await import('../../api/homie/_lib.js');

// ═══ 1. Il registro, puro ═══════════════════════════════════════════════
{
  ok(REG.PURPOSES.length >= 24, `il registro dichiara gli scopi (${REG.PURPOSES.length})`);
  ok(new Set(REG.PURPOSES.map(p => p.key)).size === REG.PURPOSES.length, 'chiavi uniche');
  ok(new Set(REG.PURPOSES.map(p => p.code)).size === REG.PURPOSES.length, 'codici Telegram unici (un bottone per scopo)');
  ok(REG.PURPOSES.every(p => existsSync(join(ROOT, p.file))), 'ogni scopo punta a un file che esiste');
  ok(REG.PURPOSES.every(p => REG.PRICES[p.cloudModel] || p.cloudModel === 'whisper-1'), 'ogni modello cloud di default è nel listino');
  ok(REG.PURPOSES.every(p => p.why && p.why.length > 10), 'ogni scopo dice PERCHÉ può (o non può) andare in locale');
  const noLocal = REG.PURPOSES.filter(p => !p.localOk).map(p => p.key).sort();
  ok(noLocal.join(',') === 'banking.pdf,inventario.video,parse.docs,portal.ingest', 'chi non va MAI in locale è scritto: PDF banca, inventario, proxy, Innesto 3.0 (strumento + scala dei 400: solo cloud)', noLocal);

  // 1.a i default: tutto cloud
  const d = REG.mergeSettings(null);
  ok(d.cfg.local.enabled === false && d.rejected.length === 0, 'default: locale spento, niente rifiuti');
  ok(REG.PURPOSES.every(p => REG.resolvePolicy(p.key, d.cfg, {}).effective === 'cloud'), 'default: OGNI scopo va in cloud (il deploy non cambia niente)');
  ok(REG.mergeSettings(undefined).cfg.local.timeoutMs === 20000 && REG.mergeSettings({}).cfg.shadow.minSample === 30, 'default: tetto locale 20s, campione ombra 30');

  // 1.b i rifiuti, mai aggiustamenti silenziosi
  const r = REG.mergeSettings({
    local: { enabled: true, url: 'http://ai.example.com', model: 'qwen3:14b', timeoutMs: 500 },
    purposes: { 'leads.brain': { mode: 'locale' }, 'inventario.video': { mode: 'local' }, 'wizard.interpret': { mode: 'shadow', cloudModel: 'gpt-5' }, 'boh.x': 'local' },
    shadow: { minAgree: 30 },
  });
  const rk = r.rejected.map(x => x.key);
  ok(rk.includes('local.url') && r.cfg.local.url === '', 'un http PUBBLICO è rifiutato (i documenti viaggerebbero in chiaro)', rk);
  ok(rk.includes('local.timeoutMs') && r.cfg.local.timeoutMs === 20000, 'un tetto impossibile torna al default e finisce fra i rifiuti');
  ok(rk.includes('purposes.leads.brain.mode') && !r.cfg.purposes['leads.brain'], 'una modalità sconosciuta è rifiutata');
  const inv = r.rejected.find(x => x.key === 'purposes.inventario.video.mode');
  ok(inv && /mai in locale/.test(inv.why) && !r.cfg.purposes['inventario.video'], 'inventario.video in locale: RIFIUTATO col perché', inv);
  ok(rk.includes('purposes.wizard.interpret.cloudModel') && r.cfg.purposes['wizard.interpret'].mode === 'shadow' && !r.cfg.purposes['wizard.interpret'].cloudModel, 'un modello fuori listino è rifiutato, la modalità valida accanto resta');
  ok(rk.includes('purposes.boh.x'), 'uno scopo sconosciuto è rifiutato');
  ok(rk.includes('shadow.minAgree') && r.cfg.shadow.minAgree === 90, 'accordo minimo sotto 50% rifiutato');
  const good = REG.mergeSettings({ local: { enabled: true, url: 'https://ai.boom.example/', model: 'qwen3:14b' }, purposes: { 'leads.brain': 'shadow' } });
  ok(good.rejected.length === 0 && good.cfg.local.url === 'https://ai.boom.example' && good.cfg.purposes['leads.brain'].mode === 'shadow', 'https accettato (slash finale tolto), forma corta purposes:{k:"shadow"} accettata', good);
  ok(REG.mergeSettings({ local: { url: 'http://127.0.0.1:11434' } }).rejected.length === 0, 'http su rete privata accettato');

  // 1.c la politica in vigore
  const L = REG.mergeSettings({ local: { enabled: true, url: 'https://ai.x', model: 'm', visionModel: '', sttUrl: '' }, purposes: { 'leads.brain': 'local', 'docs.smista': 'local', 'profile.ocr': 'local', 'stt.transcribe': 'local' } }).cfg;
  ok(REG.resolvePolicy('leads.brain', L, {}).effective === 'local', 'local: testo con url+modello → locale');
  const off = REG.mergeSettings({ local: { enabled: false, url: 'https://ai.x', model: 'm' }, purposes: { 'leads.brain': 'local' } }).cfg;
  ok(REG.resolvePolicy('leads.brain', off, {}).effective === 'cloud' && /spento/.test(REG.resolvePolicy('leads.brain', off, {}).why), 'interruttore spento → cloud, col perché');
  ok(REG.resolvePolicy('docs.smista', L, { hasDocument: true }).effective === 'cloud' && /PDF/.test(REG.resolvePolicy('docs.smista', L, { hasDocument: true }).why), 'un PDF forza il cloud');
  ok(REG.resolvePolicy('profile.ocr', L, { hasImage: true }).effective === 'cloud' && /visione/.test(REG.resolvePolicy('profile.ocr', L, { hasImage: true }).why), 'immagine senza modello visivo locale → cloud');
  const LV = REG.mergeSettings({ local: { enabled: true, url: 'https://ai.x', model: 'm', visionModel: 'qwen2.5vl' }, purposes: { 'profile.ocr': 'local' } }).cfg;
  const pv = REG.resolvePolicy('profile.ocr', LV, { hasImage: true });
  ok(pv.effective === 'local' && pv.localModel === 'qwen2.5vl', 'immagine col modello visivo → locale, sul modello visivo');
  ok(REG.resolvePolicy('stt.transcribe', L, {}).effective === 'cloud' && /trascrizione/.test(REG.resolvePolicy('stt.transcribe', L, {}).why), 'audio senza sttUrl → cloud');
  ok(REG.resolvePolicy('inventario.video', L, {}).effective === 'cloud', 'inventario: cloud anche col locale acceso');
  ok(REG.resolvePolicy('nope', L, {}) === null, 'scopo ignoto → null');

  // 1.d il costo dai token veri
  ok(Math.abs(REG.costUsd('claude-haiku-4-5-20251001', { input_tokens: 1000, output_tokens: 200 }) - 0.002) < 1e-9, 'haiku: 1000 in + 200 out = $0.002');
  ok(Math.abs(REG.costUsd('claude-opus-4-8', { input_tokens: 1000, output_tokens: 200 }) - 0.010) < 1e-9, 'opus 4.8: stessi token = $0.010 (5×)');
  ok(Math.abs(REG.costUsd('claude-sonnet-5', { input_tokens: 1500, output_tokens: 100 }) - 0.004) < 1e-9, 'sonnet 5: 1500 in (il catalogo dell\'interprete) + 100 out = $0.004');
  ok(Math.abs(REG.costUsd('claude-haiku-4-5', { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 10000 }) - 0.001) < 1e-9, 'cache read a 0.1×');
  ok(REG.costUsd('gpt-5', { input_tokens: 1 }) === null, 'modello ignoto → null, mai un numero inventato');
  ok(REG.costUsd('local:qwen3', { input_tokens: 9999 }) === 0, 'locale → 0');
  ok(Math.abs(REG.sttCostUsd('whisper-1', 120) - 0.012) < 1e-9, 'whisper: 2 minuti = $0.012');

  // 1.e l'accordo sui soli campi dichiarati
  const a = [{ i: 0, grade: 'A', intent: 'visita', brief: 'coppia, 1400' }, { i: 1, grade: 'C', intent: 'info', brief: 'x' }];
  const b = [{ i: 0, grade: 'A', intent: 'visita', brief: 'altro testo' }, { i: 1, grade: 'C', intent: 'info' }];
  ok(REG.agreement('leads.brain', a, b) === true, 'Lead Brain: stesso voto e intento = accordo, anche con brief diversi');
  ok(REG.agreement('leads.brain', a, [b[0], { ...b[1], grade: 'B' }]) === false, '…un voto diverso = disaccordo');
  ok(REG.agreement('leads.brain', a, [b[0]]) === false, '…lunghezze diverse = disaccordo');
  ok(REG.agreement('wizard.describe', 'x', 'y') === null, 'testo libero (agreeOn:false) → non misurabile (null)');
  ok(REG.agreement('wizard.interpret', { action: 'update', id: 'L1', updates: { price: 1 } }, { action: 'Update', id: ' l1 ', updates: { price: 2 } }) === true, 'confronto normalizzato (maiuscole, spazi) sui campi dichiarati');

  // 1.f il verdetto: la scala della fiducia applicata ai modelli
  const cfg = REG.mergeSettings(null).cfg;
  ok(REG.shadowVerdict('inventario.video', { samples: 100, agree: 100 }, cfg).state === 'mai', 'localOk:false → mai');
  ok(REG.shadowVerdict('wizard.describe', { samples: 100 }, cfg).state === 'non_misurabile', 'testo libero → non misurabile qui');
  ok(REG.shadowVerdict('leads.brain', { samples: 10, agree: 10 }, cfg).state === 'in_misura', 'sotto campione → in misura (10/30)');
  ok(REG.shadowVerdict('leads.brain', { samples: 40, agree: 38, disagree: 2 }, cfg).state === 'pronta', '40 coppie al 95% → pronta');
  ok(REG.shadowVerdict('leads.brain', { samples: 40, agree: 30, disagree: 10 }, cfg).state === 'bocciata', '75% → bocciata');
  const lf = REG.shadowVerdict('leads.brain', { samples: 40, agree: 32, disagree: 0, localFail: 8 }, cfg);
  ok(lf.state === 'bocciata' && /fallisce/.test(lf.why), 'un locale che fallisce il 20% è bocciato anche se quando risponde è d\'accordo', lf);
  const loose = REG.mergeSettings({ shadow: { minSample: 5 } }).cfg;
  ok(REG.shadowVerdict('leads.brain', { samples: 6, agree: 6 }, loose).state === 'pronta', 'campione minimo abbassato dall\'operatore → pronta con 6');

  // 1.g la lettura dei contatori
  const s = REG.usageSummary([
    { day: '2026-09-20', p: { leads_brain: { cloud: { calls: 3, usd: 0.01, inTok: 3000 }, local: { calls: 1 } } } },
    { day: '2026-09-21', p: { leads_brain: { cloud: { calls: 2, usd: 0.02 } }, wizard_interpret: { cloud: { calls: 1, usd: 0.004 } } } },
  ]);
  ok(s.days === 2 && s.total.cloud.calls === 6 && Math.abs(s.total.cloud.usd - 0.034) < 1e-9 && s.byPurpose['leads.brain'].cloud.calls === 5 && s.byPurpose['leads.brain'].local.calls === 1, 'i giorni si sommano per scopo e per backend', s.total);
  ok(REG.nextMode(REG.purposeOf('leads.brain'), 'cloud') === 'shadow' && REG.nextMode(REG.purposeOf('leads.brain'), 'shadow') === 'local' && REG.nextMode(REG.purposeOf('leads.brain'), 'local') === 'cloud', 'il bottone ruota cloud → shadow → local → cloud');
  ok(REG.nextMode(REG.purposeOf('inventario.video'), 'cloud') === 'cloud', '…e chi non può andare in locale resta in cloud');
}

// ═══ 2. Anti-deriva sulla sorgente ═══════════════════════════════════════
{
  function walk(dir, out = []) {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules') continue;
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p, out); else if (e.endsWith('.js')) out.push(p);
    }
    return out;
  }
  const files = walk(join(ROOT, 'api')).map(p => relative(ROOT, p));
  const used = new Map();   // key → [files]
  for (const f of files) {
    const s = src(f);
    for (const m of s.matchAll(/purpose:\s*'([a-z]+\.[a-z]+)'/g)) {
      if (!used.has(m[1])) used.set(m[1], []);
      used.get(m[1]).push(f);
    }
  }
  const unknown = [...used.keys()].filter(k => !REG.purposeOf(k));
  ok(unknown.length === 0, 'ogni scopo dichiarato da un chiamante esiste nel registro' + (unknown.length ? ' — ignoti: ' + unknown.join(', ') : ''));
  const orphans = REG.PURPOSES.filter(p => !used.has(p.key)).map(p => p.key);
  ok(orphans.length === 0, 'ogni scopo del registro ha un chiamante' + (orphans.length ? ' — orfani: ' + orphans.join(', ') : ''));
  const wrongFile = REG.PURPOSES.filter(p => used.has(p.key) && !used.get(p.key).includes(p.file)).map(p => p.key + '≠' + p.file);
  ok(wrongFile.length === 0, 'il file dichiarato nel registro è dove lo scopo viene chiamato' + (wrongFile.length ? ' — ' + wrongFile.join(', ') : ''));
  // nessuno chiama più il cloud in diretta fuori dalla centrale e dai `direct`
  const direct = files.filter(f => f !== 'api/_ai.js' && /api\.anthropic\.com\/v1\/messages['"`]/.test(src(f)));
  const allowed = new Set(REG.PURPOSES.filter(p => p.direct).map(p => p.file));
  ok(direct.every(f => allowed.has(f)), 'fuori dalla centrale chiama il cloud solo chi è dichiarato `direct`', direct);
  // e nessun modello scritto a mano è rimasto fuori dal registro
  const hardcoded = files.filter(f => f !== 'api/_ai.js' && !allowed.has(f) && /['"]claude-(haiku|sonnet|opus)-[0-9a-z-]+['"]/.test(src(f)));
  ok(hardcoded.length === 0, 'nessun modello cloud scritto a mano fuori dal registro' + (hardcoded.length ? ' — ' + hardcoded.join(', ') : ''));
  // …e un `direct` che il modello lo scrive a mano (il suo test lo pinna nel
  // sorgente: l'Innesto 3.0 esporta MODEL) deve scriverlo UGUALE al registro:
  // recordUsage prezza col nome che riceve, e /ai conterebbe un altro listino.
  for (const p of REG.PURPOSES.filter(p => p.direct)) {
    const lits = [...src(p.file).matchAll(/['"](claude-(?:haiku|sonnet|opus)-[0-9a-z-]+)['"]/g)].map(m => m[1]);
    ok(lits.length > 0 && lits.every(m => m === p.cloudModel), `${p.file}: il modello scritto a mano è quello del registro (${p.cloudModel})`, lits);
  }
}

// ═══ 3. La centrale, guidata su un Firestore in memoria ═════════════════
const store = new Map();          // path → oggetto JS
let commits = [];                 // i body dei :commit
let cloudCalls = [], localCalls = [], modelsCalls = 0;
let cloud = { status: 200, text: '{"ok":true}', usage: { input_tokens: 1000, output_tokens: 200 }, model: 'claude-haiku-4-5-20251001' };
let local = { status: 200, text: '{"ok":true}', usage: { prompt_tokens: 900, completion_tokens: 150 }, model: 'qwen3:14b', throw: false };
let commitStatus = 200, settingsThrow = false;
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const toDoc = (path, obj) => ({ name: 'projects/p/databases/(default)/documents/' + path, fields: toFsFields(obj) });
const fromFields = (fields) => { const o = {}; for (const [k, v] of Object.entries(fields || {})) o[k] = fsValToJs(v); return o; };
function setDeep(obj, path, fn) {
  const parts = path.split('.'); let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) { if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {}; cur = cur[parts[i]]; }
  cur[parts[parts.length - 1]] = fn(cur[parts[parts.length - 1]]);
}
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('accounts:signInWithPassword')) return json({ idToken: 'admin-token' });
  if (u.includes('accounts:lookup')) {
    const { idToken } = JSON.parse(opts.body);
    if (idToken === 'admin-id-token') return json({ users: [{ localId: 'u1', email: 'op@boom.it' }] });
    if (idToken === 'tenant-id-token') return json({ users: [{ localId: 'u2', email: 't@x.it' }] });
    return json({ error: 'bad' }, 400);
  }
  if (u.includes('api.anthropic.com')) {
    cloudCalls.push({ headers: opts.headers, body: JSON.parse(opts.body), signal: !!opts.signal });
    if (cloud.status !== 200) return new Response('overloaded', { status: cloud.status });
    return json({ content: [{ type: 'text', text: cloud.text }], usage: cloud.usage, model: cloud.model, stop_reason: 'end_turn' });
  }
  if (u.includes('127.0.0.1:11434') || u.includes('ai.local.test')) {
    if (u.endsWith('/v1/models')) { modelsCalls++; return json({ data: [{ id: 'qwen3:14b' }, { id: 'qwen2.5vl:7b' }] }); }
    localCalls.push({ url: u, headers: opts.headers, body: JSON.parse(opts.body), signal: !!opts.signal });
    if (local.throw) throw Object.assign(new Error('ECONNREFUSED'), { name: 'TypeError' });
    if (local.status !== 200) return new Response('no', { status: local.status });
    return json({ choices: [{ message: { role: 'assistant', content: local.text }, finish_reason: 'stop' }], usage: local.usage, model: local.model });
  }
  if (u.includes('api.openai.com')) {
    localCalls.push({ url: u, openai: true });
    return json({ text: 'trascritto dal cloud' });
  }
  if (u.includes('stt.local.test')) {
    localCalls.push({ url: u, headers: opts.headers, stt: true });
    if (local.status !== 200) return new Response('no', { status: local.status });
    return json({ text: 'trascritto in locale' });
  }
  if (u.includes('firestore.googleapis.com')) {
    const path = (u.split('(default)/documents')[1] || '').replace(/^\//, '').split('?')[0];
    if (path === ':commit') {
      const body = JSON.parse(opts.body);
      commits.push(body);
      if (commitStatus !== 200) return new Response('boom', { status: commitStatus });
      for (const w of body.writes) {
        const p = w.update.name.split('/documents/')[1];
        const cur = store.get(p) || {};
        Object.assign(cur, fromFields(w.update.fields));
        for (const t of (w.updateTransforms || [])) {
          const n = t.increment.integerValue != null ? Number(t.increment.integerValue) : Number(t.increment.doubleValue);
          setDeep(cur, t.fieldPath, (v) => (Number(v) || 0) + n);
        }
        store.set(p, cur);
      }
      return json({ writeResults: body.writes.map(() => ({})) });
    }
    if (path === ':runQuery') {
      const q = JSON.parse(opts.body).structuredQuery;
      const coll = q.from[0].collectionId;
      let rows = [...store.entries()].filter(([k]) => k.startsWith(coll + '/') && k.split('/').length === 2);
      if (q.where) {
        const f = q.where.fieldFilter; const val = fsValToJs(f.value);
        rows = rows.filter(([, v]) => f.op === 'GREATER_THAN_OR_EQUAL' ? String(v[f.field.fieldPath]) >= String(val) : f.op === 'EQUAL' ? v[f.field.fieldPath] === val : true);
      }
      return json(rows.slice(0, q.limit || 50).map(([k, v]) => ({ document: toDoc(k, v) })));
    }
    if (opts.method === 'PATCH') {
      if (u.includes('currentDocument.exists=false') && store.has(path)) return json({ error: { status: 'FAILED_PRECONDITION' } }, 400);
      const cur = store.get(path) || {};
      Object.assign(cur, fromFields(JSON.parse(opts.body).fields));
      store.set(path, cur);
      return json(toDoc(path, cur));
    }
    if (path === 'settings/ai' && settingsThrow) throw new Error('rete giù');
    if (store.has(path)) return json(toDoc(path, store.get(path)));
    return json({ error: { status: 'NOT_FOUND' } }, 404);
  }
  throw new Error('fetch non stubbata: ' + u);
};

const { ai, forgetAiSettings, recordUsage, AiError } = await import('../../api/_ai.js');
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
const usageDoc = () => store.get('aiUsage/' + today) || {};
const bucket = (key, backend) => ((usageDoc().p || {})[REG.slugOf(key)] || {})[backend] || {};
function reset(settings) {
  store.clear(); commits = []; cloudCalls = []; localCalls = []; modelsCalls = 0;
  cloud = { status: 200, text: '{"ok":true}', usage: { input_tokens: 1000, output_tokens: 200 }, model: 'claude-haiku-4-5-20251001' };
  local = { status: 200, text: '{"ok":true}', usage: { prompt_tokens: 900, completion_tokens: 150 }, model: 'qwen3:14b', throw: false };
  commitStatus = 200; settingsThrow = false;
  if (settings) store.set('settings/ai', settings);
  forgetAiSettings();
}
const LOCAL = { enabled: true, url: 'http://127.0.0.1:11434', model: 'qwen3:14b' };

// ── A. default: cloud, con gli header di sempre e il contatore ──
{
  reset(null);
  const r = await ai({ purpose: 'leads.brain', system: 'SYS', user: 'ciao', maxTokens: 1200, timeoutMs: 25000 });
  ok(cloudCalls.length === 1 && localCalls.length === 0, 'default: UNA chiamata al cloud, nessuna al locale');
  const c = cloudCalls[0];
  ok(c.headers['x-api-key'] === 'anthropic-key' && c.headers['anthropic-version'] === '2023-06-01' && c.signal, 'gli header di sempre, e il tetto di tempo (signal) c\'è');
  ok(c.body.model === 'claude-haiku-4-5-20251001' && c.body.max_tokens === 1200 && c.body.system === 'SYS' && c.body.messages[0].content === 'ciao', 'il body è quello che il chiamante mandava prima (modello dal registro)');
  ok(r.backend === 'cloud' && r.text === '{"ok":true}' && r.policy === 'cloud' && r.fallback === false && r.model === 'claude-haiku-4-5-20251001', 'la risposta dice backend, testo, modello servito', r);
  const b = bucket('leads.brain', 'cloud');
  ok(b.calls === 1 && b.ok === 1 && b.inTok === 1000 && b.outTok === 200 && Math.abs(b.usd - 0.002) < 1e-9 && b.ms >= 0, 'contatori: chiamata, token veri, costo dal listino ($0.002)', b);
  ok(commits.length === 1 && commits[0].writes[0].updateTransforms.some(t => t.fieldPath === 'p.leads_brain.cloud.calls' && t.increment.integerValue === '1'), 'scritti come INCREMENTI (:commit), non letti-e-riscritti');
  ok(usageDoc().day === today, 'il documento è quello del giorno di Roma');
}

// ── B. local: il Mac risponde, il cloud non viene toccato ──
{
  reset({ local: LOCAL, purposes: { 'leads.brain': 'local' } });
  process.env.LOCAL_AI_TOKEN = 'tok';
  const r = await ai({ purpose: 'leads.brain', system: 'SYS', messages: [{ role: 'user', content: 'ciao' }], maxTokens: 300, json: true });
  delete process.env.LOCAL_AI_TOKEN;
  ok(localCalls.length === 1 && cloudCalls.length === 0, 'local: UNA chiamata al locale, ZERO al cloud');
  const l = localCalls[0];
  ok(l.url === 'http://127.0.0.1:11434/v1/chat/completions' && l.headers.Authorization === 'Bearer tok' && l.signal, 'rotta OpenAI-compatibile, bearer del tunnel, tetto di tempo');
  ok(l.body.model === 'qwen3:14b' && l.body.messages[0].role === 'system' && l.body.messages[0].content === 'SYS' && l.body.messages[1].content === 'ciao' && l.body.max_tokens === 300 && l.body.stream === false, 'il body nel dialetto OpenAI: system come primo messaggio');
  ok(l.body.response_format && l.body.response_format.type === 'json_object', 'json:true → json mode al locale');
  ok(r.backend === 'local' && r.model === 'local:qwen3:14b' && r.usage.input_tokens === 900 && r.usage.output_tokens === 150 && r.fallback === false, 'risposta dal locale, token mappati, modello dichiarato', r);
  const b = bucket('leads.brain', 'local');
  ok(b.calls === 1 && b.ok === 1 && b.usd === 0 && b.inTok === 900, 'contatori del locale: costo 0, token veri', b);
  ok(!usageDoc().p.leads_brain.cloud, 'nessun contatore cloud: non è stato chiamato');
}

// ── C. local giù → si ricade sul cloud, dichiarandolo ──
{
  reset({ local: LOCAL, purposes: { 'leads.brain': 'local' } });
  local.status = 500;
  const r = await ai({ purpose: 'leads.brain', system: 'SYS', user: 'ciao' });
  ok(localCalls.length === 1 && cloudCalls.length === 1 && r.backend === 'cloud' && r.fallback === true, 'locale 500 → risponde il cloud, fallback:true', r);
  ok(bucket('leads.brain', 'local').fail === 1 && bucket('leads.brain', 'cloud').fallback === 1 && bucket('leads.brain', 'cloud').ok === 1, 'contatori: il guasto del locale E la ricaduta sono scritti', usageDoc().p);
  reset({ local: LOCAL, purposes: { 'leads.brain': 'local' } });
  local.throw = true;
  const r2 = await ai({ purpose: 'leads.brain', system: 'SYS', user: 'ciao' });
  ok(r2.backend === 'cloud' && r2.fallback === true, 'locale irraggiungibile (rete) → cloud');
  reset({ local: LOCAL, purposes: { 'leads.brain': 'local' } });
  local.text = 'boh, non so';
  const r3 = await ai({ purpose: 'leads.brain', system: 'SYS', user: 'ciao', json: true });
  ok(r3.backend === 'cloud' && r3.fallback === true && bucket('leads.brain', 'local').fail === 1, 'locale che scrive un JSON illeggibile quando serve JSON → è un guasto, si ricade');
  reset({ local: LOCAL, purposes: { 'leads.brain': 'local' } });
  local.text = '<think>ragiono…</think>\n{"grade":"A"}';
  const r4 = await ai({ purpose: 'leads.brain', system: 'SYS', user: 'ciao', json: true });
  ok(r4.backend === 'local' && r4.text === '{"grade":"A"}', 'il ragionamento <think> di un modello pensante non entra nella risposta');
  reset({ local: { ...LOCAL, fallback: false }, purposes: { 'leads.brain': 'local' } });
  local.status = 503;
  let err = null;
  try { await ai({ purpose: 'leads.brain', system: 'SYS', user: 'ciao' }); } catch (e) { err = e; }
  ok(err instanceof AiError && err.code === 'local_http' && err.status === 503 && cloudCalls.length === 0, 'con la ricaduta SPENTA un locale giù è un errore dichiarato, e il cloud non si tocca', err && err.code);
}

// ── D. i confini che le impostazioni non scavalcano ──
{
  reset({ local: LOCAL, purposes: { 'inventario.video': 'local' } });
  const r = await ai({ purpose: 'inventario.video', system: 'S', messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } }, { type: 'text', text: 'x' }] }] });
  ok(cloudCalls.length === 1 && localCalls.length === 0 && r.backend === 'cloud', 'inventario.video forzato a local nel documento → va comunque in cloud');
  reset({ local: LOCAL, purposes: { 'docs.smista': 'local' } });
  await ai({ purpose: 'docs.smista', messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'AAAA' } }, { type: 'text', text: 'x' }] }] });
  ok(cloudCalls.length === 1 && localCalls.length === 0, 'un PDF va in cloud anche con lo scopo in local');
  reset({ local: LOCAL, purposes: { 'profile.ocr': 'local' } });
  await ai({ purpose: 'profile.ocr', messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } }, { type: 'text', text: 'leggi' }] }] });
  ok(cloudCalls.length === 1 && localCalls.length === 0, 'un\'immagine senza modello visivo locale → cloud');
  reset({ local: { ...LOCAL, visionModel: 'qwen2.5vl:7b' }, purposes: { 'profile.ocr': 'local' } });
  const rv = await ai({ purpose: 'profile.ocr', messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } }, { type: 'text', text: 'leggi' }] }] });
  const lb = localCalls[0] && localCalls[0].body;
  ok(rv.backend === 'local' && lb.model === 'qwen2.5vl:7b' && lb.messages[0].content[0].type === 'image_url' && lb.messages[0].content[0].image_url.url === 'data:image/png;base64,QUJD' && lb.messages[0].content[1].text === 'leggi', 'col modello visivo il documento d\'identità resta in casa: data URL al locale', lb);
  reset({ local: LOCAL, purposes: { 'leads.brain': 'local' } });
  const rs = await ai({ purpose: 'leads.brain', system: [{ type: 'text', text: 'BLOCCO', cache_control: { type: 'ephemeral' } }], user: 'x' });
  ok(rs.backend === 'local' && localCalls[0].body.messages[0].content === 'BLOCCO', 'i blocchi system (con cache_control) si appiattiscono per il locale…');
  reset(null);
  await ai({ purpose: 'agent.reply', system: [{ type: 'text', text: 'BLOCCO', cache_control: { type: 'ephemeral' } }], user: 'x' });
  ok(Array.isArray(cloudCalls[0].body.system) && cloudCalls[0].body.system[0].cache_control.type === 'ephemeral' && cloudCalls[0].body.model === 'claude-opus-4-8', '…e passano INTATTI al cloud (prompt caching); agent.reply resta su opus 4.8 come prima');
  reset({ purposes: { 'commerciale.first': { cloudModel: 'claude-sonnet-5' } } });
  await ai({ purpose: 'commerciale.first', system: 'S', user: 'x' });
  ok(cloudCalls[0].body.model === 'claude-sonnet-5', 'il modello cloud per scopo si cambia da settings/ai senza deploy (opus → sonnet)');
  reset(null);
  await ai({ purpose: 'commerciale.first', system: 'S', user: 'x', model: 'claude-opus-5' });
  ok(cloudCalls[0].body.model === 'claude-opus-5', 'un modello esplicito del chiamante vince');
}

// ── E. l'ombra: il cloud risponde, il locale si misura ──
{
  reset({ local: LOCAL, purposes: { 'leads.brain': 'shadow' } });
  cloud.text = '[{"i":0,"grade":"A","intent":"visita","brief":"coppia"}]';
  local.text = '[{"i":0,"grade":"A","intent":"visita","brief":"altro"}]';
  const r = await ai({ purpose: 'leads.brain', system: 'S', user: 'x', json: true });
  ok(cloudCalls.length === 1 && localCalls.length === 1 && r.backend === 'cloud' && r.text === cloud.text && r.policy === 'shadow', 'ombra: entrambi chiamati, la risposta è quella del cloud');
  ok(r.shadow && r.shadow.agree === true, 'accordo sui campi dichiarati (grade, intent) — il brief diverso non conta');
  const sh = store.get('aiShadow/leads_brain');
  ok(sh && sh.samples === 1 && sh.agree === 1 && !sh.disagree && sh.purpose === 'leads.brain', 'aiShadow/leads_brain: 1 coppia, 1 accordo', sh);
  ok(usageDoc().p.leads_brain.shadow.agree === 1 && bucket('leads.brain', 'local').calls === 1 && bucket('leads.brain', 'local').usd === 0, 'il giorno vede l\'ombra e i token del locale (a costo 0)');
  local.text = '[{"i":0,"grade":"C","intent":"info"}]';
  await ai({ purpose: 'leads.brain', system: 'S', user: 'x', json: true });
  ok(store.get('aiShadow/leads_brain').disagree === 1 && store.get('aiShadow/leads_brain').samples === 2, 'un voto diverso = disaccordo contato');
  local.status = 500;
  const r3 = await ai({ purpose: 'leads.brain', system: 'S', user: 'x', json: true });
  ok(r3.backend === 'cloud' && r3.text === cloud.text && r3.shadow.localFail === true && store.get('aiShadow/leads_brain').localFail === 1, 'il locale giù in ombra non tocca la risposta e si conta come guasto');
  cloud.status = 529; local.status = 200;
  let err = null;
  try { await ai({ purpose: 'leads.brain', system: 'S', user: 'x', json: true }); } catch (e) { err = e; }
  ok(err instanceof AiError && err.code === 'cloud_http' && err.status === 529, 'cloud giù in ombra: errore — l\'ombra NON è un paracadute (la qualità non cambia di nascosto)', err && err.code);
  ok(bucket('leads.brain', 'cloud').fail === 1, '…e il guasto del cloud è contato');
}

// ── F. le reti: contatori e impostazioni che falliscono ──
{
  reset(null);
  commitStatus = 500;
  const r = await ai({ purpose: 'leads.brain', system: 'S', user: 'x' });
  ok(r.text === '{"ok":true}' && commits.length === 1, 'un :commit che fallisce non fa fallire la risposta');
  reset(null);
  settingsThrow = true;
  const r2 = await ai({ purpose: 'leads.brain', system: 'S', user: 'x' });
  ok(r2.backend === 'cloud', 'settings/ai irraggiungibile → cloud (fail-open)');
  reset(null);
  let err = null;
  try { await ai({ purpose: 'nope.nope', system: 'S', user: 'x' }); } catch (e) { err = e; }
  ok(err instanceof AiError && err.code === 'unknown_purpose' && cloudCalls.length === 0 && commits.length === 0, 'uno scopo ignoto non spende e non conta');
  reset({ local: LOCAL, purposes: { 'leads.brain': 'local' } });
  process.env.LOCAL_AI_URL = 'https://ai.local.test';
  forgetAiSettings();
  await ai({ purpose: 'leads.brain', system: 'S', user: 'x' });
  ok(localCalls[0].url.startsWith('http://127.0.0.1:11434'), 'l\'URL nel documento vince sull\'env');
  reset({ local: { enabled: true, model: 'm' }, purposes: { 'leads.brain': 'local' } });
  forgetAiSettings();
  await ai({ purpose: 'leads.brain', system: 'S', user: 'x' });
  delete process.env.LOCAL_AI_URL;
  ok(localCalls.length === 1 && localCalls[0].url.startsWith('https://ai.local.test'), '…e senza URL nel documento vale l\'env (default di deploy)', localCalls);
  // recordUsage diretta (il proxy del Doc Parser)
  reset(null);
  await recordUsage({ purpose: 'parse.docs', backend: 'cloud', ok: true, ms: 10, model: 'claude-haiku-4-5-20251001', usage: { input_tokens: 500, output_tokens: 50 } });
  ok(bucket('parse.docs', 'cloud').calls === 1 && Math.abs(bucket('parse.docs', 'cloud').usd - 0.00075) < 1e-9, 'recordUsage conta anche chi non passa dalla centrale (parse.docs)');
  const bad = await recordUsage({ purpose: 'nope', backend: 'cloud', ok: true, ms: 1 });
  ok(bad === false && commits.length === 1, 'uno scopo ignoto non scrive');
}

// ── G. nei log della centrale mai contenuto ──
{
  const s = src('api/_ai.js');
  const logs = s.split('\n').filter(l => /console\.(warn|error|log)\(/.test(l));
  ok(logs.length >= 2 && logs.every(l => !/\b(text|detail|body|content|raw)\b/.test(l.replace(/console\.\w+\(/, ''))), 'ogni riga di log stampa codice, stato e millisecondi — mai testo, body o dettaglio', logs);
  ok(!/\.slice\(0,\s*[1-9]\d\d\)/.test(s.replace(/detail: txt\.slice\(0, 300\)/, '')), 'nessun estratto di risposta finisce nei log');
}

// ═══ 4. La trascrizione: locale prima, cloud come rete ══════════════════
{
  const { transcribeAudio } = await import('../../api/wizard/_stt.js');
  const buf = Buffer.alloc(60_000, 1);
  reset({ local: { ...LOCAL, sttUrl: 'https://stt.local.test', sttModel: 'large-v3-turbo' }, purposes: { 'stt.transcribe': 'local' } });
  process.env.OPENAI_API_KEY = 'oa';
  const r = await transcribeAudio(buf, 'audio/ogg');
  ok(r.ok && r.backend === 'local' && r.text === 'trascritto in locale' && localCalls[0].url === 'https://stt.local.test/v1/audio/transcriptions', 'con sttUrl e modalità local la nota vocale resta sul Mac', r);
  ok(bucket('stt.transcribe', 'local').calls === 1 && bucket('stt.transcribe', 'local').usd === 0, '…contata a costo zero');
  local.status = 500;
  const r2 = await transcribeAudio(buf, 'audio/ogg');
  ok(r2.ok && r2.backend === 'cloud' && r2.text === 'trascritto dal cloud', 'STT locale giù → Whisper OpenAI');
  ok(bucket('stt.transcribe', 'local').fail === 1 && bucket('stt.transcribe', 'cloud').calls === 1 && bucket('stt.transcribe', 'cloud').usd > 0, '…col guasto contato e il costo del cloud stimato dai byte');
  reset(null);
  const r3 = await transcribeAudio(buf, 'audio/ogg');
  ok(r3.ok && r3.backend === 'cloud' && localCalls.length === 1 && localCalls[0].openai, 'default: OpenAI come prima');
  delete process.env.OPENAI_API_KEY;
  reset(null);
  const r4 = await transcribeAudio(buf, 'audio/ogg');
  ok(!r4.ok && r4.error === 'unconfigured', 'senza NESSUN backend: unconfigured, mai un\'eccezione muta');
  forgetAiSettings();
}

// ═══ 5. La porta HTTP e gli interruttori ════════════════════════════════
{
  const handler = (await import('../../api/ai/status.js')).default;
  const { toggleAi, aiStatusMessage, setAiSettings } = await import('../../api/ai/_status.js');
  const mkRes = () => ({ code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } });
  const call = async (method, headers, body, query) => { const res = mkRes(); await handler({ method, headers, body, query: query || {} }, res); return res; };

  reset(null);
  ok((await call('GET', {})).code === 401, 'GET senza auth: 401');
  const g = await call('GET', { authorization: 'Bearer cron-secret' }, null, { probe: '0' });
  ok(g.code === 200 && g.body.ok && g.body.rows.length === REG.PURPOSES.length && g.body.local.configured === false && g.body.usage.day === today, 'GET col cron: la fotografia (righe per scopo, locale non configurato, usage del giorno)', g.body && { code: g.code, rows: g.body.rows && g.body.rows.length });
  ok(g.body.rows.every(r => r.effective === 'cloud'), '…coi default ogni riga è cloud');
  store.set('users/u1', { role: 'admin' }); store.set('users/u2', { role: 'tenant' });
  ok((await call('POST', { authorization: 'Bearer cron-secret' }, { purpose: 'leads.brain', mode: 'shadow' })).code === 403, 'POST col cron: 403 — scrivere è dell\'operatore');
  ok((await call('POST', { authorization: 'Bearer tenant-id-token' }, { purpose: 'leads.brain', mode: 'shadow' })).code === 403, 'POST da un inquilino: 403');
  const bad = await call('POST', { authorization: 'Bearer admin-id-token' }, { purpose: 'inventario.video', mode: 'local' });
  ok(bad.code === 400 && bad.body.error === 'rejected' && /mai in locale/.test(bad.body.rejected[0].why) && !store.has('settings/ai'), 'inventario.video → local: 400 col perché, e NIENTE scritto', bad.body);
  const bad2 = await call('POST', { authorization: 'Bearer admin-id-token' }, { local: { url: 'http://evil.example.com' } });
  ok(bad2.code === 400 && !store.has('settings/ai'), 'un http pubblico: 400, niente scritto');
  const good = await call('POST', { authorization: 'Bearer admin-id-token' }, { purpose: 'leads.brain', mode: 'shadow' });
  ok(good.code === 200 && store.get('settings/ai').purposes['leads.brain'].mode === 'shadow', 'leads.brain → shadow: scritto su settings/ai', good.body);
  const good2 = await call('POST', { authorization: 'Bearer admin-id-token' }, { local: { enabled: true, url: 'https://ai.boom.example', model: 'qwen3:14b' } });
  ok(good2.code === 200 && store.get('settings/ai').local.url === 'https://ai.boom.example' && store.get('settings/ai').purposes['leads.brain'].mode === 'shadow', 'il locale si configura senza perdere le modalità già scritte');
  // il bottone ruota, e rispetta i confini
  ok(await toggleAi('lb') && store.get('settings/ai').purposes['leads.brain'].mode === 'local', 'aitg:lb da shadow → local');
  ok(await toggleAi('lb') && store.get('settings/ai').purposes['leads.brain'].mode === 'cloud', 'aitg:lb da local → cloud');
  ok(await toggleAi('iv') && (!store.get('settings/ai').purposes['inventario.video'] || store.get('settings/ai').purposes['inventario.video'].mode === 'cloud'), 'aitg:iv (inventario): resta cloud per costruzione');
  ok((await toggleAi('zz')) === false, 'codice ignoto → false');
  ok(await toggleAi('local') && store.get('settings/ai').local.enabled === false, 'aitg:local spegne il locale…');
  ok(await toggleAi('local') && store.get('settings/ai').local.enabled === true, '…e lo riaccende');
  const s2 = await setAiSettings({ purposes: { 'wizard.interpret': { cloudModel: 'gpt-5' } } });
  ok(s2.ok === false && s2.rejected[0].key === 'purposes.wizard.interpret.cloudModel', 'setAiSettings rifiuta un modello fuori listino');
  // il messaggio Telegram
  const { msg, keyboard } = await aiStatusMessage({ probe: true });
  ok(/Centrale AI/.test(msg) && /Oggi/.test(msg) && modelsCalls === 0, 'il messaggio /ai: intestazione e spesa di oggi (la sonda non parte verso un URL non stubbato: https://ai.boom.example non risponde → irraggiungibile, detto)');
  ok(/irraggiungibile|non configurato|acceso/.test(msg), 'lo stato del locale è scritto in chiaro', msg.split('\n')[1]);
  const buttons = keyboard.inline_keyboard.flat();
  ok(buttons[0].callback_data === 'aitg:local' && buttons.length === 1 + REG.PURPOSES.filter(p => p.localOk).length, 'un bottone per il locale + uno per ogni scopo che PUÒ andare in locale');
  ok(buttons.every(b => Buffer.byteLength(b.callback_data) <= 64 && b.text.length <= 64), 'callback ≤ 64 byte (Telegram), testi corti');
  ok(!buttons.some(b => b.callback_data === 'aitg:iv'), 'nessun bottone per chi non va mai in locale');
  ok(msg.length < 4000, 'il messaggio sta nel limite di Telegram');
}

// ═══ 6. Le giunzioni sulla sorgente ═════════════════════════════════════
{
  ok(/from '\.\.\/_ai\.js'/.test(src('api/agent/_claude.js')) && /purpose/.test(src('api/agent/_claude.js')), '_claude.js è un wrapper della centrale, con lo scopo');
  ok(/purpose: 'commerciale\.first'/.test(src('api/employees/commerciale.js')) && /purpose: 'segretaria\.turn'/.test(src('api/segretaria/_core.js')) && /purpose: 'agent\.reply'/.test(src('api/agent/ai.reply.js')), 'Commerciale, Segretaria e ai.reply dichiarano il proprio scopo');
  ok(/recordUsage\(\{ purpose: 'parse\.docs'/.test(src('api/parse-docs.js')), 'il proxy del Doc Parser si conta');
  const tg = src('api/telegram/webhook.js');
  ok(/text === '\/ai'/.test(tg) && /verb === 'aitg'/.test(tg) && /aiStatusMessage/.test(tg) && /toggleAi/.test(tg), 'Telegram: /ai e gli interruttori aitg');
  ok(tg.indexOf("verb === 'aitg'") < tg.indexOf('const action = await fsGet(`action_queue/${actionId}`)'), '…e il toggle sta PRIMA della lettura di action_queue (un toggle non è un\'azione)');
  const rules = src('firestore.rules');
  ok(/match \/aiUsage\/\{x\}\s*\{ allow read, write: if isAdmin\(\); \}/.test(rules) && /match \/aiShadow\/\{x\}\s*\{ allow read, write: if isAdmin\(\); \}/.test(rules), 'firestore.rules: aiUsage e aiShadow admin-only (la lezione propertyLocks)');
  ok(/\['company', 'registrazione', 'ai'\]/.test(rules), 'settings/ai non è leggibile dal pubblico (porta l\'URL del tunnel)');
  ok(/"api\/ai\/status\.js"/.test(src('vercel.json')), 'vercel.json: la porta di stato ha il suo maxDuration');
  ok(/name: 'ai'/.test(src('tests/run-all.mjs')), 'la suite è registrata in run-all');
  ok(/LOCAL_AI_URL|LOCAL_AI_TOKEN/.test(src('CLAUDE.md')), 'CLAUDE.md documenta le env della centrale');
  ok(/api\/_ai\.js/.test(src('AGENTS.md')), 'AGENTS.md: la regola per Codex — i modelli si chiamano SOLO dalla centrale');
}

console.log(`\n${fail ? '✗' : '✓'} ai: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
