// api/documents/_smista.js — LO SMISTATORE (pipeline condivisa)
//
// One entry point for "mando qualsiasi cosa e si sistema da sola": takes a
// file (PDF or image), asks Claude to classify it AGAINST the real property
// list, uploads it to Storage and files it in the `documents` collection —
// the same archive the portal, the taxpack checklist and the commercialista
// share links already read. Categories are keyword-mapped so
// taxpack-engine's docMatchesRequirement picks them up with NO changes:
// filing an F24 IMU automatically ticks the pacchetto-commercialista box.
//
// Callers: api/telegram/webhook.js (send a photo/PDF to the bot) and
// api/documents/scan-inbox.js (forward an email with attachments).
//
// LE PORTE (10/09/2026, Lotto 2 della Segretaria unica): un documento può
// arrivare anche da chi NON è l'operatore — un allegato WhatsApp, l'email di
// un proprietario. Due garanzie, entrambe decise PRIMA di spendere il modello
// e PRIMA di scrivere (Codex le ha chieste in PR #234, e aveva ragione):
//   · `docId` — id deterministico scelto dal chiamante (es. sha1 dell'URL
//     dell'allegato): se il documento esiste già si torna `duplicate:true`
//     senza chiamare il modello né caricare su Storage; un 409 in gara è
//     trattato allo stesso modo. Un retry di Homie non archivia due volte.
//   · `relation` — chi manda: `{ kind:'landlord'|'tenant'|'unknown'|
//     'operator', label, propertyIds[], contractIds[] }`. Con
//     landlord/tenant il modello sceglie SOLO fra gli immobili del mittente
//     (l'elenco che vede è già ristretto e la scelta è rivalidata qui); un
//     immobile solo → è il default quando il modello non sceglie
//     (`relationDefault:true`); più immobili e nessuna scelta → resta da
//     smistare coi candidati dichiarati (`relatedPropertyIds`). Con
//     `unknown` il documento NON finisce MAI sotto un immobile: la scelta
//     del modello resta visibile come `suggestedPropertyId`, `needsFiling`
//     è forzato. Senza `relation` il comportamento è quello di sempre
//     (l'operatore che smista: tutto il catalogo, archiviazione diretta).

import { fsCreate, fsGet, fsList, storageUpload, logActivity } from '../agent/_lib.js';
import { extractJson } from '../agent/_claude.js';
import { aiSignal } from '../_budget.js';

const MODEL = 'claude-haiku-4-5-20251001';
export const MAX_DOC_BYTES = 8 * 1024 * 1024;

// key → archive mapping. `category` strings are keyword-rich on purpose:
// they're what docMatchesRequirement regexes look for.
export const CATS = {
  contratto:           { label: 'Contratto di locazione',        category: 'contratto locazione',            folder: '01_Contratto',        type: 'contract' },
  rli:                 { label: 'Registrazione RLI',             category: 'registrazione RLI',              folder: '01_Contratto',        type: 'other' },
  cedolare:            { label: 'Opzione cedolare secca',        category: 'cedolare secca opzione',         folder: '01_Contratto',        type: 'other' },
  ricevuta_canone:     { label: 'Ricevuta canone',               category: 'ricevuta canone incasso',        folder: '02_Incassi',          type: 'receipt' },
  fattura_spese:       { label: 'Fattura spese/manutenzione',    category: 'fattura spese manutenzione',     folder: '03_Spese_detraibili', type: 'other' },
  f24_registro:        { label: 'F24 imposta di registro',       category: 'F24 imposta di registro',        folder: '04_Imposte',          type: 'other' },
  f24_imu:             { label: 'F24 IMU',                       category: 'F24 IMU',                        folder: '04_Imposte',          type: 'other' },
  f24_altro:           { label: 'F24 / tributi',                 category: 'F24 tributo versamento',         folder: '04_Imposte',          type: 'other' },
  istat:               { label: 'Adeguamento ISTAT',             category: 'adeguamento ISTAT',              folder: '05_Adeguamenti',      type: 'other' },
  ape:                 { label: 'APE',                           category: 'APE prestazione energetica',     folder: '06_Immobile',         type: 'other' },
  visura:              { label: 'Visura catastale',              category: 'visura catastale',               folder: '06_Immobile',         type: 'other' },
  utenza:              { label: 'Bolletta / utenza',             category: 'utility bolletta utenza',        folder: '06_Immobile',         type: 'utility' },
  documento_identita:  { label: 'Documento d\'identità',         category: 'documento identità carta ID',    folder: '07_Inquilino',        type: 'id' },
  cessione_fabbricato: { label: 'Cessione di fabbricato',        category: 'cessione fabbricato',            folder: '07_Inquilino',        type: 'other' },
  imposta_soggiorno:   { label: 'Imposta di soggiorno',          category: 'imposta soggiorno versamento',   folder: '08_BreviLocazioni',   type: 'other' },
  fattura_societa:     { label: 'Fattura società',               category: 'fattura società invoice',        folder: '09_Societa',          type: 'other' },
  estratto_conto:      { label: 'Estratto conto',                category: 'estratto conto bancario',        folder: '09_Societa',          type: 'other' },
  altro:               { label: 'Documento',                     category: 'documento generico',             folder: '99_DaSmistare',       type: 'other' },
};

