// api/preagreement/_askscheda.js
// I DATI DEL LOCATORE SI CHIEDONO DA SOLI (13/09/2026).
//
// Il contratto che il conduttore apre da /sign stampava puntini su ciò
// che nessuno aveva mai chiesto al locatore: codice fiscale, nascita,
// residenza, catasto, vani, classe energetica, tabelle. La console
// raccoglie del locatore solo nome, email e telefono; la sua Scheda
// (/scheda, link derivato) esisteva ma partiva SOLO se l'operatore la
// mandava a mano dal portal — cioè quasi mai prima della firma.
//
// Qui la richiesta parte insieme all'invito a firmare (🖊 send-sign):
// stesso tap, le due parti compilano in parallelo, e il PDF si rifà da
// solo quando i dati arrivano (profile/submit → ensureContractPdf force),
// PRIMA che il conduttore firmi. Il testo è quello del dizionario
// (missingMessage: nomina i mancanti, collassa i gruppi, porta il link).
// Cosa NON fa: non scrive al locatore se non manca niente, se non c'è
// un'email, o se ha già firmato (il documento è congelato). Lo stato
// resta sul contratto (schedaAskedLandlord*), atteso prima di rispondere.

import { fsGet, fsPatch } from '../homie/_lib.js';
import { sendEmail } from '../agent/_lib.js';
import { schedaUrl } from '../profile/_scheda.js';
import { resolveLandlord } from '../sign/_contractpdf.js';
import { shell, btn, para, fine } from './_notify.js';
import FIELDS from '../../js/contract-fields.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Cosa manca al locatore, letto come lo legge il PDF (stesso resolver).
export async function landlordGaps(contractId, contract) {
  let property = null;
  if (contract && contract.propertyId) { try { property = await fsGet('properties/' + contract.propertyId); } catch (_) { property = null; } }
  const landlord = await resolveLandlord(contract, property).catch(() => null);
  const ctx = { contract: contract || {}, property: property || {}, tenant: {}, landlord: landlord || {} };
  const missing = FIELDS.missingFor('landlord', ctx, { lang: 'it' });
  return { missing, property, landlord };
}

export async function askLandlordScheda({ contractId, contract, pa, actor }) {
  if (!contractId || !contract) return { asked: false, why: 'no_contract' };
  if (contract.landlordSignature) return { asked: false, why: 'signed' };
  const { missing, property, landlord } = await landlordGaps(contractId, contract);
  if (!missing.length) return { asked: false, why: 'complete' };
  const to = String(contract.landlordEmail || ((pa && pa.landlord) || {}).email || (landlord && landlord.email) || '').trim();
  if (!to || !EMAIL_RE.test(to)) return { asked: false, why: 'no_email', missing: missing.map(m => m.key) };

  const url = schedaUrl(contractId, 'landlord');
  const propLabel = (property && (property.name || property.address)) || (((pa && pa.property) || {}).address) || '';
  const name = contract.landlordName || (landlord && landlord.name) || '';
  const msg = FIELDS.missingMessage('landlord', missing, { name, url, propLabel });
  const subject = ('Contratto ' + (propLabel ? propLabel + ' ' : '') + '— i suoi dati per il contratto (2 minuti)').replace(/\s+/g, ' ').trim();
  const bodyHtml = esc(msg).replace(esc(url), `<a href="${esc(url)}" style="color:#B8960C">${esc(url)}</a>`).replace(/\n/g, '<br>');
  const html = shell(
    para(bodyHtml)
    + btn(url, 'Compila la scheda')
    + fine('Il link è personale e resta valido fino alla firma del contratto. Bastano due minuti dal telefono: i dati entrano direttamente nel contratto e nella registrazione, senza ribatterli.'),
    'I dati che servono per il contratto — due minuti dal telefono.',
  );
  await sendEmail({ to, subject, html, text: msg });
  await fsPatch('contracts/' + contractId, {
    schedaAskedLandlordAt: new Date().toISOString(),
    schedaAskedLandlordTo: to,
    schedaAskedLandlordBy: actor || 'send-sign',
    schedaAskedLandlordMissing: missing.map(m => m.key),
  });
  return { asked: true, to, missing: missing.map(m => m.key) };
}
