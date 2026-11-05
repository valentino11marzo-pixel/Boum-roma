// api/telegram/_firmato.js — the charge at signing from the phone (v1.8,
// spec §6.1–§6.2, D7: Telegram only). The `_richiamo.js` pattern: a command
// that prepares, a card that asks, a tap that signs.
//
//   /firmato <BM XXXXX | book_…> <AAAA-MM-GG | oggi> [visite <n>] [kalt <euro>] [ok <AAAA-MM-GG>] [anticipo]
//   /chiudi  <BM XXXXX | book_…> <declined|stopped|expired|other> [nota]
//
// /firmato reads the order, runs the gates (api/payments/_citysign.js), writes
// the DRAFT and sends ONE card with ONE question per fare — the operator's
// «Sì» is the attestation, recorded verbatim on the order. The buttons carry
// the order id and the draft's key (≤ 64 bytes): a card made stale by a newer
// /firmato says so instead of applying another card's facts (the PENDING_NL
// lesson of the wizard bot, 28/08). Nothing is ever charged without the tap,
// and the amount never comes from the button: the server reads its draft.
//
//   cfy:<id>:<key>  ✅ Sì — emetti la fattura   cfx:<id>:<key>  ✖ No — nessun compenso
//   cfn:<id>        Annulla (no write)          cch:<id>:<key>  ✅ chiudi l'ordine (/chiudi)
//   cfr:<id>        🔔 Ricorda (after the due date, or to a corrected address)

import { tgSend, tgEdit, tgAckCallback } from './_lib.js';
import { CITY_MARKETS, cityMarketOf } from '../_market.js';
import { waLink } from '../agent/_lib.js';
import {
  findOrders, draftSigning, chargeAtSigning, declineAtSigning, draftClose, closeOrder, remindInvoice,
  invoiceWhatsApp, romeDayOf, dm, dmy, eurIt, CLOSE_REASONS,
} from '../payments/_citysign.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
export const VERBS = Object.freeze(['cfy', 'cfx', 'cfn', 'cch', 'cfr']);

// ── the grammar ───────────────────────────────────────────────────────────
function parseRef(toks) {
  const t0 = toks[0] || '';
  if (/^bm$/i.test(t0) && /^[a-z0-9]{5}$/i.test(toks[1] || '')) return { ref: { file: 'BM ' + toks[1].toUpperCase() }, used: 2 };
  if (/^bm[a-z0-9]{5}$/i.test(t0)) return { ref: { file: 'BM ' + t0.slice(2).toUpperCase() }, used: 1 };
  if (/^book_[a-z0-9_]{8,52}$/i.test(t0)) return { ref: { id: t0.toLowerCase() }, used: 1 };
  return { ref: null, used: 0 };
}
/** «1250», «1.250», «1250,50», «€1250» → 1250 / 1250.5; anything else → null. */
export function parseEuro(t) {
  const x = String(t || '').replace(/^€/, '').trim();
  let n = null;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(x)) n = Number(x.replace(/\./g, '').replace(',', '.'));
  else if (/^\d+([.,]\d{1,2})?$/.test(x)) n = Number(x.replace(',', '.'));
  return n != null && n > 0 && n <= 100000 ? n : null;
}
/**
 * → { ref, signedOn ('oggi' | 'YYYY-MM-DD'), viewings, coldRent, goAheadOn, early, error }
 * error: 'order' | 'date' | 'token:<the word>' — nothing is guessed.
 */