const RELATION_KINDS = new Set(['landlord', 'tenant', 'unknown', 'operator']);

/** La relazione del mittente, normalizzata. Pura, esportata per i test.
 *  Niente relation → 'operator' (il comportamento storico). Una relation
 *  con kind ignoto → 'unknown' (il default sicuro: mai sotto un immobile). */
export function normalizeRelation(relation) {
  const r = relation && typeof relation === 'object' ? relation : null;
  const kind = r ? (RELATION_KINDS.has(r.kind) ? r.kind : 'unknown') : 'operator';
  const ids = (arr) => new Set((Array.isArray(arr) ? arr : []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 50));
  return {
    kind,
    label: r && r.label ? String(r.label).slice(0, 80) : null,
    propertyIds: kind === 'landlord' || kind === 'tenant' ? ids(r.propertyIds) : new Set(),
    contractIds: kind === 'landlord' || kind === 'tenant' ? ids(r.contractIds) : new Set(),
  };
}

function dupResult(id, prev) {
  return {
    ok: true, duplicate: true, id,
    catKey: null, label: (prev && prev.name) || null, folder: null,
    propertyLabel: null, fiscalYear: (prev && prev.fiscalYear) || null,
    needsFiling: !!(prev && prev.needsFiling), summary: (prev && prev.notes) || '',
  };
}

