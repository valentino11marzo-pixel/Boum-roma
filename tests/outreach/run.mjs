// tests/outreach/run.mjs — IL CONTATTO: il messaggio approvato, e solo quello.
//
// Tre piani:
//   A. il MOTORE (js/outreach-engine.js): stili e voci coi fatti veri, mai
//      slot inventati, MAI un telefono nel testo (mutazione), un contatto
//      per annuncio per costruzione;
//   B. i HANDLER VERI su un Firestore in memoria: la coda con lease (mai un
//      doppio invio), peek che non lascia tracce, 3 fallimenti = parcheggio,
//      esito_incerto = parcheggio IMMEDIATO (mai un retry che rischia il
//      doppio messaggio), blocked che rilascia, il battito anche a vuoto,
//      il kill switch, e l'annuncio che passa da solo a "contattato";
//   C. le GIUNZIONI sulla sorgente: plancia col motore condiviso, rules,
//      registro, i due bracci sul Mac coi loro plist.
//
// node tests/outreach/run.mjs

import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const O = createRequire(import.meta.url)(join(root, 'js', 'outreach-engine.js'));

let passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 220) : '')); }
}

console.log('\n── A. Il motore ──────────────────────────────────────────────');
{
  const L = { title: 'Bilocale luminoso Pigneto', zone: 'Pigneto' };
  const m1 = O.buildMessage(L, { style: 'sobrio', client: { moveIn: 'settembre', durationMonths: 12 } });
  ok('sobrio: cita l\'annuncio per titolo e chiude con la domanda', m1.includes('Bilocale luminoso Pigneto') && /\?/.test(m1.split('\n').pop()), m1);
  ok('i fatti del cliente entrano (ingresso, durata) ma MAI il nome', m1.includes('settembre') && m1.includes('12 mesi'));
  const m2 = O.buildMessage({ zone: 'Trastevere' }, { style: 'english' });
  ok('english: senza titolo si ripiega sulla zona, mai su un vuoto', m2.includes('Trastevere') && m2.startsWith('Good morning'));
  const m3 = O.buildMessage({}, { style: 'deciso' });
  ok('senza titolo né zona: "il suo annuncio", mai uno slot inventato', m3.includes('il suo annuncio') && !m3.includes('undefined'), m3);
  const m4 = O.buildMessage(L, { voice: 'boom' });
  ok('voce BOOM: trasparente, "senza alcun costo per lei"', m4.includes('BOOM Roma') && m4.includes('senza alcun costo'));
  const m5 = O.buildMessage(L, { note: 'Disponibile anche visita video' });
  ok('la nota extra dell\'operatore entra nel testo', m5.includes('Disponibile anche visita video'));
  ok('il messaggio non sfora mai il tetto', O.buildMessage(L, { note: 'x'.repeat(300) }).length <= O.MAX_LEN);

  const base = { sourceUrl: 'https://www.immobiliare.it/annunci/1/', portal: 'immobiliare' };
  ok('validate: un messaggio serio passa', O.validateJob({ ...base, message: m1 }).ok === true);
  // MUTAZIONE CHIAVE: un telefono nel testo non parte MAI (la chat del
  // portale È il canale — un numero nel primo messaggio è spam da bloccare).
  ok('validate: un TELEFONO nel testo viene rifiutato',
    O.validateJob({ ...base, message: 'Sono interessato alla casa, chiamami al +39 333 1234567 grazie mille davvero' }).ok === false);
  ok('validate: portale fuori whitelist rifiutato', O.validateJob({ ...base, portal: 'facebook', message: m1 }).ok === false);
  ok('validate: messaggio troppo corto rifiutato', O.validateJob({ ...base, message: 'Ciao!' }).ok === false);
  ok('outreachKey: deterministica e sanificata', O.outreachKey('h_ab/12') === 'out_h_ab12' && O.outreachKey('h_1') === O.outreachKey('h_1'));
}

console.log('\n── B. I handler veri (Firestore in memoria) ──────────────────');