export function parseFirmato(arg) {
  const toks = String(arg || '').trim().split(/\s+/).filter(Boolean);
  const out = { ref: null, signedOn: null, viewings: null, coldRent: null, goAheadOn: null, early: false, error: null };
  const r = parseRef(toks);
  if (!r.ref) return { ...out, error: 'order' };
  out.ref = r.ref;
  let i = r.used;
  const d = toks[i] || '';
  if (/^oggi$/i.test(d)) out.signedOn = 'oggi';
  else if (/^\d{4}-\d{2}-\d{2}$/.test(d)) out.signedOn = d;
  else return { ...out, error: 'date' };
  i++;
  while (i < toks.length) {
    const w = toks[i].toLowerCase(), nx = toks[i + 1];
    if ((w === 'visite' || w === 'visita') && /^\d{1,2}$/.test(nx || '')) { out.viewings = Number(nx); i += 2; }
    else if (w === 'kalt' && parseEuro(nx) != null) { out.coldRent = parseEuro(nx); i += 2; }
    else if (w === 'ok' && /^\d{4}-\d{2}-\d{2}$/.test(nx || '')) { out.goAheadOn = nx; i += 2; }
    else if (w === 'anticipo') { out.early = true; i++; }
    else return { ...out, error: 'token:' + toks[i] };
  }
  return out;
}
const REASON_ALIAS = { declined: 'declined', rifiutato: 'declined', declinato: 'declined', stopped: 'stopped', fermato: 'stopped', expired: 'expired', scaduto: 'expired', other: 'other', altro: 'other' };
export const REASON_IT = { declined: 'declinato', stopped: 'fermato dal cliente', expired: 'scaduto', other: 'altro' };
/** → { ref, reason, note, error } */
export function parseChiudi(arg) {
  const toks = String(arg || '').trim().split(/\s+/).filter(Boolean);
  const r = parseRef(toks);
  if (!r.ref) return { ref: null, reason: null, note: null, error: 'order' };
  const reason = REASON_ALIAS[String(toks[r.used] || '').toLowerCase()] || null;
  if (!reason) return { ref: r.ref, reason: null, note: null, error: 'reason' };
  const note = toks.slice(r.used + 1).join(' ').slice(0, 300) || null;
  return { ref: r.ref, reason, note, error: null };
}

/** A button only when its data fits Telegram's 64 bytes (one oversized
 *  button kills the whole keyboard in silence). */
export function cbData(verb, id, key) {
  const d = key ? `${verb}:${id}:${key}` : `${verb}:${id}`;
  return Buffer.byteLength(d, 'utf8') <= 64 ? d : null;
}
const button = (text, verb, id, key) => { const d = cbData(verb, id, key); return d ? { text, callback_data: d } : null; };
const row = (...bs) => bs.filter(Boolean);

// ── the cards ─────────────────────────────────────────────────────────────
function deskOf(l) { return CITY_MARKETS[cityMarketOf(l)] || {}; }
/** «✍️ Firma — Anna Keller · 🇫🇷 Parigi · Full Search · ordine PAR-2026-0007 (4/11, scade 4/5/2027) · recesso fino al 18/11 · importo €500» */
export function orderHead(l, amount, title = '✍️ <b>Firma</b>') {
  const c = obj(l.city), o = obj(c.order), desk = deskOf(l);
  const orderDay = romeDayOf(c.orderedAt || l.createdAt);
  return [
    `${title} — ${esc(l.name || '?')}`,
    `${desk.flag || ''} ${esc(desk.labelIt || desk.label || '')}`.trim(),
    esc(c.serviceLabel || c.service || ''),
    `ordine ${esc(o.number || l.id)} (${dm(orderDay)}${o.expiresOn ? `, scade ${dmy(o.expiresOn)}` : ''})`,
    c.withdrawalEndsOn ? `recesso fino al ${dm(c.withdrawalEndsOn)}` : null,
    amount != null ? `importo ${eurIt(amount)}` : null,
  ].filter(Boolean).join(' · ');
}

export function signingCard(r) {
  const l = r.lead, s = r.signing, fee = r.fee, c = obj(l.city);
  const lines = [orderHead(l, s.feeAllowed ? s.amount : null)];
  if (s.feeAllowed && fee && fee.extras > 0) lines.push(`<i>${eurIt(fee.listPrice)} + ${fee.extras} × ${eurIt(fee.extraEach)} visite in più</i>`);
  if (s.feeAllowed && fee && fee.cap != null) lines.push(`<i>listino ${eurIt(fee.listPrice)} · tetto (2 × Kaltmiete + IVA 19%) ${eurIt(fee.cap)}</i>`);
  lines.push(`file ${esc(c.file || '')} · inizio ${c.startNow === true ? 'subito' : c.workFrom ? 'dal ' + dm(c.workFrom) : '—'}${s.earlyStart ? ' · anticipo chiesto per iscritto' : ''}`);
  if (r.ignored && r.ignored.length) lines.push(`<i>Ignorati: ${esc(r.ignored.join(' · '))}</i>`);
  if (!s.feeAllowed) {
    lines.push('', `⛔ <b>Nessun compenso possibile</b> — ${esc(s.refusal || '')}`);
    return { text: lines.join('\n'), keyboard: { inline_keyboard: [row(button('✖ Chiudi senza compenso', 'cfx', l.id, s.key), button('Annulla', 'cfn', l.id))] } };
  }
  lines.push('', `«${esc(s.attestation)}»`);
  return {
    text: lines.join('\n'),
    keyboard: { inline_keyboard: [
      row(button(`✅ Sì — emetti la fattura ${eurIt(s.amount)}`, 'cfy', l.id, s.key)),
      row(button('✖ No — nessun compenso', 'cfx', l.id, s.key), button('Annulla', 'cfn', l.id)),
    ] },
  };
}

