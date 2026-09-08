// api/contracts/import.js — IMPORTA PRATICA: un contratto firmato FUORI entra in gestione.
//
// Il portale sapeva far nascere un contratto in un modo solo: pre-accordo →
// conversione → Magic Sign → firma. Le pratiche già stipulate — su carta, dal
// notaio, ereditate da un'altra gestione — o si ribattevano a mano campo per
// campo, o restavano fuori dal sistema che gestisce scadenze, incassi e
// documenti.
//
// Questa porta NON è un secondo portale. Riusa quello che c'è:
//   · la LETTURA è quella dell'Innesto (api/portal/ingest.js): stesso schema,
//     stesso prompt, stesse regole "non inventare mai". Qui si aggiunge solo
//     la PROVENIENZA (quale file, quale pagina) perché la revisione mostri
//     all'operatore da dove viene ogni valore;
//   · le DECISIONI stanno nel motore puro js/pratica-engine.js, testato in
//     node senza browser né Firestore;
//   · l'ARCHIVIO è `documents` con le categorie dello Smistatore, così la
//     checklist del commercialista si spunta da sola;
//   · la PRATICA è un doc `contracts`, non una collection parallela: le
//     pagine che già leggono i contratti la vedono senza modifiche.
//
// Tre operazioni, e solo una scrive:
//   op:'extract'  → legge i file, propone, NON SCRIVE NIENTE (come l'Innesto)
//   op:'confirm'  → l'operatore ha rivisto: crea la pratica e archivia gli originali
//   op:'attach'   → un documento in più su una pratica esistente (la ricevuta
//                   che arriva dopo, l'allegato dimenticato)
//
// Auth: ID token Firebase. La lettura è admin/owner/landlord come l'Innesto;
// la SCRITTURA è admin, perché `contracts` è admin-only nelle rules e un
// import che aggira quel confine sarebbe un buco, non una funzionalità.

import { requireRole, setCors } from '../_auth.js';
import { readJson, fsCreate, fsPatch, fsGet } from '../homie/_lib.js';
import { storageUpload } from '../agent/_lib.js';
import { parseModelJson, jsonFailureLine, jsonFailureHint } from '../_modeljson.js';
import { aiSignal } from '../_budget.js';
import { buildPrompt } from '../portal/ingest.js';
import PRATICA from '../../js/pratica-engine.js';
import { createHash } from 'node:crypto';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_B64 = 8 * 1024 * 1024;
const MAX_FILES = 8;

// Stesso tetto e stessa ragione dell'Innesto: il body di una function Vercel
// ha un limite di PIATTAFORMA di 4,5 MB, quindi i file grandi transitano da
// Storage e qui arriva solo l'URL.
export const config = { api: { bodyParser: { sizeLimit: '12mb' } } };

const ALLOWED_TRANSIT = /^https:\/\/firebasestorage\.googleapis\.com\//;

