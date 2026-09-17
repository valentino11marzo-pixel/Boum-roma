// api/scrivano/_offer.js — L'OFFERTA dello Scrivano (STUDIO_SCRIVANO §4, passo 4)
//
// Quali documenti archiviati meritano una lettura dell'Innesto, e il bottone
// che la propone su Telegram. UNA copia per tutte le porte: il webhook
// Telegram mette il bottone nella PROPRIA risposta («Archiviato: …»); per le
// porte che non sono Telegram — WhatsApp ed email, le porte di Codex — la
// card parte da qui, dentro smistaDocument, best-effort. Una porta che chiama
// smistaDocument eredita l'offerta senza sapere che esiste.
//
// Il tap sul bottone È la firma sulla spesa (Opus 5): niente si legge senza,
// e niente si scrive prima della conferma nel portal.
import { tgSend } from '../telegram/_lib.js';

// Le classi dello Smistatore che l'Innesto sa trasformare in una proposta.
// ESCLUSE di proposito, finché l'Innesto sa solo CREARE contratti: rli,
// cedolare, istat, cessione_fabbricato sono EVENTI su un contratto che c'è
// già — letti oggi produrrebbero un contratto doppione, non una modifica.
export const SCRIVANO_KINDS = {
  contratto:          'un contratto: parti, immobile, termini e rate',
  documento_identita: 'un documento d\'identità: l\'anagrafica della persona (chi esiste già viene aggiornato, non duplicato)',
  visura:             'una visura: i dati catastali dell\'immobile',
  ape:                'un APE: la classe energetica dell\'immobile',
};

// Telegram tronca in silenzio la tastiera se un callback_data supera i 64
// byte (la lezione di tests/viewings/telegram.mjs): meglio nessun bottone
// che una tastiera morta.
export const CALLBACK_MAX = 64;
export const CALLBACK_PREFIX = 'sc:';

export function scrivanoEligible(catKey, docId) {
  if (!Object.prototype.hasOwnProperty.call(SCRIVANO_KINDS, String(catKey || ''))) return false;
  const id = String(docId || '');
  if (!id || /[:\s]/.test(id)) return false;
  return Buffer.byteLength(CALLBACK_PREFIX + id, 'utf8') <= CALLBACK_MAX;
}

export function offerKeyboard(docId) {
  return { inline_keyboard: [[{ text: '🌱 Leggi e proponi nel portal', callback_data: CALLBACK_PREFIX + String(docId) }]] };
}

export function offerLine(catKey) {
  return `🌱 Posso leggerlo come ${SCRIVANO_KINDS[catKey]} e prepararti la proposta nel portal — niente si scrive prima della tua conferma.`;
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// La card per le porte che NON sono Telegram (WhatsApp, email…): dice che
// il documento è archiviato e offre la lettura. Best-effort: un Telegram
// giù non deve mai far fallire un'archiviazione riuscita.
export async function sendScrivanoOffer(out, { origin } = {}) {
  if (!out || !out.ok || out.duplicate || origin === 'telegram') return false;
  if (!scrivanoEligible(out.catKey, out.id)) return false;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) return false;
  const text = [
    `📁 <b>Archiviato dalla porta ${esc(origin || 'esterna')}: ${esc(out.label)}</b>`,
    out.propertyLabel ? `🏠 ${esc(out.propertyLabel)}` : null,
    out.summary ? `<i>${esc(out.summary)}</i>` : null,
    '',
    offerLine(out.catKey),
  ].filter(Boolean).join('\n');
  try {
    await tgSend(chatId, text, { reply_markup: offerKeyboard(out.id) });
    return true;
  } catch (e) {
    console.error('[scrivano/offer]', e && e.message);
    return false;
  }
}
