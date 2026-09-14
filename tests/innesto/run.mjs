// tests/innesto/run.mjs
// L'Innesto «non riesce mai a leggere i file». Il 14/09/2026 i log di
// produzione hanno dato il motivo: `why=truncated len=3365 stop=end_turn` —
// il modello aveva finito, ma il JSON scritto a mano libera non chiudeva le
// graffe e la lettura lo diagnosticava come troncato, mandando all'operatore
// il rimedio sbagliato. Ora la lettura è Opus 5 con OUTPUT STRUTTURATO (il
// JSON è valido per costruzione), legge più file in un giro, lo schema è il
// dizionario del contratto, ogni campo cita la frase da cui viene, e i
// rifiuti (HEIC, troppi file, tempo scaduto, refusal) arrivano col rimedio.
//
// La cura del 413 (28/08) resta: le foto si riducono client-side, i file
// grandi TRANSITANO dallo Storage — all'API va solo l'URL, accettato SOLO se
// punta al nostro Storage (i byte finiscono ad Anthropic: un URL libero
// trasformerebbe l'endpoint in un proxy verso host arbitrari).
//
// Qui gira l'HANDLER VERO: sono finte solo la rete (Identity Toolkit,
// Firestore, Storage, Anthropic) e le credenziali. E poi l'APPLY VERO del
// portal su un Firestore in memoria.
//
//   node tests/innesto/run.mjs

import { readFileSync } from 'node:fs';

process.env.ANTHROPIC_API_KEY = 'sk-test';
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'admin@boom';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';

// ── store in memoria ───────────────────────────────────────────────────────
const USERS = new Map([
  ['admin_1',  { role: 'admin',    email: 'valentino@boom-rome.com' }],
  ['tenant_1', { role: 'tenant',   email: 'inquilino@example.com' }],
]);

const PDF_BYTES = Buffer.from('%PDF-1.4 SIMETO12 TESTA OYKU — contratto di locazione transitoria');
const JPG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const HUGE_BYTES = Buffer.alloc(8 * 1024 * 1024 + 1, 65);

const OUR_STORAGE = 'https://firebasestorage.googleapis.com/v0/b/test/o/documents%2Fadmin_1%2Finnesto-tmp%2F1_Simeto12.pdf?alt=media&token=t';
const HUGE_URL    = 'https://firebasestorage.googleapis.com/v0/b/test/o/documents%2Fadmin_1%2Finnesto-tmp%2F2_enorme.pdf?alt=media&token=t';

const toF = (v) => (typeof v === 'string' ? { stringValue: v } : { nullValue: null });
const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

// La risposta STRUTTURATA del modello (tutte le chiavi, null dove non c'è
// niente): è la forma che output_config.format garantisce. Porta anche campi
// INVENTATI (segreto, hacker) e una citazione con percorso inesistente: la
// normalizzazione e la whitelist delle citazioni devono fermarli.
const person = (o) => Object.assign({ name: null, email: null, phone: null, codiceFiscale: null, address: null, birthDate: null, birthPlace: null, nationality: null, docType: null, docNum: null, docIssuer: null, docIssueDate: null }, o);
const AI_FULL = () => ({
  files: [{ index: 1, kind: 'contratto', title: 'Contratto transitorio Via Simeto 12', pages: 3, legible: true, summary: 'contratto firmato', party: null }],
  landlord: person({ name: 'Anna Testa', email: 'anna@example.com', codiceFiscale: 'TSTNNA70A41H501J', segreto: 'mai', kind: 'fisica', businessName: null, partitaIva: null, iban: null }),
  tenant: person({ name: 'Oyku Testa', email: 'oyku@example.com', codiceFiscale: 'TSTOYK95A41H501P', birthDate: '1995-01-01', birthPlace: 'Istanbul', docType: 'passport', docNum: 'U12345678', permessoNumero: null, permessoScadenza: null }),
  coTenants: [],
  property: { name: null, address: 'Via Simeto 12', city: null, floor: '2', scala: null, interno: '7', sqm: 65, rooms: 2, bathrooms: 1, accessories: null, furnished: true, energyClass: 'F', propertyType: 'apartment',
    cadastral: { sezione: null, foglio: '12', particella: '345', sub: '6', categoria: 'A/2', rendita: 512.3 }, tabelle: { proprieta: null, riscaldamento: null, acqua: null, altre: null } },
  contract: { type: 'transitorio', startDate: '2026-09-01', endDate: '2027-08-31', durationMonths: 12, rent: 1100, deposit: null, depositMonths: 2, paymentDay: 5, installmentMonths: '1', accessoryCharges: null, condoMode: null, cedolareSecca: true,
    transitionalReason: 'motivi di lavoro', transitionalDocs: null, esigenzaDi: 'conduttore', studenti: { corsoStudi: null, universita: null, universitaIndirizzo: null, tipoIscrizione: null, annoAccademico: null },
    cohabitants: null, otherClauses: null, signaturePlace: 'Roma', signatureDate: null, paymentMethod: null, istatPct: null, notes: null, hacker: 'x' },
  evidence: [
    { path: 'contract.rent', quote: 'euro millecento/00 (€ 1.100,00) mensili', file: 1, page: 1 },
    { path: 'property.cadastral.foglio', quote: 'foglio 12 particella 345 sub 6', file: 1, page: 1 },
    { path: 'hacker.x', quote: 'no', file: 1, page: 1 },
    { path: 'tenant.codiceFiscale', quote: 'C.F. TSTOYK95A41H501P', file: 9, page: 2 },
  ],
  notes: ['il deposito non è indicato come importo'], confidence: 88, summary: 'Contratto transitorio Via Simeto 12 — Testa → Testa, 12 mesi, €1.100/mese',
});
const AI_EMPTY = () => Object.assign(AI_FULL(), {
  files: [{ index: 1, kind: 'altro', title: 'Foto mossa', pages: null, legible: false, summary: 'immagine sfocata, testo non leggibile', party: null }],
  landlord: person({ kind: null, businessName: null, partitaIva: null, iban: null }), tenant: person({ permessoNumero: null, permessoScadenza: null }), coTenants: [],
  property: { name: null, address: null, city: null, floor: null, scala: null, interno: null, sqm: null, rooms: null, bathrooms: null, accessories: null, furnished: null, energyClass: null, propertyType: null, cadastral: { sezione: null, foglio: null, particella: null, sub: null, categoria: null, rendita: null }, tabelle: { proprieta: null, riscaldamento: null, acqua: null, altre: null } },
  contract: { type: null, startDate: null, endDate: null, durationMonths: null, rent: null, deposit: null, depositMonths: null, paymentDay: null, installmentMonths: null, accessoryCharges: null, condoMode: null, cedolareSecca: null, transitionalReason: null, transitionalDocs: null, esigenzaDi: null, studenti: { corsoStudi: null, universita: null, universitaIndirizzo: null, tipoIscrizione: null, annoAccademico: null }, cohabitants: null, otherClauses: null, signaturePlace: null, signatureDate: null, paymentMethod: null, istatPct: null, notes: null },
  evidence: [], notes: [], confidence: 10, summary: null,
});

