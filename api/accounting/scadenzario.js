// api/accounting/scadenzario.js — scadenzario unificato (admin)
//
// ONE deadline book, derived live from Firestore (nothing to maintain):
//   • company     — Egidi/BOOM: IVA trimestrale, LIPE, CCIAA, Redditi SC
//                   (fiscal-engine companyObligations from paid invoices)
//   • byClient    — one group per property owner: registro, IMU, cedolare,
//                   ISTAT… (fiscal-engine landlord obligations) grouped by
//                   `properties.ownerId`, plus contract renewals ≤120gg —
//                   ready to forward to each landlord/commercialista.
//
// POST { format?: 'json' | 'ics', horizonDays?: number (default 400),
//        fiscalYear?: number }
//
// format=ics → text/calendar with one all-day VEVENT per deadline; download
// from /banca and subscribe/import in Google/Apple Calendar. UID is the
// obligation key, so re-imports update rather than duplicate.

import FISCAL from '../../js/fiscal-engine.js';
import RENT from '../../js/rent-engine.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';
import { fsList } from '../homie/_lib.js';

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  const body = req.body || {};
  const format = body.format === 'ics' ? 'ics' : 'json';
  const horizonDays = Math.min(Number(body.horizonDays) || 400, 800);
  const now = new Date();
  const fiscalYear = Number(body.fiscalYear) || now.getFullYear();

  try {
    const [properties, contracts, invoices, users] = await Promise.all([
      fsList('properties', { limit: 200 }),
      fsList('contracts', { limit: 300 }),
      fsList('invoices', { limit: 400 }).catch(() => []),
      fsList('users', { limit: 1000 }).catch(() => []),
    ]);
    const userById = {}; users.forEach(u => { userById[u.id] = u; });

    // ── Company (this year + next year's carry-over deadlines) ──────────
    const revenueByQuarter = { 1: 0, 2: 0, 3: 0, 4: 0 };
    // IVA estera (v1.8): le provvigioni dei desk che fatturano alla firma
    // (invoices/cityfee_*, vatCountry FR|DE) restano FUORI dalla base IVA
    // italiana e si elencano a parte («IVA estera — da definire»): il luogo
    // della prestazione è del commercialista (spec §16 O13).
    const foreignVat = { label: 'IVA estera — da definire', count: 0, total: 0, byCountry: {}, invoices: [] };
    // BOOM è agenzia: le ricevute di canoni/depositi custoditi per i
    // proprietari non diventano ricavi aziendali né base IVA della società.
    for (const inv of RENT.businessInvoices(invoices)) {
      if (inv.status !== 'paid') continue;
      const d = new Date(inv.paidDate || inv.date || 0);
      if (d.getFullYear() !== fiscalYear) continue;
      if (RENT.isForeignVat(inv)) {
        const cc = String(inv.vatCountry).toUpperCase();
        const amt = Number(inv.amount) || 0;
        foreignVat.count++;
        foreignVat.total = Math.round((foreignVat.total + amt) * 100) / 100;
        foreignVat.byCountry[cc] = Math.round(((foreignVat.byCountry[cc] || 0) + amt) * 100) / 100;
        if (foreignVat.invoices.length < 50) foreignVat.invoices.push({ id: inv.id || null, number: inv.number || null, vatCountry: cc, amount: amt, paidDate: String(inv.paidDate || inv.date || '').slice(0, 10) || null });
        continue;
      }
      // l'imponibile quando la fattura lo dichiara (provvigione: amount è IVA
      // inclusa, netAmount no) — altrimenti l'IVA stimata contava l'IVA due volte
      revenueByQuarter[Math.floor(d.getMonth() / 3) + 1] += Number(inv.netAmount != null ? inv.netAmount : inv.amount) || 0;
    }
    const company = FISCAL.companyObligations(fiscalYear, revenueByQuarter);

    // ── Clients: landlord obligations grouped by property owner ─────────
    const byClient = {};
    const clientKey = p => {
      const owner = p.ownerId ? userById[p.ownerId] : null;
      return (owner && (owner.name || owner.email)) || p.ownerName || 'Proprietario da verificare';
    };
    for (const p of properties) {
      const key = clientKey(p);
      const cList = contracts.filter(c => c.propertyId === p.id);
      let obls = FISCAL.propertyObligations(p, fiscalYear);
      for (const c of cList) obls = obls.concat(FISCAL.contractObligations(c, p, fiscalYear));
      // Renewals: not fiscal, but every scadenzario worth the name has them.
      for (const c of cList) {
        if (['expired', 'terminated', 'draft'].includes(c.status) || !c.endDate) continue;
        const d = Math.round((new Date(c.endDate) - now) / 86400000);
        if (d >= 0 && d <= 120) {
          obls.push({
            key: `renewal_${c.id}`, label: `Rinnovo/disdetta contratto — ${p.title || p.name || p.id}`,
            category: 'contract', party: 'client', dueDate: new Date(c.endDate).toISOString().slice(0, 10),
            amount: null, severity: 'high', note: `Contratto in scadenza (${c.type || 'locazione'})`,
          });
        }
      }
      if (!obls.length) continue;
      (byClient[key] = byClient[key] || []).push(...obls);
    }

    // Horizon filter + per-group sort; rollup for the console header chips.
    const inHorizon = o => {
      if (!o.dueDate) return false;
      const d = Math.round((new Date(o.dueDate) - now) / 86400000);
      return d >= -370 && d <= horizonDays; // keep the recent past visible (overdue)
    };
    const clean = o => ({
      key: o.key, label: o.label, category: o.category || 'fiscal', dueDate: String(o.dueDate).slice(0, 10),
      amount: o.amount ?? null, severity: o.severity || 'medium', note: o.note || null,
      days: Math.round((new Date(o.dueDate) - now) / 86400000),
    });
    const companyOut = company.filter(inHorizon).map(clean).sort((a, b) => a.days - b.days);
    const byClientOut = {};
    for (const [k, list] of Object.entries(byClient)) {
      const dedup = {}; list.forEach(o => { dedup[o.key] = o; });
      const arr = Object.values(dedup).filter(inHorizon).map(clean).sort((a, b) => a.days - b.days);
      if (arr.length) byClientOut[k] = arr;
    }
    const all = companyOut.concat(...Object.values(byClientOut));
    const counts = {
      total: all.length,
      overdue: all.filter(o => o.days < 0).length,
      dueSoon: all.filter(o => o.days >= 0 && o.days <= 30).length,
      clients: Object.keys(byClientOut).length,
    };

    if (format === 'json') {
      return res.status(200).json({ ok: true, fiscalYear, counts, company: companyOut, byClient: byClientOut, foreignVat });
    }

    // ── ICS ──────────────────────────────────────────────────────────────
    const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    const ymd = iso => iso.replace(/-/g, '');
    const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BOOM Roma//Scadenzario//IT',
      'CALSCALE:GREGORIAN', 'X-WR-CALNAME:BOOM · Scadenzario fiscale',
    ];
    const pushEvent = (o, who) => {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${icsEsc(o.key)}@boomrome.com`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ymd(o.dueDate)}`,
        `SUMMARY:${icsEsc(`${o.severity === 'high' ? '❗' : ''}${o.label}${o.amount ? ` · ~€${Math.round(o.amount)}` : ''} [${who}]`)}`,
        `DESCRIPTION:${icsEsc((o.note || '') + ' — generato dal Contabile BOOM, verifica col commercialista.')}`,
        'TRANSP:TRANSPARENT',
        'END:VEVENT'
      );
    };
    companyOut.forEach(o => pushEvent(o, 'Società'));
    for (const [client, arr] of Object.entries(byClientOut)) arr.forEach(o => pushEvent(o, client));
    lines.push('END:VCALENDAR');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="boom-scadenzario-${fiscalYear}.ics"`);
    return res.status(200).send(lines.join('\r\n') + '\r\n');
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
