// tests/documents/smista.mjs — LO SMISTATORE, le due garanzie delle porte.
//
// Un documento può arrivare da chi NON è l'operatore (allegato WhatsApp,
// email di un proprietario). Le due cose che devono valere PRIMA di spendere
// il modello e PRIMA di scrivere, entrambe chieste da Codex in PR #234:
//   · un docId deterministico non archivia mai due volte, e un doppione non
//     paga nemmeno la chiamata al modello;
//   · la relazione del mittente vincola la scelta: uno sconosciuto NON finisce
//     mai sotto un immobile (il suggerimento resta visibile), un proprietario
//     archivia SOLO fra i suoi immobili, e con più immobili senza una scelta
//     valida il documento resta da smistare coi candidati dichiarati.
// Senza relation e senza docId il comportamento è quello storico (l'operatore
// che smista da Telegram): tutto il catalogo, id automatico.
//
// Esegui: node tests/documents/smista.mjs

import { register } from 'node:module';
register('../notify/loader.mjs', import.meta.url);   // nodemailer mockato: agent/_lib lo importa in cima

process.env.HOMIE_SECRET = 'test-secret';
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.ANTHROPIC_API_KEY = 'an';

let fails = 0;
const ok = (name, cond, detail) => {
  console.log(cond ? `PASS ${name}` : `FAIL ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!cond) fails++;
};

// ─── il Firestore in memoria (stessa disciplina di tests/phone) ────────────
const DB = new Map();
const enc = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
  return { stringValue: String(v) };
};
const dec = (f) => {
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
let aiHits = 0, storageHits = 0;
let aiJson = { category: 'ape', fiscalYear: 2026, propertyId: null, summary: 'APE classe C' };
let lastPrompt = '';

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });
  if (u.includes('identitytoolkit')) return json({ idToken: 'fake', localId: 'admin' });
  if (u.includes('firebasestorage.googleapis.com')) { storageHits++; return json({ downloadTokens: 'dl-tok-1' }); }
  if (u.includes('api.anthropic.com')) {
    aiHits++;
    const body = JSON.parse(opts.body || '{}');
    lastPrompt = ((body.messages || [])[0]?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    return json({ content: [{ type: 'text', text: JSON.stringify(aiJson) }] });
  }
  const body = opts.body ? JSON.parse(opts.body) : null;
  const m = u.match(/documents\/([^?:]+)/);
  const path = m ? decodeURIComponent(m[1]) : '';
  if (u.includes(':runQuery')) {
    const coll = body.structuredQuery.from[0].collectionId;
    return json([...DB.entries()].filter(([k]) => k.startsWith(coll + '/')).map(([k, v]) => ({ document: toDoc(k, v) })));
  }
  if (opts.method === 'PATCH') {
    const prev = DB.get(path) || {};
    const next = { ...prev, ...Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])) };
    DB.set(path, next); return json(toDoc(path, next));
  }
  if (opts.method === 'POST') {
    const qm = u.match(/documentId=([^&]+)/);
    const id = qm ? decodeURIComponent(qm[1]) : 'doc' + (++autoId);
    const key = `${path}/${id}`;
    if (qm && DB.has(key)) return json({ error: { status: 'ALREADY_EXISTS' } }, 409);
    DB.set(key, Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])));
    return json(toDoc(key, DB.get(key)));
  }
  if (DB.has(path)) return json(toDoc(path, DB.get(path)));
  return json({ error: { status: 'NOT_FOUND' } }, 404);
};

const { smistaDocument, normalizeRelation } = await import('../../api/documents/_smista.js');

DB.set('properties/pA', { id: 'pA', title: 'Bilocale Cavour', address: 'Via Cavour 12' });
DB.set('properties/pB', { id: 'pB', title: 'Trilocale Pigneto', address: 'Via del Pigneto 3' });
DB.set('properties/pC', { id: 'pC', title: 'Attico Prati', address: 'Via Cola di Rienzo 9' });
DB.set('contracts/c1', { id: 'c1', propertyId: 'pA', status: 'active', startDate: '2026-01-01', endDate: '2026-12-31' });
DB.set('contracts/c2', { id: 'c2', propertyId: 'pA', status: 'ended', startDate: '2025-01-01', endDate: '2026-03-31' });

const PDF = Buffer.from('%PDF-1.4 test').toString('base64');
const docs = () => [...DB.entries()].filter(([k]) => k.startsWith('documents/'));
const base = { base64: PDF, mediaType: 'application/pdf', fileName: 'ape.pdf', hint: null, origin: 'test' };
const promptIds = () => { const m = lastPrompt.match(/Elenco immobili[^\n]*\n(\[.*?\])/s); return m ? JSON.parse(m[1]).map((x) => x.id) : null; };

// ─── 1. normalizeRelation ──────────────────────────────────────────────────
{
  ok('niente relation → operator (comportamento storico)', normalizeRelation(null).kind === 'operator' && normalizeRelation(undefined).kind === 'operator');
  ok('kind ignoto → unknown (il default sicuro)', normalizeRelation({ kind: 'boh', propertyIds: ['pA'] }).kind === 'unknown');
  ok('unknown non porta immobili anche se dichiarati', normalizeRelation({ kind: 'unknown', propertyIds: ['pA'] }).propertyIds.size === 0);
  ok('landlord: ids puliti, vuoti scartati', [...normalizeRelation({ kind: 'landlord', propertyIds: ['pA', '', null, 'pB'] }).propertyIds].join(',') === 'pA,pB');
}

// ─── 2. storico: operatore, id automatico, tutto il catalogo ───────────────
{
  aiJson = { category: 'ape', fiscalYear: 2026, propertyId: 'pB', summary: 'APE' };
  const out = await smistaDocument({ ...base });
  ok('operatore: archiviato sotto l\'immobile scelto dal modello', out.ok && !out.duplicate && out.propertyLabel === 'Trilocale Pigneto' && out.needsFiling === false, out);
  ok('operatore: id automatico', /^doc\d+$/.test(out.id), out.id);
  ok('operatore: il modello vede TUTTO il catalogo', JSON.stringify(promptIds()) === JSON.stringify(['pA', 'pB', 'pC']), promptIds());
  const d = DB.get('documents/' + out.id);
  ok('operatore: nessun campo di relazione sul doc', d && !('relationKind' in d) && !('suggestedPropertyId' in d), d);
}

// ─── 3. docId deterministico: mai due volte, e il doppione non paga ─────────
{
  aiJson = { category: 'utenza', fiscalYear: 2026, propertyId: 'pA', summary: 'bolletta' };
  const before = docs().length;
  const a = await smistaDocument({ ...base, docId: 'wa_abc123', relation: { kind: 'landlord', propertyIds: ['pA'] } });
  ok('docId: il documento nasce con QUEL id', a.ok && a.id === 'wa_abc123' && DB.has('documents/wa_abc123'), a);
  const ai0 = aiHits, st0 = storageHits;
  const b = await smistaDocument({ ...base, docId: 'wa_abc123', relation: { kind: 'landlord', propertyIds: ['pA'] } });
  ok('docId ripetuto → duplicate:true, stesso id', b.ok && b.duplicate === true && b.id === 'wa_abc123', b);
  ok('…senza chiamare il modello né caricare (dedupe PRIMA di spendere)', aiHits === ai0 && storageHits === st0, { aiHits, ai0, storageHits, st0 });
  ok('…e in archivio resta UN documento', docs().length === before + 1, docs().length - before);
  ok('docId sporco viene ripulito', (await smistaDocument({ ...base, docId: 'x/y z?', relation: { kind: 'landlord', propertyIds: ['pA'] } })).id === 'x_y_z_');
}

// ─── 4. la gara: 409 dal Firestore vero → duplicate, non errore ────────────
{
  DB.set('documents/race1', { name: 'già lì', fiscalYear: 2025, needsFiling: true, notes: 'n' });
  const realGet = globalThis.fetch;
  // fsGet finge un guasto di rete: si arriva alla create, che risponde 409
  globalThis.fetch = async (url, opts = {}) => {
    if (String(url).endsWith('/documents/race1') && !opts.method) throw new Error('rete giù');
    return realGet(url, opts);
  };
  const r = await smistaDocument({ ...base, docId: 'race1', relation: { kind: 'landlord', propertyIds: ['pA'] } });
  globalThis.fetch = realGet;
  ok('409 sul docId → duplicate:true (mai un doppione, mai un errore)', r.ok && r.duplicate === true && r.id === 'race1', r);
}

// ─── 5. lo sconosciuto non archivia MAI sotto un immobile ──────────────────
{
  aiJson = { category: 'documento_identita', fiscalYear: 2026, propertyId: 'pA', summary: 'carta identità' };
  const out = await smistaDocument({ ...base, docId: 'wa_unk1', relation: { kind: 'unknown', label: '+39 333…' } });
  const d = DB.get('documents/wa_unk1');
  ok('sconosciuto: needsFiling forzato anche se il modello sceglie', out.needsFiling === true && d.needsFiling === true, out);
  ok('sconosciuto: propertyId NULL sul doc', d.propertyId === null, d.propertyId);
  ok('sconosciuto: il suggerimento del modello resta visibile', out.suggestedPropertyId === 'pA' && d.suggestedPropertyId === 'pA', out);
  ok('sconosciuto: nessun contratto agganciato', d.contractId === null, d.contractId);
  ok('sconosciuto: tag "sconosciuto" e relationKind sul doc', d.tags.includes('sconosciuto') && d.relationKind === 'unknown', d.tags);
  ok('sconosciuto: il modello lo sa dal prompt', /NON in archivio/.test(lastPrompt));
}

// ─── 6. il proprietario archivia SOLO fra i suoi immobili ──────────────────
{
  aiJson = { category: 'f24_imu', fiscalYear: 2026, propertyId: 'pC', summary: 'F24 IMU' };   // pC NON è suo
  const out = await smistaDocument({ ...base, docId: 'em_own1', relation: { kind: 'landlord', label: 'Rossi', propertyIds: ['pA'] } });
  const d = DB.get('documents/em_own1');
  ok('landlord con UN immobile: il modello vede solo quello', JSON.stringify(promptIds()) === JSON.stringify(['pA']), promptIds());
  ok('…una scelta fuori dai suoi immobili viene SCARTATA e vince il suo', d.propertyId === 'pA' && out.propertyLabel === 'Bilocale Cavour', d.propertyId);
  ok('…dichiarato come default di relazione', out.relationDefault === true && d.relationDefault === true, out);
  ok('…archiviato davvero (needsFiling false)', out.needsFiling === false && d.needsFiling === false);
  ok('…col contratto attivo di quell\'immobile', d.contractId === 'c1', d.contractId);
  ok('…e il prompt dice chi manda', /Rossi/.test(lastPrompt) && /SOLO i suoi immobili/.test(lastPrompt));
}

// ─── 7. più immobili: senza scelta valida resta da smistare, coi candidati ──
{
  aiJson = { category: 'utenza', fiscalYear: 2026, propertyId: null, summary: 'bolletta' };
  const out = await smistaDocument({ ...base, docId: 'em_own2', relation: { kind: 'landlord', propertyIds: ['pA', 'pB'] } });
  const d = DB.get('documents/em_own2');
  ok('due immobili, modello indeciso → needsFiling', out.needsFiling === true && d.propertyId === null, out);
  ok('…coi candidati dichiarati sul doc', JSON.stringify(d.relatedPropertyIds) === JSON.stringify(['pA', 'pB']), d.relatedPropertyIds);
  ok('…e nessun default inventato', out.relationDefault === false && !('relationDefault' in d));

  aiJson = { category: 'utenza', fiscalYear: 2026, propertyId: 'pB', summary: 'bolletta' };
  const out2 = await smistaDocument({ ...base, docId: 'em_own3', relation: { kind: 'landlord', propertyIds: ['pA', 'pB'] } });
  ok('due immobili, scelta valida → archiviato sotto quello', out2.needsFiling === false && DB.get('documents/em_own3').propertyId === 'pB', out2);
  aiJson = { category: 'utenza', fiscalYear: 2026, propertyId: 'pC', summary: 'bolletta' };
  const out3 = await smistaDocument({ ...base, docId: 'em_own4', relation: { kind: 'landlord', propertyIds: ['pA', 'pB'] } });
  ok('due immobili, scelta FUORI → scartata, da smistare', out3.needsFiling === true && DB.get('documents/em_own4').propertyId === null, out3);
}

// ─── 8. l'inquilino: il suo contratto vince sul "primo attivo" ─────────────
{
  aiJson = { category: 'ricevuta_canone', fiscalYear: 2026, propertyId: 'pA', summary: 'ricevuta' };
  const out = await smistaDocument({ ...base, docId: 'wa_ten1', relation: { kind: 'tenant', propertyIds: ['pA'], contractIds: ['c2'] } });
  ok('tenant: contratto dichiarato dalla relazione agganciato (anche se non attivo)', DB.get('documents/wa_ten1').contractId === 'c2' && out.needsFiling === false, out);
}

// ─── 9. i tetti restano ────────────────────────────────────────────────────
{
  let err = null;
  try { await smistaDocument({ ...base, base64: 'A'.repeat(9 * 1024 * 1024 * 4 / 3 | 0) }); } catch (e) { err = e; }
  ok('oltre 8MB → rifiutato prima di tutto', err && /8MB/.test(err.message), err && err.message);
}

console.log(fails ? `\n${fails} FAILED` : '\nAll smista checks passed');
process.exit(fails ? 1 : 0);
