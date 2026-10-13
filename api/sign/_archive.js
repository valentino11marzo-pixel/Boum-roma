// api/sign/_archive.js — il CONTRATTO FIRMATO nell'archivio di chi l'ha firmato.
//
// LA LEZIONE DEL 4/10/2026. A firma completa il server produce la copia
// firmata (`contracts/<id>/contratto-firmato.pdf` → `contract.signedPdfUrl`),
// ma nessuno la metteva fra i DOCUMENTI delle parti: il portal del
// proprietario legge `documents where userId == uid`, e l'unico documento
// «contratto» nasceva nel browser all'attivazione (`activateContract`) —
// prima della firma completa, quindi sul PDF SENZA firme, e mai più
// aggiornato. `archiveDeal` copiava pure lui il PDF senza firme chiamandolo
// «Contratto firmato». Qui la copia firmata entra nell'archivio di ciascuna
// parte che ha un profilo — conduttore, proprietario, co-conduttori — con un
// id DETERMINISTICO (`contract-signed_<contratto>_<parte>`): un retry, il
// watchdog o 🔄 Rifinalizza non duplicano mai. I documenti nati
// dall'attivazione col PDF senza firme vengono RIPARATI sul posto (stessa
// riga che la parte vede già), non affiancati da un doppione.
//
// Best-effort: non blocca MAI il finalize. Nessun documento senza la copia
// firmata — un PDF senza firme col nome «firmato» è il difetto da chiudere.

import { fsList, fsPatch } from '../homie/_lib.js';

export const ACTIVATION_NOTE = 'Auto-generated upon contract activation via Magic Sign';

export function signedDocId(contractId, who) {
  return `contract-signed_${contractId}_${who}`;
}

const labelOf = (contract, property) => {
  const p = property || {};
  const s = String(p.name || p.address || contract.propertyAddress || contract.propertyName || '').trim();
  return s.slice(0, 80) || 'Lease';
};

// Pura: le copie da scrivere, una per parte con un profilo (userId).
export function signedContractDocs(contract, property, { signedPdfUrl, certUrl, now } = {}) {
  const c = contract || {}, p = property || {};
  if (!c.id || !signedPdfUrl) return [];
  const at = new Date(Date.parse(c.fullySignedAt || '') || (now ? new Date(now).getTime() : Date.now()));
  const label = labelOf(c, p);
  const base = {
    type: 'contract', category: 'contratto locazione',
    tags: ['02_Contratti', 'contratto', 'firmato', 'signed'],
    contractId: c.id, propertyId: c.propertyId || '',
    fileUrl: signedPdfUrl, fileName: 'contratto-firmato.pdf', mimeType: 'application/pdf',
    certificateUrl: certUrl || '',
    signedAt: at, docDate: at.toISOString().slice(0, 10), fiscalYear: at.getFullYear(),
    contractVersion: Number(c.contractVersion) || 1,
    shared: false, uploadedBy: 'boom', source: 'finalize', needsFiling: false,
    note: 'Copia firmata dal server alla firma completa (pagina delle firme in coda).',
  };
  const out = [];
  const seen = new Set();
  const add = (who, userId, lang, extra = {}) => {
    const uid = String(userId || '').trim();
    if (!uid || seen.has(uid)) return; // la stessa persona in due ruoli: una copia
    seen.add(uid);
    out.push({
      id: signedDocId(c.id, who), who, userId: uid,
      data: {
        ...base, userId: uid, party: who, lang,
        name: (lang === 'it' ? 'Contratto firmato — ' : 'Signed contract — ') + label,
        ...extra,
      },
    });
  };
  add('tenant', c.tenantId, 'en');
  add('landlord', p.ownerId || c.landlordId || c.ownerId, 'it');
  (Array.isArray(c.coTenants) ? c.coTenants : []).forEach((x, i) => {
    if (x && x.userId) add('co' + i, x.userId, 'en', { coTenantIndex: i });
  });
  return out;
}

// Un documento già esistente per QUESTA parte che va riparato invece di
// affiancato: la copia del finalize (rerun) o quella nata dall'attivazione.
export function isAdoptable(doc, contractId) {
  if (!doc || doc.contractId !== contractId) return false;
  if (doc.type !== 'contract') return false;
  return doc.source === 'finalize' || doc.note === ACTIVATION_NOTE;
}

// Pura: per ogni copia da scrivere, il documento su cui scriverla.
//  · la copia del finalize già scritta (rerun, anche su un doc adottato);
//  · altrimenti i documenti dell'attivazione di quella persona (TUTTI: se
//    il «Ri-attiva onboarding» li ha raddoppiati, nessuno resta a mentire);
//  · altrimenti l'id deterministico, nuovo.
export function planArchive(copies, existing, contractId) {
  const docs = (Array.isArray(existing) ? existing : []).filter(d => isAdoptable(d, contractId));
  const writes = [];
  // Su un documento che esiste già si ripara il CONTENUTO: `shared` e
  // `createdAt` restano quelli che la parte vede (l'attivazione li metteva
  // shared:true — cambiarli sotto i suoi occhi non è compito dell'archivio).
  const repair = (data) => { const { shared, ...rest } = data; return rest; };
  for (const cp of copies) {
    // rerun: la copia del finalize di QUESTA persona c'è già — col suo id
    // deterministico o su un documento dell'attivazione adottato al giro
    // prima (che porta ora source:'finalize'). Mai una seconda riga.
    const done = docs.filter(d => d.source === 'finalize' && (d.id === cp.id || d.userId === cp.userId));
    if (done.length) {
      for (const d of done) writes.push({ id: d.id, data: repair(cp.data), who: cp.who, mode: 'rerun' });
      continue;
    }
    const mine = docs.filter(d => d.userId === cp.userId);
    if (mine.length) {
      for (const d of mine) writes.push({ id: d.id, data: repair(cp.data), who: cp.who, mode: 'adopt' });
      continue;
    }
    writes.push({ id: cp.id, data: { ...cp.data, createdAt: cp.data.signedAt }, who: cp.who, mode: 'create' });
  }
  return writes;
}

// I/O. Mai un'eccezione verso il finalize.
export async function archiveSignedContract(contract, property, { signedPdfUrl, certUrl, now } = {}) {
  try {
    const copies = signedContractDocs(contract, property, { signedPdfUrl, certUrl, now });
    if (!copies.length) return { ok: true, written: 0, skipped: signedPdfUrl ? 'no_party_profile' : 'no_signed_pdf' };
    let existing = [];
    try {
      existing = await fsList('documents', { filter: { field: 'contractId', op: 'EQUAL', value: contract.id }, limit: 60 });
    } catch (e) { console.warn('[archive] list:', e.message); }
    const updatedAt = now ? new Date(now) : new Date();
    const writes = planArchive(copies, existing, contract.id);
    const write = (w) => fsPatch(`documents/${w.id}`, { ...w.data, updatedAt });
    const results = await Promise.allSettled(writes.map(write));
    const parties = {};
    results.forEach((r, i) => {
      const w = writes[i];
      if (r.status === 'fulfilled') parties[w.who] = parties[w.who] || w.mode;
      else console.warn('[archive] write', w.who, r.reason && r.reason.message);
    });
    const written = results.filter(r => r.status === 'fulfilled').length;
    return { ok: written === writes.length, written, parties, adopted: writes.filter(w => w.mode === 'adopt').length };
  } catch (e) {
    console.warn('[archive] failed:', e.message);
    return { ok: false, error: 'archive_failed' };
  }
}