/** The card after the invoice: the outcome, the link, the WhatsApp text. */
export function invoicedCard(r) {
  const l = r.lead, s = r.signing, inv = r.invoice, c = obj(l.city), desk = deskOf(l);
  const wa = invoiceWhatsApp({ lead: l, invoice: inv, payUrl: r.payUrl });
  const lines = [
    `✅ <b>Fattura emessa</b> — ${esc(inv.number)} · ${eurIt(inv.amount)} · scade il ${dm(inv.dueDate)}`,
    `👤 ${esc(l.name || '')} · ${desk.flag || ''} ${esc(desk.labelIt || desk.label || '')} · ${esc(c.serviceLabel || '')}`,
    `🔗 <a href="${esc(r.payUrl)}">link di pagamento</a> (non scade)`,
    s.clientEmailSentAt ? '📧 email al cliente: inviata ✓' : `⚠️ email al cliente NON partita (${esc(s.clientEmailError || 'errore')}) — mandagli il link qui sotto`,
    r.resumed ? '<i>Ripresa di una fattura rimasta a metà: la fattura è la stessa, nessuna email doppia.</i>' : null,
    r.amountChanged ? '<i>⚠️ La fattura emessa ha un importo diverso dalla bozza: vale quella emessa.</i>' : null,
    '', '💬 <b>WhatsApp pronto</b>:', `<code>${esc(wa)}</code>`,
  ].filter((x) => x !== null);
  const waUrl = l.phone ? waLink(l.phone, wa) : null;
  return {
    text: lines.join('\n'),
    keyboard: { inline_keyboard: [row(waUrl ? { text: '💬 WhatsApp', url: waUrl } : null, button('🔔 Ricorda', 'cfr', l.id))] },
  };
}

const HELP_FIRMATO = '✍️ <b>/firmato</b> — la firma di una locazione, per un ordine di Parigi o Berlino\n\n' +
  '<code>/firmato BM X7K2Q 2026-12-10</code>\n' +
  '<code>/firmato BM X7K2Q oggi visite 3</code> — Parigi Full Search con visite in più, o Attended Viewing\n' +
  '<code>/firmato BM X7K2Q 2026-12-10 kalt 950 ok 2026-11-20</code> — Berlino Full Search: Kaltmiete e via libero scritto del proprietario\n' +
  '<code>anticipo</code> — il cliente ha chiesto per iscritto di iniziare prima della fine del recesso\n\n' +
  'Prima vedi la domanda; la fattura parte solo col tuo ✅. Chiudere un ordine: <code>/chiudi BM X7K2Q stopped</code>.';

// ── /firmato ──────────────────────────────────────────────────────────────
export async function handleFirmatoCommand(chatId, arg) {
  if (!String(arg || '').trim()) { await tgSend(chatId, HELP_FIRMATO); return true; }
  const p = parseFirmato(arg);
  if (p.error) {
    const why = p.error === 'order' ? 'Dimmi l\'ordine: <code>BM X7K2Q</code> (il file) oppure l\'id <code>book_…</code>.'
      : p.error === 'date' ? 'Dimmi la data della firma: <code>AAAA-MM-GG</code> oppure <code>oggi</code>.'
        : `Non capisco «${esc(p.error.slice(6))}».`;
    await tgSend(chatId, `⚠️ ${why}\n\n${HELP_FIRMATO}`);
    return true;
  }
  let hits;
  try { hits = await findOrders(p.ref); }
  catch (_) { await tgSend(chatId, '⚠️ Non riesco a leggere gli ordini: riprova fra un minuto.'); return true; }
  if (!hits.length) { await tgSend(chatId, `Nessun ordine di Parigi o Berlino per «${esc(p.ref.file || p.ref.id)}».`); return true; }
  if (hits.length > 1) {
    await tgSend(chatId, `«${esc(p.ref.file)}» corrisponde a ${hits.length} ordini — usa l'id:\n` +
      hits.slice(0, 6).map((l) => `· ${esc((obj(obj(l.city).order).number) || '')} ${esc(l.name || '')} <code>${esc(l.id)}</code>`).join('\n'));
    return true;
  }
  const lead = hits[0];
  let r = await draftSigning({ leadId: lead.id, facts: p, by: 'telegram:' + chatId });
  if (!r.ok && r.gate === 'resumable') {
    // a charge left halfway (the function died after the claim): finish it
    const x = await chargeAtSigning({ leadId: lead.id, by: 'telegram:' + chatId });
    if (x.ok) { const card = invoicedCard(x); await tgSend(chatId, card.text, { reply_markup: card.keyboard }); }
    else await tgSend(chatId, `⚠️ Non riesco a riprendere la fattura: ${esc(x.why || x.error)}.`);
    return true;
  }
  if (!r.ok) {
    const s = obj(obj(r.lead).signing);
    if (r.gate === 'invoiced' && s.linkUrl) {
      await tgSend(chatId, `${orderHead(r.lead, s.amount, '🧾 <b>Già emessa</b>')}\nFattura ${esc(s.invoiceNumber || '')} · scade il ${dm(s.dueDate)}\n🔗 <a href="${esc(s.linkUrl)}">link di pagamento</a>`,
        { reply_markup: { inline_keyboard: [row(button('🔔 Ricorda', 'cfr', lead.id))] } });
    } else await tgSend(chatId, `${r.lead ? orderHead(r.lead, null) + '\n\n' : ''}⛔ ${esc(r.why || r.gate)}`);
    return true;
  }
  const card = signingCard(r);
  await tgSend(chatId, card.text, { reply_markup: card.keyboard });
  return true;
}

