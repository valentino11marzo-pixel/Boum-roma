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
import { upgradeOffer, isUpgradeLeadId, UPGRADE_DAYS, creditDueState, creditDueClause, claimWaits } from '../_upgrade.js';
import { upgradeLink } from '../payments/_token.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const ROME = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric' });
const dmy = (iso) => { const t = new Date(String(iso || '')); return Number.isNaN(t.getTime()) ? '—' : ROME.format(t); };

/** "BM X7K2Q", "bm x7k2q", "BMX7K2Q" or a lead id → a reference; anything else → null. */
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

/**
 * Orders paid in full that still wait for the refund of this pack's credit (the other door): for each, its id,
 * how sure the webhook was that the payer is this pack's holder (`match` — 'same': the same phone; 'check': only
 * the e-mail), and whether its payment is with the bank (`disputed`: the refund is suspended, not over).
 */
export async function pendingClaims(packId) {
  const rows = await fsList('leads', { filter: { field: 'creditDueFrom', op: 'EQUAL', value: packId }, limit: 10 });
  // the same rule as the webhook's refund card (api/_upgrade.js claimWaits): an order refunded whole, or whose
  // payment the bank gave back to the payer, waits for nothing
  return (rows || []).filter(claimWaits).map((r) => {
    const due = r.city && typeof r.city === 'object' && r.city.creditDue && typeof r.city.creditDue === 'object' ? r.city.creditDue : {};
    return { id: String(r.id), match: due.match === 'same' ? 'same' : 'check', disputed: !!r.disputedAt };
  });
}

/**
 * The bot's answer for one order (pure: the order, its id, the clock, the site origin, and — for an open pack —
 * the orders paid in full that wait for its credit, as pendingClaims returns them; `null` = that lookup failed).
 * An e-mail is not an identity: the link is withheld only when the SAME PHONE paid in full (or already holds the
 * Full Search, in Berlin) — on an e-mail match alone the answer says what to verify and still gives the link,
 * which may be another person's. `duePack`: for an order paid in
 * full by a pack holder, that pack's lead as read now (null = gone, undefined = not read) — what is still owed
 * is said from both (api/_upgrade.js creditDueClause, the same sentence the cards print).
 */
