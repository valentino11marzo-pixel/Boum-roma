// api/preagreement/submit.js
// Public — the client self-fills their identity on the document page and
// accepts the pre-agreement. Persists identity + consent under admin creds,
// stamps a quotable reference, and (when something is due at signing)
// returns a Stripe Checkout URL so the lock is immediate.
//
// Method: POST
// Body: { token, tenant:{ fullName, dob?, birthPlace?, nationality?,
//         address?, cf?, idDoc?, email, phone },
//         tenants?: [tenant, ...co-tenants],   // primary first, ≤6 total
//         accept: true }
// The primary tenant must carry name + email + phone; co-tenants need at
// least a full name (their typed name is their signature — all co-tenants
// are jointly and severally liable per the document's conditions).
// Response: { ok, ref, checkoutUrl|null }

import Stripe from 'stripe';
import { fsList, fsPatch, readJson, logActivity } from '../homie/_lib.js';
import { sendPaEmails } from './_notify.js';
import { maybeAutoConvert } from './_auto.js';
import { paExpired } from './lookup.js';
import { acquireLock, confirmLock, HOLD_HOURS } from './_lock.js';
import { tgSend } from '../telegram/_lib.js';

// Telegram in parse_mode HTML: un nome con & o < romperebbe il messaggio.
const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const clip = (v, n = 200) => (v == null ? null : String(v).trim().slice(0, n) || null);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const b = await readJson(req);
  const token = b && typeof b.token === 'string' ? b.token.trim() : '';
  if (!/^[a-f0-9]{32}$/.test(token)) return res.status(400).json({ ok: false, error: 'bad_token' });
  if (!b.accept) return res.status(400).json({ ok: false, error: 'consent_required' });

  // Parties: prefer the tenants[] array (primary first); fall back to the
  // single-tenant body for older clients. Co-tenants are optional.
  const rawList = Array.isArray(b.tenants) && b.tenants.length
    ? b.tenants.slice(0, 6)
    : [b.tenant || {}];
  const sanitizeTenant = (t) => ({
    fullName: clip((t || {}).fullName, 120),
    email: clip((t || {}).email, 160),
    phone: clip((t || {}).phone, 60),
    dob: clip((t || {}).dob, 20), birthPlace: clip((t || {}).birthPlace, 120),
    nationality: clip((t || {}).nationality, 80), address: clip((t || {}).address, 200),
    cf: clip((t || {}).cf, 40), idDoc: clip((t || {}).idDoc, 80),
  });
  const tenants = rawList.map(sanitizeTenant)
    .filter((t, i) => i === 0 || (t.fullName && t.fullName.length >= 3));
  const primary = tenants[0];
  const { fullName, email, phone } = primary;
  if (!fullName || fullName.length < 3) return res.status(400).json({ ok: false, error: 'name_required' });
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'email_required' });
  if (!phone || phone.length < 6) return res.status(400).json({ ok: false, error: 'phone_required' });

  try {
    const rows = await fsList('preAgreements', { filter: { field: 'token', op: 'EQUAL', value: token }, limit: 1 });
    const hit = rows && rows[0];
    if (!hit) return res.status(404).json({ ok: false, error: 'not_found' });
    const { id, ...data } = hit;   // fsList returns flat rows: {id, ...fields}
    if (data.status === 'revoked') return res.status(410).json({ ok: false, error: 'revoked' });
    if (data.status === 'accepted') return res.status(200).json({ ok: true, ref: data.ref || null, checkoutUrl: null, already: true });
    // Expired offer: acceptance refused (the console's Edit extends the same
    // link — status never changes here, so reviving is one field away).
    if (paExpired(data)) return res.status(410).json({ ok: false, error: 'expired', validUntil: data.validUntil });

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const ref = 'BOOM-' + Date.now().toString(36).toUpperCase();

    // Each party's typed full name IS their signature (like the paper doc,
    // where every co-tenant signs the same signature box).
    const signed = tenants.map(t => ({ ...t, signature: t.fullName }));
    const tenant = signed[0];   // primary alias — everything downstream (Stripe,
                                // emails, webhook, reminders) keeps working on it

    // ── IL LUCCHETTO SULL'IMMOBILE ────────────────────────────────────────
    // Prima di accettare: questo appartamento è già chiuso da un altro
    // candidato per un periodo che si accavalla? Il controllo è atomico
    // (create-o-fallisci su Firestore), quindi due tocchi nello stesso
    // secondo non passano entrambi. Se il dovuto alla firma non arriva entro
    // HOLD_HOURS il lucchetto scade — una riserva che non paga non congela
    // l'immobile.
    const dueNow = Math.round(Number((data.money || {}).dueAtSigning) || 0);
    let lock = { ok: true, reason: 'skipped' };
    try {
      lock = await acquireLock({ pa: data, paId: id, firm: dueNow <= 0 });
    } catch (e) {
      // Un guasto del lucchetto non deve bloccare una chiusura legittima:
      // si registra e si prosegue (il rischio residuo è quello di prima).
      console.error('[pa/submit] lucchetto non verificabile:', e.message);
    }

    if (lock.ok === false && lock.reason === 'held') {
      // NON respingiamo: questa persona ha appena compilato documento,
      // identità e firma. La parcheggiamo come riserva, non parte nessun
      // pagamento, nessun contratto — e l'operatore lo sa entro un minuto.
      await fsPatch(`preAgreements/${id}`, {
        tenant, tenants: signed,
        status: 'reserve',
        reserveOf: lock.by || null,
        reserveAt: new Date().toISOString(),
        consent: { at: new Date().toISOString(), ip, ua: String(req.headers['user-agent'] || '').slice(0, 160) },
      });
      logActivity('preagreement_reserve', 'preagreement', {
        id, tenant: fullName, heldBy: lock.by, address: (data.property || {}).address,
      }, 'web').catch(() => {});
      tgSend(process.env.TELEGRAM_CHAT_ID,
        '🅿️ <b>Riserva su un immobile già chiuso</b>\n\n'
        + `<b>${esc(fullName)}</b> ha firmato per <b>${esc((data.property || {}).address || '')}</b>,\n`
        + `ma è tenuto da un altro candidato${lock.byRef ? ' (' + esc(lock.byRef) + ')' : ''}.\n\n`
        + 'Documenti e firma sono salvati. Chiamalo prima che vada altrove — '
        + 'se la prima chiusura salta, è già pronto.',
        { parse_mode: 'HTML' }).catch(() => {});
      return res.status(409).json({
        ok: false, error: 'property_taken', reserved: true,
        heldUntil: lock.until || null,
      });
    }
    await fsPatch(`preAgreements/${id}`, {
      tenant, tenants: signed, status: 'accepted', ref,
      acceptedAt: new Date().toISOString(),
      consent: { at: new Date().toISOString(), ip, ua: String(req.headers['user-agent'] || '').slice(0, 160) },
    });
    logActivity('preagreement_accepted', 'preagreement', { id, ref, tenant: fullName, coTenants: signed.length - 1, address: (data.property || {}).address }, 'web')
      .catch(() => {});

    // Stripe checkout for whatever is due at signing (best-effort: acceptance
    // is already recorded; a failed checkout never voids the acceptance).
    let checkoutUrl = null;
    const due = dueNow;   // già calcolato per il lucchetto qui sopra
    if (due > 0 && process.env.STRIPE_SECRET_KEY) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const eur = Math.max(50, Math.min(20000, due));
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          payment_method_types: ['card'],
          customer_email: email,
          line_items: [{
            price_data: {
              currency: 'eur',
              product_data: {
                name: `Pre-agreement ${ref} — ${(data.property || {}).address || 'Rome apartment'}`,
                description: 'Amount due at signing per your BOOM pre-agreement. Deposit terms per the agreement.',
              },
              unit_amount: eur * 100,
            },
            quantity: 1,
          }],
          metadata: {
            service: 'PREAGREEMENT', ref, token,
            address: clip((data.property || {}).address, 200) || '',
            name: fullName, email, phone,
          },
          success_url: 'https://www.boomrome.com/pre-agreement?t=' + token + '&paid=1',
          cancel_url: 'https://www.boomrome.com/pre-agreement?t=' + token,
        });
        checkoutUrl = session.url;
        fsPatch(`preAgreements/${id}`, { checkoutSessionId: session.id }).catch(() => {});
      } catch (e) {
        console.error('[preagreement/submit] stripe failed:', e.message);
      }
    }

    // Confirmation emails (best-effort, never blocks the client):
    // - nothing due via Stripe → client gets the document email now + admin copy
    // - payment expected      → admin heads-up only; the client's document +
    //                           receipt email arrives from the Stripe webhook
    try {
      await sendPaEmails({
        pa: { ...data, tenant, tenants: signed },
        ref, url: '/pre-agreement?t=' + token,
        event: 'accepted',
        notifyClient: !(due > 0 && checkoutUrl),
      });
    } catch (e) { console.error('[preagreement/submit] emails failed:', e.message); }

    // Deal sealed with nothing due via Stripe → the contract auto-creates
    // NOW and the tenant's Magic-Sign link goes out while momentum is hot.
    // (When a payment is expected, the webhook runs this after checkout.)
    if (!(due > 0 && checkoutUrl)) {
      await maybeAutoConvert({ pa: { ...data, tenant, tenants: signed, status: 'accepted', ref }, paId: id });
    }

    return res.status(200).json({ ok: true, ref, checkoutUrl });
  } catch (e) {
    console.error('[preagreement/submit] failed:', e.message);
    return res.status(500).json({ ok: false, error: 'submit_failed' });
  }
}
