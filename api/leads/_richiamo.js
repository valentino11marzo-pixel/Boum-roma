// api/leads/_richiamo.js — IL RICHIAMO: un ordine, una campagna, un tap.
//
// LO SCENARIO PER CUI ESISTE (parole dell'operatore): "sparisco una settimana,
// poi dico: ricontatta tutti quei numeri con gli orari — e non perdo neanche
// un lead". La Miniera ha misurato il buco: 544 conversazioni con l'ultima
// parola del cliente, 250 mai risposte. Questo modulo lo chiude SU ORDINE:
//
//   /richiama <casa>        → tutti quelli che hanno chiesto QUELLA casa
//                             (+ chi ne cercava una simile, via _reverse.js)
//   /richiama recenti [gg]  → i lead recenti rimasti senza seguito
//
// L'anteprima arriva su Telegram con i numeri, il messaggio tipo e gli
// ESCLUSI col motivo; UN tap (✅) fa partire tutto: WhatsApp a chi ha un
// numero (via il postino wa-outbox, ~10 ogni 5′ — ritmo umano), email agli
// altri, ognuno nella SUA lingua, con il link di prenotazione con gli slot
// VERI (book.html?listing=…).
//
// LE REGOLE CHE CONTANO (le stesse della ricerca rovesciata, più le sue):
// - I VETI valgono più del punteggio, e ogni escluso DICE PERCHÉ: mai
//   inquilini/proprietari/clienti PFS (il set di telefoni lo costruisce il
//   chiamante dagli archivi veri), mai lead morti o già convertiti, mai chi
//   ha GIÀ una visita in agenda, mai chi è stato richiamato da poco
//   (cooldown), mai ricerche oltre 120 giorni.
// - UNA campagna = UNA approvazione. Il tap è la firma; l'invio è
//   idempotente per costruzione (status pending→sending→sent: un secondo
//   tap non rimanda niente).
// - Se l'operatore non approva, non parte NULLA. Nessun auto-invio.
//
// Puro dove serve (buildCampaign, veti, messaggi: esportati e testati),
// operazioni Firestore/Telegram/email in prepare/send/cancel — il pattern
// di viewings/_apply.js: le quattro superfici (endpoint, bottone Telegram,
// comando) passano tutte da qui, così non possono divergere.

import nodemailer from 'nodemailer';
import { fsGet, fsList, fsPatch, fsCreate, logActivity } from '../homie/_lib.js';
import { phoneVariants } from '../homie/_lead.js';
import { replyLang } from '../_lang.js';
import { rankLeadsForListing, outreachText, MAX_AGE_DAYS } from './_reverse.js';
import { tgSend } from '../telegram/_lib.js';

const SITE = 'https://www.boomrome.com';
export const COOLDOWN_DAYS = 7;      // due richiami alla stessa persona in una
                                     // settimana = molestia, non follow-up
export const MAX_RECIPIENTS = 60;    // una "campagna" più grande di così è
                                     // un'altra cosa, e merita un occhio umano

const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const D = 86400000;

// ── i veti del richiamo (ogni esclusione dice perché) ──────────────────────
export function vetoRichiamo(lead, ctx = {}) {
  const now = ctx.now || Date.now();
  const status = String(lead.status || '').toLowerCase();
  if (lead.grade === 'dead') return 'lead morto (spam o irraggiungibile)';
  if (status === 'archived') return 'archiviato';
  if (['converted', 'won', 'tenant'].includes(status)) return 'è già diventato inquilino';
  if (status === 'lost' && lead.lostReason === 'not_looking') return 'ha detto che non cerca più';
  if (!String(lead.phone || '').trim() && !String(lead.email || '').trim()) return 'nessun recapito';

  const t = new Date(lead.createdAt || 0).getTime();
  if (t && (now - t) / D > MAX_AGE_DAYS) return `scritto oltre ${MAX_AGE_DAYS} giorni fa`;

  // contatti BOOM veri: il set arriva dagli archivi (contracts/users/pfs)
  if (ctx.excludePhones && lead.phone) {
    for (const f of phoneVariants(lead.phone)) {
      if (ctx.excludePhones.has(f)) return 'è un contatto BOOM (inquilino/proprietario/PFS)';
    }
  }
  // ha già una visita in agenda: richiamarlo ora fa solo confusione
  if (ctx.upcomingViewingPhones && lead.phone) {
    for (const f of phoneVariants(lead.phone)) {
      if (ctx.upcomingViewingPhones.has(f)) return 'ha già una visita in agenda';
    }
  }
  // cooldown: qualunque outreach recente (richiamo o ricerca rovesciata)
  const last = new Date(lead.lastRichiamoAt || lead.lastOutreachAt || 0).getTime();
  if (last && (now - last) / D < COOLDOWN_DAYS) return `richiamato ${Math.round((now - last) / D)}gg fa (cooldown ${COOLDOWN_DAYS}gg)`;
  return null;
}