// ── /chiudi ───────────────────────────────────────────────────────────────
export async function handleChiudiCommand(chatId, arg) {
  const p = parseChiudi(arg);
  if (p.error) {
    await tgSend(chatId, '🔒 <b>/chiudi</b> — chiude un ordine di Parigi o Berlino: nulla è stato addebitato, nulla è dovuto\n\n' +
      `<code>/chiudi BM X7K2Q &lt;${CLOSE_REASONS.join('|')}&gt; [nota]</code>`);
    return true;
  }
  let hits;
  try { hits = await findOrders(p.ref); }
  catch (_) { await tgSend(chatId, '⚠️ Non riesco a leggere gli ordini: riprova fra un minuto.'); return true; }
  if (hits.length !== 1) { await tgSend(chatId, hits.length ? `«${esc(p.ref.file)}» corrisponde a ${hits.length} ordini — usa l'id <code>book_…</code>.` : `Nessun ordine di Parigi o Berlino per «${esc(p.ref.file || p.ref.id)}».`); return true; }
  const r = await draftClose({ leadId: hits[0].id, reason: p.reason, note: p.note, by: 'telegram:' + chatId });
  if (!r.ok) { await tgSend(chatId, `${r.lead ? orderHead(r.lead, null, '🔒 <b>Chiudi</b>') + '\n\n' : ''}⛔ ${esc(r.why || r.gate)}`); return true; }
  const text = `${orderHead(r.lead, null, '🔒 <b>Chiudi</b>')}\nmotivo: ${esc(REASON_IT[p.reason])}${p.note ? ` — ${esc(p.note)}` : ''}\n\n` +
    'Il cliente riceve: «Your order is closed. Nothing was charged, and nothing is due.»';
  await tgSend(chatId, text, { reply_markup: { inline_keyboard: [row(button('✅ Sì — chiudi, nulla è dovuto', 'cch', r.lead.id, r.closeDraft.key), button('Annulla', 'cfn', r.lead.id))] } });
  return true;
}

