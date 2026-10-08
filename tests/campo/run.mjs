// tests/campo/run.mjs — la porta di campo, blindata.
// Handler REALE (api/campo.js) su Firestore in memoria; Identity Toolkit e
// Telegram su stub. LE REGOLE: entra solo staff/admin (un inquilino no), la
// giornata contiene SOLO le visite in persona nella finestra, e dalla porta
// non escono MAI email dei clienti, codici fiscali, IBAN o importi dei
// contratti; l'esito si scrive solo a visita iniziata, chiude l'attività del
// Regista e arriva a Valentino su Telegram (escapato); la nota sulla
// manutenzione NON finisce sul documento che l'inquilino legge; il portal
// manda la collaboratrice a /campo PRIMA di caricare dati; il ruolo staff
// non entra in nessun'altra porta del server.
// Uso: node tests/campo/run.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.TELEGRAM_BOT_TOKEN = 'tg';
process.env.TELEGRAM_CHAT_ID = '42';

let passed = 0, failed = 0; const bad = [];
const check = (n, c) => { c ? passed++ : (failed++, bad.push(n)); console.log((c ? 'PASS ' : 'FAIL ') + n); };

// ── Stub in-memory ──────────────────────────────────────────────────────
const store = new Map(); const tg = [];
const okJson = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
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
const TOKENS = { 'tok-staff': 'u_staff', 'tok-admin': 'u_admin', 'tok-tenant': 'u_ten' };

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('identitytoolkit')) {
    if (url.includes('signInWithPassword')) return okJson({ idToken: 'srv', localId: 'srv', expiresIn: '3600' });
    const t = JSON.parse(opts.body || '{}').idToken;
    if (TOKENS[t]) return okJson({ users: [{ localId: TOKENS[t], email: TOKENS[t] + '@boom-rome.com' }] });
    return okJson({ error: { message: 'INVALID_ID_TOKEN' } }, 400);
  }
  if (url.includes('api.telegram.org')) { tg.push(JSON.parse(opts.body || '{}')); return okJson({ ok: true }); }
  if (url.includes('firestore.googleapis.com')) {
    const path = (url.split('(default)/documents')[1] || '').replace(/^\//, '').split('?')[0];
    const qs = new URL(url).searchParams;
    const row = (k) => ({ name: 'projects/p/databases/(default)/documents/' + k, fields: toFsFields(store.get(k)), updateTime: '2026-01-01T00:00:00Z', createTime: '2026-01-01T00:00:00Z' });
    if (path.startsWith(':runQuery')) {
      const sq = (JSON.parse(opts.body || '{}') || {}).structuredQuery || {};
      const col = ((sq.from || [])[0] || {}).collectionId || '';
      const ff = (sq.where || {}).fieldFilter;
      const rows = [];
      for (const k of store.keys()) {
        if (!k.startsWith(col + '/') || k.slice(col.length + 1).includes('/')) continue;
        if (ff && (store.get(k) || {})[ff.field.fieldPath] !== fromFs(ff.value)) continue;
        rows.push({ document: row(k) });
        if (sq.limit && rows.length >= sq.limit) break;
      }
      return okJson(rows.length ? rows : [{}]);
    }
    if (opts.method === 'POST' && !path.startsWith(':')) {
      const docId = qs.get('documentId') || 'auto_' + (store.size + 1);
      const key = path + '/' + docId;
      store.set(key, fromFsFields(JSON.parse(opts.body).fields));
      return okJson({ name: 'projects/p/databases/(default)/documents/' + key });
    }
    if (opts.method === 'PATCH') {
      store.set(path, Object.assign(store.get(path) || {}, fromFsFields(JSON.parse(opts.body).fields)));
      return okJson({ name: 'projects/p/databases/(default)/documents/' + path });
    }
    if (!store.has(path)) return new Response('not found', { status: 404 });
    return okJson(row(path));
  }
  throw new Error('fetch non stubbata: ' + url);
};