// ── canale: dove è nato il lead è dove lo si raggiunge ─────────────────────
// Un numero vero batte tutto (WhatsApp è il canale caldo); senza numero si
// va sull'email. Né l'uno né l'altra = il veto 'nessun recapito' l'ha già
// fermato prima.
export function channelFor(lead) {
  const digits = String(lead.phone || '').replace(/\D/g, '');
  if (digits.length >= 7) return 'whatsapp';
  if (/.+@.+\..+/.test(String(lead.email || ''))) return 'email';
  return null;
}

export const bookingUrl = listingId => `${SITE}/book?listing=${encodeURIComponent(listingId)}`;

// ── i messaggi, nella lingua del lettore ───────────────────────────────────
export function interestedText(lead, listing, lang) {
  const first = String(lead.name || '').trim().split(/\s+/)[0] || '';
  const price = Number(listing.price);
  const priceStr = Number.isFinite(price) && price > 0 ? '€' + Math.round(price) + (lang === 'it' ? '/mese' : '/month') : '';
  const label = [listing.name || (lang === 'it' ? 'la casa' : 'the place'),
    listing.zone ? (lang === 'it' ? 'a ' + listing.zone : 'in ' + listing.zone) : '', priceStr]
    .filter(Boolean).join(' · ');
  const url = bookingUrl(listing.id);
  if (lang === 'it') {
    return `Ciao${first ? ' ' + first : ''}, sono Valentino di BOOM 👋 Mi avevi scritto per ${label} — è disponibile, ` +
      `e ora puoi prenotare la visita direttamente qui, con gli orari veri:\n${url}\n` +
      `Se preferisci rispondimi qui e la fissiamo insieme (dal vivo o in videochiamata).`;
  }
  return `Hi${first ? ' ' + first : ''}, Valentino from BOOM here 👋 You reached out about ${label} — it's available, ` +
    `and you can now book a viewing directly here, with real time slots:\n${url}\n` +
    `Or just reply here and we'll set it up together (in person or live video call).`;
}

export function recentText(lead, lang) {
  const first = String(lead.name || '').trim().split(/\s+/)[0] || '';
  if (lang === 'it') {
    return `Ciao${first ? ' ' + first : ''}, sono Valentino di BOOM 👋 Mi avevi scritto per una casa a Roma — ` +
      `stai ancora cercando? Il catalogo aggiornato è qui: ${SITE}/apartments\n` +
      `Dimmi budget e zona e ti mando subito le case giuste.`;
  }
  return `Hi${first ? ' ' + first : ''}, Valentino from BOOM 👋 You wrote to me about finding a home in Rome — ` +
    `still looking? The updated catalog is here: ${SITE}/apartments\n` +
    `Tell me your budget and area and I'll send you the right homes right away.`;
}