const DB = new Map();
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
let failPatch = null; // { path, times } — inietta guasti di scrittura mirati
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });
  if (u.includes('identitytoolkit')) return json({ idToken: 'fake', localId: 'admin' });
  if (u.includes('api.telegram.org')) return json({ ok: true });
  if (u.includes('api.anthropic.com')) return json({ error: 'no' }, 500); // l'AI giù non deve mai rompere il draft
  const body = opts.body ? JSON.parse(opts.body) : null;
  const m = u.match(/documents\/([^?:]+)/);
  const path = m ? decodeURIComponent(m[1]) : '';
  if (opts.method === 'PATCH' && failPatch && path === failPatch.path && failPatch.times > 0) {
    failPatch.times--;
    return json({ error: { status: 'UNAVAILABLE' } }, 503);
  }
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
    DB.set(path, { ...prev, ...Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])) });
    return json(toDoc(path, DB.get(path)));
  }
  if (opts.method === 'POST') {
    const id = 'doc' + (++autoId);
    DB.set(`${path}/${id}`, Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])));
    return json(toDoc(`${path}/${id}`, DB.get(`${path}/${id}`)));
  }
  if (DB.has(path)) return json(toDoc(path, DB.get(path)));
  return json({ error: { status: 'NOT_FOUND' } }, 404);
};

process.env.HOMIE_SECRET = 'test-secret';
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.ANTHROPIC_API_KEY;

const { default: queueHandler } = await import('../../api/outreach/queue.js');
const { default: draftHandler } = await import('../../api/outreach/draft.js');

const call = (handler, method, body, headers = {}, query = {}) => new Promise(resolve => {
  const req = { method, headers, body, query };
  const res = {
    _status: 0,
    setHeader() {},
    status(c) { this._status = c; return this; },
    json(o) { resolve({ status: this._status, body: o }); },
    end() { resolve({ status: this._status, body: null }); },
  };
  handler(req, res);
});
const H = { 'x-homie-secret': 'test-secret' };

const MSG = 'Buongiorno! La contatto per il suo annuncio, che mi interessa molto. Sarebbe possibile una visita? Grazie!';
function seedJob(id, over = {}) {
  DB.set('outreachQueue/' + id, {
    listingId: over.listingId || id.replace(/^out_/, ''),
    sourceUrl: 'https://www.immobiliare.it/annunci/111/',
    portal: 'immobiliare', message: MSG, style: 'sobrio', voice: 'personale',
    status: 'approved', attempts: 0, createdAt: new Date().toISOString(),
    ...over,
  });
}

// ── auth e peek ────────────────────────────────────────────────
{
  const r = await call(queueHandler, 'GET', null, { 'x-homie-secret': 'wrong' });
  ok('coda: segreto sbagliato → 401', r.status === 401);

  seedJob('out_h_1');
  seedJob('out_h_2', { sourceUrl: 'https://www.idealista.it/immobile/222/', portal: 'idealista' });
  const peek = await call(queueHandler, 'GET', null, H, { peek: '1' });
  ok('peek: vede i job SENZA prenderli', peek.body.jobs.length === 2 && DB.get('outreachQueue/out_h_1').status === 'approved', peek.body);
}

// ── lease: mai un doppio invio ─────────────────────────────────
{
  const g1 = await call(queueHandler, 'GET', null, H);
  ok('pull: i job escono e passano a "sending" (lease)', g1.body.jobs.length === 2 && DB.get('outreachQueue/out_h_1').status === 'sending');
  const g2 = await call(queueHandler, 'GET', null, H);
  // MUTAZIONE CHIAVE: due pull ravvicinati non consegnano lo stesso job due volte.
  ok('un secondo pull NON riconsegna gli stessi job', g2.body.jobs.length === 0, g2.body);
}

// ── esiti: sent, l'annuncio si aggiorna da solo ────────────────
{
  DB.set('pfsProperties/h_1', { sourceUrl: 'https://www.immobiliare.it/annunci/111/', price: 1000 });
  const r = await call(queueHandler, 'POST', { results: [{ id: 'out_h_1', ok: true }] }, H);
  ok('esito ok → sent', r.body.recorded.sent === 1 && DB.get('outreachQueue/out_h_1').status === 'sent');
  const outreach = (DB.get('pfsProperties/h_1') || {}).outreach;
  ok('…e la plancia dice la verità da sola (outreach → contattato via portal-chat)',
    outreach && outreach.status === 'contattato' && outreach.channel === 'portal-chat', outreach);
  const hb = DB.get('pfsRadarHealth/contatto');
  ok('il battito è scritto (ok)', hb && hb.ok === true && hb.source === 'contatto', hb);
  const r2 = await call(queueHandler, 'POST', { results: [{ id: 'out_h_1', ok: true }] }, H);
  ok('un doppio esito non riscrive la storia', r2.body.recorded.sent === 0);
}

// ── fallimenti: tre tentativi poi parcheggio ───────────────────
{
  const fail = () => call(queueHandler, 'POST', { results: [{ id: 'out_h_2', ok: false, error: 'campo non trovato' }] }, H);
  await fail();
  ok('1° fallimento → torna in coda con attempts 1', DB.get('outreachQueue/out_h_2').status === 'approved' && DB.get('outreachQueue/out_h_2').attempts === 1);
  await fail(); await fail();
  ok('3° fallimento → parcheggiato (failed), mai ritentato a vuoto', DB.get('outreachQueue/out_h_2').status === 'failed' && DB.get('outreachQueue/out_h_2').attempts === 3);
}

