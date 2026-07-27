// api/telegram/_viewings.js — the viewing cycle, in the operator's pocket.
//
// The whole flight machinery existed already (slots, Wallet pass, countdown,
// self-updating calendar) but the only way to press "confirm" was a desktop.
// A viewing that arrives on WhatsApp at 21:40 while you're out therefore sat
// there until the next time you opened a laptop — and a prospect who waits
// overnight for an answer has already written to three other agencies.
//
// Here the card carries the three moves that matter:
//   ✅ Conferma <the proposed time>   — one tap, no typing, no date parsing
//   🔁 Sposta                          — a real slot picker, built from the SAME
//                                        availability engine the public page
//                                        uses, so you can never double-book
//   ✖️ Annulla                         — with a confirmation step, because it
//                                        emails the client
//
// Plus /visite: the week's agenda, each entry one tap away from being moved.
//
// Callback data is capped at 64 bytes by Telegram, so the encoding is terse:
//   vok:<id>            confirm at the time already on the doc
//   vmv:<id>            open the picker
//   vdy:<id>:<m><YYYYMMDD>   the times of that day  (m = p|v, the mode)
//   vtm:<id>:<m><t36>        that exact instant (epoch minutes, base36)
//   vmo:<id>:<m>        switch mode, re-render the picker
//   vxq:<id> / vxx:<id> ask to cancel / cancel for real
//   vbk:<id>            back to the card
// The mode travels inside the callback instead of a stored draft: no extra
// document, no stale state, and two taps in parallel can never fight.

import { fsList } from '../homie/_lib.js';
import { tgSend, tgEdit, tgAckCallback } from './_lib.js';
import { loadConfig, busyBlocks, buildSlots, TZ } from '../viewings/_avail.js';
import { applyViewingChange, loadViewing } from '../viewings/_apply.js';
import { startOf, isVideo, primaryAction, fmtWhen, manageUrl } from '../viewings/_lib.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const PORTAL = 'https://www.boomrome.com/portal';

// epoch-minutes in base36: 7 chars, good until the year 4000
const t36 = date => Math.floor(date.getTime() / 60000).toString(36);
const fromT36 = s => new Date(parseInt(s, 36) * 60000);
const modeChar = m => (m === 'video' ? 'v' : 'p');
const charMode = c => (c === 'v' ? 'video' : 'person');

const romeFmt = (date, opts) => new Intl.DateTimeFormat('it-IT', { timeZone: TZ, ...opts }).format(date);

// ── the card ───────────────────────────────────────────────────────────────
export function fmtViewingCard(v, tag = null) {
  const s = startOf(v);
  const video = isVideo(v);
  const st = String(v.status || 'pending').toLowerCase();
  const head = st === 'confirmed'
    ? (v.selfBooked ? '⚡ <b>VISITA PRENOTATA DAL CLIENTE</b>' : '✅ <b>VISITA CONFERMATA</b>')
    : st === 'cancelled' ? '✖️ <b>VISITA ANNULLATA</b>'
    : '📅 <b>RICHIESTA VISITA</b>';

  const who = [v.clientName || v.name, v.clientPhone || v.phone, v.clientEmail || v.email]
    .filter(Boolean).map(esc).join(' · ');
  // useGrouping forced: modern ICU drops the separator on 4-digit numbers in
  // Italian ("1400"), which is correct CLDR but reads cheap on a BOOM card.
  const price = v.listingPrice
    ? ' · €' + Number(v.listingPrice).toLocaleString('it-IT', { useGrouping: true, maximumFractionDigits: 0 }) + '/mese'
    : '';
  const rows = [
    head,
    who ? `👤 ${who}` : null,
    v.listingName ? `🏠 ${esc(v.listingName)}${price}` : null,
    s ? `🕐 ${st === 'confirmed' ? '' : 'Proposto: '}${esc(romeFmt(s, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))} · ${video ? '🎥 video' : '🚶 di persona'}` : '🕐 <i>nessun orario proposto</i>',
    (!video && v.listingAddress) ? `📍 ${esc(v.listingAddress)}` : null,
    v.notes || v.message ? `💬 <i>${esc(String(v.notes || v.message).slice(0, 220))}</i>` : null,
    tag ? `\n${tag}` : null,
  ].filter(Boolean);
  return rows.join('\n');
}

