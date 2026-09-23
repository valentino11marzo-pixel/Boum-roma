// tests/owner/file.mjs — /api/owner/file, l'handler VERO: biglietto e byte.
//
// Si guida api/owner/file.js su un Firestore in memoria e uno Storage finto
// (tests/owner/_harness.mjs). Tre porte, una risoluzione:
//   POST {ref}        → biglietto di 60 s (tutti i controlli PRIMA)
//   GET  ?ticket=     → rilegge il ruolo, rifà la risoluzione, serve i byte
//   GET  ?ref= Bearer → gli stessi byte (la condivisione)
// Il cuore: il download va PER PERCORSO col Bearer admin, e nessun URL
// chiesto dal server porta `token=` — salvo il ripiego dichiarato dopo un
// 403 sul percorso, e solo verso lo stesso bucket+percorso.
//
// Provate PER MUTAZIONE (difetto rimesso → rosso → ripristinato): il
// contratto altrui non più «non tuo» · il biglietto senza controllo della
// firma · il ruolo non riletto alla navigazione · l'URL tokenizzato usato
// per primo · il landlord che apre il biglietto di un altro proprietario.
//
//   node tests/owner/file.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHarness, ADMIN_TOKEN } from './_harness.mjs';
import { seedFor, POISON, OWNER_UID, OTHER_UID, ADMIN_UID, su, BUCKET } from './fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let passed = 0, failed = 0; const bad = [];
function ok(name, cond) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; bad.push(name); console.log('  ✗ ' + name); }
}
function section(t) { console.log('\n' + t); }

const LOGS = [];
const orig = { log: console.log, warn: console.warn, error: console.error };
function captureLogs() {
  for (const k of ['warn', 'error']) console[k] = (...a) => { LOGS.push(a.map(String).join(' ')); };
  console.log = (...a) => { const s = a.map(String).join(' '); if (s.startsWith('[owner/')) LOGS.push(s); else orig.log(...a); };
}
function releaseLogs() { Object.assign(console, orig); }

const boot = createHarness({ seed: seedFor('ok') });
const unboot = boot.install();
const { default: fileHandler } = await import('../../api/owner/file.js');
const { mintTicket } = await import('../../api/owner/_ticket.js');
unboot();

// ── Il mondo dei file ─────────────────────────────────────────────────────
const SIGNED = Buffer.from('%PDF-1.7 contratto firmato c1 — byte veri');
const FILES = () => ({
  'contracts/c1/contratto-firmato.pdf': { bytes: SIGNED, contentType: 'application/pdf', token: 'DLTOK' },
  'contracts/c_other/contratto-firmato.pdf': { bytes: Buffer.from('%PDF altrui'), contentType: 'application/pdf', token: 'DLTOK' },
  'property-docs/p1/ape_1_ape.pdf': { bytes: Buffer.from('%PDF ape'), contentType: 'application/pdf', token: 'DLTOK' },
  [`rendiconti/${OWNER_UID}/rendiconto_2026-08.pdf`]: { bytes: Buffer.from('%PDF rendiconto agosto'), contentType: 'application/pdf' },
  'rendiconti/L1/rendiconto_2026-05.pdf': { bytes: Buffer.from('%PDF rendiconto alias'), contentType: 'application/pdf' },
  'rendiconti/prev_owner/rendiconto_2025-11.pdf': { bytes: Buffer.from('%PDF rendiconto vecchio'), contentType: 'application/pdf' },
  'smistatore/2026/f24.pdf': { bytes: Buffer.from('%PDF f24'), contentType: 'application/pdf', token: 'DLTOK' },
  'smistatore/2026/unf.pdf': { bytes: Buffer.from('%PDF da smistare'), contentType: 'application/pdf', token: 'DLTOK' },
  'smistatore/2026/identita-conduttore.jpg': { bytes: Buffer.from('JPGID'), contentType: 'image/jpeg', token: 'IDTOK' },
  'property-docs/p1/visura_1_visura.pdf': { bytes: Buffer.from('%PDF visura'), contentType: 'text/weird' },
});
function seed(mut) {
  const s = seedFor('ok');
  s['contracts/c_other'] = { propertyId: 'p_other', status: 'active', tenantName: 'Zeta', signatureStatus: 'complete', fullySignedAt: '2026-01-11T09:00:00Z',
    signedPdfUrl: su('contracts/c_other/contratto-firmato.pdf'), startDate: '2026-02-01', endDate: '2027-01-31' };
  s['documents/d_unf'] = { propertyId: 'p1', needsFiling: true, category: 'F24 IMU', type: 'other', fileUrl: su('smistatore/2026/unf.pdf') };
  if (mut) mut(s);
  return s;
}

