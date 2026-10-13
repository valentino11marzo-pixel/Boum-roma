// api/agent/risk.scan.js — Tool: agent.risk.scan  (Tier 1, read-only)
//
// Server-side mirror of the cockpit's Risk Radar. Derives an at-risk list
// from contracts + payments + leads so Homie can answer "cosa è a rischio
// oggi?" on Telegram, or run a daily digest. No new collection — pure
// scoring over existing data.
//
// Body: { window?: number }   days-ahead horizon for expiries (default 60)
//
// Output: { generatedAt, counts:{high,med,total}, items:[{sev,cat,title,detail,days,ref}] }

import { fsList, fsListAll, fsListOpenPayments, guardPost, okJson, errJson } from './_lib.js';
import { memoized } from './_memo.js';
import COMPLIANCE from '../../js/compliance-rules.js';
import RENT from '../../js/rent-engine.js';
import CS from '../../js/contract-state.js';

function daysUntil(d) {
  if (!d) return null;
  const t = typeof d === 'string' ? Date.parse(d) : (d?.getTime ? d.getTime() : d);
  return isNaN(t) ? null : Math.round((t - Date.now()) / 86400000);
}

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;
  const horizon = typeof body.window === 'number' && body.window > 0 && body.window <= 730 ? Math.round(body.window) : 60;
  // La fotografia si riusa per 10 minuti (api/agent/_memo.js): il Mac la
  // chiede ogni due minuti e ogni scansione rilegge fino a ~2.280 documenti.
  // `fresh: true` per il dato di adesso.
  try {
    const { value, cachedAt } = await memoized('risk-' + horizon, () => scan(horizon), { fresh: body.fresh === true });
    return okJson(res, { ...value, cached: !!cachedAt, cachedAt });
  } catch (e) { return errJson(res, 500, e.message); }
}

