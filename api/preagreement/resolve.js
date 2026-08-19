// api/preagreement/resolve.js
// "QUESTO DEAL È BLOCCATO" — il bottone che rimette in pari lo stato di una
// proposta quando il percorso si è rotto per strada, e che soprattutto
// RISPONDE alla domanda vera dell'operatore: ha pagato o no?
//
// Ripara due guasti, entrambi visti in produzione:
//
//  1. INCASSATO MA NON REGISTRATO. Il documento porta i soldi
//     (paidAt/paidSessionId) ma lo status dice altro — oppure Stripe ha
//     incassato e il webhook non è mai arrivato. La console mostrava
//     "pagamento in sospeso" su un deal chiuso, e → Contratto / Magic Sign /
//     ✉ Reinvia copia rispondevano 409 `not_accepted_yet`.
//  2. RISERVA MAI SBLOCCATA. Chi ha firmato mentre l'immobile era tenuto da
//     un'altra proposta resta in `reserve` per sempre: se la prima chiusura
//     salta, nessuno lo rimette in corsa. Documenti e firma sono già lì.
//
// NON INDOVINA MAI. Per dichiarare pagato serve una PROVA: il record sul
// documento, oppure una sessione Stripe con payment_status='paid' che porta
// il token di QUESTA proposta. Senza prova non tocca lo status e lo dice.
//
// Method:   POST
// Headers:  Authorization: Bearer <firebase-id-token>  (admin/owner/landlord)
// Body:     { id }                                     // preAgreements doc id
// Response: { ok, verdict, actions[], status, paid, blocked?, contractId? }

import Stripe from 'stripe';
import { fsGet, fsPatch, readJson, logActivity } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { paidOnRecord, stateVerdict, dueAtSigning } from './_state.js';
import { acquireLock, confirmLock } from './_lock.js';
import { maybeAutoConvert } from './_auto.js';

export const config = { maxDuration: 60 };

const PAGE = 100;
const MAX_PAGES = 5;      // 500 sessioni: abbondante ai volumi BOOM, e questa
                          // è un'azione manuale, non un cron