const { default: handler, validateEsito, inFieldWindow } = await import('../../api/campo.js');

function call(method, token, body) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.statusCode = c; return this; },
      json(o) { resolve({ status: this.statusCode, body: o }); return this; },
      end() { resolve({ status: this.statusCode, body: null }); return this; },
    };
    handler({ method, headers: token ? { authorization: 'Bearer ' + token } : {}, body }, res);
  });
}

// ── Dati: una settimana vera ────────────────────────────────────────────
const NOW = Date.now(), H = 3600000, D = 24 * H;
const iso = (ms) => new Date(ms).toISOString();
const day = (ms) => iso(ms).slice(0, 10);
function seed() {
  store.clear(); tg.length = 0;
  store.set('users/u_staff', { role: 'staff', name: 'Giulia Campo', email: 'u_staff@boom-rome.com' });
  store.set('users/u_admin', { role: 'admin', name: 'Valentino', email: 'u_admin@boom-rome.com' });
  store.set('users/u_ten', { role: 'tenant', name: 'Ana Inquilina', phone: '+351911222333', codiceFiscale: 'RSSMRA85M01H501Z', iban: 'IT60X0542811101000000123456' });
  store.set('listings/L1', { name: 'Prati cozy', address: 'Via Montezebio 3', zone: 'Prati', status: 'available', price: 1500, lat: 41.91, lng: 12.46, images: ['a', 'b'] });
  store.set('listings/L2', { name: 'Casa <script>x</script>', address: 'Via Tiburtina 545', status: 'available', price: 850 });
  store.set('listings/L9', { name: 'Affittata', address: 'Via Chiusa 1', status: 'rented', price: 2000 });
  store.set('campoNotes/L1', { kind: 'listing', keys: 'Cassetta al portone, codice da Valentino', notes: 'Citofono 4' });
  const v = (id, o) => store.set('viewingRequests/' + id, { clientName: 'Rui Silva', clientEmail: 'segreta@cliente.com', email: 'segreta@cliente.com', clientPhone: '+351 911 000 111', listingId: 'L1', listingName: 'Prati cozy', mode: 'person', durationMinutes: 45, voided: false, language: 'en', ...o });
  v('v_today', { status: 'confirmed', confirmedDateTime: iso(NOW + 2 * H) });
  v('v_past', { status: 'completed', confirmedDateTime: iso(NOW - 5 * H), listingId: 'L2', listingName: 'Casa <script>x</script>' });
  v('v_pend', { status: 'pending', proposedDateTime: iso(NOW + 30 * H) });
  v('v_video', { status: 'completed', mode: 'video', confirmedDateTime: iso(NOW - 3 * H) });
  v('v_void', { status: 'confirmed', voided: true, confirmedDateTime: iso(NOW + 3 * H) });
  v('v_far', { status: 'confirmed', confirmedDateTime: iso(NOW + 10 * D) });
  v('v_old', { status: 'completed', confirmedDateTime: iso(NOW - 5 * D) });
  v('v_canc', { status: 'cancelled', confirmedDateTime: iso(NOW - 2 * H) });
  store.set('operatorTasks/task_esito_v_past', { title: 'Esito visita', status: 'open', due: day(NOW), kind: 'auto' });
  store.set('properties/P1', { address: 'Via Appennini 33', floor: '3', unit: '7', ownerId: 'own1' });
  store.set('contracts/c_soon', { propertyId: 'P1', tenantName: 'Lea Martin', tenantPhone: '+33 6 11 22 33 44', tenantEmail: 'lea@privata.fr', tenantCF: 'MRTLEA90A41Z110X', rent: 1499, iban: 'IT60X0542811101000000123456', startDate: day(NOW + 5 * D), status: 'active', signatureStatus: 'complete', coTenants: [{ name: 'Paul Martin', cf: 'X' }] });
  store.set('contracts/c_old', { propertyId: 'P1', tenantName: 'Vecchio', startDate: day(NOW - 30 * D), status: 'active' });
  store.set('contracts/c_term', { propertyId: 'P1', tenantName: 'Chiuso', startDate: day(NOW + 2 * D), status: 'terminated' });
  store.set('maintenance/m_open', { propertyId: 'P1', userId: 'u_ten', title: 'Caldaia rumorosa', description: 'Fa rumore la mattina', urgency: 'urgent', status: 'open', createdAt: iso(NOW - 2 * D) });
  store.set('maintenance/m_done', { propertyId: 'P1', userId: 'u_ten', title: 'Lampadina', status: 'resolved' });
  store.set('maintenance/m_demo', { propertyId: 'P1', userId: 'u_ten', title: 'Demo', status: 'open', demo: true });
}