let anthCalls = [];
let storageFetches = 0;
let foreignFetches = 0;
let AI = { reply: AI_FULL(), stop: 'end_turn', status: 200, text: '', throwName: '', failFirstWith: '' };

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('accounts:signInWithPassword')) return json({ idToken: 'ADMIN_TOKEN' });
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
  if (u.startsWith('https://firebasestorage.googleapis.com/')) {
    storageFetches++;
    const bytes = u.includes('enorme') ? HUGE_BYTES : PDF_BYTES;
    return new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/pdf' } });
  }
  if (u.includes('api.anthropic.com')) {
    anthCalls.push({ headers: opts.headers, body: JSON.parse(opts.body || '{}') });
    if (AI.throwName) { const e = new Error('aborted'); e.name = AI.throwName; throw e; }
    if (AI.failFirstWith && anthCalls.length === 1) return new Response(AI.failFirstWith, { status: 400 });
    if (AI.status !== 200) return new Response(AI.text || 'err', { status: AI.status });
    return json({ model: 'claude-opus-5', stop_reason: AI.stop, usage: { input_tokens: 12000, output_tokens: 1800, cache_read_input_tokens: 3000 },
      content: [{ type: 'text', text: AI.stop === 'max_tokens' ? '{"files": [' : JSON.stringify(AI.reply) }] });
  }
  // Qualunque altro host è un buco: si conta e si nega.
  foreignFetches++;
  return new Response('nope', { status: 200, headers: { 'Content-Type': 'application/pdf' } });
};

const { default: handler, INGEST_SCHEMA, MODEL } = await import('../../api/portal/ingest.js');

