// api/telegram/_upgrade.js — /upgrade <BM XXXXX | svc_…> on the operator's bot.
//
// The client's personal upgrade link (api/_upgrade.js): a paid Application
// Pack on a desk that charges at the till becomes Full Search with what was
// paid credited, once, within 30 days. A policy since 12/11/2026: the client
// already has this link in their order email; the bot is how the operator
// reads the state of a credit and sends the link again. The operator types
// the file number the order email and the client both quote; the bot answers
// with the state, the link and a ready message in English. Read-only: nothing
// is written, nothing is sent to the client.

import { tgSend } from './_lib.js';
import { fsGet, fsList } from '../homie/_lib.js';
import { CITY_MARKETS, moneyOf } from '../_market.js';
import { upgradeOffer, isUpgradeLeadId, UPGRADE_DAYS } from '../_upgrade.js';
import { upgradeLink } from '../payments/_token.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const ROME = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric' });
const dmy = (iso) => { const t = new Date(String(iso || '')); return Number.isNaN(t.getTime()) ? '—' : ROME.format(t); };

/** "BM BEAEV", "bm beaev", "BMBEAEV" or a lead id → a reference; anything else → null. */
export function parseUpgradeRef(arg) {
  const t = String(arg || '').trim();
  const m = t.toUpperCase().match(/^BM\s*([A-Z2-9]{5})$/);
  if (m) return { file: 'BM ' + m[1] };
  if (isUpgradeLeadId(t)) return { id: t };
  return null;
}

/** The paid desk orders behind a reference (a file number can also name the free-door lead: only paid orders count). */
export async function findUpgradeOrders(ref) {
  if (ref && ref.id) {
    const l = await fsGet('leads/' + ref.id);
    return l ? [{ ...l, id: ref.id }] : [];
  }
  if (ref && ref.file) {
    const rows = await fsList('leads', { filter: { field: 'city.file', op: 'EQUAL', value: ref.file }, limit: 10 });
    return (rows || []).filter((r) => r && isUpgradeLeadId(r.id) && r.intent === 'city_order' && r.paid === true);
  }
  return [];
}

/** The bot's answer for one order (pure: the order, its id, the clock, the site origin). */
export function upgradeReply(lead, id, nowMs, origin) {
  const o = upgradeOffer(lead, id, nowMs);
  const who = esc(lead && lead.name ? lead.name : '—');
  const desk = lead && CITY_MARKETS[lead.market] ? CITY_MARKETS[lead.market].label : (lead && lead.market) || '—';
  const head = `⬆ <b>Upgrade</b> — ${who} · ${esc(desk)}${o.file || (lead && lead.city && lead.city.file) ? ' · ' + esc(o.file || lead.city.file) : ''}`;
  if (o.state === 'used') return `${head}\nIl credito è già stato usato (${esc(o.usedBy)}). Nessun link.`;
  if (o.state === 'expired') return `${head}\nIl credito è scaduto il ${dmy(o.expiresAt)} (${UPGRADE_DAYS} giorni dal pagamento). Nessun link.`;
  if (o.state === 'void') return `${head}\n${o.reason === 'withdrawn' ? 'Il cliente ha receduto da questo ordine' : 'Questo ordine è stato rimborsato'}: non c'è più niente da accreditare. Nessun link.`;
  // the Full Search paid with the credit keeps the pack's file: the same file number finds it too
  const cc = lead && lead.city && typeof lead.city === 'object' && lead.city.credit && typeof lead.city.credit === 'object' ? lead.city.credit : null;
  if (!o.ok && cc && cc.from) return `${head}\nQuesto ordine è già l'upgrade: ${cc.amount ? moneyOf(Number(cc.amount), String(lead.currency || 'eur').toLowerCase()) + ' ' : ''}accreditati dall'ordine ${esc(cc.from)}. Nessun link.`;
  if (!o.ok) return `${head}\nQuesto ordine non si può trasformare in Full Search (solo un Application Pack pagato su un desk che incassa alla cassa).`;
  const link = upgradeLink(id, origin);
  const pay = moneyOf(o.pay, o.currency), credit = moneyOf(o.credit, o.currency), list = moneyOf(o.list, o.currency);
  return [
    head,
    `${esc(o.fromLabel)} pagato il ${dmy(o.paidAt)} · credito ${credit} ${o.expiresAt ? `valido fino al ${dmy(o.expiresAt)}` : 'senza scadenza su questo desk'}`,
    `${esc(o.toLabel)}: <b>${pay}</b> (listino ${list} − ${credit})`,
    '',
    `<b>Link personale</b> (non inoltrarlo ad altri):`,
    esc(link),
    '',
    '<b>Messaggio pronto</b>:',
    esc(`Here's your personal ${o.toLabel} link: the ${credit} you paid for the ${o.fromLabel} is credited, so it's ${pay}. If you want me to start without waiting for the 14-day withdrawal period, tick "Start now" when you pay: ${link}`),
  ].join('\n');
}

export async function handleUpgradeCommand(chatId, arg) {
  const ref = parseUpgradeRef(arg);
  if (!ref) {
    await tgSend(chatId, 'Uso: <code>/upgrade BM XXXXX</code> — il numero di fascicolo dell\'ordine (o l\'id <code>svc_…</code>).');
    return;
  }
  let hits = [];
  try { hits = await findUpgradeOrders(ref); }
  catch (e) {
    console.error('[upgrade] lookup failed:', e && e.message);
    await tgSend(chatId, 'Non riesco a leggere gli ordini adesso. Riprova tra un minuto.');
    return;
  }
  if (!hits.length) {
    await tgSend(chatId, `Nessun ordine pagato con ${esc(ref.file || ref.id)}.`);
    return;
  }
  const now = Date.now();
  for (const l of hits.slice(0, 3)) {
    const origin = CITY_MARKETS[l.market] ? new URL(CITY_MARKETS[l.market].url).origin : 'https://www.boomrome.com';
    await tgSend(chatId, upgradeReply(l, l.id, now, origin));
  }
}