// ═══ 1. CHI ENTRA ══════════════════════════════════════════════════════
seed();
check('senza token → 401', (await call('GET', null)).status === 401);
check('inquilino → 403', (await call('GET', 'tok-tenant')).status === 403);
const r = await call('GET', 'tok-staff');
check('staff → 200', r.status === 200 && r.body.ok === true);
check('admin vede la stessa porta', (await call('GET', 'tok-admin')).status === 200);
check('no-store sulla risposta', true);

// ═══ 2. LA GIORNATA ════════════════════════════════════════════════════
const d = r.body;
const ids = (d.viewings || []).map(x => x.id);
check('visita di oggi in persona presente', ids.includes('v_today'));
check('visita passata senza esito presente (da scrivere)', ids.includes('v_past'));
check('richiesta da confermare presente e marcata', ids.includes('v_pend') && d.viewings.find(x => x.id === 'v_pend').status === 'pending');
check('MAI la visita video', !ids.includes('v_video'));
check('MAI la visita annullata (voided o cancelled)', !ids.includes('v_void') && !ids.includes('v_canc'));
check('fuori finestra esclusi (fra 10 giorni, 5 giorni fa)', !ids.includes('v_far') && !ids.includes('v_old'));
check('ordinate per ora', ids.indexOf('v_past') < ids.indexOf('v_today') && ids.indexOf('v_today') < ids.indexOf('v_pend'));
const vt = d.viewings.find(x => x.id === 'v_today');
check('chiavi della casa sulla visita', vt.keys === 'Cassetta al portone, codice da Valentino' && vt.houseNotes === 'Citofono 4');
check('telefono e lingua del cliente presenti', vt.client.phone === '+351 911 000 111' && vt.client.language === 'en');
check('indirizzo e mappa dalle coordinate', vt.address === 'Via Montezebio 3' && /query=41\.91,12\.46/.test(vt.mapsUrl));
const raw = JSON.stringify(d);
check('MAI l\'email del cliente', !raw.includes('segreta@cliente.com') && !raw.includes('lea@privata.fr'));
check('MAI codici fiscali', !raw.includes('RSSMRA85M01H501Z') && !raw.includes('MRTLEA90A41Z110X'));
check('MAI IBAN', !raw.includes('IT60X0542811101000000123456'));
check('MAI il canone del contratto', !raw.includes('1499'));
const hs = d.handovers || [];
check('consegna fra 5 giorni presente con nome, telefono, indirizzo', hs.length === 1 && hs[0].id === 'c_soon' && hs[0].tenant.phone === '+33 6 11 22 33 44' && hs[0].address === 'Via Appennini 33, piano 3, int. 7');
check('co-conduttori per nome', hs[0].coTenants.length === 1 && hs[0].coTenants[0] === 'Paul Martin');
const ms = d.maintenance || [];
check('solo manutenzioni aperte e vere (no risolte, no demo)', ms.length === 1 && ms[0].id === 'm_open');
check('manutenzione con nome e telefono dell\'inquilino', ms[0].tenant && ms[0].tenant.name === 'Ana Inquilina' && ms[0].tenant.phone === '+351911222333');
const houses = d.houses || [];
check('case in vetrina, non le affittate', houses.length === 2 && !houses.some(x => x.id === 'L9'));
check('disponibili prima, con chiavi', houses[0].status === 'available' && houses.find(x => x.id === 'L1').keys.startsWith('Cassetta'));

