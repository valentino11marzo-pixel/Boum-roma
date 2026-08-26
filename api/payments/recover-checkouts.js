// api/payments/recover-checkouts.js — IL RECUPERO: i quasi-clienti di Stripe.
//
// Un checkout ABBANDONATO è il lead più caldo che esiste: la persona ha
// compilato tutto il form (requisiti, telefono, budget), è arrivata alla
// pagina di pagamento — e si è fermata a un passo dai soldi. Fino ad oggi
// quelle sessioni scadevano in silenzio dentro Stripe: nessun lead, nessun
// follow-up, €350 alla volta lasciati sul tavolo.
//
// Questo cron (ogni 4h) legge le sessioni SCADUTE degli ultimi 14 giorni e:
//   · PFS / SERVICE / RESERVE → diventa un doc in `leads` (status 'new'),
//     e da lì la macchina ESISTENTE fa tutto da sola: il Lead Brain lo
//     grada, notify-pending lo pinga su Telegram col bottone WhatsApp,
//     il Commerciale propone il follow-up in approvazione. Zero superfici
//     nuove — solo il gancio che mancava.
//   · PREAGREEMENT / DEPOSIT / RENT → una riga di recap su Telegram (il
//     cliente è GIÀ nel pipeline: ha accettato e non ha pagato — serve
//     l'operatore, non un lead doppio).
//
// Mai un falso positivo:
//   · l'email dell'operatore (i suoi test) non diventa mai un lead
//   · chi ha RIPROVATO e pagato dopo viene saltato (check sessioni complete)
//   · chi è già in `leads` (apply-lead, scan-inbox, Homie…) viene saltato
//   · id lead deterministico strec_<sessione> → un rerun non duplica MAI
//
// Auth: cron Bearer CRON_SECRET, X-Homie-Secret o admin ID token. `?dry=1`
// mostra i candidati senza scrivere nulla. Heartbeat teamHealth/recupero.

import { fsCreate, fsList, fsGet, fsPatch, logActivity } from '../homie/_lib.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';
import { reportEmployeeHealth } from '../employees/_lib.js';
import { tgNotify } from '../pfs/_health.js';
import { replyLang } from '../_lang.js';

const WINDOW_DAYS = 14;
const LEAD_SERVICES = new Set(['PFS', 'SERVICE', 'RESERVE']);
const RECAP_SERVICES = new Set(['PREAGREEMENT', 'DEPOSIT', 'RENT']);

const PRICE_LABEL = {
  PFS: 'Property Finding',
  SERVICE: 'servizio',
  RESERVE: 'prenotazione appartamento',
  PREAGREEMENT: 'pre-accordo',
  DEPOSIT: 'deposito cauzionale',
  RENT: 'canone',
};

export function operatorEmails() {
  return new Set([
    'valentino@boom-rome.com',
    String(process.env.GMAIL_USER || '').toLowerCase(),
    String(process.env.VIEWINGS_CALENDAR_EMAIL || '').toLowerCase(),
  ].filter(Boolean).map(e => e.toLowerCase()));
}

export const sessionEmail = s =>
  String((s.customer_details && s.customer_details.email) || (s.metadata && s.metadata.email) || s.customer_email || '')
    .trim().toLowerCase();

/** 'lead' | 'recap' | null — what an EXPIRED session deserves. */
export function classifySession(s, ops = operatorEmails()) {
  if (!s || s.status !== 'expired' || s.payment_status === 'paid') return null;
  const service = String((s.metadata && s.metadata.service) || '').toUpperCase();
  const email = sessionEmail(s);
  if (!email || ops.has(email)) return null;             // niente lead dai test dell'operatore
  if (LEAD_SERVICES.has(service)) return 'lead';
  if (RECAP_SERVICES.has(service)) return 'recap';
  return null;
}

/** Deterministic lead id: the session IS the dedupe key. */
export const recoveryLeadId = s => 'strec_' + String(s.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-24);

const dateIt = epoch => new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'short' })
  .format(new Date((epoch || 0) * 1000));