// ── la campagna (pura: dati dentro, righe+esclusi fuori) ───────────────────
export function buildCampaign({ type, listing, leads, listingById, knownZones, excludePhones, upcomingViewingPhones, days, now }) {
  now = now || Date.now();
  const ctx = { now, excludePhones, upcomingViewingPhones };
  const rows = [], excluded = [];
  const push = (lead, kind, text) => {
    const channel = channelFor(lead);
    if (!channel) { excluded.push({ id: lead.id, name: lead.name || '', reason: 'nessun recapito' }); return; }
    rows.push({
      leadId: lead.id, name: lead.name || lead.phone || lead.email || '?',
      kind, channel, phone: lead.phone || null, email: lead.email || null,
      lang: replyLang(lead), text,
    });
  };

  if (type === 'listing') {
    // 1 · gli INTERESSATI: hanno chiesto QUESTA casa — il richiamo è per loro
    for (const lead of leads) {
      if (!lead || lead.propertyId !== listing.id) continue;
      const veto = vetoRichiamo(lead, ctx);
      if (veto) { excluded.push({ id: lead.id, name: lead.name || '', reason: veto }); continue; }
      push(lead, 'interessato', interestedText(lead, listing, replyLang(lead)));
    }
    // 2 · gli AFFINI: cercavano una casa così (la ricerca rovesciata, coi
    //     SUOI veti — che escludono già chi ha chiesto questa casa e chi è
    //     già stato avvisato). Sopra si aggiungono i veti del richiamo.
    const inCampaign = new Set(rows.map(r => r.leadId));
    for (const m of rankLeadsForListing(listing, leads, listingById, knownZones, now)) {
      if (inCampaign.has(m.lead.id)) continue;
      const veto = vetoRichiamo(m.lead, ctx);
      if (veto) { excluded.push({ id: m.lead.id, name: m.lead.name || '', reason: veto }); continue; }
      push(m.lead, 'affine', outreachText(m, listing, SITE));
    }
  } else { // 'recenti'
    const window = Math.max(1, Math.min(60, Number(days) || 7)) * D;
    for (const lead of leads) {
      if (!lead) continue;
      const t = new Date(lead.createdAt || 0).getTime();
      if (!t || now - t > window) continue;
      const status = String(lead.status || '').toLowerCase();
      if (!['new', 'contacted', ''].includes(status)) continue;
      const veto = vetoRichiamo(lead, ctx);
      if (veto) { excluded.push({ id: lead.id, name: lead.name || '', reason: veto }); continue; }
      push(lead, 'recente', recentText(lead, replyLang(lead)));
    }
  }

  const truncated = Math.max(0, rows.length - MAX_RECIPIENTS);
  return {
    type,
    listingId: listing ? listing.id : null,
    listingName: listing ? (listing.name || null) : null,
    days: type === 'recenti' ? (Number(days) || 7) : null,
    rows: rows.slice(0, MAX_RECIPIENTS),
    excluded,
    truncated,
    counts: {
      total: Math.min(rows.length, MAX_RECIPIENTS),
      whatsapp: rows.slice(0, MAX_RECIPIENTS).filter(r => r.channel === 'whatsapp').length,
      email: rows.slice(0, MAX_RECIPIENTS).filter(r => r.channel === 'email').length,
      interessati: rows.slice(0, MAX_RECIPIENTS).filter(r => r.kind === 'interessato').length,
      affini: rows.slice(0, MAX_RECIPIENTS).filter(r => r.kind === 'affine').length,
      recenti: rows.slice(0, MAX_RECIPIENTS).filter(r => r.kind === 'recente').length,
      excluded: excluded.length,
    },
  };
}

// ── l'anteprima Telegram (HTML-escapata: un "<" del cliente non uccide la card)
export function tgCampaignText(c) {
  const L = [];
  const label = c.type === 'listing'
    ? (c.listingName || c.listingId)
    : `lead degli ultimi ${c.days} giorni`;
  L.push(`📣 <b>RICHIAMO</b> — ${esc(label)}`);
  L.push('');
  const parts = [];
  if (c.counts.interessati) parts.push(`${c.counts.interessati} interessati`);
  if (c.counts.affini) parts.push(`${c.counts.affini} affini`);
  if (c.counts.recenti) parts.push(`${c.counts.recenti} recenti`);
  L.push(`Destinatari: <b>${c.counts.total}</b> (${c.counts.whatsapp} WhatsApp · ${c.counts.email} email)` +
         (parts.length ? ` — ${parts.join(' · ')}` : ''));
  if (c.truncated) L.push(`⚠️ ${c.truncated} oltre il tetto di ${MAX_RECIPIENTS}: rilancia dopo questa per prenderli`);
  if (c.rows.length) {
    L.push('');
    L.push('<i>Esempio (primo messaggio):</i>');
    L.push('«' + esc(c.rows[0].text.slice(0, 320)) + (c.rows[0].text.length > 320 ? '…' : '') + '»');
  }
  if (c.excluded.length) {
    const byReason = {};
    for (const e of c.excluded) byReason[e.reason] = (byReason[e.reason] || 0) + 1;
    L.push('');
    L.push(`Esclusi ${c.excluded.length}: ` + Object.entries(byReason)
      .sort((a, b) => b[1] - a[1])
      .map(([r, n]) => `${esc(r)} ×${n}`).join(' · '));
  }
  L.push('');
  L.push(c.counts.total
    ? 'UN tap e partono tutti: WhatsApp via postino (~10 ogni 5′), email subito. Ognuno nella sua lingua.'
    : 'Nessun destinatario valido: niente da inviare.');
  return L.join('\n');
}