async function fetchTransit(fileUrl) {
  // Come l'Innesto: solo il NOSTRO Storage. Un URL libero trasformerebbe
  // questo endpoint in un proxy verso host arbitrari, e i byte finiscono a
  // un modello esterno.
  if (!ALLOWED_TRANSIT.test(String(fileUrl))) throw new Error('transit_host_not_allowed');
  const r = await fetch(String(fileUrl), { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('transit_fetch_failed_' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_B64) throw new Error('file_too_large');
  return { buffer: buf, mediaType: (r.headers.get('content-type') || '').split(';')[0] };
}

// La provenienza è l'unica cosa che l'Innesto non dà, ed è ciò che rende
// REVISIONABILE un'estrazione: senza "pagina 2", l'operatore che dubita di un
// canone deve rileggersi il PDF intero.
const PROVENANCE = [
  '',
  'IN PIÙ, per ogni campo che compili aggiungi la PROVENIENZA. Rispondi con:',
  '{ "landlord": {...}, "tenant": {...}, "property": {...}, "contract": {...},',
  '  "confidence": 0-100, "notes": [...],',
  '  "provenance": { "contract.rent": {"page": 1, "quote": "<massimo 12 parole copiate dal documento>"}, ... } }',
  'La citazione deve essere COPIATA dal documento, mai riscritta: serve',
  'all\'operatore per ritrovare il punto. Se non sai la pagina metti null.',
  'Un campo senza provenienza verrà mostrato come "da verificare a mano".',
].join('\n');

function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

async function readOne(file, context) {
  // → { extraction, provenance, notes, confidence }
  const content = [];
  content.push(/pdf/i.test(file.mediaType)
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.base64 } }
    : { type: 'image', source: { type: 'base64', media_type: file.mediaType.toLowerCase(), data: file.base64 } });
  content.push({ type: 'text', text: buildPrompt(context) + PROVENANCE });

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    signal: aiSignal(45000),
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 2500, messages: [{ role: 'user', content }] }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    console.error('[contracts/import] anthropic', resp.status, t.slice(0, 300));
    const e = new Error('ai_provider_error'); e.status = 502; throw e;
  }
  const data = await resp.json();
  const raw = (data.content && data.content[0] && data.content[0].text) || '';
  const read = parseModelJson(raw);
  if (!read.ok) {
    // Un errore di estrazione è un ESITO della pratica, non un crollo: la
    // porta lo riporta per file, così un documento illeggibile fra cinque
    // non butta via gli altri quattro.
    console.error('[contracts/import] ' + jsonFailureLine(raw, read.why, data.stop_reason));
    const e = new Error('ai_bad_json'); e.status = 502; e.why = read.why; e.detail = jsonFailureHint(read.why); throw e;
  }
  const p = read.value || {};
  const pick = (obj, keys) => {
    if (!obj || typeof obj !== 'object') return null;
    const out = {}; let any = false;
    keys.forEach((k) => {
      const v = obj[k];
      if (v === undefined || v === null || v === '') return;
      out[k] = typeof v === 'object' ? '' : v; any = true;
    });
    return any ? out : null;
  };
  const extraction = {
    landlord: pick(p.landlord, ['name', 'email', 'phone', 'codiceFiscale', 'iban', 'address', 'birthDate', 'birthPlace']),
    tenant: pick(p.tenant, ['name', 'email', 'phone', 'codiceFiscale', 'address', 'birthDate', 'birthPlace', 'nationality']),
    property: pick(p.property, ['name', 'address', 'rent', 'sqm', 'rooms', 'bathrooms', 'floor', 'scala', 'interno', 'cadastralData', 'energyClass', 'propertyType']),
    contract: pick(p.contract, ['type', 'startDate', 'endDate', 'rent', 'deposit', 'depositMonths', 'paymentDay', 'installmentMonths', 'accessoryCharges', 'cedolareSecca', 'transitionalReason', 'notes']),
  };
  Object.keys(extraction).forEach((k) => { if (!extraction[k]) delete extraction[k]; });

  const prov = {};
  if (p.provenance && typeof p.provenance === 'object') {
    Object.keys(p.provenance).slice(0, 80).forEach((k) => {
      const v = p.provenance[k];
      if (!v || typeof v !== 'object') return;
      prov[k] = {
        page: Number.isFinite(Number(v.page)) ? Number(v.page) : null,
        quote: typeof v.quote === 'string' ? v.quote.slice(0, 160) : null,
      };
    });
  }
  return {
    extraction,
    provenance: prov,
    notes: Array.isArray(p.notes) ? p.notes.filter((n) => typeof n === 'string').slice(0, 12).map((n) => n.slice(0, 300)) : [],
    confidence: Number.isFinite(Number(p.confidence)) ? Math.max(0, Math.min(100, Math.round(Number(p.confidence)))) : null,
  };
}

