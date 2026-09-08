// api/profile/lookup.js
// Public resolver for La Scheda (/scheda?t=…): the derived link is the
// credential, no login. Returns the signer's OWN identity (prefilled from
// contract + users, both schemas) so the page can render one-tap confirm
// when everything is already known — never anything about the other party
// beyond what the page needs to say whose contract this is.
//
// LA SCHEDA CHE SI ADATTA: oltre all'identità, la risposta porta `ask` —
// le sezioni (esigenza transitoria, corso di studi, conviventi, fatti
// dell'immobile, tabelle millesimali, contatti) con SOLO i campi ancora
// vuoti per QUESTO ruolo su QUESTO modello, dal dizionario
// js/contract-fields.js. Un locatore con l'immobile già completo non vede
// la sezione immobile; un conduttore di un transitorio non vede mai i campi
// studenti. `complete` è la completezza del dizionario (need 'contract'):
// vero = il PDF non stamperebbe puntini per questa parte.
//
// Method:   POST
// Body:     { t }
// Response: 200 { ok, role, locked, template, property, lease, signer,
//                 docsCount, complete, ask:{ sections[], identityMissing[],
//                 missingCount }, missing:[{key,label}] }
//           404 { ok:false, error:'invalid_link'|'not_found' }

import { fsGet, readJson } from '../homie/_lib.js';
import { setCors, rateOk } from '../magic-sign/_shared.js';
import { parseSchedaRef, schedaLocked, mergedIdentity } from './_scheda.js';
import FIELDS from '../../js/contract-fields.js';

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!rateOk(req, 30)) { res.setHeader('Retry-After', '60'); return res.status(429).json({ ok: false, error: 'rate_limited' }); }

  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }

  const ref = parseSchedaRef(body && body.t);
  if (!ref) return res.status(404).json({ ok: false, error: 'invalid_link' });
  const { contractId, role, coIndex } = ref;

  let contract;
  try { contract = await fsGet('contracts/' + contractId); }
  catch (e) {
    console.error('[profile/lookup] contract fetch:', e.message);
    return res.status(500).json({ ok: false, error: 'lookup_failed' });
  }
  if (!contract) return res.status(404).json({ ok: false, error: 'not_found' });

  let property = {};
  if (contract.propertyId) {
    try { property = (await fsGet('properties/' + contract.propertyId)) || {}; } catch (_) {}
  }

  // The signer's stored profile: tenant → users/<tenantId>; landlord →
  // users/<ownerId> merged over landlords/<ownerId> (wizard schema).
  let user = null;
  try {
    if (role === 'tenant' && contract.tenantId) {
      user = await fsGet('users/' + contract.tenantId);
    } else if (role === 'landlord' && property.ownerId) {
      const [u, ll] = await Promise.all([
        fsGet('users/' + property.ownerId).catch(() => null),
        fsGet('landlords/' + property.ownerId).catch(() => null),
      ]);
      user = { ...(ll || {}), ...(u || {}) };
    }
  } catch (_) {}

  // CO-CONDUTTORE: rende come un tenant (stessa pagina, stesso step
  // identità), il prefill viene dalla SUA riga in coTenants[idx] e non
  // esistono sezioni extra (i termini e l'immobile non sono suoi).
  if (role === 'cotenant') {
    const co = (Array.isArray(contract.coTenants) ? contract.coTenants : [])[coIndex];
    if (!co) return res.status(404).json({ ok: false, error: 'not_found' });
    const d = FIELDS.cotenantIdentity(co);
    const miss = FIELDS.cotenantMissing(co);
    return res.status(200).json({
      ok: true,
      role: 'tenant',
      cosign: { index: coIndex, name: d.name },
      locked: schedaLocked(contract, 'cotenant', coIndex),
      template: FIELDS.templateOf(contract),
      complete: miss.length === 0,
      property: { name: property.name || '', address: property.address || '', zone: property.zone || '' },
      lease: { startDate: contract.startDate || null, endDate: contract.endDate || null, type: contract.type || null },
      signer: d,
      docsCount: (Array.isArray(contract.identityDocs) ? contract.identityDocs : []).filter(x => x && x.tenantIndex === coIndex + 1).length,
      ask: { sections: [], identityMissing: miss.map(m => m.key), missingCount: miss.length, lang: 'en' },
      missing: miss.map(m => ({ key: m.key, label: m.label.en, group: 'identity' })),
    });
  }

  const signer = mergedIdentity(contract, user, role);
  if (role === 'landlord' && !signer.name) signer.name = contract.landlordName || property.ownerName || '';

  const docs = Array.isArray(contract.identityDocs) ? contract.identityDocs : [];
  const docsCount = docs.filter(d => (d.role || 'tenant') === role || d.tenantIndex != null).length;

  // Il dizionario legge la STESSA catena di contract-pdf.js: ctx porta il
  // contratto, l'immobile e il profilo di QUESTA parte soltanto — i campi
  // dell'altra parte hanno un altro owner e non entrano mai in `ask`.
  const ctx = { contract, property, [role]: user || {} };
  const ask = FIELDS.askFor(role, ctx);
  const missing = FIELDS.missingFor(role, ctx, { lang: ask.lang });
  const template = FIELDS.templateOf(contract);
  // `complete` = il PDF non stamperebbe puntini per questa parte.
  const complete = FIELDS.completeness(ctx, { level: 'contract' }).byOwner[role].missing.length === 0;

  return res.status(200).json({
    ok: true,
    role,
    locked: schedaLocked(contract, role),
    template,
    complete,
    property: { name: property.name || '', address: property.address || '', zone: property.zone || '' },
    lease: { startDate: contract.startDate || null, endDate: contract.endDate || null, type: contract.type || null },
    signer,
    docsCount,
    ask: { sections: ask.sections, identityMissing: ask.identityMissing, missingCount: ask.missingCount, lang: ask.lang },
    missing,
  });
}
