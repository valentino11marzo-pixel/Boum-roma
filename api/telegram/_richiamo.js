// api/telegram/_richiamo.js — il Richiamo dal telefono: /richiama + i due tap.
//
// Il comando prepara la campagna (la card con anteprima ed esclusi arriva da
// prepareCampaign stesso); i callback rk/rx sono la firma: ✅ invia tutto,
// ✖️ annulla. L'idempotenza sta in _richiamo.js (pending→sending→sent), qui
// si traduce solo l'esito in parole.
//
// Risoluzione della casa per NOME: come interpret — mai un tiro a indovinare.
// Zero match → "non trovata"; più di uno → si elencano e si richiede l'ID.

import { fsList } from '../homie/_lib.js';
import { tgSend, tgEdit, tgAckCallback } from './_lib.js';
import { prepareCampaign, sendCampaign, cancelCampaign } from '../leads/_richiamo.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ── /richiama <casa> · /richiama recenti [gg] ──────────────────────────────
export async function handleRichiamaCommand(chatId, arg) {
  const a = String(arg || '').trim();

  if (!a) {
    await tgSend(chatId,
      '📣 <b>Il Richiamo</b> — ricontatta i lead senza perderne uno\n\n' +
      '<code>/richiama &lt;nome casa o ID&gt;</code> — tutti quelli che l\'hanno chiesta (+ chi ne cercava una simile)\n' +
      '<code>/richiama recenti [giorni]</code> — i lead recenti rimasti senza seguito (default 7)\n\n' +
      'Prima vedi l\'anteprima con gli esclusi e il motivo; parte solo col tuo ✅.');
    return true;
  }

  const mRec = a.match(/^recenti(?:\s+(\d{1,2}))?$/i);
  if (mRec) {
    const r = await prepareCampaign({ type: 'recenti', days: mRec[1] ? Number(mRec[1]) : 7, requestedBy: 'telegram' });
    if (!r.ok) await tgSend(chatId, '⚠️ Non sono riuscito a preparare la campagna: ' + esc(r.error || '?'));
    // la card con i bottoni l'ha già mandata prepareCampaign
    return true;
  }

  // risolvi la casa: ID esatto, poi nome/zona per frammento — MAI indovinare
  let catalog = [];
  try { catalog = await fsList('listings', { limit: 200 }); }
  catch { await tgSend(chatId, '⚠️ Catalogo non leggibile, riprova.'); return true; }

  const needle = norm(a);
  let hits = catalog.filter(l => l.id === a);
  if (!hits.length) {
    hits = catalog.filter(l =>
      norm(l.name).includes(needle) || norm(l.zone).includes(needle) || norm(l.address).includes(needle));
  }
  if (!hits.length) {
    await tgSend(chatId, `Nessuna casa trovata per «${esc(a)}». Prova col nome esatto o l'ID.`);
    return true;
  }
  if (hits.length > 1) {
    const list = hits.slice(0, 6).map(l => `· ${esc(l.name || l.id)}${l.zone ? ' — ' + esc(l.zone) : ''}  <code>${esc(l.id)}</code>`).join('\n');
    await tgSend(chatId,
      `«${esc(a)}» corrisponde a ${hits.length} case — dimmi quale:\n${list}\n\n<code>/richiama &lt;ID&gt;</code>`);
    return true;
  }

  const r = await prepareCampaign({ type: 'listing', listingId: hits[0].id, requestedBy: 'telegram' });
  if (!r.ok) await tgSend(chatId, '⚠️ Non sono riuscito a preparare la campagna: ' + esc(r.error || '?'));
  return true;
}

// ── i due tap: rk = invia, rx = annulla ────────────────────────────────────
export async function handleRichiamoCallback(verb, campaignId, { chatId, messageId, callbackId }) {
  if (verb !== 'rk' && verb !== 'rx') return false;

  if (verb === 'rx') {
    const r = await cancelCampaign(campaignId);
    await tgAckCallback(callbackId, r.ok ? 'Annullata' : 'Già ' + (r.status || 'chiusa'));
    if (messageId) {
      await tgEdit(chatId, messageId,
        r.ok ? '✖️ <b>Richiamo annullato</b> — non è partito nulla.'
             : `Questa campagna è già <b>${esc(r.status || 'chiusa')}</b>.`).catch(() => {});
    }
    return true;
  }

  await tgAckCallback(callbackId, 'Invio…');
  const r = await sendCampaign(campaignId, { via: 'telegram' });
  let text;
  if (!r.ok) {
    text = r.error === 'not_found'
      ? '⚠️ Campagna non trovata.'
      : `Questa campagna è già <b>${esc(r.status || 'chiusa')}</b> — nessun doppio invio.`;
  } else {
    const fails = (r.failed || []).length;
    text = `✅ <b>Richiamo partito</b>\n` +
      `· ${r.wa} WhatsApp in coda al postino (~10 ogni 5′)\n` +
      `· ${r.email} email inviate` +
      (fails ? `\n⚠️ ${fails} falliti: ${r.failed.slice(0, 3).map(f => esc(f.name || f.leadId)).join(', ')}${fails > 3 ? '…' : ''}` : '') +
      `\n\nLe risposte arrivano nei soliti canali; i richiamati hanno ora il cooldown di 7 giorni.`;
  }
  if (messageId) await tgEdit(chatId, messageId, text).catch(() => {});
  else await tgSend(chatId, text).catch(() => {});
  return true;
}