// Normalizza i file in arrivo (inline o transito) e ne calcola l'identità.
async function materialize(files) {
  const out = [];
  for (const f of (files || []).slice(0, MAX_FILES)) {
    const check = PRATICA.acceptsFile(f);
    if (!check.ok) { out.push({ name: f.name || '', error: 'unsupported_media_type', detail: check.why }); continue; }
    let buffer = null, mediaType = check.mime;
    try {
      if (f.base64) {
        const b = String(f.base64).replace(/^data:[^;]+;base64,/, '');
        if (b.length > MAX_B64) throw new Error('file_too_large');
        buffer = Buffer.from(b, 'base64');
      } else if (f.fileUrl) {
        const t = await fetchTransit(f.fileUrl);
        buffer = t.buffer;
        if (t.mediaType) mediaType = t.mediaType;
      } else {
        throw new Error('base64_or_fileUrl_required');
      }
    } catch (e) {
      out.push({ name: f.name || '', error: e.message });
      continue;
    }
    const hash = sha256(buffer);
    out.push({
      name: String(f.name || 'documento').slice(0, 120),
      size: buffer.length,
      mediaType,
      sha256: hash,
      key: PRATICA.sourceKey({ sha256: hash }),
      base64: buffer.toString('base64'),
      buffer,
    });
  }
  return out;
}

// ─── op: extract ─────────────────────────────────────────────────────────
// Legge, propone, NON SCRIVE. Un import che scrive da solo sporca l'archivio
// senza che nessuno se ne accorga (la regola dell'Innesto, qui invariata).
async function opExtract(body, res) {
  const files = await materialize(body.files);
  const ok = files.filter((f) => !f.error);
  const failed = files.filter((f) => f.error);
  if (!ok.length) {
    return res.status(400).json({
      ok: false, error: 'no_readable_file',
      files: failed.map((f) => ({ name: f.name, error: f.error, detail: f.detail || null })),
    });
  }

  // Il pregresso: se la pratica esiste già, il secondo caricamento la ritrova
  // invece di crearne una seconda.
  const existing = body.existing && body.existing.extraction ? body.existing.extraction : { fields: {}, conflicts: [] };
  let state = existing;
  const perFile = [];
  const notes = [];

  for (const f of ok) {
    let read;
    try {
      read = await readOne(f, body.context);
    } catch (e) {
      perFile.push({ key: f.key, name: f.name, ok: false, error: e.message, detail: e.detail || null });
      notes.push('«' + f.name + '»: lettura non riuscita (' + (e.detail || e.message) + '). Gli altri documenti sono stati elaborati.');
      continue;
    }
    // provenienza per campo: la pagina viene dal modello, il file da noi
    const before = state;
    state = PRATICA.mergeExtraction(before, read.extraction, { sourceKey: f.key, page: null });
    Object.keys(read.provenance).forEach((path) => {
      if (state.fields[path] && state.fields[path].source === f.key) {
        state.fields[path].page = read.provenance[path].page;
        state.fields[path].quote = read.provenance[path].quote;
      }
    });
    perFile.push({ key: f.key, name: f.name, ok: true, confidence: read.confidence, fields: Object.keys(read.extraction).length });
    read.notes.forEach((n) => notes.push('«' + f.name + '»: ' + n));
  }

  const sections = PRATICA.toSections(state);
  const key = PRATICA.praticaKey(sections);

  // Doppio caricamento: si guarda se la pratica c'è già in archivio.
  let already = null;
  if (key) {
    try {
      const doc = await fsGet('contracts/' + key);
      if (doc) already = { id: key, startDate: doc.startDate || null, takeoverDate: doc.takeoverDate || null, status: doc.status || null };
    } catch (_) { /* assente = pratica nuova */ }
  }

  const dedupe = PRATICA.dedupeSources((body.existing && body.existing.sources) || [], ok);

  return res.status(200).json({
    ok: true,
    praticaKey: key,
    exists: already,
    extraction: state,
    sections,
    links: PRATICA.linkProposals(sections, body.archive || {}),
    sources: dedupe.fresh,
    duplicates: dedupe.duplicates,
    files: perFile.concat(failed.map((f) => ({ name: f.name, ok: false, error: f.error, detail: f.detail || null }))),
    inconsistencies: PRATICA.inconsistencies(Object.assign({}, sections.contract, { extraction: state })),
    notes,
    accepted: PRATICA.ACCEPTED,
    rejected: PRATICA.NOT_ACCEPTED,
    written: false,
  });
}