/** The `leads` doc (same shape the portal/cockpit/Commerciale already read). */
export function leadFromSession(s, now = new Date()) {
  const m = s.metadata || {};
  const service = String(m.service || '').toUpperCase();
  const amountEur = Math.round(s.amount_total || 0) / 100;
  const email = sessionEmail(s);
  const name = m.name || (s.customer_details && s.customer_details.name) || '';

  // le parole DEL CLIENTE (verbatim) decidono la lingua della risposta —
  // mai il nostro riassunto, che è in italiano per l'operatore
  const verbatim = [m.must_haves, m.additional_info].filter(Boolean).join(' ');
  const language = verbatim.trim().length >= 12 ? replyLang({ message: verbatim }) : null;

  const wants = [
    m.preferred_areas && `Zone: ${m.preferred_areas}`,
    m.budget && `Budget: ${m.budget}`,
    m.bedrooms && `Camere: ${m.bedrooms}`,
    m.move_in_date && `Move-in: ${m.move_in_date}`,
    m.must_haves && `Must-have: ${m.must_haves}`,
    m.additional_info && `Note: ${m.additional_info}`,
    m.listing && `Immobile: ${m.listing}`,
    m.listingName && `Immobile: ${m.listingName}`,
  ].filter(Boolean).join(' · ');

  const label = service === 'SERVICE' && m.kind ? m.kind : (PRICE_LABEL[service] || service);
  return {
    type: 'recovery',
    service,
    kind: m.kind || (service === 'PFS' ? 'property-finding' : ''),
    status: 'new',
    paid: false,
    source: 'stripe-recovery',
    intent: service === 'PFS' ? 'pfs' : (service === 'RESERVE' ? 'reserve' : 'service'),
    name,
    email,
    phone: m.phone || '',
    listingId: m.listingId || '',
    listingName: m.listingName || m.listing || '',
    message: `⏳ Checkout NON completato il ${dateIt(s.created)} — ${label} €${amountEur}. Ha compilato tutto ed è arrivato al pagamento.${wants ? ' ' + wants : ''}${service === 'PFS' ? ' · MOSSA: proponi la call di 15 min e cita la garanzia §4.2 (3 opzioni nei suoi criteri entro 15 giorni o rimborso totale).' : ''}`,
    // requisiti PFS grezzi: il portal e il brief cliente li leggono già così
    move_in_date: m.move_in_date || '',
    budget: m.budget || '',
    bedrooms: m.bedrooms || '',
    preferred_areas: m.preferred_areas || '',
    must_haves: m.must_haves || '',
    additional_info: m.additional_info || '',
    language,
    amount_eur: amountEur,
    currency: s.currency || 'eur',
    stripe_session_id: s.id,
    checkoutCreatedAt: new Date((s.created || 0) * 1000).toISOString(),
    createdAt: now.toISOString(),
  };
}

export function recapLine(s) {
  const m = s.metadata || {};
  const service = String(m.service || '').toUpperCase();
  const amountEur = Math.round(s.amount_total || 0) / 100;
  const who = m.name || sessionEmail(s) || '—';
  const ref = m.ref ? ` (${m.ref})` : '';
  return `· ${PRICE_LABEL[service] || service} €${amountEur.toLocaleString('it-IT')} — ${who}${ref}, ${dateIt(s.created)}`;
}