// ── esito incerto: parcheggio IMMEDIATO ────────────────────────
{
  seedJob('out_h_3');
  await call(queueHandler, 'GET', null, H);
  const r = await call(queueHandler, 'POST', { results: [{ id: 'out_h_3', ok: false, error: 'esito_incerto: nessuna conferma visibile' }] }, H);
  // MUTAZIONE CHIAVE: l'incerto non torna MAI in coda — un retry cieco
  // rischia il DOPPIO messaggio allo stesso proprietario.
  ok('esito_incerto → parcheggiato SUBITO al primo colpo', r.body.recorded.parked === 1 && DB.get('outreachQueue/out_h_3').status === 'failed', DB.get('outreachQueue/out_h_3'));
}

// ── blocked: si molla la presa, i job tornano in coda ──────────
{
  seedJob('out_h_4');
  await call(queueHandler, 'GET', null, H);
  ok('(setup) il job è leased', DB.get('outreachQueue/out_h_4').status === 'sending');
  await call(queueHandler, 'POST', { results: [], blocked: true, error: 'captcha sul portale' }, H);
  ok('blocked → il job non tentato torna in coda', DB.get('outreachQueue/out_h_4').status === 'approved');
  const hb = DB.get('pfsRadarHealth/contatto');
  ok('…e il battito dice blocked', hb && hb.blocked === true, hb);
}

// ── lease scaduto: un Mac morto a metà non seppellisce i job ───
{
  DB.set('outreachQueue/out_h_4', { ...DB.get('outreachQueue/out_h_4'), status: 'sending', leaseAt: new Date(Date.now() - 50 * 60e3).toISOString() });
  const g = await call(queueHandler, 'GET', null, H);
  ok('un "sending" orfano oltre il lease torna in giro', g.body.jobs.some(j => j.id === 'out_h_4'), g.body.jobs);
}

// ── giro a vuoto = salute · kill switch = tutto fermo ──────────
{
  await call(queueHandler, 'POST', { results: [], idle: true }, H);
  ok('il battito arriva anche a coda vuota (idle è salute)', DB.get('pfsRadarHealth/contatto').ok === true);

  DB.set('settings/outreach', { enabled: false });
  seedJob('out_h_5');
  const g = await call(queueHandler, 'GET', null, H);
  ok('kill switch: enabled:false, zero job, nessun lease preso',
    g.body.enabled === false && g.body.jobs.length === 0 && DB.get('outreachQueue/out_h_5').status === 'approved');
  DB.delete('settings/outreach');
}

// ── un job manomesso non arriva mai al browser ─────────────────
{
  seedJob('out_h_6', { message: 'Chiamami al 333 1234567 per la casa che mi interessa davvero tanto grazie' });
  const g = await call(queueHandler, 'GET', null, H);
  ok('validazione in uscita: il job col telefono viene parcheggiato, non consegnato',
    !g.body.jobs.some(j => j.id === 'out_h_6') && DB.get('outreachQueue/out_h_6').status === 'failed', DB.get('outreachQueue/out_h_6'));
}

// ── draft: template sempre, AI solo come rifinitura ────────────
{
  const r401 = await call(draftHandler, 'POST', { listingId: 'h_1' }, {});
  ok('draft: senza credenziali → 401', r401.status === 401);
  const r404 = await call(draftHandler, 'POST', { listingId: 'h_manca' }, H);
  ok('draft: annuncio inesistente → 404', r404.status === 404);
  DB.set('pfsProperties/h_9', { title: 'Trilocale Monti', zone: 'Monti', price: 1800, sourceUrl: 'https://www.immobiliare.it/annunci/999/', source: 'immobiliare', advertiser: 'private' });
  const r = await call(draftHandler, 'POST', { listingId: 'h_9', style: 'caloroso', ai: true }, H);
  ok('draft: senza chiave AI si torna al template, mai un errore',
    r.status === 200 && r.body.source === 'template' && r.body.message.includes('Trilocale Monti'), r.body);
}

console.log('\n── B2. Le correzioni della revisione (per mutazione) ─────────');

// ── cancellato = mai consegnato ────────────────────────────────
{
  DB.set('outreachQueue/out_h_5', { ...DB.get('outreachQueue/out_h_5'), status: 'cancelled' });
  const g = await call(queueHandler, 'GET', null, H);
  ok('un job ANNULLATO non esce mai verso il Mac', !g.body.jobs.some(j => j.id === 'out_h_5'));
}