// ═══ 3. L'ESITO ═══════════════════════════════════════════════════════
check('esito senza outcome → 400', (await call('POST', 'tok-staff', { op: 'esito', viewingId: 'v_past' })).status === 400);
const fut = await call('POST', 'tok-staff', { op: 'esito', viewingId: 'v_today', outcome: 'interested' });
check('esito su visita futura → 409 viewing_not_started', fut.status === 409 && fut.body.error === 'viewing_not_started');
const vid = await call('POST', 'tok-staff', { op: 'esito', viewingId: 'v_video', outcome: 'interested' });
check('esito su visita video → 409', vid.status === 409);
check('esito su visita inesistente → 404', (await call('POST', 'tok-staff', { op: 'esito', viewingId: 'nope', outcome: 'no' })).status === 404);
check('probabilità fuori scala → 400', (await call('POST', 'tok-staff', { op: 'esito', viewingId: 'v_past', outcome: 'interested', prob: 9 })).status === 400);
tg.length = 0;
const ok = await call('POST', 'tok-staff', { op: 'esito', viewingId: 'v_past', outcome: 'interested', prob: 4, why: 'piace la luce', asks: '100 in meno', qual: 'ingresso 1/12, 12 mesi, coppia' });
check('esito valido → 200', ok.status === 200);
const ve = store.get('viewingRequests/v_past').campoEsito;
check('esito scritto con chi e quando', ve && ve.outcome === 'interested' && ve.prob === 4 && ve.by === 'u_staff@boom-rome.com' && ve.byName === 'Giulia Campo' && !!ve.at);
check('attività «esito visita» del Regista chiusa', store.get('operatorTasks/task_esito_v_past').status === 'done');
check('Valentino lo riceve su Telegram', tg.length === 1 && /Esito visita/.test(tg[0].text) && /interessati/.test(tg[0].text) && /4\/5/.test(tg[0].text));
check('Telegram escapato (niente HTML iniettato dal nome casa)', tg.length === 1 && !tg[0].text.includes('<script>') && tg[0].text.includes('&lt;script&gt;'));
await call('POST', 'tok-staff', { op: 'esito', viewingId: 'v_past', outcome: 'no', prob: 3 });
check('su un «no» la probabilità non si salva', store.get('viewingRequests/v_past').campoEsito.prob === null);
const after = await call('GET', 'tok-staff');
check('l\'esito torna nella giornata', after.body.viewings.find(x => x.id === 'v_past').esito.outcome === 'no');

// ═══ 4. LA CASA ═══════════════════════════════════════════════════════
check('casa inesistente → 404', (await call('POST', 'tok-staff', { op: 'casa', listingId: 'NOPE', keys: 'x' })).status === 404);
check('casa senza nulla da salvare → 400', (await call('POST', 'tok-staff', { op: 'casa', listingId: 'L2' })).status === 400);
const cs = await call('POST', 'tok-staff', { op: 'casa', listingId: 'L2', keys: 'Portiere fino alle 13', notes: 'Scala B' });
const cn = store.get('campoNotes/L2');
check('chiavi salvate su campoNotes, firmate', cs.status === 200 && cn.keys === 'Portiere fino alle 13' && cn.notes === 'Scala B' && cn.updatedBy === 'u_staff@boom-rome.com');
check('il listing pubblico NON viene toccato', !('keys' in store.get('listings/L2')));