export function upgradeReply(lead, id, nowMs, origin, claims = [], duePack = undefined) {
  const o = upgradeOffer(lead, id, nowMs);
  const city = lead && lead.city && typeof lead.city === 'object' ? lead.city : {};
  // what the webhook recorded at the payment (the other door, Berlin's rule): said on every answer about this order
  const st = city.stackedOn && typeof city.stackedOn === 'object' && city.stackedOn.from ? city.stackedOn : null;
  const stSame = !!st && st.match === 'same';
  const flags = (st ? (stSame
    ? `\n⚠️ Pagato avendo già un Full Search su questo desk (${esc(st.from)}): i Termini §12.5 non fanno pagare altro accanto — se quella ricerca è in corso, rimborsa questo ordine.`
    : `\n⚠️ Pagato con l'email di chi ha già un Full Search su questo desk (${esc(st.from)}), ma il telefono non coincide: verifica la persona. Se è la stessa e quella ricerca è in corso, i Termini §12.5 non fanno pagare altro accanto: rimborsa questo ordine.`) : '')
    + (city.creditUnverified === true ? '\n⚠️ Al pagamento non ho potuto leggere gli ordini precedenti di chi paga: controlla a mano (stessa email, stesso desk).' : '');
  const who = esc(lead && lead.name ? lead.name : '—');
  const desk = lead && CITY_MARKETS[lead.market] ? CITY_MARKETS[lead.market].label : (lead && lead.market) || '—';
  const head = `⬆ <b>Upgrade</b> — ${who} · ${esc(desk)}${o.file || (lead && lead.city && lead.city.file) ? ' · ' + esc(o.file || lead.city.file) : ''}`;
  if (o.state === 'used') return `${head}\n${lead.credit && lead.credit.via === 'full-price' ? `Il credito è già stato rimborsato sull'ordine ${esc(o.usedBy)}, pagato a prezzo pieno` : `Il credito è già stato usato (${esc(o.usedBy)})`}. Nessun link.${flags}`;
  if (o.state === 'expired') return `${head}\nIl credito è scaduto il ${dmy(o.expiresAt)} (${UPGRADE_DAYS} giorni dal pagamento). Nessun link.${flags}`;
  if (o.state === 'void') return `${head}\n${o.reason === 'disputed' ? 'Il pagamento di questo ordine è contestato in banca' : 'Questo ordine è stato rimborsato'}: non c'è più niente da accreditare. Nessun link.${flags}`;
  // the Full Search paid with the credit keeps the pack's file: the same file number finds it too
  const cc = lead && lead.city && typeof lead.city === 'object' && lead.city.credit && typeof lead.city.credit === 'object' ? lead.city.credit : null;
  if (!o.ok && cc && cc.from) return `${head}\nQuesto ordine è già l'upgrade: ${cc.amount ? moneyOf(Number(cc.amount), String(lead.currency || 'eur').toLowerCase()) + ' ' : ''}accreditati dall'ordine ${esc(cc.from)}. Nessun link.${flags}`;
  // paid in full by a pack holder (the other door): what is owed back on this order
  const due = lead && lead.city && typeof lead.city === 'object' && lead.city.creditDue && typeof lead.city.creditDue === 'object' ? lead.city.creditDue : null;
  if (!o.ok && due && due.from) {
    const cur = String(due.currency || lead.currency || 'eur').toLowerCase();
    const state = creditDueState(lead, duePack, id);
    const clause = creditDueClause(lead, duePack, (n) => moneyOf(n, cur), id);
    const closes = state !== 'due' && state !== 'unknown' ? ''
      : due.match === 'same' ? ' Il credito del pack si chiude quando quel rimborso è segnato.'
        : ' Il credito del pack si chiude solo con un rimborso di esattamente quella cifra su questo ordine.';
    return `${head}\nPagato a prezzo pieno ${due.match === 'same' ? 'da chi aveva' : 'con l\'email di chi aveva'} un credito aperto: ${esc(clause)}.${closes} Nessun link.${flags}`;
  }
  if (!o.ok) return `${head}\nQuesto ordine non si può trasformare in Full Search (solo un Application Pack pagato su un desk che incassa alla cassa).${flags}`;
  // an order paid in full is waiting for THIS credit to be refunded: the link would spend it a second time.
  // (a bare id is read as a same-phone claim: the careful side)
  const list_ = claims === null ? [] : (Array.isArray(claims) ? claims : []).map((x) => (typeof x === 'string' ? { id: x, match: 'same' } : x)).filter((x) => x && x.id);
  const sure = list_.filter((x) => x.match === 'same'), maybe = list_.filter((x) => x.match !== 'same');
  const tag = (x) => esc(x.id) + (x.disputed ? ' (ora contestato in banca: sospeso)' : '');
  const noLink = claims === null || sure.length > 0 || stSame;
  const credit = moneyOf(o.credit, o.currency);
  const sureLine = sure.length ? `\n⚠️ ${sure.map(tag).join(', ')} (pagato a prezzo pieno, stesso telefono) aspetta il rimborso di questo credito: rimborsa lì, non mandare il link.` : '';
  const maybeLine = maybe.length ? `\n⚠️ ${maybe.map(tag).join(', ')} è stato pagato a prezzo pieno con la stessa email ma un altro telefono: potrebbe aspettare il rimborso di questo credito. Verifica chi ha pagato: se è questo cliente, rimborsa lì esattamente ${credit} e non mandare il link; se è un'altra persona, ${noLink ? 'questo credito resta suo' : 'il link qui sotto resta suo'}.` : '';
  if (noLink) {
    return `${head}\n${esc(o.fromLabel)} pagato il ${dmy(o.paidAt)} · credito ${credit} ancora aperto.`
      + sureLine + maybeLine
      + (claims === null ? '\n⚠️ Non ho potuto controllare se un ordine pagato a prezzo pieno aspetta questo credito: riprova prima di mandare il link.' : '')
      + flags + (stSame ? '\nNessun link: ha già il Full Search.' : '');
  }
  const link = upgradeLink(id, origin);
  const pay = moneyOf(o.pay, o.currency), list = moneyOf(o.list, o.currency);
  // what must be read BEFORE the link is forwarded: an e-mail-only match, a lookup that had failed
  const cautions = (maybeLine + flags + (st ? '\nSe è un\'altra persona, il link qui sotto resta suo.' : '')).trim();
  return [
    head,
    `${esc(o.fromLabel)} pagato il ${dmy(o.paidAt)} · credito ${credit} ${o.expiresAt ? `valido fino al ${dmy(o.expiresAt)}` : 'senza scadenza su questo desk'}`,
    `${esc(o.toLabel)}: <b>${pay}</b> (listino ${list} − ${credit})`,
    ...(cautions ? [cautions] : []),
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
    // only an OPEN credit needs the question "is an order paid in full waiting for it?"
    let claims = [];
    if (upgradeOffer(l, l.id, now).ok) {
      try { claims = await pendingClaims(l.id); }
      catch (e) { console.error('[upgrade] claims lookup failed:', e && e.message); claims = null; }
    }
    // an order paid in full by a pack holder: what is still owed depends on that pack as it is now
    let duePack;
    const dueFrom = l.city && typeof l.city === 'object' && l.city.creditDue && typeof l.city.creditDue === 'object' ? l.city.creditDue.from : null;
    if (dueFrom && isUpgradeLeadId(dueFrom)) {
      try { duePack = await fsGet('leads/' + dueFrom); }
      catch (e) { console.error('[upgrade] pack read failed:', e && e.message); duePack = undefined; }
    }
    await tgSend(chatId, upgradeReply(l, l.id, now, origin, claims, duePack));
  }
}