// ═══ OPERAZIONI (Firestore + Telegram + email) ═════════════════════════════

// Telefoni dei contatti BOOM veri: inquilini, proprietari, clienti PFS.
// Scrivere "stai ancora cercando casa?" a uno di loro brucia la fiducia
// nello strumento — il set si costruisce dagli archivi, non si indovina.
async function buildExcludeSets() {
  const [contracts, users, pfsClients, viewings] = await Promise.all([
    fsList('contracts', { limit: 800 }),
    fsList('users', { limit: 2000 }),
    fsList('pfsClients', { limit: 400 }),
    fsList('viewings', { limit: 600 }),
  ]);
  const excludePhones = new Set();
  const addAll = p => { for (const f of phoneVariants(p)) excludePhones.add(f); };
  for (const c of contracts) { if (c.tenantPhone) addAll(c.tenantPhone); if (c.landlordPhone) addAll(c.landlordPhone); }
  for (const u of users) {
    if (u.phone && ['tenant', 'owner', 'landlord'].includes(String(u.role || ''))) addAll(u.phone);
  }
  for (const p of pfsClients) { const ph = p.phone || p.contactPhone || p.whatsapp; if (ph) addAll(ph); }

  const now = Date.now();
  const upcomingViewingPhones = new Set();
  for (const v of viewings) {
    if (String(v.status || '') === 'cancelled') continue;
    const t = new Date(v.when || v.confirmedDate || v.date || 0).getTime();
    if (!t || t < now) continue;
    const ph = v.phone || v.clientPhone;
    if (ph) for (const f of phoneVariants(ph)) upcomingViewingPhones.add(f);
  }
  return { excludePhones, upcomingViewingPhones };
}

/**
 * Prepara la campagna: costruisce l'audience dai dati veri, la persiste
 * (status 'pending') e manda la card di anteprima su Telegram con i bottoni
 * ✅/✖️. NON invia nulla: l'invio è il tap.
 */
export async function prepareCampaign({ type, listingId, days, requestedBy = 'operator' }) {
  let listing = null;
  if (type === 'listing') {
    listing = await fsGet(`listings/${listingId}`);
    if (!listing) return { ok: false, error: 'listing_not_found' };
    listing = { ...listing, id: listingId };
  }

  const [leads, catalog, sets] = await Promise.all([
    fsList('leads', { limit: 1500 }),
    fsList('listings', { limit: 200 }),
    buildExcludeSets(),
  ]);
  const listingById = new Map(catalog.map(l => [l.id, l]));
  const knownZones = [...new Set(catalog.map(l => l.zone).filter(Boolean))];

  const campaign = buildCampaign({
    type, listing, leads, listingById, knownZones,
    excludePhones: sets.excludePhones,
    upcomingViewingPhones: sets.upcomingViewingPhones,
    days,
  });

  const doc = {
    ...campaign,
    status: 'pending',
    createdAt: new Date(),
    requestedBy,
  };
  const { id } = await fsCreate('richiamoCampaigns', doc);

  // La card con la firma a un tap. Callback ≤64 byte per costruzione
  // (rk: + id Firestore ~20 char) — la lezione delle card visite.
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (chatId) {
    const keyboard = campaign.counts.total
      ? { inline_keyboard: [[
          { text: `✅ Invia a ${campaign.counts.total}`, callback_data: `rk:${id}` },
          { text: '✖️ Annulla', callback_data: `rx:${id}` },
        ]] }
      : undefined;
    try {
      await tgSend(chatId, tgCampaignText(campaign), keyboard ? { reply_markup: keyboard } : {});
    } catch (e) { console.warn('[richiamo] tgSend preview:', e.message); }
  }

  await logActivity('Richiamo preparato', 'lead',
    { campaignId: id, type, listingId: listingId || null, recipients: campaign.counts.total, excluded: campaign.excluded.length },
    requestedBy);
  return { ok: true, id, campaign };
}

