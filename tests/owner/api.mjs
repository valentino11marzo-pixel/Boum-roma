// tests/owner/api.mjs — GET /api/owner/archivio, l'handler VERO.
//
// Si guida api/owner/archivio.js su un Firestore in memoria e uno Storage
// finto (tests/owner/_harness.mjs): si finge SOLO la rete. Ogni chiamata non
// prevista lancia e resta scritta in h.unexpected — un test che passa dopo
// aver contattato un host sconosciuto è cieco, quindi si controlla sempre.
// L'orologio è fermo al 22/09/2026 10:42 di Roma (lo stesso delle fixtures):
// il verdetto dipende da «oggi», e un test non deve cambiare esito col
// calendario.
//
// Le regole delicate sono state provate PER MUTAZIONE (rimesso il difetto,
// il controllo è diventato rosso, ripristinato): `as` onorato per un
// landlord · timbro di prima apertura anche per l'admin · tetto senza
// `truncated:` · rate cercate solo per immobile (niente IN sui contratti) ·
// Cache-Control tolto · assertClean saltato.
// L'ultima porta (23/09): da quando scrubText neutralizza `?token=` col suo
// valore, un record avvelenato non la raggiunge più; il test avvolge
// OWNER.build (la cucitura che l'handler chiama per proprietà) e pianta
// URL di Storage + token, CF ed email nella proiezione. Mutazioni: assertClean
// saltato · log senza percorso · archivio nel corpo del 500 — tutte rosse.
//
//   node tests/owner/api.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHarness } from './_harness.mjs';
import { seedFor, projection, POISON, NOW, OWNER_UID, OTHER_UID, ADMIN_UID, su, OWNER } from './fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let passed = 0, failed = 0; const bad = [];
function ok(name, cond) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; bad.push(name); console.log('  ✗ ' + name); }
}
function section(t) { console.log('\n' + t); }

// ── L'orologio fermo (come la rete: si finge, non si aggira) ─────────────
const RealDate = Date;
function freezeClock(at) {
  const T = at instanceof RealDate ? at.getTime() : RealDate.parse(at);
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(T); else super(...a); }
    static now() { return T; }
  }
  globalThis.Date = FakeDate;
  return () => { globalThis.Date = RealDate; };
}

// ── I log: mai un contenuto ───────────────────────────────────────────────
const LOGS = [];
const orig = { log: console.log, warn: console.warn, error: console.error };
function captureLogs() {
  for (const k of ['warn', 'error']) console[k] = (...a) => { LOGS.push(a.map(String).join(' ')); };
  console.log = (...a) => { const s = a.map(String).join(' '); if (s.startsWith('[owner/')) LOGS.push(s); else orig.log(...a); };
}
function releaseLogs() { Object.assign(console, orig); }

// L'ambiente va installato PRIMA di importare l'handler (FS_BASE e la chiave
// si leggono al caricamento del modulo).
const boot = createHarness({ seed: seedFor('ok') });
const unboot = boot.install();
const { default: archivio } = await import('../../api/owner/archivio.js');
unboot();

const unclock = freezeClock(NOW);
captureLogs();

// Un giro: harness fresco, chiamata all'handler, h per le verifiche.
async function run({ seed, files, mutateSeed, wrapFetch, ...reqOpts }) {
  const s = seed || seedFor('ok');
  if (mutateSeed) mutateSeed(s);
  const h = createHarness({ seed: s, files: files || {} });
  const un = h.install();
  if (wrapFetch) { const inner = globalThis.fetch; globalThis.fetch = (u, o) => wrapFetch(u, o || {}, inner); }
  try { const res = await h.call(archivio, { method: 'GET', ...reqOpts }); return { h, res }; }
  finally { un(); }
}
const bodyStr = (res) => JSON.stringify(res.body);
const noPoison = (s) => POISON.every((p) => !s.includes(p));
const refsOf = (a) => new Set(a.archive.filter((x) => x.ref).map((x) => x.ref));
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const RENDICONTO_08 = { ['rendiconti/' + OWNER_UID + '/rendiconto_2026-08.pdf']: { bytes: Buffer.from('%PDF-rendiconto'), contentType: 'application/pdf' } };
const isRunQueryOn = (u, o, col) => String(u).includes(':runQuery') && typeof o.body === 'string' && o.body.includes('"collectionId":"' + col + '"');

