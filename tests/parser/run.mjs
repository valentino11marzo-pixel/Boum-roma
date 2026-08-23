// tests/parser/run.mjs
// Il Doc Parser si apriva su "Parser config missing": la pagina cercava il
// bearer di /api/parse-docs in un documento Firestore (config/parse_docs) che
// in produzione non e mai esistito. La cura non e creare quel documento — un
// segreto del server dentro il browser era gia un rilievo dell'audit — ma
// lasciare che l'endpoint riconosca l'ID token dell'admin, come ogni altro
// endpoint chiamato dal portale.
//
// Qui gira l'HANDLER VERO: sono finte solo la rete (Identity Toolkit,
// Firestore, Anthropic) e le credenziali.
//
//   node tests/parser/run.mjs

import { readFileSync } from 'node:fs';

process.env.ANTHROPIC_API_KEY = 'sk-test';
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'admin@boom';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.PARSE_DOCS_SECRET = 'segreto-storico-lungo-abbastanza';

// ── store in memoria ───────────────────────────────────────────────────────
const USERS = new Map([
  ['admin_1',  { role: 'admin',    email: 'valentino@boom-rome.com' }],
  ['tenant_1', { role: 'tenant',   email: 'inquilino@example.com' }],
  ['owner_1',  { role: 'landlord', email: 'anna@example.com' }],
]);

const toF = (v) => (typeof v === 'string' ? { stringValue: v } : { nullValue: null });
const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

let upstreamCalls = [];

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);

  if (u.includes('accounts:signInWithPassword')) return json({ idToken: 'ADMIN_TOKEN' });

  // Il token del chiamante e valido solo se e il nome di un utente noto:
  // qualunque altra stringa (compreso il segreto storico) non e un ID token.
  if (u.includes('accounts:lookup')) {
    const { idToken } = JSON.parse(opts.body || '{}');
    if (!USERS.has(idToken)) return json({ error: 'INVALID_ID_TOKEN' }, 400);
    return json({ users: [{ localId: idToken, email: USERS.get(idToken).email }] });
  }

  if (u.includes('firestore.googleapis.com')) {
    const path = decodeURIComponent(u.split('/documents/')[1] || '').split('?')[0];
    const uid = path.replace('users/', '');
    if (!USERS.has(uid)) return json({ error: { status: 'NOT_FOUND' } }, 404);
    const p = USERS.get(uid);
    return json({ name: path, fields: { role: toF(p.role), email: toF(p.email) } });
  }

  if (u.includes('api.anthropic.com')) {
    upstreamCalls.push({ headers: opts.headers, body: JSON.parse(opts.body || '{}') });
    return json({ content: [{ type: 'text', text: '{"_summary":"ok"}' }] });
  }

  throw new Error('fetch non previsto nel test: ' + u);
};

const { default: handler } = await import('../../api/parse-docs.js');

function mkRes() {
  const r = { code: 0, body: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}

let ipSeed = 0;
async function call(token, body) {
  upstreamCalls = [];
  const req = {
    method: 'POST',
    // un IP diverso per chiamata: il rate limit e per IP e qui non e in esame
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.0.0.${++ipSeed}`,
      ...(token === null ? {} : { authorization: 'Bearer ' + token }),
    },
    body: body || { messages: [{ role: 'user', content: 'ciao' }] },
  };
  const res = mkRes();
  await handler(req, res);
  return { res, upstream: upstreamCalls };
}

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  const ok = !!cond;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${ok || !extra ? '' : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

console.log('\n\x1b[1mLa porta\x1b[0m');
let r = await call(null);
check('senza Authorization → 401', r.res.code === 401, `ho avuto ${r.res.code}`);
check('…e Anthropic non viene mai chiamato', r.upstream.length === 0);

r = await call('segreto-storico-lungo-sbagliatX');
check('segreto errato (stessa lunghezza) → 401', r.res.code === 401, `ho avuto ${r.res.code}`);
check('…e non spende un token', r.upstream.length === 0);

r = await call('tenant_1');
check('un inquilino loggato → 403, non 401', r.res.code === 403, `ho avuto ${r.res.code}`);
check('…il messaggio dice che serve admin', /admin/i.test(r.res.body?.error || ''), r.res.body?.error);
check('…e non spende un token', r.upstream.length === 0);

r = await call('owner_1');
check('un proprietario non passa (lo strumento e admin-only)', r.res.code === 403, `ho avuto ${r.res.code}`);

console.log('\n\x1b[1mLe due vie legittime\x1b[0m');
r = await call('admin_1');
check('ID token di un admin → 200 (la via della pagina)', r.res.code === 200, JSON.stringify(r.res.body));
check('…la richiesta arriva davvero ad Anthropic', r.upstream.length === 1);
check('…con la chiave del server, mai quella del client',
  r.upstream[0]?.headers?.['x-api-key'] === 'sk-test');

r = await call('segreto-storico-lungo-abbastanza');
check('il segreto condiviso continua a funzionare (server-to-server)', r.res.code === 200, `ho avuto ${r.res.code}`);

console.log('\n\x1b[1mL\'irrigidimento resta\x1b[0m');
r = await call('admin_1', {
  model: 'claude-opus-4-1', max_tokens: 999999, stream: true,
  tools: [{ name: 'x' }], metadata: { user_id: 'x' },
  system: 'sei un estrattore', messages: [{ role: 'user', content: 'ciao' }],
});
const sent = r.upstream[0]?.body || {};
check('il modello resta quello pinnato dal server', sent.model === 'claude-haiku-4-5-20251001', sent.model);
check('max_tokens resta sotto il tetto', sent.max_tokens === 2000, String(sent.max_tokens));
check('stream/tools/metadata non passano', !('stream' in sent) && !('tools' in sent) && !('metadata' in sent),
  Object.keys(sent).join(','));
check('il system prompt del client passa', sent.system === 'sei un estrattore');

r = await call('admin_1', { messages: [] });
check('messages vuoto → 400 prima di spendere', r.res.code === 400 && r.upstream.length === 0, `ho avuto ${r.res.code}`);

console.log('\n\x1b[1mLa pagina\x1b[0m');
const page = readFileSync(new URL('../../boom_doc_parser.html', import.meta.url), 'utf8');
check('non legge piu la collection config (il documento che non esisteva)',
  !/collection\('config'\)/.test(page) && !/\.doc\('parse_docs'\)/.test(page),
  'la pagina legge ancora config/parse_docs');
check('non tiene piu un segreto in una variabile di pagina', !/_parseDocsBearer/.test(page));
check('manda l\'ID token di chi e loggato', /getIdToken\(\)/.test(page));
check('…proprio nella chiamata a /api/parse-docs',
  /fetch\('\/api\/parse-docs'[\s\S]{0,260}await _authHeader\(\)/.test(page));
check('un errore HTTP non viene raccontato come "JSON non valido"',
  /if \(!response\.ok\)/.test(page));

console.log('\n────────────────────────────────────────────────');
console.log(`\x1b[1mResult: ${pass} passed, ${fail} failed\x1b[0m`);
if (fail) process.exit(1);
console.log('\x1b[32mIl Doc Parser si apre con l\'admin che e gia loggato, e nessun segreto scende nel browser.\x1b[0m');