const mailTransport = () => nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASS },
});
const withTimeout = (p, ms) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
]);

/**
 * Invia la campagna. IDEMPOTENTE per costruzione: solo pending→sending
 * passa; un secondo tap trova 'sending'/'sent' e non rimanda niente.
 * WhatsApp = action_queue nel formato che il postino (wa-outbox) già pull-a;
 * email = Nodemailer, un fallimento su una riga non ferma le altre.
 */
export async function sendCampaign(id, { via = 'api' } = {}) {
  const c = await fsGet(`richiamoCampaigns/${id}`);
  if (!c) return { ok: false, error: 'not_found' };
  if (c.status !== 'pending') return { ok: false, error: 'already_' + c.status, status: c.status };
  await fsPatch(`richiamoCampaigns/${id}`, { status: 'sending', sendStartedAt: new Date(), sentVia: via });

  let wa = 0, email = 0;
  const failed = [];
  const subjectFor = r => {
    if (c.type === 'listing' && c.listingName) return `${c.listingName} — BOOM Rome`;
    return r.lang === 'it' ? 'La tua ricerca casa a Roma — BOOM' : 'Your home search in Rome — BOOM';
  };

  for (const r of c.rows || []) {
    try {
      if (r.channel === 'whatsapp') {
        // Il formato che wa-outbox pull-a: status executed + payload.channel
        // whatsapp + executedAt fresco. Il tap della campagna È l'approvazione.
        await fsCreate('action_queue', {
          kind: 'richiamo-wa', tier: 2, confidence: 1,
          status: 'executed', executedAt: new Date(), createdAt: new Date(),
          source: 'richiamo', campaignId: id, leadId: r.leadId,
          payload: { channel: 'whatsapp', phone: r.phone, body: r.text },
          approvedVia: via,
        });
        wa++;
      } else {
        await withTimeout(mailTransport().sendMail({
          from: `"BOOM Rome" <${process.env.GMAIL_USER}>`,
          to: r.email,
          subject: subjectFor(r),
          text: r.text,
          html: r.text.split('\n').map(l => `<p style="margin:0 0 10px">${esc(l)}</p>`).join(''),
        }), 12000);
        email++;
      }
      // il cooldown nasce qui: la prossima campagna lo vede e lo rispetta
      const patch = { lastRichiamoAt: new Date(), lastOutreachAt: new Date(), lastRichiamoCampaign: id };
      if (c.type === 'listing' && r.kind === 'affine' && c.listingId) {
        const lead = await fsGet(`leads/${r.leadId}`).catch(() => null);
        const prev = lead && Array.isArray(lead.notifiedListings) ? lead.notifiedListings : [];
        if (!prev.includes(c.listingId)) patch.notifiedListings = [...prev, c.listingId].slice(-40);
      }
      await fsPatch(`leads/${r.leadId}`, patch).catch(() => {});
    } catch (e) {
      failed.push({ leadId: r.leadId, name: r.name, channel: r.channel, error: String(e.message || e).slice(0, 120) });
    }
  }

  const results = { wa, email, failed };
  await fsPatch(`richiamoCampaigns/${id}`, { status: 'sent', sentAt: new Date(), results });
  await logActivity('Richiamo inviato', 'lead',
    { campaignId: id, wa, email, failed: failed.length }, via);
  return { ok: true, id, ...results };
}

export async function cancelCampaign(id) {
  const c = await fsGet(`richiamoCampaigns/${id}`);
  if (!c) return { ok: false, error: 'not_found' };
  if (c.status !== 'pending') return { ok: false, error: 'already_' + c.status, status: c.status };
  await fsPatch(`richiamoCampaigns/${id}`, { status: 'cancelled', cancelledAt: new Date() });
  return { ok: true };
}