try {
  section('La porta: chi entra e chi no');
  {
    const { h, res } = await run({});
    ok('senza token → 401 invalid_or_expired_token', res.statusCode === 401 && res.body.error === 'invalid_or_expired_token' && !h.unexpected.length);
  }
  {
    const { res } = await run({ uid: 't1' });
    ok('un conduttore → 403 forbidden', res.statusCode === 403 && res.body.error === 'forbidden');
  }
  {
    const { res } = await run({ uid: ADMIN_UID });
    ok('admin senza ?as → 400 as_required', res.statusCode === 400 && res.body.error === 'as_required');
  }
  {
    const { res } = await run({ uid: ADMIN_UID, query: { as: '../x' } });
    const r2 = (await run({ uid: ADMIN_UID, query: { as: 'a/b' } })).res;
    ok('admin con ?as di forma sbagliata → 400 bad_as', res.statusCode === 400 && res.body.error === 'bad_as' && r2.statusCode === 400 && r2.body.error === 'bad_as');
  }
  {
    const { res, h } = await run({ uid: ADMIN_UID, query: { as: 'nessuno' } });
    ok('admin con ?as senza immobili né profilo → 404 owner_not_found', res.statusCode === 404 && res.body.error === 'owner_not_found' && !h.unexpected.length);
  }
  {
    const { res } = await run({ uid: ADMIN_UID, query: { as: 'ghost_owner' },
      mutateSeed: (s) => { s['properties/p_ghost'] = { ownerId: 'ghost_owner', name: 'Via Nomentana 5', address: 'Via Nomentana 5, Roma', status: 'vacant', ownerName: 'Luca Neri' }; } });
    const a = res.body.archive;
    ok('admin «vedi come» su un ownerId penzolante (nessun profilo, un immobile) → 200, niente 409 not_a_landlord (ERRATA E5)',
      res.statusCode === 200 && a.viewAs === true && a.properties.length === 1 && a.properties[0].id === 'p_ghost' && a.owner.name === 'Luca Neri');
  }
  {
    const { res } = await run({ uid: OWNER_UID, query: { as: OTHER_UID } });
    const a = res.body.archive;
    ok('un landlord con ?as=<altro> vede il PROPRIO archivio (as ignorato)', res.statusCode === 200 && a.viewAs === false
      && a.properties.map((p) => p.id).join() === 'p1' && !bodyStr(res).includes('Via Giulia'));
  }
  {
    const r1 = (await run({ uid: OWNER_UID, method: 'POST' })).res;
    const r2 = (await run({ uid: OWNER_UID, method: 'OPTIONS' })).res;
    ok('POST → 405; OPTIONS → 204', r1.statusCode === 405 && r2.statusCode === 204);
  }

  section('La proiezione: solo ciò che è suo, niente veleno');
  {
    const { h, res } = await run({ uid: OWNER_UID, files: RENDICONTO_08,
      mutateSeed: (s) => {
        // Un contratto sull'immobile di UN ALTRO proprietario, carico di veleno riconoscibile.
        s['contracts/c_x'] = { propertyId: 'p_other', status: 'active', tenantName: 'Zeta Estraneo', tenantEmail: 'zeta@altro.it',
          signedPdfUrl: su('contracts/c_x/contratto-firmato.pdf'), startDate: '2026-01-01', endDate: '2026-12-31', rent: 999 };
        s['payments/pay_c_x_2026-09'] = { contractId: 'c_x', propertyId: 'p_other', amount: 999, status: 'pending', dueDate: '2026-09-05', month: '2026-09' };
      } });
    const a = res.body.archive, s = bodyStr(res);
    ok('200 { ok:true, archive }', res.statusCode === 200 && res.body.ok === true && a && a.v === 1);
    ok('Cache-Control: private, no-store', /private/.test(res.getHeader('cache-control')) && /no-store/.test(res.getHeader('cache-control')));
    ok('due proprietari a sistema: SOLO i suoi immobili, niente del vicino', a.properties.map((p) => p.id).join() === 'p1'
      && !s.includes('Via Giulia') && !s.includes('Zeta Estraneo') && !s.includes('c_x') && !s.includes('zeta@altro.it'));
    ok('nessuna stringa velenosa nel corpo (email, telefono, CF, token, IBAN, margini, URL Storage)', noPoison(s));
    ok('assertClean sulla risposta: ok', OWNER.assertClean(a).ok === true);
    ok('nessun URL tokenizzato, da nessuna parte', !/token=|firebasestorage|pay\.stripe/.test(s));
    ok('nessuna chiamata di rete non prevista', h.unexpected.length === 0);
    ok('nessuna lettura fuori dal perimetro (users di altri, contracts senza filtro)',
      !h.fetchLog.some((e) => /documents\/users\/(t1|own_2)\b/.test(e.url)));
    ok('il verdetto dello scenario «ok»: ' + a.verdict.state, a.verdict.state === projection('ok').verdict.state);
    ok('il landlord non riceve adminNotes', !('adminNotes' in a));
  }

  section('Il caricatore porta al motore TUTTO ciò che serve (stesso esito del motore sugli stessi dati)');
  for (const name of ['ok', 'osservo', 'nonso', 'tu', 'renewal', 'rooms', 'paper']) {
    const { res, h } = await run({ uid: OWNER_UID, seed: seedFor(name), files: RENDICONTO_08 });
    const want = projection(name, { mutate: (inp) => { inp.rendicontiFiles = {}; } });
    const got = res.body.archive;
    const wantRefs = refsOf(want), gotRefs = refsOf(got);
    ok(`«${name}»: verdetto ${got && got.verdict.state}, stessi file in archivio (${gotRefs.size}), stessi «da fare»`,
      res.statusCode === 200 && got.verdict.state === want.verdict.state && sameSet(wantRefs, gotRefs)
      && got.todo.map((t) => t.id).join() === want.todo.map((t) => t.id).join() && !h.unexpected.length && noPoison(bodyStr(res)));
  }
  {
    // Rate senza propertyId (pay_<cid>_<mese>): si ritrovano SOLO con l'IN sui contratti.
    const { res } = await run({ uid: OWNER_UID, seed: seedFor('osservo'),
      mutateSeed: (s) => { Object.keys(s).filter((k) => k.startsWith('payments/')).forEach((k) => { delete s[k].propertyId; }); } });
    const a = res.body.archive;
    ok('rate senza propertyId ritrovate col contratto (IN a blocchi): osservo, rata in ritardo', res.statusCode === 200
      && a.verdict.state === 'osservo' && a.verdict.reasons.some((r) => r.code === 'rent_overdue') && a.properties[0].year.paidCount > 0);
  }
  {
    // 11 contratti = due blocchi IN (10 + 1): la rata dell'undicesimo c'è.
    const ins = [];
    const { res } = await run({ uid: OWNER_UID, mutateSeed: (s) => {
      for (let i = 0; i < 11; i++) s[`contracts/cz${String(i).padStart(2, '0')}`] = { propertyId: 'p1', status: 'terminated', startDate: '2020-01-01', endDate: '2020-12-31' };
      s['payments/pay_cz10_2026-09'] = { contractId: 'cz10', amount: 50, status: 'pending', dueDate: '2026-09-05', month: '2026-09', type: 'extra' };
    }, wrapFetch: (u, o, inner) => {
      if (isRunQueryOn(u, o, 'payments') && o.body.includes('"op":"IN"')) ins.push(JSON.parse(o.body).structuredQuery.where.fieldFilter.value.arrayValue.values.length);
      return inner(u, o);
    } });
    ok('IN a blocchi da 10: 12 contratti = blocchi [10, 2], la rata dell\'undicesimo arriva', res.statusCode === 200
      && ins.sort((a, b) => b - a).join() === '10,2' && res.body.archive.properties[0].others.some((r) => r.id === 'pay_cz10_2026-09'));
  }

  section('Nessuna troncatura muta, nessuna lettura persa in silenzio');
  {
    const { res } = await run({ uid: OWNER_UID, wrapFetch: (u, o, inner) => (isRunQueryOn(u, o, 'payments')
      ? Promise.resolve(new Response('{"error":{"status":"UNAVAILABLE"}}', { status: 503 })) : inner(u, o)) });
    const a = res.body.archive;
    ok('la query delle rate fallisce → 200, «non posso dirlo», read_partial, meta.partial = read:payments',
      res.statusCode === 200 && a.verdict.state === 'nonso' && a.verdict.reasons.some((r) => r.code === 'read_partial')
      && a.meta.partial.includes('read:payments'));
  }
  {
    const { res } = await run({ uid: OWNER_UID, mutateSeed: (s) => {
      for (let i = 0; i < 300; i++) s[`maintenance/m${String(i).padStart(3, '0')}`] = { propertyId: 'p1', category: 'other', title: 'x', status: 'resolved', createdAt: '2025-01-01T10:00:00Z' };
    } });
    const a = res.body.archive;
    ok('300 interventi = il tetto → truncated:maintenance, «non posso dirlo» (ERRATA E1.3)', res.statusCode === 200
      && a.meta.partial.includes('truncated:maintenance') && a.verdict.state === 'nonso');
  }
  {
    const { res } = await run({ uid: OWNER_UID, mutateSeed: (s) => {
      for (let i = 0; i < 51; i++) s[`properties/pp${String(i).padStart(2, '0')}`] = { ownerId: OWNER_UID, name: 'Casa ' + i, status: 'vacant' };
    } });
    const a = res.body.archive;
    ok('oltre 50 immobili: 50 in pagina e truncated:properties dichiarato', res.statusCode === 200
      && a.properties.length === 50 && a.meta.partial.includes('truncated:properties') && a.verdict.state === 'nonso');
  }
  {
    const { res } = await run({ uid: OWNER_UID, wrapFetch: (u, o, inner) => (isRunQueryOn(u, o, 'properties')
      ? Promise.resolve(new Response('{}', { status: 500 })) : inner(u, o)) });
    ok('la lista degli immobili fallisce → 500 read_failed (non un archivio vuoto spacciato per vero)', res.statusCode === 500 && res.body.error === 'read_failed');
  }

  section('I rendiconti: il marcatore dice «spedito», solo Storage dice «c\'è»');
  {
    const { res } = await run({ uid: OWNER_UID, files: RENDICONTO_08,
      wrapFetch: (u, o, inner) => (String(u).includes(encodeURIComponent('rendiconto_2026-06.pdf'))
        ? Promise.resolve(new Response('{}', { status: 500 })) : inner(u, o)) });
    const rs = res.body.archive.archive.filter((x) => x.kind === 'rendiconto');
    const by = (m) => rs.find((x) => x.ref === `r:${OWNER_UID}:${m}`) || {};
    ok('agosto: il PDF c\'è → file:true', by('2026-08').file === true && by('2026-08').note === null);
    ok('luglio: marcatore senza oggetto → note:not_generated, file:false', by('2026-07').file === false && by('2026-07').note === 'not_generated');
    ok('giugno: metadati in errore → non verificato, file:true (la verità la dice il file)', by('2026-06').file === true && by('2026-06').note === null);
  }
  {
    const { h, res } = await run({ uid: OWNER_UID, files: RENDICONTO_08 });
    const metas = h.fetchLog.filter((e) => e.kind === 'storage');
    ok('i metadati si chiedono PER PERCORSO col Bearer admin, mai con un token', res.statusCode === 200 && metas.length === 3
      && metas.every((e) => e.auth === 'Bearer ADMIN_TOKEN' && !e.url.includes('token=') && e.url.includes('/o/rendiconti%2F')));
  }

  section('La prima apertura: un timbro e una notifica, una volta sola, mai in «vedi come»');
  {
    const s = seedFor('ok');
    const h = createHarness({ seed: s, files: RENDICONTO_08 });
    const un = h.install();
    try {
      const r1 = await h.call(archivio, { method: 'GET', uid: OWNER_UID });
      const u = h.DB.get('users/' + OWNER_UID), n = h.DB.get('agentNotifications/owner_activated_' + OWNER_UID);
      ok('prima chiamata del landlord: users.ownerPortalFirstAt timbrato', r1.statusCode === 200 && typeof u.ownerPortalFirstAt === 'string');
      ok('prima chiamata: agentNotifications/owner_activated_<uid> (pending, high, owner.activated)', !!n && n.status === 'pending'
        && n.priority === 'high' && n.type === 'owner.activated' && n.payload.uid === OWNER_UID && n.payload.properties === 1
        && n.dedupKey === 'owner-activated-' + OWNER_UID && /archivio/.test(n.summary) && noPoison(JSON.stringify(n)));
      const snap = h.snapshot();
      const r2 = await h.call(archivio, { method: 'GET', uid: OWNER_UID });
      ok('seconda chiamata: 200 e NESSUNA scrittura', r2.statusCode === 200 && h.diff(snap).length === 0);
    } finally { un(); }
  }
  {
    const h = createHarness({ seed: seedFor('ok'), files: RENDICONTO_08 });
    const un = h.install();
    try {
      const snap = h.snapshot();
      const r = await h.call(archivio, { method: 'GET', uid: ADMIN_UID, query: { as: OWNER_UID } });
      ok('l\'admin in «vedi come» non timbra e non notifica: zero scritture', r.statusCode === 200 && h.diff(snap).length === 0);
      const a = r.body.archive;
      ok('«vedi come»: viewAs true e adminNotes presenti (cosa è nascosto e perché)', a.viewAs === true && a.adminNotes
        && Array.isArray(a.adminNotes.hidden) && a.adminNotes.hidden.some((x) => x.kind === 'identity'));
    } finally { un(); }
  }
  {
    const { res } = await run({ uid: OWNER_UID, wrapFetch: (u, o, inner) => (String(u).includes('agentNotifications')
      ? Promise.resolve(new Response('{"error":{}}', { status: 500 })) : inner(u, o)) });
    ok('la notifica fallisce → l\'archivio esce comunque (best-effort)', res.statusCode === 200 && res.body.ok === true);
  }

  section('I link personali: al proprietario sì, in «vedi come» mai');
  {
    const own = (await run({ uid: OWNER_UID, seed: seedFor('tu') })).res.body.archive;
    const adm = (await run({ uid: ADMIN_UID, query: { as: OWNER_UID }, seed: seedFor('tu') })).res.body.archive;
    const sign = (a) => a.todo.find((t) => t.kind === 'sign') || {};
    ok('il proprietario ha il SUO link di firma (www, /sign?sign=)', /^https:\/\/www\.boomrome\.com\/sign\?sign=LL-SIGN-TOKEN-123$/.test(sign(own).url || ''));
    ok('la Scheda del proprietario è il link derivato del LOCATORE', /^https:\/\/www\.boomrome\.com\/scheda\?t=c1\.l\.[0-9a-f]{24}$/.test((own.todo.find((t) => t.kind === 'scheda') || {}).url || ''));
    ok('in «vedi come» nessun link personale (url null)', adm.todo.length > 0 && adm.todo.every((t) => t.url == null)
      && !JSON.stringify(adm).includes('/sign?sign='));
  }

  section('L\'ultima porta: una proiezione sporca NON esce');
  {
    // Prima difesa: un token piantato in un record lo neutralizza già
    // scrubText (revisione 23/09) — l'archivio esce, il valore no.
    const { res } = await run({ uid: OWNER_UID,
      mutateSeed: (s) => { s['properties/p1'].address = 'Via Cavour 12?token=SEGRETO-XYZ'; } });
    ok('un token piantato in un record: scrubText lo toglie col valore → 200, SEGRETO da nessuna parte', res.statusCode === 200
      && res.body.ok === true && !bodyStr(res).includes('SEGRETO') && !bodyStr(res).includes('token='));
  }
  {
    // L'ULTIMA porta si raggiunge solo se il motore sbaglia: quindi si fa
    // sbagliare il motore. archivio.js chiama OWNER.build per proprietà, al
    // momento della chiamata, sullo STESSO oggetto che le fixtures
    // richiedono (cache CommonJS): lo si avvolge qui, e la proiezione che
    // ne esce porta tre valori che non devono MAI uscire — un URL di
    // Storage col suo token, un CF, un'email. Il contatore prova che la
    // cucitura è quella dell'handler e non un'altra.
    const BAD_URL = 'https://firebasestorage.googleapis.com/v0/b/boom/o/contracts%2Fc1%2Ff.pdf?alt=media&token=SEGRETO-XYZ';
    const BAD_CF = 'RSSMRA80A01H501U', BAD_MAIL = 'segreto.mail@example.com';
    const realBuild = OWNER.build;
    let calls = 0, plant = false;
    OWNER.build = function (input, deps) {
      calls++;
      const a = realBuild.call(this, input, deps);
      if (plant) { a.properties[0].address = BAD_URL; a.owner.name = BAD_CF; a.properties[0].label = BAD_MAIL; }
      return a;
    };
    try {
      {
        const { res } = await run({ uid: OWNER_UID, files: RENDICONTO_08 });
        ok('controllo: la cucitura senza veleno lascia uscire l\'archivio (200)', res.statusCode === 200 && res.body.ok === true && calls === 1);
      }
      calls = 0;
      const h = createHarness({ seed: seedFor('ok'), files: RENDICONTO_08 });
      const un = h.install();
      const from = LOGS.length;
      let res;
      try {
        plant = true;
        const snap = h.snapshot();
        res = await h.call(archivio, { method: 'GET', uid: OWNER_UID });
        ok('la cucitura è quella dell\'handler: OWNER.build chiamato una volta', calls === 1);
        ok('proiezione con URL di Storage + token, CF ed email → 500 projection_unsafe, niente archivio nel corpo',
          res.statusCode === 500 && res.body.ok === false && res.body.error === 'projection_unsafe' && !('archive' in res.body));
        const b = bodyStr(res);
        ok('nel corpo nessuno dei tre valori', ![BAD_URL, 'SEGRETO', 'firebasestorage', BAD_CF, BAD_MAIL].some((x) => b.includes(x)));
        ok('non si spedisce niente: né timbro di prima apertura né notifica (zero scritture), nessun host estraneo',
          h.diff(snap).length === 0 && !h.unexpected.length);
      } finally { un(); }
      const mine = LOGS.slice(from).filter((l) => l.includes('projection_unsafe'));
      const all = mine.join('\n');
      ok('il log del rifiuto porta regola@percorso per ognuno (storage_url, token_param, cf, email)', mine.length === 1
        && ['storage_url@properties[0].address', 'token_param@properties[0].address', 'cf@owner.name', 'email@properties[0].label'].every((x) => all.includes(x)));
      ok('il log non ristampa mai il valore', ![BAD_URL, 'SEGRETO', 'firebasestorage.googleapis', BAD_CF, BAD_MAIL, 'example.com'].some((x) => LOGS.slice(from).join('\n').includes(x)));
    } finally { OWNER.build = realBuild; plant = false; }
    ok('la cucitura è tolta: OWNER.build è di nuovo quello del motore', OWNER.build === realBuild);
  }

  section('Giunzioni sulla sorgente');
  {
    const src = readFileSync(path.join(ROOT, 'api/owner/archivio.js'), 'utf8');
    const load = readFileSync(path.join(ROOT, 'api/owner/_load.js'), 'utf8');
    const iClean = src.indexOf('OWNER.assertClean('), iStamp = src.indexOf("fsPatch('users/'"), iOk = src.indexOf('res.status(200)');
    ok('assertClean PRIMA del timbro e della risposta 200', iClean > 0 && iStamp > iClean && iOk > iStamp);
    ok('scritture ATTESE (su Vercel una scrittura dopo la risposta si perde)', /await fsPatch\('users\/'/.test(src) && /await fsCreate\('agentNotifications'/.test(src));
    const imports = [...src.matchAll(/from '([^']+)'/g), ...load.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    ok('import solo _auth, homie/_lib, profile/_scheda, _load e i motori UMD (niente nodemailer)', imports.every((m) =>
      ['../_auth.js', '../homie/_lib.js', '../profile/_scheda.js', './_load.js'].includes(m) || /^\.\.\/\.\.\/js\/[\w-]+\.js$/.test(m)));
    const calls = [...load.matchAll(/fsList\(/g)].map((m) => load.slice(m.index, m.index + 220));
    ok(`ogni query del caricatore ha un limit esplicito (${calls.length})`, calls.length >= 2 && calls.every((c) => /\blimit\b/.test(c)));
  }

  section('I log: codici e conteggi, mai un contenuto');
  {
    const all = LOGS.join('\n');
    ok('nessuna stringa velenosa nei log', noPoison(all));
    ok('nessun indirizzo né nome nei log', !/Via Cavour|Marco Bianchi|Mario Rossi/.test(all));
  }
} finally {
  releaseLogs();
  unclock();
}

console.log('\n' + '─'.repeat(48));
if (failed) console.log('FALLITI:\n  - ' + bad.join('\n  - '));
console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