export async function scan(horizon = 60) {
  // Contratti, immobili e rate APERTE fino in fondo (a pagine per nome),
  // mai «i primi 300»: oltre quel numero l'archivio perdeva proprio i
  // ritardi e i bonifici segnalati del Palazzo (`pay_c_plz_…`, in fondo
  // all'ordine per nome). Un tetto di sicurezza scattato si DICE (partial).
  const [contractsR, paymentsR, leads, propertiesR, users, stateDocs] = await Promise.all([
    fsListAll('contracts'),
    fsListOpenPayments(),
    fsList('leads', { orderBy: { field: 'createdAt', direction: 'DESCENDING' }, limit: 80 }),
    fsListAll('properties'),
    fsList('users', { limit: 1000 }).catch(() => []),
    fsList('complianceState', { limit: 500 }).catch(() => []),
  ]);
  const contracts = contractsR.docs, payments = paymentsR.docs, properties = propertiesR.docs;
  const partial = [[contractsR, 'contratti'], [paymentsR, 'rate'], [propertiesR, 'immobili']].filter(([r]) => r.truncated).map(([, n]) => n);
  const propById = {};
  properties.forEach(p => { propById[p.id] = p; });
  const userById = {}; users.forEach(u => { userById[u.id] = u; });
  const stateById = {}; stateDocs.forEach(d => { stateById[d.id] = d.items || {}; });
  const propLabel = (c) => {
    const p = propById[c.propertyId];
    return (p && (p.title || p.name || p.nickname)) || c.propertyName || c.propertyTitle || c.propertyId || 'Contratto';
  };

  const items = [];

  // 1) Contract expiries
  for (const c of contracts) {
    if (['expired', 'terminated', 'draft'].includes(c.status)) continue;
    const d = daysUntil(c.endDate);
    if (d == null) continue;
    if (d < 0) items.push({ sev: 'high', cat: 'Contratto scaduto', title: propLabel(c), detail: `Scaduto da ${Math.abs(d)}gg`, days: d, ref: c.id });
    else if (d <= 30) items.push({ sev: 'high', cat: 'Scadenza contratto', title: propLabel(c), detail: `Scade tra ${d}gg`, days: d, ref: c.id });
    else if (d <= horizon) items.push({ sev: 'med', cat: 'Scadenza vicina', title: propLabel(c), detail: `Scade tra ${d}gg`, days: d, ref: c.id });
  }

  // 2) Unsigned contracts — mai i firmati su carta né i segnaposto (contratto
  //    non in archivio): non c'è una firma digitale da raccogliere, e «Firma
  //    mancante» alta priorità su un atto già firmato a penna è un falso allarme.
  for (const c of contracts) {
    if (['draft', 'expired', 'terminated'].includes(c.status)) continue;
    if (CS.notSignable(c)) continue;
    const missing = [];
    if (!c.tenantSignature) missing.push('inquilino');
    if (!c.landlordSignature) missing.push('locatore');
    if (missing.length) items.push({ sev: c.status === 'active' ? 'high' : 'med', cat: 'Firma mancante', title: propLabel(c), detail: `Manca: ${missing.join(' + ')}`, days: 0, ref: c.id });
  }

  // 3) Overdue payments — lo stato da BOOM_RENT.paymentState: un bonifico
  //    SEGNALATO non è un ritardo (è da verificare) e un mese prima della
  //    gestione BOOM (property.gestioneDal) non è un arretrato di nessuno.
  const now = Date.now();
  const contractById = {}; contracts.forEach(c => { contractById[c.id] = c; });
  for (const p of payments) {
    const pc = contractById[p.contractId] || {};
    // PRIMA la gestione, come Gestore, Contabile, Oggi e il Palazzo: la RATA
    // intera prima della gestione BOOM non è di nessuno — né un arretrato,
    // né una rata «da annullare», né un bonifico da verificare (una
    // trimestrale che arriva dentro la gestione è un arretrato vero).
    if (CS.paymentBeforeGestione(p, propById[p.propertyId || pc.propertyId])) continue;
    // Dopo la chiusura vera del contratto (BOOM_RENT.openAfterClose): non è
    // un ritardo, è una rata da annullare — si dice come tale.
    if (RENT.openAfterClose(p, contractById[p.contractId], new Date(now))) {
      items.push({ sev: 'med', cat: 'Rata dopo la chiusura', title: p.tenantName || (contractById[p.contractId] || {}).tenantName || 'Pagamento', detail: `€${(p.amount || 0).toLocaleString('it-IT')} · da annullare (il contratto è chiuso)`, days: 0, ref: p.id });
      continue;
    }
    const st = RENT.paymentState(p, new Date(now));
    // Segnalato (o in corso, o da verificare) su una rata dopo la chiusura:
    // non è un incasso da registrare — verifica, poi rimborsa o annulla.
    if (RENT.reportedAfterClose(p, contractById[p.contractId], new Date(now))) {
      items.push({ sev: 'med', cat: 'Rata dopo la chiusura', title: p.tenantName || (contractById[p.contractId] || {}).tenantName || 'Pagamento', detail: `€${(p.amount || 0).toLocaleString('it-IT')} · pagamento segnalato dopo la chiusura: verifica, poi rimborsa o annulla`, days: 0, ref: p.id });
      continue;
    }
    if (st === 'reported') {
      // Una PARTE segnalata non è la rata saldata (reportSummary).
      const rs = RENT.reportSummary(p);
      items.push({ sev: 'med', cat: 'Bonifico segnalato', title: p.tenantName || (contractById[p.contractId] || {}).tenantName || 'Pagamento',
        detail: rs.partial ? `€${rs.sum.toLocaleString('it-IT')} segnalati su €${rs.total.toLocaleString('it-IT')} · mancano €${rs.missing.toLocaleString('it-IT')} · da verificare`
          : `€${(p.amount || 0).toLocaleString('it-IT')} · da verificare`, days: 0, ref: p.id });
      continue;
    }
    if (st !== 'overdue') continue;
    const due = p.dueDate ? Date.parse(p.dueDate) : null;
    if (due && due < now) {
      const late = Math.round((now - due) / 86400000);
      items.push({ sev: late > 7 ? 'high' : 'med', cat: 'Pagamento in ritardo', title: p.tenantName || p.description || 'Pagamento', detail: `€${(p.amount || 0).toLocaleString('it-IT')} · ${late}gg`, days: -late, ref: p.id });
    }
  }

  // 4) Grade-A leads stale > 24h
  for (const l of leads) {
    if (l.status && l.status !== 'new') continue;
    if (l.grade !== 'A') continue;
    const created = l.createdAt ? Date.parse(l.createdAt) : now;
    const age = now - created;
    if (age > 24 * 3600 * 1000) items.push({ sev: 'med', cat: 'Lead A senza follow-up', title: l.name || 'Lead', detail: `In attesa da ${Math.round(age / 3600000)}h`, days: 0, ref: l.id });
  }

  // 5) Bureaucracy / compliance deadlines (overdue or due ≤14gg) — same
  //    engine as the /compliance page, so the cockpit Risk Radar now also
  //    surfaces RLI, asseverazione, ISTAT, cedolare, etc. without any UI change.
  const todayD = new Date();
  for (const c of contracts) {
    if (['expired', 'terminated', 'draft'].includes(c.status)) continue;
    const tenant = userById[c.tenantId || c.tenant || c.tenantUid] || {};
    const doneMap = stateById[c.id] || {};
    let obligations;
    try { obligations = COMPLIANCE.obligationsFor(c, { tenant, today: todayD, property: propById[c.propertyId] }); } catch { continue; }
    for (const it of obligations) {
      const st = COMPLIANCE.statusOf(it, doneMap, todayD, 14);
      if (st !== 'overdue' && st !== 'due_soon') continue;
      const d = it.dueDate ? Math.round((COMPLIANCE.toDate(it.dueDate) - todayD) / 86400000) : 0;
      const sev = st === 'overdue' ? (it.severity === 'low' ? 'med' : 'high') : (it.severity === 'high' ? 'high' : 'med');
      items.push({
        sev,
        cat: st === 'overdue' ? 'Burocrazia scaduta' : 'Burocrazia in scadenza',
        title: propLabel(c),
        detail: `${it.label} · ${st === 'overdue' ? `${Math.abs(d)}gg fa` : `tra ${d}gg`}`,
        days: d,
        ref: c.id,
      });
    }
  }

  if (partial.length) items.push({ sev: 'med', cat: 'Archivio letto in parte', title: partial.join(', '), detail: 'Il tetto di lettura è scattato: ritardi e scadenze possono non essere tutti', days: 0, ref: 'partial' });

  const rank = { high: 0, med: 1, low: 2 };
  items.sort((a, b) => (rank[a.sev] - rank[b.sev]) || (a.days - b.days));

  return {
    generatedAt: new Date().toISOString(),
    counts: { high: items.filter(i => i.sev === 'high').length, med: items.filter(i => i.sev === 'med').length, total: items.length },
    items,
  };
}