async function withH(opts, fn) {
  const h = createHarness({ seed: opts.seed || seed(opts.mut), files: opts.files || FILES(), mediaBearer: opts.mediaBearer, env: opts.env });
  const un = h.install();
  try { return await fn(h); } finally { un(); }
}
const post = (h, uid, body, extra = {}) => h.call(fileHandler, { method: 'POST', uid, body, ...extra });
const getT = (h, ticket, headers = {}) => h.call(fileHandler, { method: 'GET', query: { ticket }, headers });
const ticketOf = (res) => new URL('https://x' + res.body.url).searchParams.get('ticket');
const bodyBuf = (res) => (Buffer.isBuffer(res.body) ? res.body : Buffer.from(String(res.body || '')));
const media = (h) => h.fetchLog.filter((e) => e.kind === 'storage' && e.url.includes('alt=media'));
const noPoison = (s) => POISON.filter((p) => p !== 'firebasestorage.googleapis.com').every((p) => !s.includes(p));

captureLogs();
try {
  section('Il biglietto e i byte, per il proprio contratto');
  await withH({}, async (h) => {
    const p = await post(h, OWNER_UID, { ref: 'c:c1:signed' });
    const b = p.body;
    ok('POST ref suo → 200 { url /api/owner/file?ticket=…, expiresAt, name, size, contentType }', p.statusCode === 200 && b.ok === true
      && /^\/api\/owner\/file\?ticket=[\w-]+\.[\w-]+$/.test(b.url) && !Number.isNaN(Date.parse(b.expiresAt))
      && /^BOOM_Signed_[\w.-]+\.pdf$/.test(b.name) && b.size === SIGNED.length && b.contentType === 'application/pdf');
    ok('la scadenza è a un minuto', Math.abs(Date.parse(b.expiresAt) - Date.now() - 60000) < 5000);
    ok('la risposta del POST non porta mai un URL Storage né un token', !/firebasestorage|token=|DLTOK/.test(JSON.stringify(b)));
    ok('il POST non scarica i byte (solo i metadati)', media(h).length === 0);
    const g = await getT(h, ticketOf(p));
    ok('GET ?ticket → 200 con i byte del file', g.statusCode === 200 && bodyBuf(g).equals(SIGNED));
    ok('Content-Type application/pdf e Content-Length', g.getHeader('content-type') === 'application/pdf' && g.getHeader('content-length') === String(SIGNED.length));
    ok('Content-Disposition inline con filename ASCII e filename* UTF-8', /^inline; filename="BOOM_Signed_[\w.-]+\.pdf"; filename\*=UTF-8''BOOM_Signed_/.test(g.getHeader('content-disposition')));
    ok('Cache-Control private, no-store · nosniff · no-referrer · noindex', /private/.test(g.getHeader('cache-control')) && /no-store/.test(g.getHeader('cache-control'))
      && g.getHeader('x-content-type-options') === 'nosniff' && g.getHeader('referrer-policy') === 'no-referrer' && /noindex/.test(g.getHeader('x-robots-tag')));
    const m = media(h);
    ok('Storage chiesto PER PERCORSO, ?alt=media, Bearer ADMIN_TOKEN', m.length === 1
      && m[0].url.includes('/o/' + encodeURIComponent('contracts/c1/contratto-firmato.pdf') + '?alt=media') && m[0].auth === 'Bearer ' + ADMIN_TOKEN);
    ok('NESSUNA richiesta di rete con token= (il registro delle fetch)', h.fetchLog.every((e) => !e.url.includes('token=')));
    ok('nessuna chiamata non prevista', h.unexpected.length === 0);
    // Un secondo uso dello stesso biglietto entro il minuto è ammesso (il
    // visore di iOS può richiedere due volte): è a tempo, non monouso.
    const g2 = await getT(h, ticketOf(p));
    ok('lo stesso biglietto rivale entro il minuto (visore iOS che richiede)', g2.statusCode === 200);
  });

  section('GET ?ref col Bearer: gli stessi byte (la condivisione)');
  await withH({}, async (h) => {
    const g = await h.call(fileHandler, { method: 'GET', uid: OWNER_UID, query: { ref: 'c:c1:signed' } });
    ok('GET ?ref Bearer → gli stessi byte', g.statusCode === 200 && bodyBuf(g).equals(SIGNED));
    const a = await h.call(fileHandler, { method: 'GET', uid: ADMIN_UID, query: { ref: 'c:c1:signed', as: OWNER_UID } });
    ok('GET ?ref admin con as → gli stessi byte', a.statusCode === 200 && bodyBuf(a).equals(SIGNED));
    const n = await h.call(fileHandler, { method: 'GET', query: { ref: 'c:c1:signed' } });
    ok('GET ?ref senza Bearer → 401', n.statusCode === 401);
  });

  section('Chi non deve aprire niente');
  await withH({}, async (h) => {
    const c = await post(h, OWNER_UID, { ref: 'c:c_other:signed' });
    ok('contratto su un immobile altrui → 403 not_your_property', c.statusCode === 403 && c.body.error === 'not_your_property');
    const p = await post(h, OWNER_UID, { ref: 'p:p_other:dossier-ape' });
    ok('immobile altrui → 403 not_your_property', p.statusCode === 403 && p.body.error === 'not_your_property');
    const o = await post(h, OTHER_UID, { ref: 'c:c1:signed' });
    ok('l\'altro proprietario sul mio contratto → 403 not_your_property', o.statusCode === 403 && o.body.error === 'not_your_property');
    const t = await post(h, 't1', { ref: 'c:c1:signed' });
    ok('il conduttore → 403 forbidden', t.statusCode === 403 && t.body.error === 'forbidden');
    const n = await post(h, undefined, { ref: 'c:c1:signed' });
    ok('senza token → 401', n.statusCode === 401);
    const ad = await post(h, ADMIN_UID, { ref: 'c:c1:signed' });
    ok('admin senza as → 400 as_required', ad.statusCode === 400 && ad.body.error === 'as_required');
    const as = await post(h, OWNER_UID, { ref: 'c:c_other:signed', as: OTHER_UID });
    ok('un landlord che passa as=<altro> resta sé stesso (403)', as.statusCode === 403);
    ok('nessun byte scaricato per i rifiuti', media(h).length === 0);
  });
  await withH({}, async (h) => {
    const forms = ['c:../x', 'c:a:b:c', 'x:1', 'r:u:2026-13', '/', 'c:' + 'a'.repeat(199), ''];
    let good = 0;
    for (const f of forms) { const r = await post(h, OWNER_UID, { ref: f }); if (r.statusCode === 400 && r.body.error === 'bad_ref') good++; }
    ok(`ref malformati → 400 bad_ref (${good}/${forms.length} forme)`, good === forms.length);
    const nf = await post(h, OWNER_UID, { ref: 'c:nessuno:signed' });
    ok('contratto inesistente → 404 not_found', nf.statusCode === 404 && nf.body.error === 'not_found');
    const nf2 = await post(h, OWNER_UID, { ref: 'd:nessuno' });
    ok('documento inesistente → 404 not_found', nf2.statusCode === 404);
  });

  section('Il biglietto: manomesso, rotto, scaduto, e chi lo usa oggi');
  await withH({}, async (h) => {
    const t = ticketOf(await post(h, OWNER_UID, { ref: 'c:c1:signed' }));
    const [pl, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(pl, 'base64url').toString()), r: 'c:c1:scheda' })).toString('base64url') + '.' + sig;
    const t1 = await getT(h, forged);
    ok('carico manomesso (altro file, stessa firma) → 401 ticket_invalid', t1.statusCode === 401 && t1.body.error === 'ticket_invalid');
    const t2 = await getT(h, pl + '.' + (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1));
    ok('firma manomessa → 401 ticket_invalid', t2.statusCode === 401 && t2.body.error === 'ticket_invalid');
    const t3 = await getT(h, 'nonunbiglietto');
    ok('forma sbagliata → 400 bad_ticket', t3.statusCode === 400 && t3.body.error === 'bad_ticket');
    const old = mintTicket({ viewerUid: OWNER_UID, ownerUid: OWNER_UID, ref: 'c:c1:signed', now: Date.now() - 120000 });
    const t4 = await getT(h, old);
    ok('scaduto → 410 ticket_expired', t4.statusCode === 410 && t4.body.error === 'ticket_expired');
    const t5 = await getT(h, old, { accept: 'text/html,application/xhtml+xml' });
    ok('scaduto in navigazione → pagina HTML scura con «Torna all\'archivio»', t5.statusCode === 410 && /text\/html/.test(t5.getHeader('content-type'))
      && /Torna all'archivio/.test(t5.text()) && /href="\/proprietario"/.test(t5.text()) && /#D4AF37/.test(t5.text()));
    const other = mintTicket({ viewerUid: OWNER_UID, ownerUid: OTHER_UID, ref: 'c:c_other:signed', now: Date.now() });
    const t6 = await getT(h, other);
    ok('un landlord con un biglietto per un ALTRO proprietario → 403', t6.statusCode === 403);
    ok('nessun byte servito per un biglietto rifiutato', media(h).length === 0);
  });
  await withH({}, async (h) => {
    const t = ticketOf(await post(h, OWNER_UID, { ref: 'c:c1:signed' }));
    h.DB.get('users/' + OWNER_UID).role = 'tenant';
    const g = await getT(h, t);
    ok('il visitatore diventato conduttore → 403 role_changed (il ruolo si rilegge alla navigazione)', g.statusCode === 403 && g.body.error === 'role_changed' && media(h).length === 0);
  });
  await withH({}, async (h) => {
    const p = await post(h, ADMIN_UID, { ref: 'c:c1:signed', as: OWNER_UID });
    const g = await getT(h, ticketOf(p));
    ok('admin in «vedi come»: POST con as nel corpo → biglietto → byte', p.statusCode === 200 && g.statusCode === 200 && bodyBuf(g).equals(SIGNED));
  });

  section('Ciò che il proprietario non vede, non si apre');
  await withH({ seed: (() => { const s = seedFor('renewal'); return s; })() }, async (h) => {
    const r = await post(h, OWNER_UID, { ref: 'c:c_new:verbale' });
    ok('il verbale ereditato dal rinnovo sotto il contratto nuovo → 403 not_visible', r.statusCode === 403 && r.body.error === 'not_visible');
  });
  await withH({ mut: (s) => { s['contracts/c1'].signedPdfUrl = 'https://evil.example.com/v0/b/x/o/contratto.pdf?alt=media&token=EVIL'; } }, async (h) => {
    const r = await post(h, OWNER_UID, { ref: 'c:c1:signed' });
    const g = await h.call(fileHandler, { method: 'GET', uid: OWNER_UID, query: { ref: 'c:c1:signed' } });
    ok('signedPdfUrl su un host estraneo → rifiutato (403 not_visible dal motore) e mai servito', r.statusCode === 403 && r.body.error === 'not_visible' && g.statusCode === 403);
    ok('l\'host estraneo NON viene mai contattato', h.fetchLog.every((e) => e.host !== 'evil.example.com') && h.unexpected.length === 0);
  });
  await withH({}, async (h) => {
    const id = await post(h, OWNER_UID, { ref: 'd:d_id' });
    const un = await post(h, OWNER_UID, { ref: 'd:d_unf' });
    const rc = await post(h, OWNER_UID, { ref: 'd:d_rcpt' });
    ok('documento d\'identità → 403 not_visible', id.statusCode === 403 && id.body.error === 'not_visible');
    ok('documento da smistare (needsFiling) → 403 not_visible', un.statusCode === 403 && un.body.error === 'not_visible');
    ok('ricevuta del conduttore → 403 not_visible', rc.statusCode === 403);
    const f24 = await post(h, OWNER_UID, { ref: 'd:d_f24' });
    ok('F24 IMU del suo immobile → 200', f24.statusCode === 200 && f24.body.ok);
    const ape = await post(h, OWNER_UID, { ref: 'p:p1:dossier-ape' });
    ok('APE del fascicolo immobile → 200', ape.statusCode === 200);
  });

  section('Troppo grande: 413 onesto, JSON per il POST, pagina per la navigazione');
  await withH({ files: { ...FILES(), 'contracts/c1/contratto-firmato.pdf': { size: 5000000, contentType: 'application/pdf' } } }, async (h) => {
    const p = await post(h, OWNER_UID, { ref: 'c:c1:signed' });
    ok('metadati 5.000.000 byte → POST 413 too_large {size, limit} in JSON', p.statusCode === 413 && p.body.error === 'too_large'
      && p.body.size === 5000000 && p.body.limit === 4400000);
    const t = mintTicket({ viewerUid: OWNER_UID, ownerUid: OWNER_UID, ref: 'c:c1:signed', now: Date.now() });
    const g = await getT(h, t, { accept: 'text/html' });
    ok('GET ?ticket con Accept text/html → 413 pagina «troppo grande» e ritorno all\'archivio', g.statusCode === 413
      && /text\/html/.test(g.getHeader('content-type')) && /5,0 MB: troppo grande da aprire qui/.test(g.text()) && /Chiedilo a BOOM/.test(g.text())
      && /\/proprietario/.test(g.text()));
    ok('il file troppo grande NON viene scaricato', media(h).length === 0);
  });
  await withH({ env: { OWNER_FILE_MAX_BYTES: '1000' },
    files: { ...FILES(), 'contracts/c1/contratto-firmato.pdf': { bytes: Buffer.alloc(5000, 65), size: 10, contentType: 'application/pdf' } } }, async (h) => {
    const g = await h.call(fileHandler, { method: 'GET', uid: OWNER_UID, query: { ref: 'c:c1:signed' } });
    ok('metadati che mentono (10 B) ma il file è 5 KB oltre il tetto → 413, il download si interrompe', g.statusCode === 413 && g.body.error === 'too_large');
  });
  delete process.env.OWNER_FILE_MAX_BYTES;

  section('I rendiconti: le chiavi del proprietario, non la storia dell\'immobile');
  await withH({ mut: (s) => {
    s['users/' + OWNER_UID].ownerAliases = ['L1'];
    s['properties/p1'].ownerIdHistory = [{ from: 'prev_owner', to: OWNER_UID, at: '2025-12-01T10:00:00Z', reason: 'transfer' }];
  } }, async (h) => {
    const own = await post(h, OWNER_UID, { ref: `r:${OWNER_UID}:2026-08` });
    const al = await post(h, OWNER_UID, { ref: 'r:L1:2026-05' });
    const tr = await post(h, OWNER_UID, { ref: 'r:prev_owner:2025-11' });
    const ot = await post(h, OWNER_UID, { ref: `r:${OTHER_UID}:2026-08` });
    const nf = await post(h, OWNER_UID, { ref: `r:${OWNER_UID}:2026-07` });
    ok('il suo rendiconto → 200', own.statusCode === 200);
    ok('l\'alias rivendicato dall\'invito (users.ownerAliases) → 200', al.statusCode === 200 && al.body.ok);
    ok('il vecchio proprietario dalla storia dell\'immobile (trasferimento) → 403', tr.statusCode === 403 && tr.body.error === 'not_your_property');
    ok('la chiave di un altro proprietario → 403', ot.statusCode === 403);
    ok('marcatore senza PDF → 404 not_found', nf.statusCode === 404 && nf.body.error === 'not_found');
    const g = await getT(h, ticketOf(al));
    ok('i byte dell\'alias, per percorso sul bucket di upload', g.statusCode === 200 && bodyBuf(g).toString() === '%PDF rendiconto alias'
      && media(h).some((e) => e.url.includes('/b/' + encodeURIComponent(BUCKET) + '/o/' + encodeURIComponent('rendiconti/L1/rendiconto_2026-05.pdf'))));
  });

  section('Il ripiego: l\'URL salvato SOLO dopo un 403 sul percorso, stesso bucket+percorso');
  await withH({ mediaBearer: false }, async (h) => {
    const g = await h.call(fileHandler, { method: 'GET', uid: OWNER_UID, query: { ref: 'c:c1:signed' } });
    const m = media(h);
    ok('percorso rifiutato (403) → ripiego sull\'URL salvato → 200 gli stessi byte', g.statusCode === 200 && bodyBuf(g).equals(SIGNED));
    ok('prima il percorso col Bearer, poi il ripiego sullo stesso host e percorso', m.length === 2 && m[0].auth === 'Bearer ' + ADMIN_TOKEN
      && !m[0].url.includes('token=') && m[1].host === 'firebasestorage.googleapis.com' && m[1].url.includes(encodeURIComponent('contracts/c1/contratto-firmato.pdf'))
      && m[1].auth === '');
    ok('il log dice QUALE via, non l\'URL', LOGS.some((l) => l.includes('storage_via fallback')) && !LOGS.some((l) => l.includes('DLTOK')));
    const r = await h.call(fileHandler, { method: 'GET', uid: OWNER_UID, query: { ref: `r:${OWNER_UID}:2026-08` } });
    ok('il rendiconto non ha un URL salvato: percorso rifiutato → 502 storage_error', r.statusCode === 502 && r.body.error === 'storage_error');
  });

  section('Il tipo del file');
  await withH({}, async (h) => {
    const g = await h.call(fileHandler, { method: 'GET', uid: OWNER_UID, query: { ref: 'p:p1:dossier-visura' } });
    ok('tipo non ammesso nei metadati → application/octet-stream + attachment', g.statusCode === 200
      && g.getHeader('content-type') === 'application/octet-stream' && /^attachment;/.test(g.getHeader('content-disposition')));
  });

  section('Senza segreto non si conia niente');
  await withH({}, async (h) => {
    const t = ticketOf(await post(h, OWNER_UID, { ref: 'c:c1:signed' }));
    const saved = process.env.HOMIE_SECRET;
    delete process.env.HOMIE_SECRET;
    try {
      const p = await post(h, OWNER_UID, { ref: 'c:c1:signed' });
      const g = await getT(h, t);
      ok('HOMIE_SECRET assente → POST 500 not_configured', p.statusCode === 500 && p.body.error === 'not_configured');
      ok('HOMIE_SECRET assente → GET ?ticket 500 not_configured', g.statusCode === 500 && g.body.error === 'not_configured');
    } finally { process.env.HOMIE_SECRET = saved; }
  });

  section('Giunzioni sulla sorgente');
  {
    const src = readFileSync(path.join(ROOT, 'api/owner/file.js'), 'utf8');
    const load = readFileSync(path.join(ROOT, 'api/owner/_load.js'), 'utf8');
    ok('una sola risoluzione per le tre porte (resolveFile chiamata 3 volte)', (src.match(/await resolveFile\(/g) || []).length === 3);
    ok('i byte passano SOLO da storageBytes (nessuna fetch diretta in file.js)', !/\bfetch\(/.test(src));
    ok('storageBytes prova il percorso col Bearer PRIMA del ripiego, e il ripiego solo su 401/403',
      load.indexOf("'?alt=media'") < load.indexOf('fetch(fallbackUrl') && /\(r\.status === 401 \|\| r\.status === 403\) && fallbackUrl/.test(load));
    const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    ok('import solo _auth, homie/_lib, _load, _ticket e motori UMD (niente nodemailer)', imports.every((m) =>
      ['../_auth.js', '../homie/_lib.js', './_load.js', './_ticket.js'].includes(m) || /^\.\.\/\.\.\/js\/[\w-]+\.js$/.test(m)));
  }

  section('I log: codici e conteggi, mai un contenuto');
  {
    const all = LOGS.join('\n');
    ok('nessuna stringa velenosa, nessun token, nessun percorso di file nei log', noPoison(all) && !/token=|contracts\/c1|rendiconti\//.test(all));
  }
} finally {
  releaseLogs();
}

console.log('\n' + '─'.repeat(48));
if (failed) console.log('FALLITI:\n  - ' + bad.join('\n  - '));
console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