// ── the taps ──────────────────────────────────────────────────────────────
const WHY = {
  not_found: 'Ordine non trovato.', already_invoiced: 'Fattura già emessa.', no_fee: 'Già chiuso senza compenso.',
  in_flight: 'In corso: un altro tap la sta emettendo.', no_draft: 'Nessuna bozza: rimanda /firmato.',
  stale_card: 'Card superata da una bozza più recente: usa l\'ultima card, o rimanda /firmato.',
  busy: 'L\'ordine è cambiato nel frattempo: rimanda il comando.', paid: 'Già pagato.', closed: 'Ordine già chiuso.',
  withdrawn: 'Il cliente ha esercitato il recesso.', invoice_failed: 'Fattura non creata: riprova fra due minuti (riprende la stessa).',
  not_invoiced: 'Nessuna fattura emessa per questo ordine.', no_invoice: 'Fattura non trovata.', no_email: 'Nessuna email in archivio.',
  unavailable: 'Archivio non raggiungibile: riprova.', email_failed: 'Email non partita: riprova o manda il link a mano.',
};
export async function handleFirmatoCallback(verb, rest, { chatId, messageId, callbackId }) {
  if (!VERBS.includes(verb)) return false;
  const [leadId, key] = String(rest || '').split(':');
  const by = 'telegram:' + chatId;
  const edit = async (text, keyboard) => {
    if (messageId) await tgEdit(chatId, messageId, text, keyboard ? { reply_markup: keyboard } : { reply_markup: { inline_keyboard: [] } }).catch(() => {});
    else await tgSend(chatId, text, keyboard ? { reply_markup: keyboard } : {}).catch(() => {});
  };
  if (!/^book_[a-z0-9_]{8,52}$/.test(leadId || '')) { await tgAckCallback(callbackId, 'Dati non validi'); return true; }

  if (verb === 'cfn') {
    await tgAckCallback(callbackId, 'Annullato');
    await edit('✖️ <b>Annullato</b> — niente scritto, niente inviato.');
    return true;
  }
  if (verb === 'cfy') {
    await tgAckCallback(callbackId, 'Emetto la fattura…');
    const r = await chargeAtSigning({ leadId, key, by });
    if (r.ok) { const card = invoicedCard(r); await edit(card.text, card.keyboard); return true; }
    if (r.error === 'in_flight' || r.error === 'stale_card') { await tgSend(chatId, `⏳ ${esc(WHY[r.error])}`).catch(() => {}); return true; }
    const s = obj(r.signing);
    if (r.error === 'already_invoiced' && s.linkUrl) {
      await edit(`🧾 <b>Già emessa</b> — ${esc(s.invoiceNumber || '')} · scade il ${dm(s.dueDate)}\n🔗 <a href="${esc(s.linkUrl)}">link di pagamento</a>`,
        { inline_keyboard: [row(button('🔔 Ricorda', 'cfr', leadId))] });
      return true;
    }
    await edit(`⛔ ${esc(r.why || WHY[r.error] || r.error)}`);
    return true;
  }
  if (verb === 'cfx') {
    await tgAckCallback(callbackId, 'Chiudo senza compenso…');
    const r = await declineAtSigning({ leadId, key, by });
    if (r.ok) {
      await edit(`${orderHead(r.lead, null, '✖️ <b>Nessun compenso</b>')}\n\nOrdine chiuso. Al cliente: «Your lease is signed, and nothing is due to BOOM for it.» ${r.emailOk ? '📧 inviata ✓' : `⚠️ email NON partita (${esc(r.emailError || '')})`}`);
      return true;
    }
    if (r.error === 'stale_card' || r.error === 'in_flight') { await tgSend(chatId, `⏳ ${esc(WHY[r.error])}`).catch(() => {}); return true; }
    await edit(`⛔ ${esc(WHY[r.error] || r.error)}`);
    return true;
  }
  if (verb === 'cch') {
    await tgAckCallback(callbackId, 'Chiudo l\'ordine…');
    const r = await closeOrder({ leadId, key, by });
    if (r.ok) {
      await edit(`${orderHead(r.lead, null, '🔒 <b>Ordine chiuso</b>')}\nmotivo: ${esc(REASON_IT[r.lead.closeReason] || r.lead.closeReason)}\n\nAl cliente: «Nothing was charged, and nothing is due.» ${r.emailOk ? '📧 inviata ✓' : `⚠️ email NON partita (${esc(r.emailError || '')})`}`);
      return true;
    }
    if (r.error === 'stale_card') { await tgSend(chatId, `⏳ ${esc(WHY[r.error])}`).catch(() => {}); return true; }
    await edit(`⛔ ${esc(WHY[r.error] || r.error)}`);
    return true;
  }
  // cfr — 🔔 Ricorda
  const r = await remindInvoice({ leadId, by });
  if (r.ok) {
    await tgAckCallback(callbackId, r.sent === 'invoice' ? '📧 Fattura rimandata' : '🔔 Promemoria inviato');
    await tgSend(chatId, `${r.sent === 'invoice' ? '📧 Fattura rimandata' : '🔔 Promemoria inviato'} a ${esc(r.to)} — ${esc(r.invoice.number)} · ${eurIt(r.invoice.amount)}`).catch(() => {});
    return true;
  }
  const why = r.error === 'not_due' ? `La fattura scade il ${dmy(r.dueDate)}: il promemoria si manda dopo la scadenza.`
    : r.error === 'recent' ? 'Promemoria già mandato nelle ultime 20 ore.'
      : (r.why ? `${WHY[r.error] || r.error} (${r.why})` : (WHY[r.error] || r.error));
  await tgAckCallback(callbackId, why.slice(0, 190));
  return true;
}
