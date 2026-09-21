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
import { PDFDocument } from 'pdf-lib';

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
const HUGE_BYTES = Buffer.alloc(20 * 1024 * 1024 + 1, 65);
// Un «PDF» da 9 MB (pdf-lib non lo apre: passa com'è) — il 21/09 era «troppo grande».
const NINE_MB_PDF = Buffer.concat([Buffer.from('%PDF-1.4 '), Buffer.alloc(9 * 1024 * 1024, 32)]);
const ELEVEN_MB_PDF = Buffer.concat([Buffer.from('%PDF-1.4 '), Buffer.alloc(11 * 1024 * 1024, 32)]);
// Una HEIC VERA nella firma (ftypheic): i byte di un JPEG con l'etichetta
// «image/heic» vengono riconosciuti come JPEG e letti — giustamente.
const HEIC_BYTES = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(24, 0)]);
// Uno ZIP minimo (STORE o DEFLATE) per costruire Word/Excel finti e un
// archivio che non è un documento.
import { deflateRawSync } from 'node:zlib';
import { crc32 } from '../../api/_zip.js';
function mkZip(entries, deflate) {
  const locals = [], cds = []; let off = 0;
  for (const [name, str] of entries) {
    const nameB = Buffer.from(name), raw = Buffer.from(str), data = deflate ? deflateRawSync(raw) : raw, crc = crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(deflate ? 8 : 0, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nameB.length, 26); lh.writeUInt16LE(0, 28);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0, 8); cd.writeUInt16LE(deflate ? 8 : 0, 10);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(raw.length, 24); cd.writeUInt16LE(nameB.length, 28); cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32); cd.writeUInt32LE(off, 42);
    locals.push(lh, nameB, data); cds.push(cd, nameB); off += 30 + nameB.length + data.length;
  }
  const cdBuf = Buffer.concat(cds);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cdBuf, eocd]);
}
const DOCX = mkZip([['[Content_Types].xml', '<Types/>'], ['word/document.xml', '<w:document><w:body><w:p><w:r><w:t>Contratto di locazione transitoria</w:t></w:r></w:p><w:p><w:r><w:t>Canone &#8364;1.100 al mese</w:t><w:tab/><w:t>deposito 2 mensilit&#224;</w:t></w:r></w:p></w:body></w:document>']], true);
const XLSX = mkZip([['xl/workbook.xml', '<workbook><sheets><sheet name="Rate" sheetId="1" r:id="rId1"/></sheets></workbook>'], ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'], ['xl/sharedStrings.xml', '<sst><si><t>Mese</t></si><si><t>Importo</t></si><si><t>Settembre</t></si></sst>'], ['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>1100</v></c></row></sheetData></worksheet>']], false);
const NOT_A_DOC = mkZip([['x.bin', 'xx']], false);
const EML = Buffer.from('From: Marta Neri <marta@x.com>\r\nTo: info@boomrome.com\r\nSubject: =?utf-8?B?Q2FzYSBhIFRyYXN0ZXZlcmU=?=\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nCerco un bilocale a Trastevere da settembre, budget =E2=82=AC1200 al mese.\r\n');

const OUR_STORAGE = 'https://firebasestorage.googleapis.com/v0/b/test/o/documents%2Fadmin_1%2Finnesto-tmp%2F1_Simeto12.pdf?alt=media&token=t';
const HUGE_URL    = 'https://firebasestorage.googleapis.com/v0/b/test/o/documents%2Fadmin_1%2Finnesto-tmp%2F2_enorme.pdf?alt=media&token=t';

const toF = (v) => (typeof v === 'string' ? { stringValue: v } : { nullValue: null });
const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

// La risposta del modello: l'INPUT dello strumento `proposta` (tutte le
// chiavi; qui anche null, numeri e booleani dove lo schema chiede stringhe —
// senza grammatica l'aderenza è del modello, e il motore deve leggerli lo
// stesso). Porta anche campi INVENTATI (segreto, hacker) e una citazione con
// percorso inesistente: la normalizzazione e la whitelist devono fermarli.
const person = (o) => Object.assign({ name: null, email: null, phone: null, codiceFiscale: null, address: null, birthDate: null, birthPlace: null, nationality: null, docType: null, docNum: null, docIssuer: null, docIssueDate: null }, o);
const AI_FULL = () => ({
  files: [{ index: 1, kind: 'Contratto', title: 'Contratto transitorio Via Simeto 12', pages: '3', legible: true, summary: 'contratto firmato', party: '' }],
  landlord: person({ name: 'Anna Testa', email: 'anna@example.com', codiceFiscale: 'TSTNNA70A41H501J', segreto: 'mai', kind: 'fisica', businessName: null, partitaIva: null, iban: null }),
  tenant: person({ name: 'Oyku Testa', email: 'oyku@example.com', codiceFiscale: 'TSTOYK95A41H501P', birthDate: '1995-01-01', birthPlace: 'Istanbul', docType: 'passport', docNum: 'U12345678', permessoNumero: null, permessoScadenza: null }),
  coTenants: [],
  property: { name: '', address: 'Via Simeto 12', city: '', floor: '2', scala: '', interno: '7', sqm: '65', rooms: '2', bathrooms: 1, accessories: '', furnished: 'si', energyClass: 'F', propertyType: 'Apartment',
    cadastral: { sezione: '', foglio: '12', particella: '345', sub: '6', categoria: 'A/2', rendita: '512.3' }, tabelle: { proprieta: '', riscaldamento: null, acqua: null, altre: '' } },
  contract: { type: 'transitorio', startDate: '2026-09-01', endDate: '2027-08-31', durationMonths: '12', rent: '1100', deposit: '', depositMonths: '2', paymentDay: '5', installmentMonths: '1', accessoryCharges: '', condoMode: '', cedolareSecca: 'si',
    transitionalReason: 'motivi di lavoro', transitionalDocs: null, esigenzaDi: 'conduttore', studenti: { corsoStudi: null, universita: null, universitaIndirizzo: null, tipoIscrizione: null, annoAccademico: null },
    cohabitants: null, otherClauses: null, signaturePlace: 'Roma', signatureDate: null, paymentMethod: null, istatPct: null, notes: null, hacker: 'x' },
  evidence: [
    { path: 'contract.rent', quote: 'euro millecento/00 (€ 1.100,00) mensili', file: '1', page: '1' },
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
let AI = { reply: AI_FULL(), stop: 'end_turn', status: 200, text: '', throwName: '', failFirstWith: '', viaText: false };

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
    const body = JSON.parse(opts.body || '{}');
    anthCalls.push({ headers: opts.headers, body });
    if (AI.throwName) { const e = new Error('aborted'); e.name = AI.throwName; throw e; }
    if (AI.failFirstWith && anthCalls.length === 1) return new Response(AI.failFirstWith, { status: 400 });
    if (AI.status !== 200) return new Response(AI.text || 'err', { status: AI.status });
    const usage = { input_tokens: 12000, output_tokens: 1800, cache_read_input_tokens: 3000 };
    if (AI.stop === 'max_tokens') return json({ model: 'claude-opus-5', stop_reason: 'max_tokens', usage, content: [{ type: 'text', text: '{"files": [' }] });
    if (AI.stop === 'refusal') return json({ model: 'claude-opus-5', stop_reason: 'refusal', usage, content: [], stop_details: { type: 'refusal', category: null } });
    // A parole (tool_choice auto e un modello che non chiama): il JSON sta nel testo, dentro un recinto.
    if (AI.viaText) return json({ model: 'claude-opus-5', stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Ecco la proposta:\n```json\n' + JSON.stringify(AI.reply) + '\n```' }] });
    // La forma VERA della risposta: l'input dello strumento, già un oggetto — mai testo da parsare.
    return json({ model: 'claude-opus-5', stop_reason: 'tool_use', usage,
      content: [{ type: 'text', text: 'Ecco la proposta.' }, { type: 'tool_use', id: 'toolu_01', name: body.tools?.[0]?.name || 'proposta', input: AI.reply }] });
  }
  // Qualunque altro host è un buco: si conta e si nega.
  foreignFetches++;
  return new Response('nope', { status: 200, headers: { 'Content-Type': 'application/pdf' } });
};

const { default: handler, INGEST_SCHEMA, SCHEMA_LIMITS, MODEL, MAX_PAGES, MAX_TOTAL_PAGES } = await import('../../api/portal/ingest.js');

// Conta ciò che l'API conta quando compila lo schema in grammatica: i
// parametri con UNIONE (anyOf / oneOf / type array) e quelli FUORI da
// required. I limiti documentati sono 16 e 24 per richiesta; il 21/09/2026
// lo schema ne aveva 99 con unione e ogni lettura moriva con 400.
function schemaComplexity(schema) {
  let params = 0, unions = 0, optional = 0;
  (function walk(x) {
    if (!x || typeof x !== 'object') return;
    if (x.type === 'object' && x.properties) {
      const req = new Set(x.required || []);
      Object.entries(x.properties).forEach(([k, v]) => { params++; if (!req.has(k)) optional++; if (v.anyOf || v.oneOf || Array.isArray(v.type)) unions++; });
    }
    Object.values(x).forEach(walk);
  })(schema);
  return { params, unions, optional };
}

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
  AI = Object.assign({ reply: AI_FULL(), stop: 'end_turn', status: 200, text: '', throwName: '', failFirstWith: '', viaText: false }, ai || {});
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
const pdfOf = async (n) => { const d = await PDFDocument.create(); for (let i = 0; i < n; i++) d.addPage([200, 200]); return Buffer.from(await d.save()); };

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
check('IL JSON ARRIVA GIÀ PARSATO: lo schema è l\'input_schema dello strumento `proposta`, chiamato FORZATO e uno solo — e NESSUNA grammatica (niente output_config.format, niente strict: la terza lezione del 21/09)',
  body.tools?.length === 1 && body.tools[0].name === 'proposta' && JSON.stringify(body.tools[0].input_schema) === JSON.stringify(INGEST_SCHEMA) && body.tools[0].strict !== true
  && !body.output_config?.format && body.tool_choice?.type === 'tool' && body.tool_choice?.name === 'proposta' && body.tool_choice?.disable_parallel_tool_use === true,
  JSON.stringify({ tools: (body.tools || []).map((t) => [t.name, t.strict]), tool_choice: body.tool_choice, output_config: Object.keys(body.output_config || {}) }));
check('…il prompt dice di CHIAMARE lo strumento, una volta sola', /chiamando lo strumento `proposta`/.test(body.system?.[0]?.text || '') && /UNA sola chiamata allo strumento `proposta`/.test(body.system?.[0]?.text || ''));
check('…ogni oggetto dello schema: additionalProperties false e required COMPLETO', (() => {
  let bad = 0, n = 0;
  (function walk(x) { if (!x || typeof x !== 'object') return; if (x.type === 'object') { n++; if (x.additionalProperties !== false || !Array.isArray(x.required) || x.required.length !== Object.keys(x.properties || {}).length) bad++; } Object.values(x).forEach(walk); })(INGEST_SCHEMA);
  return n >= 10 && bad === 0;
})());
check('…nessun vincolo che la piattaforma non supporta (minimum/maxLength/pattern)', !/"(minimum|maximum|minLength|maxLength|pattern)"/.test(JSON.stringify(INGEST_SCHEMA)));
check('…ZERO unioni e ZERO facoltativi su >100 parametri: i limiti DOCUMENTATI sono 16 unioni e 24 facoltativi PER RICHIESTA (il 21/09/2026 erano 99 unioni → 400 su OGNI lettura)', (() => {
  const c = schemaComplexity(INGEST_SCHEMA);
  return c.params > 100 && c.unions === 0 && c.optional === 0 && SCHEMA_LIMITS.unionParams === 16 && SCHEMA_LIMITS.optionalParams === 24 && c.unions <= SCHEMA_LIMITS.unionParams && c.optional <= SCHEMA_LIMITS.optionalParams;
})(), JSON.stringify(schemaComplexity(INGEST_SCHEMA)));
check('…il contatore morde (mutazione: un anyOf e un campo fuori da required vengono contati)', (() => {
  const c = schemaComplexity({ type: 'object', properties: { a: { anyOf: [{ type: 'string' }, { type: 'null' }] }, b: { type: ['string', 'null'] }, c: { type: 'string' } }, required: ['a', 'b'], additionalProperties: false });
  return c.params === 3 && c.unions === 2 && c.optional === 1;
})());
check('…«manca» è "" e MAI null: nessun tipo null nello schema, e ogni enum facoltativo ammette ""', !/"null"/.test(JSON.stringify(INGEST_SCHEMA)) && (() => {
  let withEmpty = 0; (function walk(x) { if (!x || typeof x !== 'object') return; if (Array.isArray(x.enum) && x.enum.indexOf('') >= 0) withEmpty++; Object.values(x).forEach(walk); })(INGEST_SCHEMA); return withEmpty >= 12;
})());
check('…e il prompt di sistema dice «stringa vuota», non «null»', /lascia la stringa vuota ""/.test(body.system?.[0]?.text || '') && !/lascia null/.test(body.system?.[0]?.text || ''));
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
check('i numeri del modello sono stringhe di cifre e tornano numeri (sqm "65" → 65, rendita "512.3", canone "1100", giorno "5")', P.property?.sqm === 65 && P.property?.renditaCatastale === 512.3 && P.contract?.rent === 1100 && P.contract?.paymentDay === 5 && P.contract?.durationMonths === 12, JSON.stringify([P.property?.sqm, P.property?.renditaCatastale, P.contract?.rent, P.contract?.paymentDay]));
check('"si" / "no" / "" per i booleani: ammobiliato "si" → yes, cedolare "si" → si; "" resta vuoto (oneri, condominio) e il deposito "" viene DERIVATO da mensilità × canone (2 × 1100)', P.property?.furnished === 'yes' && P.contract?.cedolareSecca === 'si' && P.contract?.accessoryCharges == null && P.contract?.condoMode === '' && P.contract?.deposit === 2200, JSON.stringify([P.property?.furnished, P.contract?.cedolareSecca, P.contract?.accessoryCharges, P.contract?.deposit]));
check('citazioni con indice come stringa: file "1" pagina "1" → 1 e 1', EV.find((e) => e.path === 'contract.rent')?.file === 1 && EV.find((e) => e.path === 'contract.rent')?.page === 1, JSON.stringify(EV.find((e) => e.path === 'contract.rent')));
check('gli enum senza maiuscole garantite: «Contratto» → contratto, «Apartment» → apartment', (r.res.body?.files?.[0]?.kind === 'contratto' || r.res.body?.files?.length === 0) && P.property?.propertyType === 'apartment', JSON.stringify([r.res.body?.files?.[0]?.kind, P.property?.propertyType]));
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
check('file oltre 20 MB via Storage → 413 file_too_large', r.res.code === 413 && r.res.body?.error === 'file_too_large', `${r.res.code} ${r.res.body?.error}`);
check('…senza spendere un token', r.anth.length === 0);
r = await call('admin_1', { base64: 'A'.repeat(Math.ceil(20 * 1024 * 1024 * 4 / 3) + 8), mediaType: 'application/pdf' });
check('base64 inline oltre il tetto → 413', r.res.code === 413, `ho avuto ${r.res.code}`);
r = await call('admin_1', { files: [{ base64: b64(NINE_MB_PDF), mediaType: 'application/pdf', name: 'scansione.pdf' }] });
check('LA SECONDA LEZIONE DEL 21/09: un PDF da 9 MB NON è più «troppo grande» (il tetto era nostro, non della piattaforma) → si legge', r.res.code === 200 && r.anth.length === 1, `${r.res.code} ${r.res.body?.error}`);
r = await call('admin_1', { files: [{ base64: b64(HUGE_BYTES.subarray(0, 21 * 1024 * 1024)), mediaType: 'application/pdf', name: 'enorme.pdf' }] });
check('…oltre 20 MB il rifiuto dice il numero e il rimedio (qualità inferiore / fotografa), non «8 MB»', r.res.code === 413 && r.res.body?.error === 'file_too_large' && /20 MB/.test(r.res.body?.detail || '') && /fotografa/.test(r.res.body?.detail || '') && !/8 MB/.test(r.res.body?.detail || ''), JSON.stringify(r.res.body));
r = await call('admin_1', { files: [{ base64: b64(ELEVEN_MB_PDF), mediaType: 'application/pdf', name: 'a.pdf' }, { base64: b64(ELEVEN_MB_PDF), mediaType: 'application/pdf', name: 'b.pdf' }] });
check('due file da 11 MB → 413 files_too_large col rimedio dei due giri', r.res.code === 413 && r.res.body?.error === 'files_too_large' && /due giri/.test(r.res.body?.detail || '') && r.anth.length === 0, `${r.res.code} ${r.res.body?.error}`);
r = await call('admin_1', { files: Array.from({ length: 9 }, (_, i) => ({ base64: b64(PDF_BYTES), mediaType: 'application/pdf', name: 'f' + i })) });
check('nove file → 400 too_many_files, prima di spendere', r.res.code === 400 && r.res.body?.error === 'too_many_files' && r.anth.length === 0, `${r.res.code} ${r.res.body?.error}`);
r = await call('admin_1', { fileUrl: OUR_STORAGE, mediaType: 'application/zip' });
check('un\'etichetta sbagliata non conta: i byte sono un PDF → si legge (il tipo VERO viene dai byte)', r.res.code === 200 && r.anth.length === 1, `${r.res.code} ${r.res.body?.error}`);
r = await call('admin_1', { files: [{ base64: b64(NOT_A_DOC), mediaType: 'application/zip', name: 'archivio.zip' }] });
check('un archivio che non è un documento → 400 unsupported_media_type con l\'ELENCO dei formati buoni', r.res.code === 400
  && r.res.body?.error === 'unsupported_media_type' && /Word/.test(r.res.body?.detail || '') && /email/.test(r.res.body?.detail || '') && r.anth.length === 0,
  `${r.res.code} ${r.res.body?.error} ${r.res.body?.detail}`);
r = await call('admin_1', { files: [{ base64: b64(HEIC_BYTES), mediaType: 'image/heic', name: 'IMG_1.heic' }] });
check('una foto HEIC (iPhone) → 400 con il RIMEDIO scritto, non un errore nudo', r.res.code === 400 && /JPEG|compatibile/i.test(r.res.body?.detail || ''), JSON.stringify(r.res.body));
r = await call('admin_1', { files: [{ base64: b64(JPG_BYTES), mediaType: 'image/heic', name: 'IMG_2.heic' }] });
check('…ma un JPEG etichettato HEIC (Safari l\'ha già convertito) si legge come JPEG', r.res.code === 200 && (r.anth[0]?.body?.messages?.[0]?.content || []).some((c) => c.type === 'image' && c.source?.media_type === 'image/jpeg'), `${r.res.code} ${r.res.body?.error}`);

console.log('\n\x1b[1mQualsiasi formato: Word, Excel, email, testo diventano TESTO per il modello\x1b[0m');
r = await call('admin_1', { files: [{ base64: b64(DOCX), mediaType: 'application/octet-stream', name: 'contratto.docx' }] });
let blocks = r.anth[0]?.body?.messages?.[0]?.content || [];
check('un .docx (dichiarato octet-stream dal browser) → 200, riconosciuto dai byte come Word', r.res.code === 200 && r.res.body?.files?.[0]?.isText === true && r.res.body?.files?.[0]?.format === 'Word', `${r.res.code} ${JSON.stringify(r.res.body?.files?.[0])}`);
check('…al modello va il TESTO estratto (paragrafi, tab, entità), etichettato come DOCUMENTO, senza blocchi document/image', blocks[0]?.type === 'text' && /DOCUMENTO 1 — «contratto\.docx» \(Word, \d+ caratteri\)/.test(blocks[0].text) && /Canone €1\.100 al mese\tdeposito 2 mensilità/.test(blocks[0].text) && !blocks.some((c) => c.type === 'document'), JSON.stringify(blocks.map((c) => [c.type, c.text])));
r = await call('admin_1', { files: [{ base64: b64(XLSX), mediaType: '', name: 'rate.xlsx' }] });
blocks = r.anth[0]?.body?.messages?.[0]?.content || [];
check('un .xlsx → righe a tabulazioni col nome del foglio e le stringhe condivise risolte', r.res.code === 200 && /FOGLIO: Rate/.test(blocks[0]?.text || '') && /Mese\tImporto/.test(blocks[0]?.text || '') && /Settembre\t1100/.test(blocks[0]?.text || ''), String(blocks[0]?.text || '').slice(0, 200));
r = await call('admin_1', { files: [{ base64: b64(EML), mediaType: '', name: 'richiesta.eml' }] });
blocks = r.anth[0]?.body?.messages?.[0]?.content || [];
check('una .eml → intestazioni decodificate (RFC 2047) e corpo quoted-printable', r.res.code === 200 && /Subject: Casa a Trastevere/.test(blocks[0]?.text || '') && /budget €1200/.test(blocks[0]?.text || '') && r.res.body?.files?.[0]?.format === 'email', String(blocks[0]?.text || '').slice(0, 300));
r = await call('admin_1', { files: [{ base64: b64(Buffer.from('Canone \xe2\x82\xac 900 - inquilino Rossi', 'latin1')), mediaType: 'text/plain', name: 'appunti.txt' }] });
check('un .txt → testo (UTF-8), formato «testo»', r.res.code === 200 && /Canone € 900/.test((r.anth[0]?.body?.messages?.[0]?.content || [])[0]?.text || '') && r.res.body?.files?.[0]?.format === 'testo', JSON.stringify(r.res.body?.files?.[0]));
r = await call('admin_1', { files: [{ base64: b64(Buffer.from('non sono uno zip')), mediaType: '', name: 'rotto.docx' }] });
check('un .docx che non si apre → 422 unreadable_document col rimedio (esporta di nuovo), mai «troppo grande»', r.res.code === 422 && r.res.body?.error === 'unreadable_document' && /[Ee]sporta/.test(r.res.body?.detail || '') && r.anth.length === 0, `${r.res.code} ${r.res.body?.error} ${r.res.body?.detail}`);
r = await call('admin_1', { files: [{ base64: b64(DOCX), mediaType: '', name: 'contratto.docx' }, { base64: b64(PDF_BYTES), mediaType: 'application/pdf', name: 'ci.pdf' }], text: 'nota' });
blocks = r.anth[0]?.body?.messages?.[0]?.content || [];
check('Word + PDF + testo nello stesso giro: DOCUMENTO 1 (testo), DOCUMENTO 2 (document), DOCUMENTO 3 (incollato)', r.res.code === 200 && /DOCUMENTO 1 — «contratto\.docx»/.test(blocks[0]?.text || '') && /DOCUMENTO 2 — «ci\.pdf»/.test(blocks[1]?.text || '') && blocks[2]?.type === 'document' && /\(DOCUMENTO 3\)/.test(blocks[3]?.text || ''), blocks.map((c) => c.type).join(','));

console.log('\n\x1b[1mIl tetto delle pagine è per GIRO, non per file (il limite dell\'API è 100 a richiesta)\x1b[0m');
check('il tetto per giro è quello dell\'API ed è esportato', MAX_TOTAL_PAGES === 100 && MAX_PAGES === 60);
const pdf70 = await pdfOf(70), pdf50 = await pdfOf(50), pdf30 = await pdfOf(30);
r = await call('admin_1', { files: [
  { base64: b64(pdf70), mediaType: 'application/pdf', name: 'contratto-completo.pdf' },
  { base64: b64(pdf50), mediaType: 'application/pdf', name: 'allegati.pdf' },
] });
check('60 (tagliate) + 50 = 110 pagine → 400 too_many_pages PRIMA di spendere, coi nomi e «due giri»',
  r.res.code === 400 && r.res.body?.error === 'too_many_pages' && r.anth.length === 0
  && /110 pagine/.test(r.res.body?.detail || '') && /«contratto-completo\.pdf» 60 pag\./.test(r.res.body?.detail || '') && /due giri/.test(r.res.body?.detail || ''),
  `${r.res.code} ${r.res.body?.error} ${r.res.body?.detail}`);
r = await call('admin_1', { files: [
  { base64: b64(pdf70), mediaType: 'application/pdf', name: 'contratto-completo.pdf' },
  { base64: b64(pdf30), mediaType: 'application/pdf', name: 'ape.pdf' },
] });
check('60 (tagliate) + 30 = 90 pagine → si legge, e il taglio del primo è DETTO (files[] e note)',
  r.res.code === 200 && r.anth.length === 1 && r.res.body?.files?.[0]?.clipped === true && r.res.body?.files?.[0]?.readPages === MAX_PAGES
  && (r.res.body?.notes || []).some((n) => /70 pagine, lette le prime 60/.test(n)),
  `${r.res.code} ${JSON.stringify(r.res.body?.files?.[0])} ${JSON.stringify(r.res.body?.notes)}`);

console.log('\n\x1b[1mLe risposte del modello: mai una diagnosi sbagliata\x1b[0m');
r = await call('admin_1', { text: 'x' }, { stop: 'refusal' });
check('refusal → 502 ai_refused con spiegazione', r.res.code === 502 && r.res.body?.error === 'ai_refused' && r.res.body?.detail, `${r.res.code} ${r.res.body?.error}`);
r = await call('admin_1', { text: 'x' }, { stop: 'max_tokens' });
check('max_tokens → 502 ai_truncated (e SOLO in quel caso si parla di taglio)', r.res.code === 502 && r.res.body?.error === 'ai_truncated', `${r.res.code} ${r.res.body?.error}`);
r = await call('admin_1', { text: 'x' }, { status: 429, text: 'rate' });
check('429 → ai_rate_limited con «riprova tra un minuto»', r.res.code === 502 && r.res.body?.error === 'ai_rate_limited' && /minuto/.test(r.res.body?.detail || ''));
r = await call('admin_1', { text: 'x' }, { status: 400, text: '{"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 213456 tokens > 200000 maximum"}}' });
check('«prompt is too long» dal modello → 413 ai_too_long col rimedio (meno pagine, due giri), MAI un «riprova»',
  r.res.code === 413 && r.res.body?.error === 'ai_too_long' && /due giri/.test(r.res.body?.detail || '') && !/[Rr]iprova/.test(r.res.body?.detail || '') && r.anth.length === 1,
  `${r.res.code} ${r.res.body?.error} ${r.res.body?.detail}`);
r = await call('admin_1', { text: 'x' }, { status: 400, text: '{"type":"error","error":{"type":"invalid_request_error","message":"messages.0.content.0.document: PDF exceeds the maximum of 100 pages"}}' });
check('il tetto pagine detto dall\'API → stessa classe ai_too_long', r.res.code === 413 && r.res.body?.error === 'ai_too_long', `${r.res.code} ${r.res.body?.error}`);
r = await call('admin_1', { text: 'x' }, { throwName: 'TimeoutError' });
check('tempo scaduto → 504 ai_timeout con il rimedio (meno pagine)', r.res.code === 504 && r.res.body?.error === 'ai_timeout' && /pagine/.test(r.res.body?.detail || ''), `${r.res.code} ${r.res.body?.error}`);
r = await call('admin_1', { text: 'x' }, { failFirstWith: 'unknown beta: server-side-fallback-2026-07-01' });
check('un 400 sul beta del ripiego → si riprova UNA volta senza, e la lettura passa', r.res.code === 200 && r.anth.length === 2
  && r.anth[0].headers['anthropic-beta'] && !r.anth[1].headers['anthropic-beta'] && !('fallbacks' in r.anth[1].body), `${r.res.code} calls=${r.anth.length}`);
r = await call('admin_1', { text: 'x' }, { failFirstWith: 'invalid_request_error: messages' });
check('un 400 di altra natura NON si riprova (niente doppia spesa) ed è DETERMINISTICO: 500 ai_bad_request, mai un «riprova»', r.res.code === 500 && r.res.body?.error === 'ai_bad_request' && r.anth.length === 1 && !/[Rr]iprova/.test(r.res.body?.detail || ''), `${r.res.code} ${r.res.body?.error} calls=${r.anth.length}`);

console.log('\n\x1b[1mIl 400 che era MIO (la lezione del 21/09/2026)\x1b[0m');
r = await call('admin_1', { text: 'x' }, { status: 400, text: '{"type":"error","error":{"type":"invalid_request_error","message":"Schemas contains too many parameters with union types (99 parameters with type arrays or anyOf). This causes exponential compilation time."}}' });
check('lo schema rifiutato dall\'API → 500 ai_bad_request che nomina la RICHIESTA del server, non il documento, col messaggio dell\'API dentro', r.res.code === 500 && r.res.body?.error === 'ai_bad_request' && /RICHIESTA del server/.test(r.res.body?.detail || '') && /union types/.test(r.res.body?.detail || '') && !/[Rr]iprova|incolla/.test(r.res.body?.detail || '') && r.anth.length === 1, `${r.res.code} ${r.res.body?.error} ${r.res.body?.detail}`);
r = await call('admin_1', { text: 'x' }, { status: 400, text: '{"type":"error","error":{"type":"invalid_request_error","message":"The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools."}}' });
check('«The compiled grammar is too large» (la TERZA lezione del 21/09: il primo documento vero, dopo il fix delle unioni) → 500 ai_bad_request che nomina la RICHIESTA del server, col messaggio dentro', r.res.code === 500 && r.res.body?.error === 'ai_bad_request' && /RICHIESTA del server/.test(r.res.body?.detail || '') && /compiled grammar/.test(r.res.body?.detail || '') && r.anth.length === 1, `${r.res.code} ${r.res.body?.error} ${r.res.body?.detail}`);
check('…e quella richiesta non compila più NIENTE: nessun output_config.format, nessuno strumento strict — il tetto interno della grammatica non può più mordere', r.anth.length === 1 && !('output_config' in r.anth[0].body) && Array.isArray(r.anth[0].body.tools) && r.anth[0].body.tools.every((t) => t.strict !== true), JSON.stringify(Object.keys(r.anth[0]?.body || {})));
r = await call('admin_1', { text: 'x' }, { failFirstWith: '{"type":"error","error":{"type":"invalid_request_error","message":"tool_choice: type \\"tool\\" is not supported when thinking is enabled"}}' });
check('la chiamata FORZATA rifiutata (400 che nomina tool_choice) → si riprova UNA volta con tool_choice auto, stesso strumento, e la lettura passa', r.res.code === 200 && r.anth.length === 2 && r.anth[0].body.tool_choice?.type === 'tool' && r.anth[1].body.tool_choice?.type === 'auto' && r.anth[1].body.tool_choice?.disable_parallel_tool_use === true && r.anth[1].body.tools?.[0]?.name === 'proposta' && r.res.body?.proposal?.tenant?.name === 'Oyku Testa', `${r.res.code} calls=${r.anth.length} tc=${JSON.stringify(r.anth[1]?.body?.tool_choice)}`);
r = await call('admin_1', { text: 'x' }, { viaText: true });
check('la RETE: se il modello risponde a PAROLE (nessun blocco tool_use), il JSON si legge dal testo e la proposta esce lo stesso', r.res.code === 200 && r.res.body?.proposal?.tenant?.name === 'Oyku Testa' && r.res.body?.proposal?.contract?.rent === 1100, `${r.res.code} ${JSON.stringify(r.res.body?.proposal?.tenant)}`);
r = await call('admin_1', { text: 'x' }, { status: 400, text: '{"type":"error","error":{"type":"invalid_request_error","message":"messages.0.content.1.document.source.data: Could not process PDF: file is encrypted"}}' });
check('un PDF che l\'API non apre → 422 ai_bad_document col rimedio (senza password / fotografa), non «riprova»', r.res.code === 422 && r.res.body?.error === 'ai_bad_document' && /password|fotografa/.test(r.res.body?.detail || '') && !/[Rr]iprova/.test(r.res.body?.detail || ''), `${r.res.code} ${r.res.body?.error}`);
r = await call('admin_1', { text: 'x' }, { status: 500, text: 'overloaded' });
check('un 500 del servizio resta un guasto momentaneo: 502 ai_provider_error con «riprova»', r.res.code === 502 && r.res.body?.error === 'ai_provider_error' && /[Rr]iprova/.test(r.res.body?.detail || ''), `${r.res.code} ${r.res.body?.error}`);

console.log('\n\x1b[1mLe creazioni in più: il messaggio di un cliente, la proposta\x1b[0m');
const AI_LEAD = () => Object.assign(AI_EMPTY(), {
  material: 'Messaggio',
  files: [{ index: 1, kind: 'messaggio', title: 'WhatsApp di Marta', pages: '', legible: true, summary: 'richiesta di un bilocale', party: '' }],
  lead: { name: 'Marta Neri', email: 'MARTA@x.com', phone: '+39 333 123 4567', request: 'Looking for a 1-bed in Trastevere from September', zone: 'Trastevere', budget: '1200', bedrooms: '1', moveIn: '2026-09', durationMonths: '12', household: 'Couple', occupation: 'employed', language: 'EN', side: 'tenant', listing: '', channel: 'whatsapp' },
  preagreement: { ref: '', isBoom: '', status: '', acceptedAt: '', feePct: '', feeMonths: '', feeEur: '', feeVatPct: '', feeDue: '', energyCredit: '', depositSplitPct: '', dueAtSigning: '', validUntil: '', extras: '' },
  evidence: [{ path: 'lead.phone', quote: '+39 333 123 4567', file: '1', page: '' }, { path: 'lead.budget', quote: 'budget 1200', file: '1', page: '' }],
  summary: 'Messaggio WhatsApp di Marta Neri: bilocale a Trastevere, €1.200', confidence: 80,
});
r = await call('admin_1', { text: 'Looking for a 1-bed in Trastevere from September, budget 1200', files: [{ base64: b64(JPG_BYTES), mediaType: 'image/jpeg', name: 'whatsapp.jpg' }] }, { reply: AI_LEAD() });
let Q = r.res.body?.proposal || {};
check('un messaggio → la sezione LEAD (e nessuna sezione contratto/immobile inventata), material «messaggio»', r.res.code === 200 && Q.lead && !Q.contract && !Q.property && !Q.tenant && Q.material === 'messaggio', JSON.stringify(Object.keys(Q)));
check('…normalizzato: email minuscola, telefono senza spazi, budget numero, lingua en, coppia', Q.lead?.email === 'marta@x.com' && Q.lead?.phone === '+393331234567' && Q.lead?.budget === 1200 && Q.lead?.language === 'en' && Q.lead?.household === 'couple' && Q.lead?.moveIn === '2026-09', JSON.stringify(Q.lead));
check('…le citazioni sui campi del lead passano la whitelist dei percorsi', (r.res.body?.evidence || []).some((e) => e.path === 'lead.phone' && e.file === 1));
check('…una proposta tutta vuota non genera una card Proposta', !Q.preagreement);
check('…e il verdetto per file dice «messaggio»', r.res.body?.files?.[0]?.kind === 'messaggio' && /cliente/.test(r.res.body?.files?.[0]?.label || ''), JSON.stringify(r.res.body?.files?.[0]));
const AI_PA = () => Object.assign(AI_FULL(), {
  material: 'proposta',
  preagreement: { ref: 'boom-3k9f2a', isBoom: 'si', status: 'Accepted', acceptedAt: '2026-09-10', feePct: '10', feeMonths: '', feeEur: '', feeVatPct: '22', feeDue: 'Signing', energyCredit: '50', depositSplitPct: '50', dueAtSigning: '1100', validUntil: '2026-10-01', extras: 'Pulizia finale: 150' },
  lead: { name: '', email: '', phone: '', request: '', zone: '', budget: '', bedrooms: '', moveIn: '', durationMonths: '', household: '', occupation: '', language: '', side: '', listing: '', channel: '' },
});
r = await call('admin_1', { text: 'Rental proposal BOOM-3K9F2A' }, { reply: AI_PA() });
Q = r.res.body?.proposal || {};
check('una proposta BOOM → la sezione PREAGREEMENT accanto a contratto e parti: riferimento maiuscolo, isBoom, stato, provvigione, dovuto alla firma', Q.preagreement?.ref === 'BOOM-3K9F2A' && Q.preagreement?.isBoom === 'yes' && Q.preagreement?.status === 'accepted' && Q.preagreement?.feePct === 10 && Q.preagreement?.feeDue === 'signing' && Q.preagreement?.dueAtSigning === 1100 && Q.preagreement?.depositSplitPct === 50 && Q.contract?.rent === 1100 && Q.material === 'proposta', JSON.stringify(Q.preagreement));
check('…e un lead tutto vuoto non genera una card Lead', !Q.lead);
check('lo schema porta le due sezioni e «material» — sempre a ZERO unioni e ZERO facoltativi', INGEST_SCHEMA.properties.lead && INGEST_SCHEMA.properties.preagreement && INGEST_SCHEMA.properties.material && (() => { const c = schemaComplexity(INGEST_SCHEMA); return c.unions === 0 && c.optional === 0 && c.params > 140; })(), JSON.stringify(schemaComplexity(INGEST_SCHEMA)));
check('…e il prompt spiega proposta e messaggio al modello', /PROPOSTA \/ PRE-ACCORDO/.test(r.anth[0]?.body?.system?.[0]?.text || '') && /MESSAGGIO DI UN CLIENTE/.test(r.anth[0]?.body?.system?.[0]?.text || ''));

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
const S = { users: [], properties: [], contracts: [], landlords: [], deadlines: [], leads: [], profile: { id: 'admin', role: 'admin' } };
const { createRequire } = await import('node:module');
const requireCjs = createRequire(import.meta.url);
const APPLY_SRC = ['generateMonthlyPayments', 'monthsBetween', 'generateContractDeadlines', 'innestoEmpty', 'innestoReset', 'innestoPools', 'innestoLinkFor',
  'innestoPatchFor', 'innestoUserDoc', 'innestoArchiveContentType', 'innestoArchiveNeedsZip', 'innestoArchiveDoc', 'innestoPaKey', 'innestoLookupPa', 'innestoLeadDup', 'innestoMoney', 'innestoApply'].map(extract).join('\n') + '\nreturn innestoApply;';
const makeApply = new Function(
  'window', 'firebase', 'db', 'S', 'toast', 'renderPage', 'buildNav', 'loadDataFresh', 'logActivity', 'localStorage', 'console', '_innesto',
  'storage', 'auth', 'goTo', 'clearInterval', '_innestoTick', 'generateContractPDF',
  APPLY_SRC
);
async function runApply(proposal, seed = {}, opts = {}) {
  applyWrites.length = 0; applyToasts.length = 0; storagePuts.length = 0; applyAutoId = 0;
  S.users = seed.users || []; S.properties = seed.properties || [];
  S.contracts = []; S.landlords = seed.landlords || []; S.deadlines = []; S.leads = seed.leads || [];
  const innesto = Object.assign({ proposal, links: {}, coLinks: {}, diffs: {}, notes: [], confidence: 90, busy: false, files: [], readDocs: [], archive: true, create: { lead: true, preagreement: false }, pa: null, skipContract: false }, opts);
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

// LO SCRIVANO (passo 4): il documento è GIÀ in archivio (arrivato dal telefono,
// archiviato dallo Smistatore) — non si ricarica, si LEGA.
const archivedDocs = [
  { archived: { id: 'tg_abc', url: 'https://firebasestorage.googleapis.com/v0/b/t/o/smistatore%2F2026%2Fcontratto.pdf?alt=media&token=x', name: 'contratto.pdf', mimeType: 'application/pdf' }, meta: { kind: 'contratto', party: null, title: 'Contratto', docType: 'contract', category: 'contratto locazione', folder: '01_Contratto' } },
  { archived: { id: 'tg_id1', url: 'https://firebasestorage.googleapis.com/v0/b/t/o/smistatore%2F2026%2Fci.jpg?alt=media&token=y', name: 'ci.jpg', mimeType: 'image/jpeg' }, meta: { kind: 'documento_identita', party: 'tenant', title: 'CI Oyku', docType: 'id', category: 'documento identità carta ID', folder: '07_Inquilino' } },
];
a = await runApply(structuredClone(FULL), {}, { readDocs: archivedDocs });
const linked = a.writes.filter((w) => w.c === 'documents' && w.op === 'update');
check('un documento GIÀ archiviato (dal telefono) non si ricarica: zero put, zero documenti nuovi', a.puts.length === 0 && !a.writes.some((w) => w.c === 'documents' && w.op === 'add'), JSON.stringify(a.puts));
check('…si LEGA al contratto e all\'immobile appena nati (update sui doc esistenti)', linked.length === 2 && linked.every((w) => w.data.contractId && w.data.propertyId && w.data.innestoBy), JSON.stringify(linked.map((w) => [w.id, w.data])));
check('…e la carta d\'identità archiviata entra negli identityDocs (contratto E profilo), firmata scrivano',
  a.writes.some((w) => w.c === 'contracts' && w.op === 'update' && w.data.identityDocs?.__union?.source === 'scrivano' && w.data.identityDocs?.__union?.url)
  && a.writes.some((w) => w.c === 'users' && w.op === 'update' && w.data.identityDocs?.__union?.url), JSON.stringify(a.writes.filter((w) => w.op === 'update').map((w) => [w.c, w.data])));

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

// LE CREAZIONI IN PIÙ (21/09): un messaggio diventa un LEAD nello schema del
// sito; chi è già fra i lead non si raddoppia; con il deal già proposta del
// console il contratto NON nasce da qui (skipContract).
const LEAD_ONLY = { material: 'messaggio', lead: { name: 'Marta Neri', email: 'marta@x.com', phone: '+393331234567', request: 'cerco bilocale a Trastevere', zone: 'Trastevere', budget: 1200, bedrooms: 1, moveIn: '2026-09', durationMonths: 12, household: 'couple', occupation: 'employed', language: 'en', side: 'tenant', listing: '', channel: 'whatsapp' } };
a = await runApply(structuredClone(LEAD_ONLY));
const LD = a.writes.find((w) => w.c === 'leads' && w.op === 'add')?.data || null;
check('un messaggio → nasce un LEAD nello schema del sito (status new, source innesto, tenant, lingua en, richiesta nel message), nessun contratto né utente',
  a.by.leads === 1 && LD && LD.status === 'new' && LD.source === 'innesto' && LD.leadType === 'tenant' && LD.language === 'en' && LD.intent === 'inquiry' && /bilocale/.test(LD.message) && LD.budget === 1200 && LD.zone === 'Trastevere' && !a.by.contracts && !a.by.users, JSON.stringify(a.by) + ' ' + JSON.stringify(LD));
check('…e il toast lo dice', a.toasts.some((t) => t[0] === 'success' && /lead Marta Neri/.test(t[2] || '')), JSON.stringify(a.toasts));
a = await runApply(structuredClone(LEAD_ONLY), { leads: [{ id: 'ld_1', name: 'M. Neri', email: 'marta@x.com', phone: '' }] });
check('la stessa persona già fra i lead (stessa email) → NESSUN doppione', !a.by.leads && a.toasts.some((t) => /lead già presente/.test(t[2] || '')), JSON.stringify(a.by) + ' ' + JSON.stringify(a.toasts));
a = await runApply(structuredClone(LEAD_ONLY), { leads: [{ id: 'ld_2', name: 'Marta', email: '', phone: '333 123 4567' }] });
check('…anche con lo stesso numero scritto in altra forma (nazionale vs internazionale)', !a.by.leads, JSON.stringify(a.by));
a = await runApply(structuredClone(LEAD_ONLY), {}, { create: { lead: false, preagreement: false } });
check('con la spunta spenta il lead non nasce', !a.by.leads, JSON.stringify(a.by));
const owner = structuredClone(LEAD_ONLY); owner.lead.side = 'landlord';
a = await runApply(owner);
check('chi propone il proprio immobile è un lead landlord (intent owner): la macchina inquilino non gli scrive «ti va una visita?»', a.writes.find((w) => w.c === 'leads')?.data.leadType === 'landlord' && a.writes.find((w) => w.c === 'leads')?.data.intent === 'owner');
a = await runApply(structuredClone(FULL), {}, { skipContract: true, pa: { key: 'BOOM-X', loading: false, found: { id: 'pa_1', ref: 'BOOM-X', status: 'paid', contractId: 'pa_1' } } });
check('deal già proposta del console con contratto → persone e immobile sì, contratto e rate NO, e nessun toast «Contratto NON creato»', a.by.users === 2 && a.by.properties === 1 && !a.by.contracts && !a.by.payments && !a.toasts.some((t) => /Contratto NON creato/.test(t[1] || '')), JSON.stringify(a.by) + ' ' + JSON.stringify(a.toasts));

console.log('\n\x1b[1mLe giunzioni sulla sorgente\x1b[0m');
const app = appSrc;
const api = readFileSync(new URL('../../api/portal/ingest.js', import.meta.url), 'utf8');
const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

check('il riepilogo promette il contratto SOLO con entrambe le gambe (e mai se il deal è già una proposta del console)',
  /wantContract && !contractLegs\.length\) willCreate\.push\('contratto/.test(app));
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
  /type="file" multiple accept="\$\{INNESTO_ACCEPT\}"/.test(app) && /innestoDrop\(event\)/.test(app) && /innestoPaste\(event\)/.test(app) && /capture="environment"/.test(app));
check('il progresso dice cosa sta facendo e da quanto', /innestoProgressText\(\)/.test(app) && /setInterval/.test(app.slice(app.indexOf('async function innestoAnalyze'), app.indexOf('async function innestoAnalyze') + 800)));

const sw = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
check('il motore dataops è network-first nel SW (una copia stantia divergerebbe dalla pagina)',
  /url\.pathname === '\/js\/dataops-engine\.js'/.test(sw));
check('…e la cache del SW è stata versionata oltre la v20', !/boom-v20'/.test(sw));

const capM = /INNESTO_INLINE_MAX\s*=\s*(\d+)\s*\*\s*1024\s*\*\s*1024/.exec(app);
check('il tetto inline del client sta SOTTO i 4,5 MB di piattaforma (base64 +33%)',
  capM && Number(capM[1]) * 1024 * 1024 * (4 / 3) < 4.5 * 1024 * 1024,
  capM ? `${capM[1]} MB raw` : 'INNESTO_INLINE_MAX assente');
check('la scelta inline/transito passa dal tetto SULLA SOMMA dei file', /inlineTotal \+ blob\.size <= inlineBudget/.test(app) && /innestoSend\(INNESTO_INLINE_MAX, transitRefs\)/.test(app));
check('le foto si riducono PRIMA della scelta (adeCompressImage, una copia sola)', (() => {
  const fn = app.slice(app.indexOf('async function innestoSend'));
  const body = fn.slice(0, fn.indexOf('\n    }\n'));
  return body.indexOf('adeCompressImage') !== -1
    && body.indexOf('adeCompressImage') < body.indexOf('<= inlineBudget');
})());
check('LA SECONDA LEZIONE DEL 21/09: le FOTO non hanno più un cancello di grandezza (si riducono), il tetto vale solo per gli altri file ed è quello dello Storage di transito (25 MB)',
  /kind !== 'image' && f\.size > INNESTO_MAX_FILE/.test(app) && !/supera gli 8 MB/.test(app) && /INNESTO_MAX_FILE = 25 \* 1024 \* 1024/.test(app));
check('un 413 dell\'edge ritenta UNA volta con tutto in transito, e il messaggio non dice più «8 MB»',
  /sent\.r\.status === 413/.test(app) && /innestoSend\(0, transitRefs\)/.test(app) && !/oltre il limite di 8 MB/.test(app));
check('HEIC: heic2any caricato SOLO al bisogno, SOLO da jsDelivr, mai nel <head> della pagina',
  /cdn\.jsdelivr\.net\/npm\/heic2any@/.test(app) && /innestoHeicToJpeg\(/.test(app) && !/heic2any/.test(readFileSync(new URL('../../portal.html', import.meta.url), 'utf8')));
check('l\'accept apre a Word/Excel/email/HEIC e l\'intake li riconosce anche dal solo nome',
  (() => { const m = /INNESTO_ACCEPT = '([^']*)'/.exec(app); return m && ['.docx', '.xlsx', '.eml', '.heic', '.odt', '.txt'].every((x) => m[1].indexOf(x) >= 0); })() && /INNESTO_TEXTY_RE = /.test(app) && /function innestoMediaType/.test(app));
check('i file di testo puro non transitano (storage.rules accetta immagini, PDF e ZIP): vanno inline; gli Office transitano come ZIP, che sono',
  /canTransit = kind !== 'text' \|\| zipBased/.test(app) && /contentType: zipBased \? 'application\/zip' : mediaType/.test(app)
  && /application\/zip/.test(readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8')));
check('le card Lead e Proposta esistono; una proposta trovata nel console SALTA il contratto (nasce da lì), e il riepilogo lo rispetta',
  // state è il riferimento catturato della lettura; review.mjs verifica
  // che solo il deal confermato, mai una risposta obsoleta, salti il contratto.
  /function innestoLeadCard/.test(app) && /function innestoPaCard/.test(app) && /if \(found\) state\.skipContract = true/.test(app)
  && /p\.contract && propertyId && tenantId && !_innesto\.skipContract/.test(app) && /const wantContract = p\.contract && !_innesto\.skipContract/.test(app));
check('la proposta nel console e il contratto dalla proposta passano dalle STESSE API della console (create / convert), mai una scrittura diretta',
  /fetch\('\/api\/preagreement\/create'/.test(app) && /fetch\('\/api\/preagreement\/convert'/.test(app) && !/collection\('preAgreements'\)\.add/.test(app));
check('il server legge i formati testuali con _doctext (una copia) e li manda al modello come TESTO etichettato',
  /from '\.\.\/_doctext\.js'/.test(api) && /if \(f\.isText\)/.test(api) && /TEXTY\.has\(mediaType\)/.test(api) && /sniffType\(buf, f\.name, mediaType\)/.test(api));
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
check('il server legge con Opus 5 e consegna il JSON come input dello strumento (tools + tool_choice nel sorgente) — MAI più come grammatica: niente output_config.format, niente strict',
  /MODEL = 'claude-opus-5'/.test(api) && /tools: \[INGEST_TOOL\]/.test(api) && /input_schema: INGEST_SCHEMA/.test(api)
  && !/output_config: \{ format/.test(api) && !/type: 'json_schema'/.test(api) && !/strict: true/.test(api));
check('la funzione ha il tempo per leggere: maxDuration in vercel.json sopra il tetto della chiamata',
  (() => { const md = vercel.functions?.['api/portal/ingest.js']?.maxDuration; const ai = Number((/const AI_MS = (\d+)/.exec(api) || [])[1]); return md >= 100 && ai > 0 && ai < md * 1000; })(),
  JSON.stringify(vercel.functions?.['api/portal/ingest.js']));
check('nei log va la forma, mai il contenuto (nessun raw.slice nel file)', !/raw\.slice\(/.test(api));

console.log('\n────────────────────────────────────────────────');
console.log(`\x1b[1mResult: ${pass} passed, ${fail} failed\x1b[0m`);
if (fail) process.exit(1);
console.log('\x1b[32mLa lettura è strutturata e dice la verità, i file entrano insieme, l\'apply crea (e aggiorna, e archivia) davvero.\x1b[0m');