// ─── op: confirm ─────────────────────────────────────────────────────────
async function opConfirm(body, res, auth) {
  const draft = body.draft || {};
  const sections = PRATICA.toSections(draft.extraction || {});
  // I valori del contratto vivono in `extraction`, non sulla radice del draft:
  // passare il draft nudo faceva girare `inconsistencies` sul vuoto, quindi
  // una data di fine anteriore all'inizio sarebbe passata dal cancello.
  const gate = PRATICA.confirmable(Object.assign({}, draft, sections.contract || {}));
  if (!gate.ok) return res.status(400).json({ ok: false, error: 'not_confirmable', errors: gate.errors });
  const key = PRATICA.praticaKey(sections);
  if (!key) return res.status(400).json({ ok: false, error: 'no_pratica_identity' });

  const sig = PRATICA.externalSignature(draft.signature || {});
  if (!sig.ok) return res.status(400).json({ ok: false, error: 'signature_incomplete', errors: sig.errors });

  const plan = PRATICA.takeoverPlan(Object.assign({}, sections.contract, { takeoverDate: draft.takeoverDate }), null);
  if (!plan.ok) return res.status(400).json({ ok: false, error: 'takeover_invalid', errors: plan.errors });

  // Gli originali si conservano IMMUTATI, prima di qualunque scrittura sul
  // contratto: se Storage è giù non nasce una pratica che dichiara documenti
  // che non esistono (la lezione della sonda in api/sign/_finalize.js).
  const stored = [];
  for (const f of await materialize(draft.sources || [])) {
    if (f.error) return res.status(400).json({ ok: false, error: 'source_unreadable', detail: f.name + ': ' + f.error });
    const path = 'contracts/' + key + '/originali/' + f.key + '_' + f.name.replace(/[^\w.\-]+/g, '_');
    const url = await storageUpload(path, f.buffer, f.mediaType);
    stored.push({ key: f.key, name: f.name, sha256: f.sha256, size: f.size, mediaType: f.mediaType, path, url, uploadedAt: new Date().toISOString() });
  }

  const now = new Date().toISOString();
  const doc = {
    // i campi che le pagine del portale leggono già
    propertyId: draft.links && draft.links.property && draft.links.property.chosen || null,
    tenantId: draft.links && draft.links.tenant && draft.links.tenant.chosen || null,
    landlordId: draft.links && draft.links.landlord && draft.links.landlord.chosen || null,
    type: (sections.contract && sections.contract.type) || null,
    startDate: (sections.contract && sections.contract.startDate) || null,
    endDate: (sections.contract && sections.contract.endDate) || null,
    rent: (sections.contract && sections.contract.rent) || null,
    deposit: (sections.contract && sections.contract.deposit) || null,
    installmentMonths: (sections.contract && sections.contract.installmentMonths) || 1,
    paymentDay: (sections.contract && sections.contract.paymentDay) || null,
    cedolareSecca: (sections.contract && sections.contract.cedolareSecca) != null ? sections.contract.cedolareSecca : null,
    status: 'active',
    // il blocco che dichiara che questa pratica NON è nata qui
    origin: 'imported',
    takeoverDate: draft.takeoverDate,
    signature: sig.signature,
    imported: {
      at: now,
      by: auth.email || auth.uid || 'admin',
      sources: stored,
      extraction: draft.extraction || {},
      links: draft.links || {},
      historicalPeriods: plan.historical.length,
      note: plan.note,
    },
    createdAt: now,
    updatedAt: now,
  };

  // La guardia finale, ridondante di proposito: nessun campo di Magic Sign
  // può entrare in un contratto importato, nemmeno per errore di un chiamante.
  const touched = PRATICA.magicSignFieldsTouched(doc);
  if (touched.length) return res.status(500).json({ ok: false, error: 'magic_sign_fields_refused', fields: touched });

  try {
    await fsCreate('contracts', doc, key);
  } catch (e) {
    if (e.exists) {
      // Secondo caricamento della stessa pratica: NON si duplica e NON si
      // sovrascrive. Si dice all'operatore che esiste, e da lì si allega.
      return res.status(409).json({ ok: false, error: 'pratica_exists', id: key,
        message: 'Questa pratica è già in gestione. Usa «Aggiungi documento» per allegare quello che manca.' });
    }
    throw e;
  }

  return res.status(200).json({
    ok: true, id: key, historical: plan.historical.length, managed: plan.managed.length,
    states: PRATICA.states(doc),
    nextAction: PRATICA.nextAction(Object.assign({}, doc, sections.contract)),
    missing: PRATICA.missingDocs(doc),
  });
}

