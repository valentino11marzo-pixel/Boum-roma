// api/owners/summary.js — LA DASHBOARD DEL PROPRIETARIO, in un solo giro.
//
// owner-dashboard.html è stata per mesi una pagina statica che la doc
// descriveva come SPA: il proprietario aveva SOLO il PDF mensile del
// rendiconto (push), nessun posto dove GUARDARE i propri numeri quando
// vuole lui (pull). Questo endpoint è quel posto: un'unica chiamata
// autenticata che restituisce, per ogni immobile del proprietario,
// contratto attivo, incassi dell'anno, arretrati, prossima rata,
// manutenzioni e lo stato del fascicolo ARPE.
//
// Perché un'API e non letture Firestore client-side (come /casa):
//   - le rules riconoscono il ruolo `landlord`, ma in archivio esistono
//     anche profili `owner` — lato server la porta li accetta entrambi e
//     l'aggregazione non dipende da com'è scritto il ruolo;
//   - l'ADMIN può aprire la dashboard DI un proprietario (?ownerId=…):
//     è lo strumento di vendita durante il pitch del mandato, e il modo
//     per controllare cosa vede il cliente prima di mandargli il link;
//   - l'aritmetica (incassato anno, arretrati, prossima rata) sta in UN
//     posto testabile — la stessa lezione di rendiconto.js, di cui questa
//     è la vista live.
//
// Sicurezza: un landlord/owner vede SOLO se stesso — ?ownerId= di un
// altro → 403, mai una risposta parziale. Admin senza target → l'elenco
// dei proprietari (per il picker), mai i dati di tutti in un colpo.
//
// GET/POST /api/owners/summary[?ownerId=<uid>]  · Bearer Firebase ID token
// → { ok, viewer, owner, properties[], totals } | { ok, viewer, owners[] }

import { requireRole } from '../_auth.js';
import { fsGet, fsList } from '../homie/_lib.js';

const LIMITS = { properties: 400, contracts: 800, payments: 3000, maintenance: 600 };
const clip = (v, n = 160) => (v == null ? null : String(v).trim().slice(0, n) || null);
const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };

/**
 * L'aggregazione, pura: (ownerId, dataset) → la vista del proprietario.
 * Esportata così i test la guidano su dati finti senza rete — e l'endpoint
 * resta un guscio di auth + fetch.
 */