// La prova del pagamento su Stripe, cercata per il token di QUESTA proposta.
// Il metadata `token` viaggia su ogni sessione creata da submit.js e pay.js,
// quindi è l'unico legame che non si perde nemmeno se il documento ha
// dimenticato l'id della sessione (il vecchio giro lo sovrascriveva).
export async function findPaidSession(stripe, pa) {
  const token = (pa || {}).token;
  if (!stripe || !token) return null;
  // Non si guarda più indietro della nascita della proposta (‑1 giorno di
  // margine): tutto ciò che è più vecchio non può essere il suo pagamento.
  const born = Date.parse((pa || {}).createdAt || '');
  const created = isFinite(born) ? { gte: Math.floor(born / 1000) - 86400 } : undefined;
  let startingAfter = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await stripe.checkout.sessions.list({
      limit: PAGE,
      ...(created ? { created } : {}),
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    const rows = (res && res.data) || [];
    for (const s of rows) {
      if (!s || !s.metadata || s.metadata.token !== token) continue;
      if (s.payment_status === 'paid') return s;
    }
    if (!rows.length || !(res && res.has_more)) break;
    startingAfter = rows[rows.length - 1].id;
  }
  return null;
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin', 'owner', 'landlord']);
  if (!auth) return;

  const b = await readJson(req);
  const paId = b && typeof b.id === 'string' ? b.id.trim().slice(0, 80) : '';
  if (!paId) return res.status(400).json({ ok: false, error: 'id_required' });

  let pa;
  try { pa = await fsGet('preAgreements/' + paId); }
  catch (e) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  if (!pa) return res.status(404).json({ ok: false, error: 'not_found' });

  const before = stateVerdict(pa);
  const actions = [];
  const now = new Date().toISOString();

  // ── 1 · I SOLDI ────────────────────────────────────────────────────────
  // Prima la prova sul documento, poi (solo se manca) quella su Stripe.
  let session = null;
  if (!paidOnRecord(pa) && process.env.STRIPE_SECRET_KEY && dueAtSigning(pa) > 0) {
    try {
      session = await findPaidSession(new Stripe(process.env.STRIPE_SECRET_KEY), pa);
      if (session) actions.push('stripe_payment_found');
    } catch (e) {
      console.error('[pa/resolve] ricerca Stripe fallita:', e.message);
      actions.push('stripe_unreachable');
    }
  }

  if (paidOnRecord(pa) || session) {
    if (pa.status === 'paid' && !session) {
      return res.status(200).json({ ok: true, verdict: 'ok', actions: ['nothing_to_do'], status: 'paid', paid: true });
    }
    const patch = { status: 'paid', statusRepairedAt: now, statusRepairedBy: auth.email || auth.uid || 'console' };
    if (session) {
      patch.paidAt = pa.paidAt || now;
      patch.paidEur = Number(pa.paidEur) || ((session.amount_total || 0) / 100);
      patch.paidSessionId = pa.paidSessionId || session.id;
      if (session.payment_intent) patch.stripePaymentIntent = String(session.payment_intent);
    }
    try { await fsPatch(`preAgreements/${paId}`, patch); }
    catch (e) {
      console.error('[pa/resolve] patch fallita:', e.message);
      return res.status(500).json({ ok: false, error: 'repair_failed' });
    }
    actions.push('status_restored_to_paid');

    // I soldi ci sono: il lucchetto sull'immobile diventa definitivo (nel
    // giro rotto poteva essere rimasto una presa a scadenza, o esser passato
    // ad altri — confirmLock tocca solo ciò che è ancora nostro).
    const fixed = { ...pa, ...patch };
    try { await confirmLock({ pa: fixed, paId }); } catch (e) { console.error('[pa/resolve] lucchetto:', e.message); }

    // E il contratto, se questa proposta era nata per crearsi da sola.
    let contractId = pa.contractId || null;
    try {
      const out = await maybeAutoConvert({ pa: fixed, paId });
      if (out && out.contractId) { contractId = out.contractId; actions.push('contract_ready'); }
    } catch (e) { console.error('[pa/resolve] convert:', e.message); }

    logActivity('preagreement_state_repaired', 'preagreement', {
      id: paId, was: before.status, now: 'paid', viaStripe: !!session, by: auth.email || null,
    }, 'console').catch(() => {});

    return res.status(200).json({
      ok: true, verdict: 'payment_restored', actions, status: 'paid', paid: true,
      paidEur: patch.paidEur != null ? patch.paidEur : (Number(pa.paidEur) || null),
      contractId,
    });
  }

  // ── 2 · LA RISERVA ─────────────────────────────────────────────────────
  // L'immobile si è liberato? Il lucchetto è l'unica autorità: se lo prende,
  // la riserva torna in corsa con la firma e i documenti che ha già dato.
  if (pa.status === 'reserve') {
    const due = dueAtSigning(pa);
    let lock;
    try { lock = await acquireLock({ pa, paId, firm: due <= 0 }); }
    catch (e) {
      console.error('[pa/resolve] lucchetto non verificabile:', e.message);
      return res.status(503).json({ ok: false, error: 'lock_unavailable' });
    }
    if (lock && lock.ok === false && lock.reason === 'held') {
      // Ancora di un altro: nessuna scrittura, e si dice DI CHI.
      return res.status(200).json({
        ok: true, verdict: 'still_held', actions: ['no_change'], status: 'reserve', paid: false,
        blocked: { by: lock.by || null, byRef: lock.byRef || null, until: lock.until || null },
      });
    }
    const ref = pa.ref || ('BOOM-' + Date.now().toString(36).toUpperCase());
    try {
      await fsPatch(`preAgreements/${paId}`, {
        status: 'accepted', ref,
        acceptedAt: pa.acceptedAt || now,
        reserveReleasedAt: now,
        reserveOf: null,
        statusRepairedBy: auth.email || auth.uid || 'console',
      });
    } catch (e) {
      console.error('[pa/resolve] promozione fallita:', e.message);
      return res.status(500).json({ ok: false, error: 'promote_failed' });
    }
    actions.push('reserve_promoted');

    // Niente da pagare → il deal è chiuso davvero: contratto come su submit.
    // C'è un dovuto → resta un'accettazione in attesa di pagamento, e il
    // cliente lo trova sulla SUA pagina ("Complete your reservation").
    let contractId = pa.contractId || null;
    if (due <= 0) {
      try {
        const out = await maybeAutoConvert({ pa: { ...pa, status: 'accepted', ref }, paId });
        if (out && out.contractId) { contractId = out.contractId; actions.push('contract_ready'); }
      } catch (e) { console.error('[pa/resolve] convert:', e.message); }
    }

    logActivity('preagreement_reserve_released', 'preagreement', {
      id: paId, ref, tenant: (pa.tenant || {}).fullName || null, by: auth.email || null,
    }, 'console').catch(() => {});

    return res.status(200).json({
      ok: true, verdict: 'reserve_promoted', actions, status: 'accepted', paid: false,
      ref, due, contractId,
    });
  }

  // ── 3 · NIENTE DA RIPARARE ─────────────────────────────────────────────
  // Il caso più comune, e va detto com'è: accettata, c'è un dovuto, il
  // pagamento non risulta né sul documento né su Stripe. Non è un guasto.
  return res.status(200).json({
    ok: true,
    verdict: before.kind === 'unpaid' ? 'no_payment_found' : 'ok',
    actions: actions.length ? actions : ['nothing_to_do'],
    status: pa.status || 'sent', paid: false,
  });
}