function mkRes() {
  const r = { code: 0, body: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}

async function call(token, body, ai) {
  anthCalls = []; storageFetches = 0; foreignFetches = 0;
  AI = Object.assign({ reply: AI_FULL(), stop: 'end_turn', status: 200, text: '', throwName: '', failFirstWith: '' }, ai || {});
  const req = {
    method: 'POST',
    headers: token === null ? {} : { authorization: 'Bearer ' + token },
    body: body || {},
  };
  const res = mkRes();
  await handler(req, res);
  return { res, anth: anthCalls, storage: storageFetches, foreign: foreignFetches };
}
const b64 = (buf) => buf.toString('base64');

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  const ok = !!cond;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${ok || !extra ? '' : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

console.log('\n\x1b[1mLa porta\x1b[0m');
let r = await call(null, { text: 'contratto' });
check('senza Authorization → 401', r.res.code === 401, `ho avuto ${r.res.code}`);
check('…e Anthropic non viene mai chiamato', r.anth.length === 0);
r = await call('tenant_1', { text: 'contratto' });
check('un inquilino loggato → 403', r.res.code === 403, `ho avuto ${r.res.code}`);
check('…e non spende un token', r.anth.length === 0);
r = await call('admin_1', {});
check('senza materiale → 400 prima di spendere', r.res.code === 400 && r.anth.length === 0, `ho avuto ${r.res.code}`);

console.log('\n\x1b[1mLa forma della richiesta (la lezione del 14/09)\x1b[0m');
r = await call('admin_1', { text: 'Contratto transitorio, Anna Testa, €1.100/mese', context: { hint: 'è il contratto di Simeto', known: { landlords: ['Anna Testa'], tenants: ['Oyku Testa'], properties: ['Via Simeto 12 — Via Simeto 12, Roma'] } } });
const body = r.anth[0]?.body || {};
check('admin + testo → 200', r.res.code === 200, JSON.stringify(r.res.body).slice(0, 200));
check('legge claude-opus-5 (il documento vale un contratto registrato: non si risparmia)', body.model === 'claude-opus-5' && MODEL === 'claude-opus-5', body.model);
check('OUTPUT STRUTTURATO: output_config.format è un json_schema', body.output_config?.format?.type === 'json_schema' && body.output_config?.format?.schema === INGEST_SCHEMA || JSON.stringify(body.output_config?.format?.schema) === JSON.stringify(INGEST_SCHEMA));
check('…ogni oggetto dello schema: additionalProperties false e required COMPLETO', (() => {
  let bad = 0, n = 0;
  (function walk(x) { if (!x || typeof x !== 'object') return; if (x.type === 'object') { n++; if (x.additionalProperties !== false || !Array.isArray(x.required) || x.required.length !== Object.keys(x.properties || {}).length) bad++; } Object.values(x).forEach(walk); })(INGEST_SCHEMA);
  return n >= 10 && bad === 0;
})());
check('…nessun vincolo che la piattaforma non supporta (minimum/maxLength/pattern)', !/"(minimum|maximum|minLength|maxLength|pattern)"/.test(JSON.stringify(INGEST_SCHEMA)));
check('thinking adattivo, MAI budget_tokens (400 su Opus 5)', body.thinking?.type === 'adaptive' && !('budget_tokens' in (body.thinking || {})));
check('max_tokens generoso (un taglio a 2000 era un «troncato» garantito su 120 campi)', body.max_tokens >= 8000, String(body.max_tokens));
check('il prompt di sistema è in cache (prefisso stabile, cache_control)', Array.isArray(body.system) && body.system[0]?.cache_control?.type === 'ephemeral');
check('il ripiego server-side sui rifiuti è dichiarato (beta + fallbacks)', r.anth[0]?.headers?.['anthropic-beta'] === 'server-side-fallback-2026-07-01' && body.fallbacks === 'default');
const userText = (body.messages?.[0]?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
check('il testo incollato è etichettato come DOCUMENTO', /TESTO INCOLLATO DALL'OPERATORE \(DOCUMENTO 1\)/.test(userText));
check('i nomi in archivio viaggiano (proprietari, inquilini, immobili) — solo per la grafia', /Anna Testa/.test(userText) && /Oyku Testa/.test(userText) && /Via Simeto 12/.test(userText) && /SOLO per usare la stessa grafia/.test(body.system[0].text));
check('l\'indicazione dell\'operatore arriva al modello', /è il contratto di Simeto/.test(userText));
check('…con la chiave del server', r.anth[0]?.headers?.['x-api-key'] === 'sk-test');

console.log('\n\x1b[1mLa proposta che torna\x1b[0m');
const P = r.res.body?.proposal || {};
check('quattro sezioni, nello schema piatto del portale', P.landlord && P.tenant && P.property && P.contract, Object.keys(P).join(','));
check('il catasto annidato del modello è piatto (foglio/particella/sub/rendita)', P.property?.foglio === '12' && P.property?.sub === '6' && P.property?.renditaCatastale === 512.3, JSON.stringify(P.property));
check('…e composto in testo per il PDF', /foglio 12, particella 345, sub 6/.test(P.property?.cadastralData || ''));
check('i campi inventati dal modello non escono (segreto, hacker)', !('segreto' in P.landlord) && !('hacker' in P.contract));
check('il deposito è DERIVATO (2 mensilità × canone) e la derivazione è detta', P.contract?.deposit === 2200 && /mensilità/.test(r.res.body?.derived?.['contract.deposit'] || ''), JSON.stringify(r.res.body?.derived));
check('i controlli del motore viaggiano già nella risposta', r.res.body?.checks && Array.isArray(r.res.body.checks.errors));
check('cedolare true → "si", cadenza "1" → 1, documento → codice', P.contract?.cedolareSecca === 'si' && P.contract?.installmentMonths === 1 && P.tenant?.docType === 'passport');
const EV = r.res.body?.evidence || [];
check('le citazioni arrivano (canone, foglio)', EV.some((e) => e.path === 'contract.rent' && /millecento/.test(e.quote)) && EV.some((e) => e.path === 'property.cadastral.foglio'));
check('…un percorso fuori schema viene scartato', !EV.some((e) => e.path === 'hacker.x'));
check('…un indice di documento inesistente diventa null, non un riferimento falso', EV.find((e) => e.path === 'tenant.codiceFiscale')?.file === null);
check('il verdetto per file: cosa è, quante pagine, leggibile', r.res.body?.files?.[0]?.kind === 'contratto' && r.res.body.files[0].label === 'Contratto di locazione' && r.res.body.files[0].legible === true || r.res.body?.files?.length === 0);
check('l\'uso: modello, token, tempo (per dire all\'operatore quanto è costata)', r.res.body?.usage?.model === 'claude-opus-5' && r.res.body.usage.inputTokens === 12000 && r.res.body.usage.cacheReadTokens === 3000);
check('summary e confidence', /Via Simeto/.test(r.res.body?.summary || '') && r.res.body?.confidence === 88);

console.log('\n\x1b[1mPiù file in una lettura sola\x1b[0m');
r = await call('admin_1', { text: 'note', files: [
  { base64: b64(PDF_BYTES), mediaType: 'application/pdf', name: 'contratto.pdf' },
  { base64: 'data:image/jpeg;base64,' + b64(JPG_BYTES), mediaType: 'image/jpeg', name: 'ci-fronte.jpg' },
] });
const content = r.anth[0]?.body?.messages?.[0]?.content || [];
check('due file → un blocco document e un blocco image, nell\'ordine', r.res.code === 200
  && content.filter((c) => c.type === 'document').length === 1 && content.filter((c) => c.type === 'image').length === 1
  && content.findIndex((c) => c.type === 'document') < content.findIndex((c) => c.type === 'image'), `${r.res.code} ${content.map((c) => c.type).join(',')}`);
check('…ognuno preceduto dalla SUA etichetta «DOCUMENTO n — nome»', /DOCUMENTO 1 — «contratto\.pdf»/.test(content[0]?.text || '') && /DOCUMENTO 2 — «ci-fronte\.jpg»/.test(content[2]?.text || ''));
check('…il data: URI viene spogliato del prefisso', content.find((c) => c.type === 'image')?.source?.data === b64(JPG_BYTES));
check('…e il testo incollato è il DOCUMENTO 3', /\(DOCUMENTO 3\)/.test(content.map((c) => c.text || '').join('\n')));
check('il vecchio client (base64 + mediaType al livello alto) funziona ancora', (await call('admin_1', { base64: b64(PDF_BYTES), mediaType: 'application/pdf' })).res.code === 200);

console.log('\n\x1b[1mIl transito da Storage (la cura del 413)\x1b[0m');
r = await call('admin_1', { files: [{ fileUrl: OUR_STORAGE, mediaType: 'application/pdf', name: 'grande.pdf' }] });
check('fileUrl del NOSTRO Storage → 200', r.res.code === 200, JSON.stringify(r.res.body).slice(0, 200));
check('…i byte scaricati sono ESATTAMENTE quelli che vanno ad Anthropic', (() => {
  const doc = (r.anth[0]?.body?.messages?.[0]?.content || []).find((c) => c.type === 'document');
  return doc && doc.source?.data === PDF_BYTES.toString('base64') && doc.source?.media_type === 'application/pdf';
})());
check('…lo Storage è stato letto una volta', r.storage === 1, String(r.storage));
r = await call('admin_1', { fileUrl: OUR_STORAGE });
check('senza mediaType dichiarato vale il content-type dello Storage', r.res.code === 200
  && (r.anth[0]?.body?.messages?.[0]?.content || []).some((c) => c.type === 'document'), `ho avuto ${r.res.code}`);

console.log('\n\x1b[1mMai un proxy verso host arbitrari\x1b[0m');
r = await call('admin_1', { files: [{ fileUrl: 'https://evil.example.com/leak.pdf', mediaType: 'application/pdf' }] });
check('host estraneo → 400 bad_file_url', r.res.code === 400 && r.res.body?.error === 'bad_file_url', `${r.res.code} ${r.res.body?.error}`);
check('…l\'host estraneo non viene MAI contattato', r.foreign === 0, String(r.foreign));
check('…e non si spende un token', r.anth.length === 0);
r = await call('admin_1', { fileUrl: 'http://firebasestorage.googleapis.com/v0/b/x/o/y?alt=media', mediaType: 'application/pdf' });
check('http nudo (non https) → 400 anche sul nostro host', r.res.code === 400 && r.foreign === 0 && r.storage === 0, `${r.res.code} foreign=${r.foreign} storage=${r.storage}`);

console.log('\n\x1b[1mI tetti restano onesti — e i rifiuti dicono il rimedio\x1b[0m');
r = await call('admin_1', { files: [{ fileUrl: HUGE_URL, mediaType: 'application/pdf' }] });
check('file oltre 8 MB via Storage → 413 file_too_large', r.res.code === 413 && r.res.body?.error === 'file_too_large', `${r.res.code} ${r.res.body?.error}`);
check('…senza spendere un token', r.anth.length === 0);
r = await call('admin_1', { base64: 'A'.repeat(8 * 1024 * 1024 + 1), mediaType: 'application/pdf' });
check('base64 inline oltre il tetto → 413', r.res.code === 413, `ho avuto ${r.res.code}`);
r = await call('admin_1', { files: Array.from({ length: 9 }, (_, i) => ({ base64: b64(PDF_BYTES), mediaType: 'application/pdf', name: 'f' + i })) });
check('nove file → 400 too_many_files, prima di spendere', r.res.code === 400 && r.res.body?.error === 'too_many_files' && r.anth.length === 0, `${r.res.code} ${r.res.body?.error}`);
r = await call('admin_1', { fileUrl: OUR_STORAGE, mediaType: 'application/zip' });
check('formato fuori whitelist → 400 anche via fileUrl', r.res.code === 400
  && r.res.body?.error === 'unsupported_media_type' && r.anth.length === 0,
  `${r.res.code} ${r.res.body?.error}`);
r = await call('admin_1', { files: [{ base64: b64(JPG_BYTES), mediaType: 'image/heic', name: 'IMG_1.heic' }] });
check('una foto HEIC (iPhone) → 400 con il RIMEDIO scritto, non un errore nudo', r.res.code === 400 && /JPEG|compatibile/i.test(r.res.body?.detail || ''), JSON.stringify(r.res.body));

console.log('\n\x1b[1mLe risposte del modello: mai una diagnosi sbagliata\x1b[0m');
r = await call('admin_1', { text: 'x' }, { stop: 'refusal' });
check('refusal → 502 ai_refused con spiegazione', r.res.code === 502 && r.res.body?.error === 'ai_refused' && r.res.body?.detail, `${r.res.code} ${r.res.body?.error}`);
r = await call('admin_1', { text: 'x' }, { stop: 'max_tokens' });
check('max_tokens → 502 ai_truncated (e SOLO in quel caso si parla di taglio)', r.res.code === 502 && r.res.body?.error === 'ai_truncated', `${r.res.code} ${r.res.body?.error}`);
r = await call('admin_1', { text: 'x' }, { status: 429, text: 'rate' });
check('429 → ai_rate_limited con «riprova tra un minuto»', r.res.code === 502 && r.res.body?.error === 'ai_rate_limited' && /minuto/.test(r.res.body?.detail || ''));
r = await call('admin_1', { text: 'x' }, { throwName: 'TimeoutError' });
check('tempo scaduto → 504 ai_timeout con il rimedio (meno pagine)', r.res.code === 504 && r.res.body?.error === 'ai_timeout' && /pagine/.test(r.res.body?.detail || ''), `${r.res.code} ${r.res.body?.error}`);
r = await call('admin_1', { text: 'x' }, { failFirstWith: 'unknown beta: server-side-fallback-2026-07-01' });
check('un 400 sul beta del ripiego → si riprova UNA volta senza, e la lettura passa', r.res.code === 200 && r.anth.length === 2
  && r.anth[0].headers['anthropic-beta'] && !r.anth[1].headers['anthropic-beta'] && !('fallbacks' in r.anth[1].body), `${r.res.code} calls=${r.anth.length}`);
r = await call('admin_1', { text: 'x' }, { failFirstWith: 'invalid_request_error: messages' });
check('un 400 di altra natura NON si riprova (niente doppia spesa)', r.res.code === 502 && r.anth.length === 1);

console.log('\n\x1b[1mIl vuoto detto per quello che è\x1b[0m');
r = await call('admin_1', { files: [{ base64: b64(JPG_BYTES), mediaType: 'image/jpeg', name: 'mossa.jpg' }] }, { reply: AI_EMPTY() });
check('tutto null → 200 empty:true (non un errore)', r.res.code === 200 && r.res.body?.empty === true && r.res.body?.proposal && !Object.keys(r.res.body.proposal).length, JSON.stringify(r.res.body).slice(0, 200));
check('…e il messaggio nomina il documento ILLEGGIBILE col motivo', /illeggibile/i.test(r.res.body?.message || '') && /sfocata/.test(r.res.body?.message || ''), r.res.body?.message);
check('…con il verdetto per file legible:false', r.res.body?.files?.[0]?.legible === false);

// ═══ L'APPLY VERO — "Crea nel portale" deve creare DAVVERO ═══════════════
// Il 30/08 l'operatore ha premuto Crea, letto "Innesto completato" e trovato
// l'archivio senza contratto: l'apply lo salta quando nella proposta manca
// l'immobile o l'inquilino, ma il riepilogo lo PROMETTEVA comunque e il
// toast finale non diceva niente. Qui si estraggono le funzioni REALI (con
// il generateMonthlyPayments reale) e le si guida su un Firestore in memoria.
console.log('\n\x1b[1mL\'apply crea davvero (funzioni reali su Firestore finto)\x1b[0m');

const appSrc = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
function extract(name) {
  const at = appSrc.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('non trovo ' + name);
  const start = appSrc.lastIndexOf('\n', at) + 1;   // prende anche l'eventuale async
  let i = appSrc.indexOf('{', at), depth = 0;
  for (; i < appSrc.length; i++) {
    if (appSrc[i] === '{') depth++;
    else if (appSrc[i] === '}') { depth--; if (!depth) break; }
  }
  return appSrc.slice(start, i + 1);
}

const applyWrites = [];
const storagePuts = [];
let applyAutoId = 0;
const fakeDb = {
  collection: (cname) => ({
    add: async (data) => { const id = cname.slice(0, 3) + '_' + (++applyAutoId); applyWrites.push({ op: 'add', c: cname, id, data }); return { id }; },
    doc: (id) => {
      const did = id || (cname.slice(0, 3) + '_' + (++applyAutoId));
      return { id: did, _path: cname + '/' + did, update: async (data) => { applyWrites.push({ op: 'update', c: cname, id: did, data }); } };
    },
    where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }),
  }),
  batch: () => ({
    set(ref, data) { applyWrites.push({ op: 'batch.set', path: ref._path, data }); },
    commit: async () => {},
  }),
};
const fakeStorage = { ref: (path) => ({
  put: async (blob, meta) => { storagePuts.push({ path, size: blob.size, meta }); return { ref: { getDownloadURL: async () => 'https://firebasestorage.googleapis.com/v0/b/t/o/' + encodeURIComponent(path) + '?alt=media' } }; },
  delete: async () => {},
}) };
const applyToasts = [];
const S = { users: [], properties: [], contracts: [], landlords: [], deadlines: [], profile: { id: 'admin', role: 'admin' } };
const { createRequire } = await import('node:module');
const requireCjs = createRequire(import.meta.url);
const APPLY_SRC = ['generateMonthlyPayments', 'monthsBetween', 'generateContractDeadlines', 'innestoEmpty', 'innestoReset', 'innestoPools', 'innestoLinkFor',
  'innestoPatchFor', 'innestoUserDoc', 'innestoArchiveDoc', 'innestoApply'].map(extract).join('\n') + '\nreturn innestoApply;';
const makeApply = new Function(
  'window', 'firebase', 'db', 'S', 'toast', 'renderPage', 'buildNav', 'loadDataFresh', 'logActivity', 'localStorage', 'console', '_innesto',
  'storage', 'auth', 'goTo', 'clearInterval', '_innestoTick', 'generateContractPDF',
  APPLY_SRC
);
async function runApply(proposal, seed = {}, opts = {}) {
  applyWrites.length = 0; applyToasts.length = 0; storagePuts.length = 0; applyAutoId = 0;
  S.users = seed.users || []; S.properties = seed.properties || [];
  S.contracts = []; S.landlords = seed.landlords || []; S.deadlines = [];
  const innesto = Object.assign({ proposal, links: {}, coLinks: {}, diffs: {}, notes: [], confidence: 90, busy: false, files: [], readDocs: [], archive: true }, opts);
  const fn = makeApply(
    { BOOM_DATAOPS: requireCjs('../../js/dataops-engine.js') },
    { firestore: { FieldValue: { serverTimestamp: () => 'TS', arrayUnion: (v) => ({ __union: v }) } } },
    fakeDb, S, (...a) => applyToasts.push(a), () => {}, () => {}, async () => {}, async () => {},
    { removeItem: () => {}, getItem: () => null, setItem: () => {} },
    { log: () => {}, warn: () => {}, error: () => {} },
    innesto, fakeStorage, { currentUser: { uid: 'admin' } }, () => {}, () => {}, null, undefined
  );
  await fn();
  const by = {};
  applyWrites.forEach((w) => { const k = w.op === 'batch.set' ? w.path.split('/')[0] : w.c; by[k] = (by[k] || 0) + (w.op === 'update' ? 0 : 1); });
  return { by, writes: [...applyWrites], toasts: [...applyToasts], puts: [...storagePuts] };
}

const FULL = {
  landlord: { name: 'Anna Rossi', email: 'anna@example.com', codiceFiscale: 'RSSNNA70A41H501J', iban: 'IT60X0542811101000000123456' },
  tenant: { name: 'Oyku Testa', email: 'oyku@example.com', codiceFiscale: 'TSTOYK95A41H501P', birthDate: '1995-01-01', birthPlace: 'Istanbul', docType: 'passport', docNum: 'U12345678', nationality: 'turca' },
  property: { name: 'Via Simeto 12', address: 'Via Simeto 12, Roma', rent: 1100, foglio: '12', particella: '345', sub: '6', cadastralData: 'foglio 12, particella 345, sub 6', energyClass: 'F', interno: '7' },
  contract: { type: 'transitorio', startDate: '2026-09-01', endDate: '2027-08-31', rent: 1100, deposit: 2200, depositMonths: 2, paymentDay: 5, installmentMonths: 1, cedolareSecca: 'si', transitionalReason: 'motivi di lavoro', esigenzaDi: 'conduttore' },
};

let a = await runApply(structuredClone(FULL));
check('proposta completa → contratto E piano rate scritti',
  a.by.contracts === 1 && a.by.payments === 12 && a.by.users === 2 && a.by.properties === 1,
  JSON.stringify(a.by));
check('…e il toast lo dice', a.toasts.some((t) => t[0] === 'success' && /contratto/.test(t[2] || '')));
const C = a.writes.find((w) => w.c === 'contracts' && w.op === 'add')?.data || {};
check('il contratto nasce con i TOKEN di firma (Magic Sign pronto, come saveContract)', /^[0-9a-f-]{36}$/.test(C.tenantSignToken || '') && /^[0-9a-f-]{36}$/.test(C.landlordSignToken || ''));
check('…con canone{} e durata{} strutturati (il PDF li legge)', C.canone?.monthly === 1100 && C.canone?.installments === 12 && C.durata?.startDate === '2026-09-01');
check('…con l\'identità delle parti sul contratto (CF, nascita, documento, catasto, APE)', C.tenantCF === 'TSTOYK95A41H501P' && C.tenantDob === '1995-01-01' && C.tenantDocNum === 'U12345678' && C.landlordCF === 'RSSNNA70A41H501J' && /foglio 12/.test(C.cadastral) && C.energyClass === 'F');
check('…e le scadenze (AdE, rinnovi) generate come dal portal', (a.by.deadlines || 0) >= 1, JSON.stringify(a.by));
const U = a.writes.filter((w) => w.c === 'users' && w.op === 'add').map((w) => w.data);
check('i profili users nascono nei DUE schemi (codiceFiscale+cf, birthDate+dob, idDocType+docType)',
  U.some((u) => u.role === 'tenant' && u.codiceFiscale === 'TSTOYK95A41H501P' && u.cf === 'TSTOYK95A41H501P' && u.dob === '1995-01-01' && u.idDocType === 'passport' && u.docType === 'passport'), JSON.stringify(U));
const PR = a.writes.find((w) => w.c === 'properties' && w.op === 'add')?.data || {};
check('l\'immobile porta il catasto a caselle E in testo, e interno anche come unit', PR.foglio === '12' && PR.sub === '6' && /foglio 12/.test(PR.cadastralData) && PR.unit === '7');

const senzaTenant = structuredClone(FULL); delete senzaTenant.tenant;
a = await runApply(senzaTenant);
check('senza inquilino il contratto NON nasce (niente rate orfane)',
  !a.by.contracts && !a.by.payments, JSON.stringify(a.by));
check('…ma il salto NON è più muto: il toast nomina la gamba mancante',
  a.toasts.some((t) => t[0] === 'warning' && /Contratto NON creato/.test(t[1]) && /inquilino/.test(t[2])),
  JSON.stringify(a.toasts));

a = await runApply(structuredClone(FULL), { landlords: [{ id: 'll_anna', name: 'Anna Rossi', email: 'anna@example.com' }] });
check('proprietario già in landlords → NESSUN doppione (il pool è quello della card)',
  a.by.users === 1 && a.writes.some((w) => w.c === 'contracts' && w.op === 'add' && w.data.landlordId === 'll_anna'),
  JSON.stringify(a.by));

// LA MODIFICA PROPOSTA (STUDIO_SCRIVANO §3): l'inquilino esiste già, senza
// CF; il documento lo porta → si riempie il buco sul record esistente. Il
// suo indirizzo, diverso, NON cambia da solo.
a = await runApply(structuredClone(FULL), {
  users: [{ id: 'u_ten', name: 'Oyku Testa', email: 'oyku@example.com', role: 'tenant', address: 'Via Roma 1', codiceFiscale: '' }],
});
check('inquilino già in archivio → nessun utente nuovo, contratto sul SUO id',
  a.by.users === 1 && a.writes.some((w) => w.c === 'contracts' && w.op === 'add' && w.data.tenantId === 'u_ten'), JSON.stringify(a.by));
const upd = a.writes.find((w) => w.c === 'users' && w.op === 'update' && w.id === 'u_ten')?.data || null;
check('…e il BUCO (CF) si riempie sul record esistente, nei due schemi', upd && upd.codiceFiscale === 'TSTOYK95A41H501P' && upd.cf === 'TSTOYK95A41H501P', JSON.stringify(upd));
check('…mentre l\'indirizzo diverso NON viene sovrascritto senza spunta', upd && !('address' in upd));
check('…e l\'aggiornamento è firmato', upd && upd.updatedBy === 'innesto');
const withAddr = structuredClone(FULL); withAddr.tenant.address = 'Via Roma 1/B';
a = await runApply(withAddr, { users: [{ id: 'u_ten', name: 'Oyku Testa', email: 'oyku@example.com', role: 'tenant', address: 'Via Roma 1', codiceFiscale: '' }] }, { diffs: { tenant: { address: true } } });
check('con la spunta dell\'operatore il valore che cambia ENTRA', (a.writes.find((w) => w.c === 'users' && w.op === 'update')?.data || {}).address === 'Via Roma 1/B');
a = await runApply(structuredClone(FULL), { users: [{ id: 'u_ten', name: 'Oyku Testa', email: 'oyku@example.com', role: 'tenant', codiceFiscale: 'TSTOYK95A41H501P', birthDate: '1995-01-01', birthPlace: 'Istanbul', idDocType: 'passport', idDocNumber: 'U12345678', nationality: 'turca' }] });
check('record già completo → nessuna scrittura di aggiornamento', !a.writes.some((w) => w.c === 'users' && w.op === 'update'));
a = await runApply(structuredClone(FULL), { users: [{ id: 'u_ten', name: 'Oyku Testa', email: 'oyku@example.com', role: 'tenant' }] }, { links: { tenant: null } });
check('«non collegare» esplicito → si crea un utente nuovo e non si tocca l\'esistente', a.by.users === 2 && !a.writes.some((w) => w.c === 'users' && w.op === 'update'));

// I co-conduttori: un profilo ciascuno e una riga sul contratto col CF.
const conCo = structuredClone(FULL);
conCo.coTenants = [{ name: 'Luca Bianchi', codiceFiscale: 'BNCLCU00B02H501C', email: 'luca@example.com', birthDate: '2000-02-02' }];
a = await runApply(conCo);
check('co-conduttore → un profilo in più e la riga sul contratto (cf, dob, tenantIndex)', a.by.users === 3 && (() => {
  const c = a.writes.find((w) => w.c === 'contracts' && w.op === 'add')?.data;
  return c && c.coTenants?.length === 1 && c.coTenants[0].cf === 'BNCLCU00B02H501C' && c.coTenants[0].dob === '2000-02-02' && c.coTenants[0].tenantIndex === 1 && c.coTenants[0].userId;
})(), JSON.stringify(a.by));
a = await runApply(conCo, { users: [{ id: 'u_luca', name: 'Bianchi Luca', email: 'luca@example.com', role: 'tenant' }] });
check('co-conduttore già in archivio → agganciato (nome invertito) e non duplicato', a.by.users === 2 && a.writes.find((w) => w.c === 'contracts')?.data.coTenants[0].userId === 'u_luca');

// IL DOCUMENTO RESTA (STUDIO_SCRIVANO §4, passo 1): il file letto si archivia
// legato a ciò che ha creato; la carta d'identità entra negli identityDocs.
const readDocs = [
  { blob: { size: 10, type: 'application/pdf' }, mediaType: 'application/pdf', file: { name: 'contratto simeto.pdf', type: 'application/pdf', size: 10 }, meta: { kind: 'contratto', party: null, title: 'Contratto transitorio Via Simeto 12', docType: 'contract', category: 'contratto locazione', folder: '01_Contratto', summary: 'firmato' } },
  { blob: { size: 5, type: 'image/jpeg' }, mediaType: 'image/jpeg', file: { name: 'IMG_1.jpg', type: 'image/jpeg', size: 5 }, meta: { kind: 'documento_identita', party: 'tenant', title: 'Passaporto di Oyku Testa', docType: 'id', category: 'documento identità carta ID', folder: '07_Inquilino', summary: '' } },
];
a = await runApply(structuredClone(FULL), {}, { readDocs });
const docs = a.writes.filter((w) => w.c === 'documents' && w.op === 'add').map((w) => w.data);
const ctr = a.writes.find((w) => w.c === 'contracts' && w.op === 'add');
check('i due documenti letti finiscono su Storage nella cartella dell\'operatore', a.puts.length === 2 && a.puts.every((p) => /^documents\/admin\/innesto\//.test(p.path)), JSON.stringify(a.puts));
check('…e in `documents`, legati al contratto e all\'immobile, con categoria dello Smistatore', docs.length === 2 && docs.every((d) => d.contractId === ctr.id && d.propertyId && d.source === 'innesto') && docs.some((d) => d.category === 'contratto locazione' && d.type === 'contract'), JSON.stringify(docs.map((d) => [d.name, d.type, d.category, d.contractId])));
check('…il documento d\'identità è intestato all\'inquilino', docs.find((d) => d.type === 'id')?.userId === a.writes.find((w) => w.c === 'users' && w.data.role === 'tenant')?.id);
check('…ed entra negli identityDocs del contratto E del profilo (arrayUnion, mai una riscrittura)',
  a.writes.some((w) => w.c === 'contracts' && w.op === 'update' && w.data.identityDocs?.__union?.role === 'tenant')
  && a.writes.some((w) => w.c === 'users' && w.op === 'update' && w.data.identityDocs?.__union?.url));
check('…e il toast conta i documenti archiviati', a.toasts.some((t) => t[0] === 'success' && /2 documenti archiviati/.test(t[2] || '')), JSON.stringify(a.toasts));
a = await runApply(structuredClone(FULL), {}, { readDocs, archive: false });
check('con l\'archivio spento non si carica NULLA', a.puts.length === 0 && !a.writes.some((w) => w.c === 'documents'));

// IL CASO VIA SIMETO (30/08): il PDF non porta inquilino né immobile, ma
// ENTRAMBI esistono in anagrafica (creati da una corsa precedente). Con gli
// agganci del fantasma il contratto nasce sui record esistenti — zero
// doppioni, e le rate puntano agli id giusti.
a = await runApply({ contract: structuredClone(FULL.contract) }, {
  users: [{ id: 'u_ten', name: 'Oyku Testa', email: 'oyku@example.com', role: 'tenant' }],
  properties: [{ id: 'p_sim', name: 'Via Simeto 12', address: 'Via Simeto 12, Roma', rent: 1100 }],
}, { links: { tenant: 'u_ten', property: 'p_sim' } });
check('CASO VIA SIMETO: contratto dagli agganci d\'archivio, senza sezioni nella proposta',
  a.by.contracts === 1 && a.by.payments === 12 && !a.by.users && !a.by.properties,
  JSON.stringify(a.by));
check('…con gli id GIUSTI dell\'archivio', (() => {
  const c = a.writes.find((w) => w.c === 'contracts' && w.op === 'add');
  return c && c.data.tenantId === 'u_ten' && c.data.propertyId === 'p_sim';
})());
check('…e l\'immobile agganciato viene marcato affittato',
  a.writes.some((w) => w.c === 'properties' && w.op === 'update' && w.id === 'p_sim' && w.data.availabilityStatus === 'rented'));

// L'aggancio ESPLICITO vince sul match riderivato: se l'operatore ha scelto
// un immobile diverso da quello che il nome suggerirebbe, comanda lui.
a = await runApply(structuredClone(FULL), {
  users: [{ id: 'u_ten', name: 'Oyku Testa', email: 'oyku@example.com', role: 'tenant' }],
  properties: [
    { id: 'p_sim', name: 'Via Simeto 12', address: 'Via Simeto 12, Roma', rent: 1100 },
    { id: 'p_altro', name: 'Via Simeto 12 int. 7', address: 'Via Simeto 12, Roma', rent: 1100 },
  ],
}, { links: { property: 'p_altro' } });
check('l\'aggancio scelto dall\'operatore vince sul match automatico', (() => {
  const c = a.writes.find((w) => w.c === 'contracts' && w.op === 'add');
  return c && c.data.propertyId === 'p_altro' && !a.by.properties;
})());

console.log('\n\x1b[1mLe giunzioni sulla sorgente\x1b[0m');
const app = appSrc;
const api = readFileSync(new URL('../../api/portal/ingest.js', import.meta.url), 'utf8');
const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

check('il riepilogo promette il contratto SOLO con entrambe le gambe',
  /p\.contract && !contractLegs\.length\) willCreate\.push\('contratto/.test(app));
check('…e la gamba mancante ha una card visibile, non un silenzio',
  /Contratto NON creabile/.test(app));
check('…ma un aggancio dall\'archivio VALE come gamba (il fantasma sblocca)',
  /!p\.property && !_innesto\.links\.property\) contractLegs/.test(app)
  && /!p\.tenant && !_innesto\.links\.tenant\) contractLegs/.test(app));
check('la sezione mancante ha il fantasma: select dall\'archivio + compila a mano',
  /innestoPick\(/.test(app) && /innestoAddSection\(/.test(app) && /scegli dall'archivio/.test(app));
check('una seconda lettura INTEGRA la proposta aperta (mergeProposal, mai sovrascrivere)',
  /mergeProposal\(_innesto\.proposal, fresh\)/.test(app) && /Leggi e integra/.test(app));
check('…e le derivazioni girano dopo ogni lettura col dizionario per il catasto',
  /deriveProposal\(next, \{ parseCadastral/.test(app));
check('a contratto creato si atterra sui Contratti, non su una pagina vuota',
  /if \(madeContract\) goTo\('contracts'\)/.test(app));
check('la card mostra la CITAZIONE sotto il campo e dichiara il calcolato',
  /innestoEvidence\(path\)/.test(app) && /calcolato: \$\{esc\(derived\)\}/.test(app) && /senza citazione dal documento/.test(app));
check('la modifica proposta: un buco si riempie da solo, un cambio si conferma',
  /r\.action === 'fill'/.test(app) && /diffRecord\(/.test(app) && /applyDiff\(/.test(app) && /innestoToggleDiff\(/.test(app));
check('più file: input multiple, drop, incolla, scatta',
  /type="file" multiple accept="application\/pdf,image\/\*"/.test(app) && /innestoDrop\(event\)/.test(app) && /innestoPaste\(event\)/.test(app) && /capture="environment"/.test(app));
check('il progresso dice cosa sta facendo e da quanto', /innestoProgressText\(\)/.test(app) && /setInterval/.test(app.slice(app.indexOf('async function innestoAnalyze'), app.indexOf('async function innestoAnalyze') + 800)));

const sw = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
check('il motore dataops è network-first nel SW (una copia stantia divergerebbe dalla pagina)',
  /url\.pathname === '\/js\/dataops-engine\.js'/.test(sw));
check('…e la cache del SW è stata versionata oltre la v20', !/boom-v20'/.test(sw));

const capM = /INNESTO_INLINE_MAX\s*=\s*(\d+)\s*\*\s*1024\s*\*\s*1024/.exec(app);
check('il tetto inline del client sta SOTTO i 4,5 MB di piattaforma (base64 +33%)',
  capM && Number(capM[1]) * 1024 * 1024 * (4 / 3) < 4.5 * 1024 * 1024,
  capM ? `${capM[1]} MB raw` : 'INNESTO_INLINE_MAX assente');
check('la scelta inline/transito passa dal tetto SULLA SOMMA dei file', /inlineTotal \+ blob\.size <= INNESTO_INLINE_MAX/.test(app));
check('le foto si riducono PRIMA della scelta (adeCompressImage, una copia sola)', (() => {
  const fn = app.slice(app.indexOf('async function innestoAnalyze'));
  const body = fn.slice(0, fn.indexOf('\n    }\n'));
  return body.indexOf('adeCompressImage') !== -1
    && body.indexOf('adeCompressImage') < body.indexOf('INNESTO_INLINE_MAX');
})());
check('il transito va nella cartella PROPRIA (documents/<uid>/innesto-tmp/)',
  /storage\.ref\('documents\/'\s*\+\s*auth\.currentUser\.uid\s*\+\s*'\/innesto-tmp\//.test(app));
check('…e si CANCELLA a lettura finita (anche su errore: sta nel finally)', (() => {
  const fn = app.slice(app.indexOf('async function innestoAnalyze'));
  const fin = fn.slice(fn.indexOf('} finally {'));
  return /transitRefs\.forEach\(ref => ref\.delete\(\)/.test(fin.slice(0, 400));
})());
check('la pagina dice del transito invece di promettere il falso',
  /transita dal tuo Storage/.test(app) && !/Non viene salvato da nessuna parte finché non confermi/.test(app));
check('il server inchioda l\'host del fileUrl al nostro Storage',
  /u\.hostname\s*!==\s*'firebasestorage\.googleapis\.com'/.test(api));
check('il server legge con Opus 5 e output strutturato (MODEL + json_schema nel sorgente)',
  /MODEL = 'claude-opus-5'/.test(api) && /format: \{ type: 'json_schema', schema: INGEST_SCHEMA \}/.test(api));
check('la funzione ha il tempo per leggere: maxDuration in vercel.json sopra il tetto della chiamata',
  (() => { const md = vercel.functions?.['api/portal/ingest.js']?.maxDuration; const ai = Number((/const AI_MS = (\d+)/.exec(api) || [])[1]); return md >= 100 && ai > 0 && ai < md * 1000; })(),
  JSON.stringify(vercel.functions?.['api/portal/ingest.js']));
check('nei log va la forma, mai il contenuto (nessun raw.slice nel file)', !/raw\.slice\(/.test(api));

console.log('\n────────────────────────────────────────────────');
console.log(`\x1b[1mResult: ${pass} passed, ${fail} failed\x1b[0m`);
if (fail) process.exit(1);
console.log('\x1b[32mLa lettura è strutturata e dice la verità, i file entrano insieme, l\'apply crea (e aggiorna, e archivia) davvero.\x1b[0m');