// ── il lease È la consegna: patch fallito = job NON consegnato ─
{
  seedJob('out_h_7', { listingId: 'h_7' });
  DB.set('pfsProperties/h_7', {
    sourceUrl: 'https://www.immobiliare.it/annunci/777/', price: 1200,
    outreach: { status: 'visita_fissata', note: 'vuole referenze, richiamare', contactedAt: '2026-08-10T00:00:00.000Z', by: 'admin' },
  });
  failPatch = { path: 'outreachQueue/out_h_7', times: 2 }; // entrambe le PATCH di fsPatch
  const g = await call(queueHandler, 'GET', null, H);
  // MUTAZIONE CHIAVE (revisione): se il lease non atterra, il job NON parte
  // — consegnarlo comunque = doppio messaggio al giro dopo.
  ok('lease non atterrato → job NON consegnato e ancora approved',
    !g.body.jobs.some(j => j.id === 'out_h_7') && DB.get('outreachQueue/out_h_7').status === 'approved', DB.get('outreachQueue/out_h_7'));
  failPatch = null;
  const g2 = await call(queueHandler, 'GET', null, H);
  ok('…e al giro dopo parte normalmente', g2.body.jobs.some(j => j.id === 'out_h_7'));
}

// ── il merge che non calpesta l'operatore ──────────────────────
{
  await call(queueHandler, 'POST', { results: [{ id: 'out_h_7', ok: true }] }, H);
  const o = DB.get('pfsProperties/h_7').outreach;
  // MUTAZIONE CHIAVE (revisione): la nota e il contactedAt dell'operatore
  // sopravvivono, e uno stato più avanti non retrocede mai a 'contattato'.
  ok('outreach: lo stato AVANTI non retrocede', o.status === 'visita_fissata', o);
  ok('outreach: la nota dell\'operatore sopravvive', o.note === 'vuole referenze, richiamare');
  ok('outreach: contactedAt è write-once', o.contactedAt === '2026-08-10T00:00:00.000Z');
  ok('outreach: il canale nuovo si aggiunge senza cancellare', o.channel === 'portal-chat');
}

// ── l'esito 'sent' che non atterra non sparisce ────────────────
{
  seedJob('out_h_10');
  await call(queueHandler, 'GET', null, H);
  failPatch = { path: 'outreachQueue/out_h_10', times: 2 };
  const r = await call(queueHandler, 'POST', { results: [{ id: 'out_h_10', ok: true }] }, H);
  failPatch = null;
  ok('esito sent non registrato → NON contato come sent, doc resta sending',
    r.body.recorded.sent === 0 && DB.get('outreachQueue/out_h_10').status === 'sending', r.body);
  ok('…e il battito lo DICE (ok:false, esiti non registrati)',
    DB.get('pfsRadarHealth/contatto').ok === false && /NON registrati/.test(DB.get('pfsRadarHealth/contatto').lastError || ''), DB.get('pfsRadarHealth/contatto'));
}

// ── il reclaim CONTA: un lotto che perde sempre i rapporti parcheggia ──
{
  DB.set('outreachQueue/out_h_10', { ...DB.get('outreachQueue/out_h_10'), leaseAt: new Date(Date.now() - 50 * 60e3).toISOString(), attempts: 2 });
  const g = await call(queueHandler, 'GET', null, H);
  // MUTAZIONE CHIAVE (revisione): al 3° reclaim senza rapporto il job si
  // PARCHEGGIA invece di essere reinviato alla cieca per sempre.
  ok('3° lease scaduto senza rapporto → parcheggiato, non reinviato',
    DB.get('outreachQueue/out_h_10').status === 'failed' && !g.body.jobs.some(j => j.id === 'out_h_10'), DB.get('outreachQueue/out_h_10'));
}

// ── --assist vede i parcheggiati ───────────────────────────────
{
  const g = await call(queueHandler, 'GET', null, H, { assist: '1' });
  ok('?assist=1 serve ANCHE i parcheggiati (la promessa del --assist è vera)',
    g.body.jobs.some(j => j.id === 'out_h_10'), g.body.jobs.map(j => j.id));
}