// ── Stripe, raw fetch (GET only — nessun SDK da istanziare) ────────────────
async function stripeGet(path, params, key) {
  const q = new URLSearchParams(params).toString();
  const r = await fetch(`https://api.stripe.com/v1/${path}?${q}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`stripe_${r.status}: ${(d && d.error && d.error.message) || 'error'}`);
  return d;
}

async function listExpiredSessions(key, sinceEpoch) {
  const out = [];
  let starting_after = null;
  for (let page = 0; page < 3; page++) {
    const params = { status: 'expired', limit: '100', 'created[gte]': String(sinceEpoch) };
    if (starting_after) params.starting_after = starting_after;
    const d = await stripeGet('checkout/sessions', params, key);
    out.push(...(d.data || []));
    if (!d.has_more || !d.data.length) break;
    starting_after = d.data[d.data.length - 1].id;
  }
  return out;
}

/** Ha riprovato e PAGATO dopo? Allora non è un abbandono, è un cliente. */
async function paidLater(key, email, sinceEpoch) {
  try {
    const d = await stripeGet('checkout/sessions', {
      'customer_details[email]': email, status: 'complete', limit: '10', 'created[gte]': String(sinceEpoch),
    }, key);
    return (d.data || []).some(x => x.payment_status === 'paid');
  } catch { return false; }       // in dubbio, meglio un lead in più che uno perso
}

const ts = v => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? d.getTime() : 0; };

/** È già nel pipeline (apply-lead, scan-inbox, Homie, webhook…)? */
async function alreadyLead(email) {
  try {
    const rows = await fsList('leads', { filter: { field: 'email', op: 'EQUAL', value: email }, limit: 5 });
    const cutoff = Date.now() - 45 * 86400000;
    return (rows || []).some(l => ts(l.createdAt) >= cutoff || ts(l.paid_at) >= cutoff);
  } catch { return false; }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  const dry = String((req.query && req.query.dry) || '') === '1';

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(200).json({ ok: false, error: 'stripe_unconfigured' });

  const stats = { scanned: 0, leads: 0, recap: 0, skippedPaidLater: 0, skippedExisting: 0 };
  const preview = [];
  try {
    const since = Math.floor(Date.now() / 1000) - WINDOW_DAYS * 86400;
    const sessions = await listExpiredSessions(key, since);
    stats.scanned = sessions.length;
    const ops = operatorEmails();

    // memoria per il recap (i lead si auto-dedupano via docId)
    const mem = (await fsGet('heartbeat/stripe-recovery').catch(() => null)) || {};
    const seen = new Set(Array.isArray(mem.recapSeen) ? mem.recapSeen : []);
    const recapNew = [];

    for (const s of sessions) {
      const kind = classifySession(s, ops);
      if (!kind) continue;
      const email = sessionEmail(s);

      if (kind === 'recap') {
        const tail = String(s.id).slice(-24);
        if (seen.has(tail)) continue;
        if (dry) { preview.push({ kind, email, line: recapLine(s) }); continue; }
        seen.add(tail);
        recapNew.push(recapLine(s));
        stats.recap++;
        continue;
      }

      // kind === 'lead'
      if (await paidLater(key, email, s.created - 3600)) { stats.skippedPaidLater++; continue; }
      if (await alreadyLead(email)) { stats.skippedExisting++; continue; }
      const lead = leadFromSession(s);
      if (dry) { preview.push({ kind, email, lead: { name: lead.name, message: lead.message } }); continue; }
      try {
        await fsCreate('leads', lead, recoveryLeadId(s));
        stats.leads++;
        await logActivity('Lead recuperato da checkout abbandonato', 'lead',
          { email, service: lead.service, amountEur: lead.amount_eur }, 'stripe-recovery');
      } catch (e) {
        if (!e || !e.exists) console.error('[recover-checkouts] lead write:', e && e.message);
        // exists = già recuperato in un run precedente: silenzio
      }
    }

    if (!dry) {
      if (recapNew.length) {
        await tgNotify(`💳 <b>Pagamenti non completati</b> (già nel pipeline, serve un tuo tocco):\n${recapNew.join('\n')}`)
          .catch(() => null);
      }
      if (stats.recap || seen.size !== (mem.recapSeen || []).length) {
        await fsPatch('heartbeat/stripe-recovery', {
          recapSeen: [...seen].slice(-300), lastRunAt: new Date(),
        }).catch(() => null);
      }
      // i lead nuovi NON hanno bisogno di un recap: notify-pending manda a
      // ogni lead la sua card completa (WhatsApp incluso) entro un minuto
      await reportEmployeeHealth('recupero', { ok: true, stats });
    }

    return res.status(200).json({ ok: true, dry, stats, ...(dry ? { preview } : {}) });
  } catch (e) {
    console.error('[recover-checkouts]', e);
    if (!dry) await reportEmployeeHealth('recupero', { ok: false, error: e.message }).catch(() => null);
    return res.status(500).json({ ok: false, error: e.message || 'internal' });
  }
}
