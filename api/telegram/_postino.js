// api/telegram/_postino.js — IL POSTINO: la consegna WhatsApp non è un atto di fede.
//
// IL BUCO TROVATO IN PRODUZIONE (29/08/2026): l'operatore consegna due lead
// alla Segretaria, lei scrive, l'executor marca 'executed'… e su WhatsApp non
// arriva NIENTE. Perché su WhatsApp consegna il Mac (wa-outbox → wacli), e se
// nessuno ritira l'outbox il messaggio resta in coda PER SEMPRE, in silenzio.
// Peggio: nel repo lo script che ritira non è mai esistito — il ciclo viveva
// solo come mandato in bot/HOMIE.md (la stessa storia dello Scout).
//
// Due mestieri, ogni minuto dentro notify-pending, entrambi best-effort:
//
//  1. AUTO-RIPARAZIONE: un'azione della macchina rimasta 'approved' senza
//     esecuzione (funzione uccisa a metà volo) viene rieseguita qui — solo
//     quelle `autoApplied` (Segretaria, scala della fiducia): le approvazioni
//     umane le esegue il webhook e hanno già il loro retry (ripremi Approva).
//  2. LA POSTA FERMA: un messaggio WhatsApp 'executed' che il Mac non ritira
//     entro STALL_MS diventa una card Telegram con IL TESTO GIÀ PRONTO nel
//     link wa.me — un tap e lo consegna l'operatore. Da quel momento la
//     consegna è SUA: si marca `waSendError:'stalled_operator_notified'`
//     così l'outbox non può più rimandarlo (un doppio messaggio allo stesso
//     cliente è peggio di un messaggio in ritardo). Il bottone ✅ (pw:<id>)
//     registra la consegna manuale.

import { fsGet, fsPatch, fsList } from '../homie/_lib.js';
import { tgSend } from './_lib.js';
import { runExecutor } from '../employees/_fiducia.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const ts = v => v && v.toMillis ? v.toMillis() : (v && v._seconds ? v._seconds * 1000 : (v ? new Date(v).getTime() || 0 : 0));

const HEAL_MS = 3 * 60 * 1000;    // approved senza esecuzione: si riprova
const STALL_MS = 5 * 60 * 1000;   // executed senza ritiro: si avvisa
const MAX_HEAL = 3;
const MAX_STALL_CARDS = 3;

const waText = a => String((a.payload && (a.payload.body || a.payload.draft)) || '');
const waPhone = a => String((a.payload && a.payload.phone) || '').trim();
const isWa = a => String((a.payload && a.payload.channel) || '').toLowerCase() === 'whatsapp';

export async function postinoTick({ chatId, now = Date.now() }) {
  const out = { healed: 0, stalled: 0 };

  // ── 1. l'azione della macchina uccisa a metà volo si riesegue ──────────
  let approved = [];
  try { approved = await fsList('action_queue', { filter: { field: 'status', op: 'EQUAL', value: 'approved' }, limit: 25 }); }
  catch { approved = []; }
  for (const a of approved) {
    if (out.healed >= MAX_HEAL) break;
    if (!a.autoApplied) continue;
    if (now - ts(a.approvedAt || a.createdAt) < HEAL_MS) continue;
    // rilettura fresca: il doc può essere cambiato dopo la list
    const fresh = await fsGet('action_queue/' + a.id).catch(() => null);
    if (!fresh || fresh.status !== 'approved') continue;
    try {
      const r = await runExecutor(a.id);
      if (r.status === 200 && r.body && r.body.ok !== false) out.healed++;
    } catch (e) { console.warn('[postino] heal', a.id, e.message); }
  }

  // ── 2. la posta ferma diventa un tap dell'operatore ────────────────────
  if (!chatId) return out;
  let executed = [];
  try { executed = await fsList('action_queue', { filter: { field: 'status', op: 'EQUAL', value: 'executed' }, limit: 50 }); }
  catch { executed = []; }
  const stalled = executed
    .filter(a => isWa(a) && waPhone(a) && waText(a)
      && !a.waSentAt && !a.waSendError && !a.waStallNotifiedAt
      && now - ts(a.executedAt) > STALL_MS)
    .sort((a, b) => ts(a.executedAt) - ts(b.executedAt))
    .slice(0, MAX_STALL_CARDS);
  for (const a of stalled) {
    const digits = waPhone(a).replace(/\D/g, '');
    const text = waText(a);
    const mins = Math.round((now - ts(a.executedAt)) / 60000);
    try {
      await tgSend(chatId,
        `📮 <b>Scritto ma NON consegnato su WhatsApp</b> — il Mac non ritira l'outbox da ${mins} min.\n` +
        `${esc(a.summary || a.kind || a.id)}\n\n` +
        `💬 <i>${esc(text.slice(0, 400))}${text.length > 400 ? '…' : ''}</i>\n\n` +
        `Il testo è già nel bottone: un tap, invii, fatto. Da ora la consegna è tua — l'outbox non lo rimanderà (niente doppi messaggi).`,
        { reply_markup: { inline_keyboard: [
          [{ text: '📲 Aprilo su WhatsApp (testo pronto)', url: `https://wa.me/${digits}?text=${encodeURIComponent(text)}` }],
          [{ text: '✅ Consegnato', callback_data: `pw:${a.id}` }],
        ] } });
      await fsPatch('action_queue/' + a.id, {
        waStallNotifiedAt: new Date(now),
        waSendError: 'stalled_operator_notified',
      });
      out.stalled++;
    } catch (e) { console.warn('[postino] stall card', a.id, e.message); }
  }
  return out;
}

// Il conteggio per /segretaria: quanta posta aspetta il Mac, quanta è in
// mano all'operatore. Una coda invisibile è il difetto che questo file cura.
export async function postinoStatus() {
  let executed = [];
  try { executed = await fsList('action_queue', { filter: { field: 'status', op: 'EQUAL', value: 'executed' }, limit: 50 }); }
  catch { executed = []; }
  const wa = executed.filter(a => isWa(a) && !a.waSentAt);
  return {
    waiting: wa.filter(a => !a.waSendError).length,
    handedToOperator: wa.filter(a => a.waSendError === 'stalled_operator_notified').length,
  };
}
