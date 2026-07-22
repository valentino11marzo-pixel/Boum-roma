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

import { fsCreate, fsList, storageUpload, logActivity } from '../agent/_lib.js';
import { extractJson } from '../agent/_claude.js';

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

// Classify + file one document. Returns
// { ok, id, catKey, label, propertyLabel, fiscalYear, folder, needsFiling, summary }
export async function smistaDocument({ base64, mediaType, fileName, hint, origin }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing');
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > MAX_DOC_BYTES) throw new Error('file troppo grande (max 8MB)');

  // Real property list so the model does the matching against ACTUAL data.
  const [properties, contracts] = await Promise.all([
    fsList('properties', { limit: 200 }).catch(() => []),
    fsList('contracts', { limit: 300 }).catch(() => []),
  ]);
  const propList = properties.map(p => ({
    id: p.id,
    label: [p.title || p.name || p.nickname, p.address].filter(Boolean).join(' — ').slice(0, 90),
  }));

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
    hint ? `\nNota di chi lo invia (usala per categoria/immobile): "${String(hint).slice(0, 300)}"` : '',
    '\nSe non sei ragionevolmente sicuro dell\'immobile, propertyId=null. Non inventare.',
  ].join('\n');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
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
  const property = properties.find(p => p.id === parsed.propertyId) || null;
  const propertyLabel = property ? (property.title || property.name || property.nickname || property.id) : null;

  // Best contract for the property in that fiscal year (for the checklist).
  let contractId = null;
  if (property) {
    const cands = contracts
      .filter(c => c.propertyId === property.id && c.status !== 'draft')
      .filter(c => {
        const sy = c.startDate ? Number(String(c.startDate).slice(0, 4)) : null;
        const ey = c.endDate ? Number(String(c.endDate).slice(0, 4)) : null;
        return (!sy || sy <= fiscalYear) && (!ey || ey >= fiscalYear);
      });
    contractId = (cands.find(c => c.status === 'active') || cands[0])?.id || null;
  }

  const safeName = String(fileName || 'documento').replace(/[^\w.\-]+/g, '_').slice(0, 60);
  const path = `smistatore/${fiscalYear}/${Date.now()}_${safeName}`;
  const fileUrl = await storageUpload(path, Buffer.from(base64, 'base64'), mediaType);
  if (!fileUrl) throw new Error('storage non configurato');

  const needsFiling = !property;
  const name = [cat.label, propertyLabel || null, String(fiscalYear)].filter(Boolean).join(' · ');
  const { id } = await fsCreate('documents', {
    name,
    type: cat.type,
    category: cat.category,
    tags: [cat.folder, 'smistatore', origin].filter(Boolean),
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
  });

  await logActivity('Documento smistato', 'document',
    { id, catKey, propertyId: property?.id || null, fiscalYear, origin, needsFiling }, 'smistatore');

  return {
    ok: true, id, catKey,
    label: cat.label, folder: cat.folder,
    propertyLabel, fiscalYear, needsFiling,
    summary: String(parsed.summary || '').slice(0, 200),
  };
}