export function viewingKeyboard(v) {
  const id = v.id;
  const s = startOf(v);
  const st = String(v.status || 'pending').toLowerCase();
  if (st === 'cancelled') return { inline_keyboard: [[{ text: '📇 Portale', url: PORTAL }]] };

  const rows = [];
  if (st !== 'confirmed') {
    rows.push([{
      text: s ? `✅ Conferma ${romeFmt(s, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : '✅ Conferma…',
      callback_data: s ? `vok:${id}` : `vmv:${id}`,
    }]);
  }
  rows.push([
    { text: st === 'confirmed' ? '🔁 Sposta' : '🔁 Altro orario', callback_data: `vmv:${id}` },
    { text: '✖️ Annulla', callback_data: `vxq:${id}` },
  ]);
  if (st === 'confirmed' && s) {
    const act = primaryAction(v, 'it');
    rows.push([{ text: act.label, url: act.href }]);
  }
  return { inline_keyboard: rows };
}

// ── the picker ─────────────────────────────────────────────────────────────
async function slotsFor(id, mode) {
  const cfg = await loadConfig();
  return buildSlots(cfg, await busyBlocks(cfg, id), mode);
}

function dayKeyboard(id, mode, slots) {
  const rows = [];
  const days = slots.slice(0, 12);
  for (let i = 0; i < days.length; i += 3) {
    rows.push(days.slice(i, i + 3).map(d => ({
      text: `${romeFmt(new Date(d.times[0].iso), { weekday: 'short', day: 'numeric' })} (${d.times.length})`,
      callback_data: `vdy:${id}:${modeChar(mode)}${d.date.replace(/-/g, '')}`,
    })));
  }
  rows.push([{
    text: mode === 'video' ? '🚶 Passa a di persona' : '🎥 Passa a video',
    callback_data: `vmo:${id}:${mode === 'video' ? 'p' : 'v'}`,
  }]);
  rows.push([{ text: '↩︎ Indietro', callback_data: `vbk:${id}` }]);
  return { inline_keyboard: rows };
}

function timeKeyboard(id, mode, day) {
  const rows = [];
  const times = day.times.slice(0, 20);
  for (let i = 0; i < times.length; i += 4) {
    rows.push(times.slice(i, i + 4).map(t => ({
      text: t.label,
      callback_data: `vtm:${id}:${modeChar(mode)}${t36(new Date(t.iso))}`,
    })));
  }
  rows.push([{ text: '↩︎ Altri giorni', callback_data: `vmv:${id}` }]);
  return { inline_keyboard: rows };
}

const pickerHead = (v, mode) =>
  `🔁 <b>${v.status === 'confirmed' ? 'Sposta' : 'Scegli l\'orario'}</b> — ${esc(v.clientName || v.name || 'cliente')}\n` +
  `🏠 ${esc(v.listingName || '—')}\n` +
  `${mode === 'video' ? '🎥 Videochiamata' : '🚶 Di persona'} · solo slot realmente liberi (ora di Roma)`;

// ── the callback router ────────────────────────────────────────────────────
/**
 * @returns true when the callback belonged to the viewing family (handled)
 */
export async function handleViewingCallback(verb, rest, { chatId, messageId, callbackId }) {
  if (!['vok', 'vmv', 'vdy', 'vtm', 'vmo', 'vxq', 'vxx', 'vbk'].includes(verb)) return false;

  const parts = String(rest || '').split(':');
  const id = parts[0];
  const arg = parts[1] || '';
  const v = id ? await loadViewing(id) : null;
  if (!v) { await tgAckCallback(callbackId, 'Visita non trovata'); return true; }

  const stamp = (text, kb) => tgEdit(chatId, messageId, text, kb ? { reply_markup: kb } : {}).catch(e => console.warn('[tg/viewings] edit:', e.message));

  // back to the card
  if (verb === 'vbk') {
    await tgAckCallback(callbackId);
    await stamp(fmtViewingCard(v), viewingKeyboard(v));
    return true;
  }

  // open the day picker
  if (verb === 'vmv' || verb === 'vmo') {
    const mode = verb === 'vmo' ? charMode(arg) : (isVideo(v) ? 'video' : 'person');
    await tgAckCallback(callbackId);
    const slots = await slotsFor(id, mode);
    if (!slots.length) {
      await stamp(pickerHead(v, mode) + '\n\n⚠️ <i>Nessuno slot libero nel periodo pubblicato.</i>\nAllarga la disponibilità dal portale, oppure conferma un orario dal portale a mano.',
        { inline_keyboard: [[{ text: '↩︎ Indietro', callback_data: `vbk:${id}` }], [{ text: '📇 Portale', url: PORTAL }]] });
      return true;
    }
    await stamp(pickerHead(v, mode), dayKeyboard(id, mode, slots));
    return true;
  }

  // the times of one day
  if (verb === 'vdy') {
    const mode = charMode(arg[0]);
    const raw = arg.slice(1);
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    await tgAckCallback(callbackId);
    const slots = await slotsFor(id, mode);
    const day = slots.find(d => d.date === date);
    if (!day) {
      await stamp(pickerHead(v, mode) + '\n\n⚠️ <i>Quel giorno si è appena riempito.</i>', dayKeyboard(id, mode, slots));
      return true;
    }
    await stamp(pickerHead(v, mode) + `\n\n<b>${esc(romeFmt(new Date(day.times[0].iso), { weekday: 'long', day: 'numeric', month: 'long' }))}</b>`,
      timeKeyboard(id, mode, day));
    return true;
  }

  // confirm at the time already on the doc
  if (verb === 'vok') {
    const s = startOf(v);
    if (!s) { await tgAckCallback(callbackId, 'Nessun orario da confermare'); return true; }
    await tgAckCallback(callbackId, 'Confermo…');
    const out = await applyViewingChange(id, { action: 'confirm', when: s, actor: 'telegram:' + chatId, viewing: v });
    await stamp(fmtViewingCard(out.viewing || v, out.ok
      ? '✅ <b>CONFERMATA</b> — kit inviato al cliente, evento in calendario.'
      : `⚠️ Errore: ${esc(out.error || 'sconosciuto')}`), out.ok ? viewingKeyboard(out.viewing || v) : viewingKeyboard(v));
    return true;
  }

  // a chosen instant
  if (verb === 'vtm') {
    const mode = charMode(arg[0]);
    const when = fromT36(arg.slice(1));
    if (isNaN(when.getTime())) { await tgAckCallback(callbackId, 'Orario non valido'); return true; }
    await tgAckCallback(callbackId, 'Aggiorno…');

    // re-verify: minutes may have passed since the grid was rendered
    const cfg = await loadConfig();
    const slots = buildSlots(cfg, await busyBlocks(cfg, id), mode);
    if (!slots.some(d => d.times.some(t => t.iso === when.toISOString()))) {
      await stamp(pickerHead(v, mode) + '\n\n⚠️ <i>Quello slot non è più libero.</i>', dayKeyboard(id, mode, slots));
      return true;
    }

    const wasConfirmed = String(v.status || '').toLowerCase() === 'confirmed';
    const out = await applyViewingChange(id, {
      action: wasConfirmed ? 'reschedule' : 'confirm',
      when, mode, durationMinutes: cfg.slotMinutes[mode],
      actor: 'telegram:' + chatId, viewing: v,
    });
    const tag = out.ok
      ? (wasConfirmed
        ? '🔁 <b>SPOSTATA</b> — cliente avvisato, calendario e Wallet aggiornati.'
        : '✅ <b>CONFERMATA</b> — kit inviato al cliente, evento in calendario.')
      : `⚠️ Errore: ${esc(out.error || 'sconosciuto')}`;
    await stamp(fmtViewingCard(out.viewing || v, tag), viewingKeyboard(out.viewing || v));
    return true;
  }

  // cancel — two steps, because it emails the client
  if (verb === 'vxq') {
    await tgAckCallback(callbackId);
    await stamp(fmtViewingCard(v, '⚠️ <b>Annullare questa visita?</b>\nAl cliente parte un\'email e l\'evento sparisce dal calendario.'),
      { inline_keyboard: [[
        { text: '✖️ Sì, annulla', callback_data: `vxx:${id}` },
        { text: '↩︎ No, torna', callback_data: `vbk:${id}` },
      ]] });
    return true;
  }
  if (verb === 'vxx') {
    await tgAckCallback(callbackId, 'Annullo…');
    const out = await applyViewingChange(id, { action: 'cancel', actor: 'telegram:' + chatId, viewing: v });
    await stamp(fmtViewingCard({ ...v, status: 'cancelled' }, out.ok
      ? '✖️ <b>ANNULLATA</b> — cliente avvisato, evento rimosso dal calendario.'
      : `⚠️ Errore: ${esc(out.error || 'sconosciuto')}`), { inline_keyboard: [[{ text: '📇 Portale', url: PORTAL }]] });
    return true;
  }

  return true;
}

// ── /visite — the week, at a glance ────────────────────────────────────────
export async function sendAgenda(chatId, days = 7) {
  let rows = [];
  for (const status of ['confirmed', 'pending']) {
    try { rows = rows.concat(await fsList('viewingRequests', { filter: { field: 'status', op: 'EQUAL', value: status }, limit: 100 })); }
    catch { /* best effort */ }
  }
  const now = Date.now();
  const horizon = now + days * 86400000;
  const live = rows
    .filter(v => !v.voided)
    .map(v => ({ v, s: startOf(v) }))
    .filter(x => x.s && x.s.getTime() >= now - 2 * 3600000 && x.s.getTime() <= horizon)
    .sort((a, b) => a.s - b.s);

  const pendingNoDate = rows.filter(v => !v.voided && String(v.status || '').toLowerCase() === 'pending' && !startOf(v));

  if (!live.length && !pendingNoDate.length) {
    await tgSend(chatId, `📭 <b>Nessuna visita nei prossimi ${days} giorni.</b>\n\n<i>Gli slot pubblici sono aperti: chi arriva dal sito può prenotare da solo.</i>`);
    return;
  }

  const lines = [`📅 <b>Prossimi ${days} giorni · ${live.length} visite</b>`, ''];
  let lastDay = '';
  for (const { v, s } of live) {
    const day = romeFmt(s, { weekday: 'long', day: 'numeric', month: 'long' });
    if (day !== lastDay) { lines.push(`<b>${esc(day)}</b>`); lastDay = day; }
    const pend = String(v.status || '').toLowerCase() === 'pending';
    lines.push(
      `${pend ? '🟡' : '✅'} ${esc(romeFmt(s, { hour: '2-digit', minute: '2-digit' }))} · ${isVideo(v) ? '🎥' : '🚶'} ` +
      `${esc(v.clientName || v.name || '—')} — ${esc(String(v.listingName || '').slice(0, 40))}${pend ? ' <i>(da confermare)</i>' : ''}`
    );
  }
  if (pendingNoDate.length) {
    lines.push('', `🟡 <b>${pendingNoDate.length} richieste senza orario</b> — scegline uno qui sotto`);
  }
  await tgSend(chatId, lines.join('\n'));

  // Each open item gets its own actionable card: the agenda is a list, the
  // cards are where you actually do something.
  const actionable = [...pendingNoDate.map(v => ({ v })), ...live.filter(x => String(x.v.status || '').toLowerCase() === 'pending')]
    .slice(0, 6);
  for (const { v } of actionable) {
    const full = await loadViewing(v.id).catch(() => null);
    if (!full) continue;
    await tgSend(chatId, fmtViewingCard(full), { reply_markup: viewingKeyboard(full) });
  }
}

export { manageUrl };