// ── la guardia telefoni conta le CIFRE, non i caratteri ────────
{
  const base = { sourceUrl: 'https://www.immobiliare.it/annunci/1/', portal: 'immobiliare' };
  ok('una DATA nel testo ("dal 01.09.2026") non è un telefono',
    O.validateJob({ ...base, message: 'Buongiorno! Cerco casa in zona, ingresso dal 01.09.2026. Possibile una visita? Grazie!' }).ok === true);
  ok('un numero vero (10 cifre) resta vietato',
    O.validateJob({ ...base, message: 'Sono interessato davvero, richiamami al 333 123 4567 appena puoi, grazie mille!' }).ok === false);
}

console.log('\n── C. Le giunzioni (asserite sulla sorgente) ─────────────────');
{
  const src = p => readFileSync(join(root, p), 'utf8');

  const rules = src('firestore.rules');
  ok('rules: outreachQueue admin-only', /match \/outreachQueue\/\{x\}\s*\{ allow read, write: if isAdmin\(\); \}/.test(rules));

  const cmd = src('pfs-command.html');
  ok('plancia: carica il motore CONDIVISO (outreach-engine)', cmd.includes('js/outreach-engine.js'));
  ok('plancia: ascolta la coda e mostra lo stato vero', cmd.includes("collection('outreachQueue')"));
  ok('plancia: l\'AI rifinisce via /api/outreach/draft', cmd.includes('/api/outreach/draft'));
  ok('plancia: MAI il bottone 📨 sulle AGENZIE (priorità totale al privato)',
    /advKey === 'agency'\) return '';/.test(cmd));
  ok('plancia: MAI il bottone 📨 su fonti senza chat (whatsapp/manual)',
    cmd.includes('OUTREACH_PORTALS.indexOf(p.source) < 0'));
  ok('plancia: il tap scrive status approved con id deterministico (un contatto per annuncio)',
    cmd.includes('BOOM_OUTREACH.outreachKey(p.id)') && cmd.includes("status: 'approved'"));
  ok('plancia: prima di scrivere si RILEGGE il doc da Firestore (mai fidarsi della sola cache)',
    /outreachQueue'\)\.doc\(key\)\.get\(\)/.test(cmd));
  ok('plancia: un job in coda si può ANNULLARE', cmd.includes('cancel-outreach') && cmd.includes("status: 'cancelled'"));

  const queue = src('api/outreach/queue.js');
  ok('coda: esito_incerto parcheggia SUBITO', /esito_incerto/.test(queue) && /uncertain \|\| attempts >= MAX_ATTEMPTS/.test(queue));
  ok('coda: il rapporto è il battito (reportHealth contatto)', queue.includes("reportHealth('contatto'"));

  const searches = src('api/homie/searches.js');
  ok('occhi: la zona PULITA viaggia verso lo Scatto', searches.includes('zoneName'));
  const property = src('api/homie/property.js');
  ok('ingestione: skipFreshHours opt-in per i ri-avvistamenti dello Scatto', property.includes('skipFreshHours'));

  const registry = src('js/squadra-registry.js');
  ok('organigramma: Il Contatto assunto, approvazione SEMPRE', /key: 'contatto'[\s\S]{0,2600}approval: 'sempre'/.test(registry));

  ok('i due bracci esistono coi loro plist e il mandato',
    existsSync(join(root, 'bot/boom_scout.py')) && existsSync(join(root, 'bot/boom_contatto.py'))
    && existsSync(join(root, 'bot/com.boom.scout.plist')) && existsSync(join(root, 'bot/com.boom.contatto.plist'))
    && existsSync(join(root, 'bot/SCATTO_CONTATTO.md')));

  const scout = src('bot/boom_scout.py');
  ok('scout: l\'inserzionista viaggia SEMPRE esplicito (mai il default-private del server)',
    scout.includes("'advertiser': advertiser if advertiser in ('private', 'agency', 'unknown') else 'unknown'"));
  ok('scout: il contatore senza-prezzo è PERSISTITO (pending_urls dal registro)',
    scout.includes('pending_urls(urls, known)'));
  const contatto = src('bot/boom_contatto.py');
  ok('contatto: il testo si incolla INTATTO (fill(message), mai trasformato)',
    contatto.includes('box.fill(message)') && !/message\.replace\(|message\.upper|message\.format/.test(contatto));
  ok('contatto: il rapporto ha lo SPOOL su disco (mai un lotto di esiti perso)',
    contatto.includes('SPOOL_PATH') && contatto.includes('replay_spool'));
  ok('contatto: la conferma esige il DELTA (marker comparso, non preesistente)',
    contatto.includes('confirmation_delta(before, after)'));
  ok('contatto: lock di giro (un --assist manuale non si accavalla a launchd)',
    contatto.includes('acquire_lock'));
}

console.log(`\n  ${passed} passati, ${failed} falliti`);
process.exit(failed ? 1 : 0);