export function buildOwnerView(ownerId, { properties = [], contracts = [], payments = [], maintenance = [] }, nowIso) {
  const today = String(nowIso || new Date().toISOString()).slice(0, 10);
  const year = today.slice(0, 4);

  const props = properties.filter(p => p && p.ownerId === ownerId);
  const out = [];
  const totals = { paidYtd: 0, arrears: 0, lateCount: 0, openCount: 0, properties: props.length, activeContracts: 0 };

  for (const p of props) {
    const cs = contracts.filter(c => c && c.propertyId === p.id);
    const cIds = new Set(cs.map(c => c.id));
    const activeC = cs.find(c => c.status === 'active') || cs[0] || null;
    if (activeC && activeC.status === 'active') totals.activeContracts++;

    const pays = payments.filter(x => x && (x.propertyId === p.id || cIds.has(x.contractId)));
    const isOpen = x => x.status !== 'paid' && x.status !== 'cancelled';
    const paid = pays.filter(x => x.status === 'paid');
    const paidYtd = paid.filter(x => String(x.paidDate || x.month || '').slice(0, 4) === year);
    const late = pays.filter(x => isOpen(x) && x.dueDate && x.dueDate < today)
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
    const upcoming = pays.filter(x => isOpen(x) && x.dueDate && x.dueDate >= today)
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
    const recentPaid = paid
      .sort((a, b) => String(b.paidDate || b.month || '').localeCompare(String(a.paidDate || a.month || '')))
      .slice(0, 6);

    const sum = arr => arr.reduce((s, x) => s + num(x.amount), 0);
    const paidYtdSum = sum(paidYtd);
    const arrearsSum = sum(late);
    totals.paidYtd += paidYtdSum;
    totals.arrears += arrearsSum;
    totals.lateCount += late.length;
    totals.openCount += late.length + upcoming.length;

    const openMaint = maintenance
      .filter(m => m && m.propertyId === p.id && !/^(resolved|done|closed|cancelled)$/i.test(String(m.status || '')))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 10);

    const d = p.dossier || {};
    out.push({
      id: p.id,
      name: clip(p.name, 120),
      address: clip(p.address, 160),
      zone: clip(p.zone, 80),
      status: clip(p.status, 40),
      image: clip(p.image, 500) || (Array.isArray(p.images) && p.images[0] ? clip(p.images[0], 500) : null),
      contract: activeC ? {
        id: activeC.id,
        tenantName: clip(activeC.tenantName, 120),
        rent: num(activeC.rent) || null,
        startDate: clip(activeC.startDate, 10),
        endDate: clip(activeC.endDate, 10),
        status: clip(activeC.status, 30),
        installmentMonths: num(activeC.installmentMonths) || 1,
        cedolareSecca: activeC.cedolareSecca === true || activeC.cedolareSecca === 'si' || activeC.cedolareSecca === 'sì',
        signedPdfUrl: clip(activeC.signedPdfUrl, 600),
      } : null,
      money: {
        paidYtd: Math.round(paidYtdSum),
        arrears: Math.round(arrearsSum),
        next: upcoming[0] ? { month: clip(upcoming[0].month, 10), amount: num(upcoming[0].amount), dueDate: clip(upcoming[0].dueDate, 10) } : null,
        late: late.slice(0, 12).map(x => ({ month: clip(x.month, 10), amount: num(x.amount), dueDate: clip(x.dueDate, 10) })),
        recentPaid: recentPaid.map(x => ({ month: clip(x.month, 10), amount: num(x.amount), paidDate: clip(x.paidDate, 10), paidVia: clip(x.paidVia, 20) })),
      },
      maintenance: openMaint.map(m => ({
        title: clip(m.title || m.description || m.category, 120),
        status: clip(m.status, 30),
        createdAt: clip(m.createdAt, 10),
      })),
      dossier: {
        visura: !!d.visura, planimetria: !!d.planimetria, ape: !!d.ape, delega: !!d.delega,
      },
    });
  }

  totals.paidYtd = Math.round(totals.paidYtd);
  totals.arrears = Math.round(totals.arrears);
  return { properties: out, totals };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const who = await requireRole(req, res, ['admin', 'owner', 'landlord']);
  if (!who) return;
  const isAdmin = who.profile.role === 'admin';

  const asked = clip(req.query?.ownerId, 80);
  // Un proprietario vede SOLO sé stesso: chiedere un altro id non degrada
  // in silenzio sulla propria vista — è un 403 che si vede nei log.
  if (!isAdmin && asked && asked !== who.uid) {
    return res.status(403).json({ ok: false, error: 'not_your_dashboard' });
  }
  const target = isAdmin ? asked : who.uid;

  let data;
  try {
    const [properties, contracts, payments, maintenance] = await Promise.all([
      fsList('properties', { limit: LIMITS.properties }),
      fsList('contracts', { limit: LIMITS.contracts }),
      fsList('payments', { limit: LIMITS.payments }),
      fsList('maintenance', { limit: LIMITS.maintenance }),
    ]);
    data = { properties, contracts, payments, maintenance };
  } catch (e) {
    console.error('[owners/summary] read failed:', e.message);
    return res.status(500).json({ ok: false, error: 'read_failed' });
  }

  // ── Admin senza target: l'elenco per il picker, non i dati di tutti ──
  if (isAdmin && !target) {
    const byOwner = new Map();
    for (const p of data.properties) {
      const oid = clip(p.ownerId, 80);
      if (!oid) continue;
      byOwner.set(oid, (byOwner.get(oid) || 0) + 1);
    }
    const owners = [];
    for (const [oid, count] of [...byOwner.entries()].slice(0, 40)) {
      let name = null;
      try {
        const u = await fsGet('users/' + oid).catch(() => null);
        const l = u ? null : await fsGet('landlords/' + oid).catch(() => null);
        name = clip((u && u.name) || (l && l.name), 120);
      } catch { /* il nome è cortesia, non requisito */ }
      owners.push({ id: oid, name: name || oid, properties: count });
    }
    owners.sort((a, b) => b.properties - a.properties);
    return res.status(200).json({ ok: true, viewer: { role: who.profile.role }, owners });
  }

  const view = buildOwnerView(target, data);

  // Identità del proprietario (users → landlords → contratto), come rendiconto.
  let ownerName = null, ownerEmail = null;
  try {
    const [u, l] = await Promise.all([
      fsGet('users/' + target).catch(() => null),
      fsGet('landlords/' + target).catch(() => null),
    ]);
    ownerName = clip((u && u.name) || (l && l.name), 120);
    ownerEmail = clip((u && u.email) || (l && l.email), 160);
  } catch { /* best-effort */ }

  return res.status(200).json({
    ok: true,
    viewer: { role: who.profile.role, uid: who.uid, preview: isAdmin && !!asked },
    owner: { id: target, name: ownerName || who.profile.name || null, email: ownerEmail || who.email || null },
    ...view,
    generatedAt: new Date().toISOString(),
  });
}
