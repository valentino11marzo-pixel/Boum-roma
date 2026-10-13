// api/agent/state.snapshot.js — Tool: agent.state.snapshot  (Tier 1, read-only)
//
// Returns a compact view of the portal state so Homie can answer questions
// on Telegram ("quanti lead oggi?", "quali contratti scadono?") without
// holding its own copy of Firestore. POST so we share the secret guard.
//
// Body: { scope?: 'all' | 'leads' | 'contracts' | 'payments' | 'agenda' }
//        default 'all'. Numbers are recent slices (last 30d) to keep the
//        response small (<10KB).

import { fsList, fsListAll, fsListOpenPayments, guardPost, okJson, errJson } from './_lib.js';
import { memoized } from './_memo.js';
import RENT from '../../js/rent-engine.js';
import CS from '../../js/contract-state.js';

function startOfToday() { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); }
function daysAgoIso(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); }

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;
  const scope = ['all', 'leads', 'contracts', 'payments', 'agenda'].includes(body.scope) ? body.scope : 'all';
  // La fotografia si riusa per 10 minuti (api/agent/_memo.js): il Mac la
  // chiede ogni due minuti. `fresh: true` per il dato di adesso.
  try {
    const { value, cachedAt } = await memoized('snapshot-' + scope, () => snapshot(scope), { fresh: body.fresh === true });
    return okJson(res, { ...value, cached: !!cachedAt, cachedAt });
  } catch (e) { return errJson(res, 500, e.message); }
}

export async function snapshot(scope) {
  const out = { ts: new Date().toISOString() };

  if (scope === 'all' || scope === 'leads') {
    const recent = await fsList('leads', { orderBy: { field: 'createdAt', direction: 'DESCENDING' }, limit: 50 });
    const today = startOfToday();
    out.leads = {
      total30d: recent.length,
      newToday: recent.filter(l => l.createdAt && l.createdAt >= today && (l.status === 'new' || !l.status)).length,
      pendingNew: recent.filter(l => l.status === 'new' || !l.status).length,
      converted30d: recent.filter(l => l.status === 'converted').length,
      recent: recent.slice(0, 10).map(l => ({
        id: l.id, name: l.name, source: l.source, status: l.status || 'new',
        propertyTitle: l.propertyTitle || null, price: l.propertyPrice || null,
        createdAt: l.createdAt,
      })),
    };
  }

  if (scope === 'all' || scope === 'contracts') {
    // Tutti i contratti (a pagine per nome), mai «i primi 100».
    const contractsR = await fsListAll('contracts');
    const contracts = contractsR.docs;
    const now = Date.now();
    const exp = (c) => c.endDate ? Math.round((new Date(c.endDate).getTime() - now) / 86400000) : null;
    out.contracts = {
      active: contracts.filter(c => c.status === 'active').length,
      draft: contracts.filter(c => c.status === 'draft').length,
      // firmati su carta e segnaposto non hanno una firma digitale da
      // raccogliere: contarli fra i «non firmati» era un falso allarme
      unsigned: contracts.filter(c => !CS.notSignable(c) && (!c.landlordSignature || !c.tenantSignature)).length,
      expiring60: contracts.filter(c => { const d = exp(c); return d != null && d >= 0 && d <= 60; }).length,
      expiring30: contracts.filter(c => { const d = exp(c); return d != null && d >= 0 && d <= 30; }).length,
      ...(contractsR.truncated ? { partial: true } : {}),
    };
  }

  if (scope === 'all' || scope === 'payments') {
    // Le rate APERTE fino in fondo (mai «le prime 100» per nome: oltre quel
    // numero sparivano proprio quelle del Palazzo) e, come nel Palazzo, mai
    // una rata tutta prima della gestione BOOM (property.gestioneDal): la
    // fotografia per Homie non conta arretrati che il Palazzo non conta.
    const [paymentsR, propertiesR, contractsR] = await Promise.all([
      fsListOpenPayments(), fsListAll('properties'), fsListAll('contracts'),
    ]);
    const propById = {}; propertiesR.docs.forEach(p => { propById[p.id] = p; });
    const contractById = {}; contractsR.docs.forEach(c => { contractById[c.id] = c; });
    const payments = paymentsR.docs.filter(p => {
      const pc = contractById[p.contractId] || {};
      return !CS.paymentBeforeGestione(p, propById[p.propertyId || pc.propertyId]);
    });
    const now = new Date();
    // Lo stato da BOOM_RENT.paymentState (la lettura del Palazzo): un
    // bonifico SEGNALATO dall'inquilino è da verificare, non in ritardo.
    const overdue = payments.filter(p => RENT.paymentState(p, now) === 'overdue');
    const reported = payments.filter(p => RENT.paymentState(p, now) === 'reported');
    out.payments = {
      ...(paymentsR.truncated || propertiesR.truncated || contractsR.truncated ? { partial: true } : {}),
      pending: payments.filter(p => p.status === 'pending').length,
      overdue: overdue.length,
      overdueAmount: overdue.reduce((s, p) => s + (p.amount || 0), 0),
      reported: reported.length,
      reportedAmount: reported.reduce((s, p) => s + (p.amount || 0), 0),
    };
  }

  if (scope === 'all' || scope === 'agenda') {
    const today = startOfToday();
    const upcoming = await fsList('viewingRequests', { limit: 50 });
    out.agenda = {
      todayViewings: upcoming.filter(v => v.scheduledAt && v.scheduledAt.slice(0, 10) === today.slice(0, 10)).length,
      pendingViewings: upcoming.filter(v => v.status === 'pending').length,
    };
  }

  if (scope === 'all') {
    const pending = await fsList('action_queue', { filter: { field: 'status', op: 'EQUAL', value: 'pending' }, limit: 50 });
    out.actionQueue = { pending: pending.length };
  }
  return out;
}