// ─── op: attach ──────────────────────────────────────────────────────────
// Il documento che arriva DOPO: la ricevuta, l'RLI, il verbale. Non crea una
// seconda pratica e non riscrive ciò che l'operatore ha già confermato.
async function opAttach(body, res, auth) {
  const id = String(body.praticaId || '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'praticaId_required' });
  const doc = await fsGet('contracts/' + id);
  if (!doc) return res.status(404).json({ ok: false, error: 'pratica_not_found' });

  const files = await materialize(body.files);
  const ok = files.filter((f) => !f.error);
  if (!ok.length) return res.status(400).json({ ok: false, error: 'no_readable_file', files: files.map((f) => ({ name: f.name, error: f.error })) });

  const prev = (doc.imported && doc.imported.sources) || [];
  const dedupe = PRATICA.dedupeSources(prev, ok);
  if (!dedupe.fresh.length) {
    return res.status(200).json({ ok: true, id, added: 0, duplicates: dedupe.duplicates.map((d) => d.name),
      message: 'Documento già allegato a questa pratica: niente è stato duplicato.' });
  }

  const stored = [];
  const conflicts = [];
  let state = (doc.imported && doc.imported.extraction) || { fields: {}, conflicts: [] };

  for (const f of ok) {
    if (!dedupe.fresh.some((d) => d.key === f.key)) continue;
    const path = 'contracts/' + id + '/originali/' + f.key + '_' + f.name.replace(/[^\w.\-]+/g, '_');
    const url = await storageUpload(path, f.buffer, f.mediaType);
    stored.push({ key: f.key, name: f.name, sha256: f.sha256, size: f.size, mediaType: f.mediaType, path, url, uploadedAt: new Date().toISOString() });
    if (body.reread !== false) {
      try {
        const read = await readOne(f, body.context);
        const merged = PRATICA.mergeExtraction(state, read.extraction, { sourceKey: f.key, page: null });
        merged.conflicts.slice((state.conflicts || []).length).forEach((c) => conflicts.push(c));
        state = merged;
      } catch (e) {
        conflicts.push({ path: null, reason: 'lettura non riuscita per «' + f.name + '»: ' + (e.detail || e.message) });
      }
    }
  }

  await fsPatch('contracts/' + id, {
    imported: Object.assign({}, doc.imported || {}, {
      sources: prev.concat(stored),
      extraction: state,
    }),
    updatedAt: new Date().toISOString(),
  });

  return res.status(200).json({
    ok: true, id, added: stored.length,
    duplicates: dedupe.duplicates.map((d) => d.name),
    conflicts,
    message: conflicts.length
      ? 'Documento allegato. ' + conflicts.length + ' valore/i in disaccordo: nessuno è stato sovrascritto, decidi tu.'
      : 'Documento allegato.',
  });
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }

  const op = String(body.op || 'extract');
  // La lettura la può fare chi vede i propri immobili; SCRIVERE una pratica
  // è admin, come `contracts` nelle rules. Il confine sta qui, server-side.
  const roles = op === 'extract' ? ['admin', 'owner', 'landlord'] : ['admin'];
  const auth = await requireRole(req, res, roles);
  if (!auth) return;

  if (op !== 'confirm' && !process.env.ANTHROPIC_API_KEY) {
    return res.status(501).json({ ok: false, error: 'extraction_unconfigured',
      message: 'Lettura automatica non configurata: i dati si possono inserire a mano.' });
  }

  try {
    if (op === 'extract') return await opExtract(body, res);
    if (op === 'confirm') return await opConfirm(body, res, auth);
    if (op === 'attach') return await opAttach(body, res, auth);
    return res.status(400).json({ ok: false, error: 'unknown_op' });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ ok: false, error: e.message, why: e.why || null, detail: e.detail || null });
    console.error('[contracts/import]', e);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
