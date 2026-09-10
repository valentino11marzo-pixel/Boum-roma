// api/preagreement/lookup.js
// Public, no login — the client opens /pre-agreement?t=<token> and the page
// resolves the document here. Views are audit-logged onto the doc.
//
// Method: POST   Body: { token }
// Response 200: { ok, id, pa: {status, property, landlord, tenant, lease,
//                money, note, createdAt, acceptedAt?, ref?} }

import { fsGet, fsList, fsPatch, readJson } from '../homie/_lib.js';
import { offeredAddons } from './_addons.js';
import { resolveCanoneInput, schedaFacts, schedaGaps } from '../fiscal/fascicolo.js';
import CANONE from '../../js/canone-engine.js';

// La scheda ARPE come la vedrebbe il contratto nato da questa proposta:
// stessi fatti (schedaFacts), stesso motore. Senza immobile collegato o
// senza mq/zona: `gaps` dice cosa manca, mai un numero inventato.
async function schedaSummary(pa) {
  if (!pa || !pa.propertyId) return { linked: false, gaps: ['immobile'] };
  const property = await fsGet('properties/' + pa.propertyId).catch(() => null);
  if (!property) return { linked: false, gaps: ['immobile'] };
  let cfg = null;
  try { cfg = await fsGet('settings/canoneAccordo'); } catch (_) {}
  const le = pa.lease || {}, m = pa.money || {};
  const contract = { type: /student/i.test(String(le.type || '')) ? 'studenti' : (/3\s*\+\s*2/.test(String(le.type || '')) ? '3+2' : 'transitorio'), rent: Number(m.rent) || 0 };
  const input = resolveCanoneInput({ contract, property, listing: null, cfg: cfg || undefined });
  const calc = input.zona && input.mq > 0 ? CANONE.solve(input) : { ok: false, error: !input.zona ? 'zona_non_trovata' : 'mq_mancanti' };
  const f = schedaFacts({ contract, property, calc, input });
  return {
    linked: true, gaps: schedaGaps(f),
    zonaCod: f.zonaCod || '', zonaNome: f.zona ? f.zona.nome : '', mq: f.mq || 0, sc: f.has ? f.sc : (f.scTotal || 0),
    nP: f.nP, fascia: f.sub ? f.sub.fascia : '', subfascia: f.sub ? f.sub.name : '',
    valore: f.sub ? f.sub.val : null, cMax: f.cMax, pattuito: f.pattuito, fits: f.fits,
  };
}

// Offer expiry gates NEW acceptances only — never an accepted/paid deal.
// "Today" is Rome's calendar day, so the offer dies at midnight in Rome.
export function paExpired(data) {
  if (!data || !data.validUntil) return false;
  if (data.status === 'accepted' || data.status === 'paid') return false;
  try {
    const todayRome = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
    return todayRome > String(data.validUntil);
  } catch { return false; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const b = await readJson(req);
  const token = b && typeof b.token === 'string' ? b.token.trim() : '';
  if (!/^[a-f0-9]{32}$/.test(token)) return res.status(400).json({ ok: false, error: 'bad_token' });

  try {
    const rows = await fsList('preAgreements', { filter: { field: 'token', op: 'EQUAL', value: token }, limit: 1 });
    const hit = rows && rows[0];
    if (!hit) return res.status(404).json({ ok: false, error: 'not_found' });
    const { id, ...data } = hit;   // fsList returns flat rows: {id, ...fields}
    if (data.status === 'revoked') return res.status(410).json({ ok: false, error: 'revoked' });

    const scheda = await schedaSummary(data).catch(() => null);

    // audit the view (best-effort)
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const views = Array.isArray(data.views) ? data.views.slice(-49) : [];
    views.push({ at: new Date().toISOString(), ip, ua: String(req.headers['user-agent'] || '').slice(0, 160) });
    fsPatch(`preAgreements/${id}`, { views, status: data.status === 'sent' ? 'viewed' : data.status }).catch(() => {});

    return res.status(200).json({
      ok: true, id,
      pa: {
        status: data.status, property: data.property, landlord: data.landlord,
        tenant: data.tenant, tenants: Array.isArray(data.tenants) ? data.tenants : null,
        lease: data.lease, money: data.money,
        extras: Array.isArray(data.extras) ? data.extras : null,
        customClauses: Array.isArray(data.customClauses) ? data.customClauses : null,
        // uploads stay private (their URLs carry the read token) — the page
        // only needs how many arrived, to restore the Verify step's state
        uploadsCount: Array.isArray(data.uploads) ? data.uploads.length : 0,
        // the optional second requested document (e.g. proof of transitional
        // need) — label + whether it already arrived (never blocking)
        extraDoc: data.extraDoc || null,
        extraDocCount: Array.isArray(data.uploads) ? data.uploads.filter(u => u && u.kind === 'extra').length : 0,
        // Il mandato a firmare: chiesto? gia' conferito? (mai il testo qui —
        // la pagina lo ha in una copia sola, uguale a _consent.js).
        askMandate: data.askMandate === true,
        mandate: data.mandate && data.mandate.given ? { at: data.mandate.at } : null,
        // La scheda di calcolo del canone (Allegato 2/B) che il cliente firma
        // con l'accettazione: i numeri che firma, calcolati DAL SERVER
        // sull'immobile collegato — o cosa manca per calcolarli.
        scheda,
        contractReady: !!data.contractId,
        // Gli add-on proponibili alla firma (prezzo dal catalogo server-side,
        // mai dal browser) + quelli già scelti, così un rientro sulla pagina
        // ritrova le sue spunte.
        addonsOffered: offeredAddons(data),
        addons: Array.isArray(data.addons) ? data.addons : null,
        note: data.note || null, createdAt: data.createdAt,
        acceptedAt: data.acceptedAt || null, ref: data.ref || null,
        validUntil: data.validUntil || null,
        expired: paExpired(data),
      },
    });
  } catch (e) {
    console.error('[preagreement/lookup] failed:', e.message);
    return res.status(500).json({ ok: false, error: 'lookup_failed' });
  }
}