// Classify + file one document. Returns
// { ok, id, catKey, label, propertyLabel, fiscalYear, folder, needsFiling, summary,
//   duplicate, suggestedPropertyId, relationDefault, relatedPropertyIds }
export async function smistaDocument({ base64, mediaType, fileName, hint, origin, docId = null, relation = null }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing');
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > MAX_DOC_BYTES) throw new Error('file troppo grande (max 8MB)');

  // Idempotenza PRIMA di spendere: stesso docId → già archiviato. Niente
  // modello, niente upload. (Un fsGet fallito per rete cade nel 409 sotto.)
  const id0 = docId ? String(docId).replace(/[^\w.\-]+/g, '_').slice(0, 120) : null;
  if (id0) {
    const prev = await fsGet('documents/' + id0).catch(() => null);
    if (prev) return dupResult(id0, prev);
  }

  const rel = normalizeRelation(relation);
  const allowed = rel.propertyIds.size ? rel.propertyIds : null;

  // Real property list so the model does the matching against ACTUAL data.
  // Con una relazione, il modello vede SOLO gli immobili del mittente.
  const [properties, contracts] = await Promise.all([
    fsList('properties', { limit: 200 }).catch(() => []),
    fsList('contracts', { limit: 300 }).catch(() => []),
  ]);
  const candidates = allowed ? properties.filter((p) => allowed.has(p.id)) : properties;
  const propList = candidates.map(p => ({
    id: p.id,
    label: [p.title || p.name || p.nickname, p.address].filter(Boolean).join(' — ').slice(0, 90),
  }));
  const whoLine = rel.kind === 'landlord' || rel.kind === 'tenant'
    ? `\nChi lo manda: ${rel.label || (rel.kind === 'landlord' ? 'un proprietario' : 'un inquilino')} in archivio, ${rel.kind === 'landlord' ? 'proprietario' : 'inquilino'} degli immobili elencati sotto. L'elenco contiene SOLO i suoi immobili.`
    : rel.kind === 'unknown'
      ? '\nChi lo manda: un contatto NON in archivio. Indica l\'immobile solo se il documento lo nomina chiaramente.'
      : '';

  const isPdf = /pdf/.test(mediaType);
  const block = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };

  const prompt = [
    'Sei l\'archivista di un\'agenzia di affitti a Roma. Classifica questo documento e rispondi SOLO con JSON valido:',
    '{',
    ` "category": una tra ${JSON.stringify(Object.keys(CATS))},`,
    ' "fiscalYear": <anno fiscale del documento, o null>,',
    ' "propertyId": "<id dell\'immobile a cui si riferisce, scelto dall\'elenco sotto, o null se non identificabile>",',
    ' "tenantName": "<nome dell\'inquilino se presente, o null>",',
    ' "amount": <importo principale in EUR, o null>,',
    ' "docDate": "YYYY-MM-DD o null",',
    ' "summary": "<una riga in italiano: cos\'è e a cosa si riferisce>"',
    '}',
    '',
    'Elenco immobili (usa SOLO questi id, confronta indirizzi/nomi):',
    JSON.stringify(propList),
    whoLine,
    hint ? `\nNota di chi lo invia (usala per categoria/immobile): "${String(hint).slice(0, 300)}"` : '',
    '\nSe non sei ragionevolmente sicuro dell\'immobile, propertyId=null. Non inventare.',
  ].join('\n');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    signal: aiSignal(20000),   // un modello appeso non deve uccidere la funzione
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: 800,
      messages: [{ role: 'user', content: [block, { type: 'text', text: prompt }] }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const parsed = extractJson(text) || {};

  const catKey = CATS[parsed.category] ? parsed.category : 'altro';
  const cat = CATS[catKey];
  const fiscalYear = Number(parsed.fiscalYear) || (parsed.docDate ? Number(String(parsed.docDate).slice(0, 4)) : null) || new Date().getFullYear();
  // La scelta del modello, rivalidata QUI contro la relazione — prima di
  // qualunque scrittura. Il modello propone; il vincolo decide.
  const modelPick = properties.find(p => p.id === parsed.propertyId) || null;
  let property = null;
  let relationDefault = false;
  let suggestedPropertyId = null;
  if (rel.kind === 'unknown') {
    // Uno sconosciuto non archivia MAI sotto un immobile: il suggerimento
    // resta visibile all'operatore, la decisione è sua.
    suggestedPropertyId = modelPick ? modelPick.id : null;
  } else if (allowed) {
    if (modelPick && allowed.has(modelPick.id)) property = modelPick;
    else if (candidates.length === 1) { property = candidates[0]; relationDefault = true; }
    // più immobili e nessuna scelta valida → da smistare, coi candidati dichiarati
  } else {
    property = modelPick;
  }
  const propertyLabel = property ? (property.title || property.name || property.nickname || property.id) : null;

  // Best contract for the property in that fiscal year (for the checklist).
  // Un contratto dichiarato dalla relazione (l'inquilino che manda) vince,
  // purché sia dell'immobile scelto.
  let contractId = null;
  if (property) {
    const cands = contracts
      .filter(c => c.propertyId === property.id && c.status !== 'draft')
      .filter(c => {
        const sy = c.startDate ? Number(String(c.startDate).slice(0, 4)) : null;
        const ey = c.endDate ? Number(String(c.endDate).slice(0, 4)) : null;
        return (!sy || sy <= fiscalYear) && (!ey || ey >= fiscalYear);
      });
    contractId = (cands.find(c => rel.contractIds.has(c.id)) || cands.find(c => c.status === 'active') || cands[0])?.id || null;
  }

  const safeName = String(fileName || 'documento').replace(/[^\w.\-]+/g, '_').slice(0, 60);
  const path = `smistatore/${fiscalYear}/${Date.now()}_${safeName}`;
  const fileUrl = await storageUpload(path, Buffer.from(base64, 'base64'), mediaType);
  if (!fileUrl) throw new Error('storage non configurato');

  const needsFiling = !property;
  const relatedPropertyIds = allowed && !property ? [...allowed] : null;
  const name = [cat.label, propertyLabel || null, String(fiscalYear)].filter(Boolean).join(' · ');
  const doc = {
    name,
    type: cat.type,
    category: cat.category,
    tags: [cat.folder, 'smistatore', origin, rel.kind === 'unknown' ? 'sconosciuto' : null].filter(Boolean),
    fileUrl,
    fileName: safeName,
    mimeType: mediaType,
    propertyId: property ? property.id : null,
    contractId,
    fiscalYear,
    amount: Number(parsed.amount) || null,
    docDate: parsed.docDate || null,
    tenantName: parsed.tenantName || null,
    notes: String(parsed.summary || '').slice(0, 300),
    source: origin,
    uploadedBy: 'smistatore',
    needsFiling,
    shared: false,
    createdAt: new Date(),
    ...(rel.kind !== 'operator' ? { relationKind: rel.kind, relationLabel: rel.label } : {}),
    ...(suggestedPropertyId ? { suggestedPropertyId } : {}),
    ...(relatedPropertyIds ? { relatedPropertyIds } : {}),
    ...(relationDefault ? { relationDefault: true } : {}),
  };
  let id;
  try {
    ({ id } = await fsCreate('documents', doc, id0 || undefined));
  } catch (e) {
    // Gara persa su un docId (due porte, stesso allegato): è già in archivio.
    if (e && e.exists && id0) return dupResult(id0, await fsGet('documents/' + id0).catch(() => null));
    throw e;
  }

  await logActivity('Documento smistato', 'document',
    { id, catKey, propertyId: property?.id || null, fiscalYear, origin, needsFiling, relationKind: rel.kind }, 'smistatore');

  return {
    ok: true, duplicate: false, id, catKey,
    label: cat.label, folder: cat.folder,
    propertyLabel, fiscalYear, needsFiling,
    summary: String(parsed.summary || '').slice(0, 200),
    suggestedPropertyId, relationDefault, relatedPropertyIds,
  };
}
