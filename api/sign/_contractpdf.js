// api/sign/_contractpdf.js — il PDF del contratto nasce ANCHE dal server.
//
// Il difetto che chiude (agosto 2026): un contratto creato dal rail
// pre-agreement (convert / send-sign, tutto server-side) nasceva senza
// generatedPDF perché l'impaginato jsPDF viveva solo dentro portal-app.js.
// Conseguenze a catena: sign.html non mostrava "View full contract PDF"
// prima della firma, _finalize.js saltava il contratto firmato in allegato
// (email, Pack Registrazione, Conservazione) e all'operatore restava un
// promemoria Telegram "genera il PDF dal portal" — il cerotto al posto
// della cura.
//
// Ora l'impaginato sta in js/contract-pdf.js (UNA copia, browser + server)
// e qui c'è solo il giro server: risolvi i dati, impagina con jsPDF npm
// (STESSA versione 2.5.1 del CDN del portal), carica su Storage, patcha il
// contratto — generatedPDF, pdfHash, sigAnchors (per le firme SUL
// contratto), clauseVersion. Identico a ciò che scrive il portal.
//
// REGOLE DURE:
// - MAI rigenerare sotto una firma viva: qualunque firma presente
//   (inquilino, locatore, co-conduttore) → si esce senza toccare nulla.
//   Il PDF di un atto in corso di sottoscrizione è congelato.
// - Idempotente sul PDF FRESCO: generatedPDF presente E clauseVersion
//   corrente → si restituisce quello. Un PDF con le clausole VECCHIE e
//   NESSUNA firma invece si rigenera qui, in automatico: fino ad agosto
//   2026 il portal mostrava solo un ⚠ dentro il dettaglio contratto e
//   sign.html serviva al firmatario il PDF stantio — il modello vecchio
//   finiva in firma ogni volta che nessuno premeva 🔄 Rigenera.
// - Best-effort per contratto ALTRUI: ogni chiamante avvolge in try/catch —
//   una generazione fallita non blocca mai conversione, invito o lookup.
//
// Chiamanti: preagreement/convert.js (alla creazione), preagreement/
// send-sign.js (cintura e bretelle sui contratti pre-fix), magic-sign/
// lookup.js (ultima rete: la prima apertura del link genera se manca o
// se il PDF è di una versione clausole superata).

import crypto from 'node:crypto';
import jspdfNS from 'jspdf';
import CONTRACT_PDF from '../../js/contract-pdf.js';
import { fsGet, fsPatch } from '../homie/_lib.js';
import { storageUpload } from '../agent/_lib.js';

const jsPDF = jspdfNS.jsPDF || jspdfNS.default || jspdfNS;

// La versione CORRENTE delle clausole dell'impaginato (js/contract-pdf.js,
// modelli CAF 2023). Un contratto senza firma il cui PDF porta una versione
// più vecchia viene rigenerato al prossimo passaggio sul rail di firma.
export const CLAUSE_VERSION = 2;

// Stessa impronta del portal: SHA-256 hex, primi 16 caratteri
// (generateDocHash in portal-app.js usa crypto.subtle con la stessa formula).
export const sha16 = (s) =>
  crypto.createHash('sha256').update(String(s)).digest('hex').substring(0, 16);

export const hasAnySignature = (c) => !!(
  c && (c.tenantSignature || c.landlordSignature
    || (Array.isArray(c.coTenants) && c.coTenants.some(x => x && x.signature)))
);

const withBudget = (p, ms, label) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error(label + '_timeout')), ms)),
]);

// Genera (se serve) il PDF del contratto e ritorna l'URL, o null quando non
// si può/deve generare. `preloaded` evita una rilettura quando il chiamante
// ha già il documento in mano; deve includere i campi del contratto (l'id
// arriva dal primo parametro, non dal documento).
export async function ensureContractPdf(contractId, preloaded = null) {
  if (!contractId) return null;
  const contract = preloaded || await fsGet('contracts/' + contractId);
  if (!contract) return null;
  // PDF fresco (clausole correnti) → idempotente, si restituisce quello.
  if (contract.generatedPDF && Number(contract.clauseVersion || 0) >= CLAUSE_VERSION) {
    return contract.generatedPDF;
  }
  // Firma viva: il documento è CONGELATO qualunque versione porti — un
  // atto in corso di sottoscrizione non cambia sotto la penna di nessuno.
  if (hasAnySignature(contract)) return contract.generatedPDF || null;
  // Da qui: PDF mancante O impaginato con clausole vecchie e nessuna
  // firma → si (ri)genera, sovrascrivendo lo stesso path su Storage.

  // Risoluzione dati — stessa catena del portal (S.properties/S.users):
  // property dal contratto, tenant da users, landlord da property.ownerId.
  // Tutto opzionale: il modulo stampa i puntini dove mancano i dati,
  // esattamente come farebbe il portal.
  let property = null, tenant = null, landlord = null;
  if (contract.propertyId) {
    try { property = await fsGet('properties/' + contract.propertyId); } catch (_) {}
  }
  if (contract.tenantId) {
    try { tenant = await fsGet('users/' + contract.tenantId); } catch (_) {}
  }
  if (property && property.ownerId) {
    try { landlord = await fsGet('users/' + property.ownerId); } catch (_) {}
  }

  const built = CONTRACT_PDF.build({ jsPDF, contractId, contract, property, tenant, landlord });
  const bytes = Buffer.from(built.doc.output('arraybuffer'));
  if (!bytes.length) throw new Error('empty_pdf');

  // Stesso path del portal: contracts/<id>/contract.pdf (sovrascrive la
  // versione precedente, mai una copia orfana).
  const url = await withBudget(
    storageUpload(`contracts/${contractId}/contract.pdf`, bytes, 'application/pdf'),
    15000, 'storage',
  );
  if (!url) return null;

  await fsPatch('contracts/' + contractId, {
    generatedPDF: url,
    pdfHash: sha16(built.hashSeed),
    sigAnchors: { v: 1, blocks: built.sigAnchors },
    pdfSizeKB: Math.round(bytes.length / 1024),
    pdfGeneratedAt: new Date().toISOString(),
    pdfGeneratedBy: 'server',
    clauseVersion: CLAUSE_VERSION,
  });
  return url;
}