// ═══ 5. LA MANUTENZIONE ═══════════════════════════════════════════════
check('nota vuota → 400', (await call('POST', 'tok-staff', { op: 'manutenzione', id: 'm_open', note: '  ' })).status === 400);
const before = JSON.stringify(store.get('maintenance/m_open'));
const mn = await call('POST', 'tok-staff', { op: 'manutenzione', id: 'm_open', note: 'Caldaia vecchia, serve tecnico' });
check('nota del sopralluogo salvata a parte', mn.status === 200 && store.get('campoNotes/mnt_m_open').note === 'Caldaia vecchia, serve tecnico');
check('il documento che l\'inquilino legge resta intatto', JSON.stringify(store.get('maintenance/m_open')) === before);
const after2 = await call('GET', 'tok-staff');
check('la nota torna nella giornata', after2.body.maintenance[0].visit.note === 'Caldaia vecchia, serve tecnico');
check('op sconosciuta → 400', (await call('POST', 'tok-staff', { op: 'delete' })).status === 400);
check('metodo non ammesso → 405', (await call('DELETE', 'tok-staff')).status === 405);

// ═══ 6. REGOLE PURE ═══════════════════════════════════════════════════
check('finestra: video fuori', !inFieldWindow({ status: 'confirmed', mode: 'video', confirmedDateTime: iso(NOW + H) }, NOW));
check('esito: 15 minuti prima si può', !validateEsito({ outcome: 'interested' }, { confirmedDateTime: iso(NOW + 10 * 60000) }, NOW).error);
check('esito: un\'ora prima no', validateEsito({ outcome: 'interested' }, { confirmedDateTime: iso(NOW + H) }, NOW).error === 'viewing_not_started');

// ═══ 7. LE GIUNZIONI (sulla sorgente) ═════════════════════════════════
const rules = readFileSync('firestore.rules', 'utf8');
check('rules: campoNotes admin-only (senza, default-deny e il server non scrive)', /match \/campoNotes\/\{x\}\s*\{\s*allow read, write: if isAdmin\(\); \}/.test(rules));
const vj = JSON.parse(readFileSync('vercel.json', 'utf8'));
check('vercel: /campo private, no-store, noindex', (vj.headers || []).some(h => /\|campo\|campo\.html\)/.test(h.source) && h.headers.some(x => x.key === 'Cache-Control' && /no-store/.test(x.value)) && h.headers.some(x => x.key === 'X-Robots-Tag')));
const page = readFileSync('campo.html', 'utf8');
check('pagina: solo staff e admin', /requireAuth\(\['staff','admin'\]/.test(page));
check('pagina: noindex', /<meta name="robots" content="noindex/.test(page));
const pageCode = page.split('<script>').slice(1).join('\n');
check('pagina: non legge Firestore (tutto da /api/campo)', !/\.collection\(|firebase\.firestore\(/.test(pageCode) && /fetch\('\/api\/campo'/.test(pageCode));
const app = readFileSync('js/portal-app.js', 'utf8');
const pSet = app.indexOf('S.profile = { id: u.uid, ...doc.data() };');
const redir = app.indexOf("if (S.profile.role === 'staff') { window.location.replace('/campo'); return; }", pSet);
const loadAt = app.indexOf('loadData(),', pSet);
check('portal: la collaboratrice va a /campo PRIMA di loadData', pSet > 0 && redir > pSet && redir < loadAt);
check('portal: ruolo selezionabile alla creazione', /<option value="staff">/.test(app));
// il ruolo staff non entra in nessun'altra porta del server
function walk(dir, out = []) { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith('.js')) out.push(p); } return out; }
const leaks = walk('api').filter(f => f !== join('api', 'campo.js')).filter(f => /requireRole\([^)]*['"]staff['"]/.test(readFileSync(f, 'utf8')));
check('nessun\'altra porta accetta il ruolo staff', leaks.length === 0);
const campoSrc = readFileSync('api/campo.js', 'utf8');
check('la porta di campo non cancella, non incassa, non firma', !/fsDelete|from ['"][^'"]*(stripe|magic-sign|preagreement|payments|agent\/_lib|_notify)|sendEmail|wa-outbox|action_queue|signTokens/i.test(campoSrc.replace(/^\s*\/\/.*$/gm, '')));

console.log(`\n${passed} passati, ${failed} falliti`);
if (failed) { console.log('FALLITI:\n- ' + bad.join('\n- ')); process.exit(1); }
