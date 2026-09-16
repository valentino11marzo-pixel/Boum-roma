// api/telegram/_scrivano.js — il bottone 🌱 dal telefono (callback sc:<docId>).
// Il tap mette in coda e lo dice; la lettura vera la fa il worker
// (api/scrivano/worker.js), che manda la card col link al portal.
import { tgSend, tgEdit, tgAckCallback } from './_lib.js';
import { enqueueRead, proposalCard, openKeyboard } from '../scrivano/_core.js';

const WHY = {
  doc_not_found: 'Documento non trovato in archivio (cancellato?).',
  doc_without_file: 'Il documento in archivio non ha un file allegato: non c\'è niente da leggere.',
  doc_id_required: 'Bottone senza documento.',
};

export async function handleScrivanoCallback(verb, docId, { chatId, messageId, callbackId, text = '' }) {
  if (verb !== 'sc') return false;
  const id = String(docId || '').trim();
  let r;
  try { r = await enqueueRead({ docId: id, chatId, messageId }); }
  catch (e) { r = { ok: false, error: 'enqueue_failed', detail: e && e.message }; }

  if (!r.ok) {
    await tgAckCallback(callbackId, 'Non riesco');
    await tgSend(chatId, '⚠️ ' + (WHY[r.error] || ('Non sono riuscito a mettere in coda la lettura: ' + (r.detail || r.error))));
    return true;
  }
  if (r.state === 'done') {
    await tgAckCallback(callbackId, 'Già letto');
    await tgSend(chatId, proposalCard(r.record), { reply_markup: openKeyboard(id) });
    return true;
  }
  await tgAckCallback(callbackId, r.state === 'reading' ? 'Sto già leggendo' : '🌱 In coda');
  const line = r.state === 'reading'
    ? '🌱 Lo sto già leggendo: la proposta arriva tra poco.'
    : (r.already ? '🌱 È già in coda: la proposta arriva entro un paio di minuti.'
      : '🌱 In coda: lo leggo con Opus 5 e ti mando la proposta entro un paio di minuti.');
  // Il bottone sparisce dal messaggio: un secondo tap non deve sembrare
  // necessario (e comunque non leggerebbe due volte).
  if (messageId && text) {
    try { await tgEdit(chatId, messageId, text + '\n\n' + line, { reply_markup: { inline_keyboard: [] } }); return true; }
    catch (_) { /* messaggio non modificabile: si manda una riga */ }
  }
  await tgSend(chatId, line);
  return true;
}
