// api/preagreement/convert.js
// An ACCEPTED (or paid) pre-agreement becomes a rental contract in the
// portal's `contracts` collection — no re-typing. The tenant identity the
// client self-filled on the public page (name, dob, birthplace, nationality,
// address, CF, ID + uploaded ID documents) seeds their `users` profile and
// travels onto the contract; lease + money terms carry over; Magic-Sign
// tokens are minted.
//
// Two entry points:
//   - HTTP POST (console "→ Contract" button) — this file's default handler
//   - convertPaToContract() — the same core, called by stripe-webhook.js /
//     submit.js for the AUTOMATIC pipeline: PA created with propertyId +
//     autoConvert → the contract materializes the moment the deal closes
//     (payment confirmed, or acceptance when nothing is due via Stripe).
//
// Landlord signature: by DEFAULT the owner signs directly — the landlord-side
// Magic-Sign link is meant for them (the console shares it via WhatsApp/email
// after the tenant signs; signingOrder sequential). delegate:true is the
// OPTION for deals where the admin countersigns per delega scritta (as on
// some real BOOM proposals): it records landlordDelegate and the landlord
// link stays with the admin instead.
//
// Method:   POST
// Headers:  Authorization: Bearer <firebase-id-token>  (admin/owner/landlord)
// Body: {
//   id:          string,        // preAgreements doc id
//   propertyId?: string,        // defaults to pa.propertyId
//   delegate?:   boolean,       // default FALSE — owner signs directly;
//                               // true = agency countersigns per delega
//   delegateName?: string,      // default 'Valentino Egidi'
//   type?:       'transitorio'|'studenti'   // default 'transitorio'
//   createProperty?: boolean,   // nessun immobile nel portal → lo crea DALLA
//                               // proposta (indirizzo, piano, interno,
//                               // locatore, canone), id prop_pa_<paId>
//   force?:      boolean,       // ignora la guardia sovrapposizioni (stanza
//                               // diversa non modellata, sostituzione)
//   dryRun?:     boolean,       // NON scrive: torna completezza (puntini del
//                               // PDF per parte) + eventuale sovrapposizione
// }
// Response: { ok, contractId, tenantId, tenantSignUrl, landlordSignUrl,
//             delegate:{...}|null, already?:true, propertyCreated?:true }
//   409 overlap { overlap:{contractId, tenantName, startDate, endDate, unit} }
//   400 no_property { canCreate }

import crypto from 'node:crypto';
import { fsGet, fsList, fsCreate, fsPatch, readJson, logActivity } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { ensureContractPdf, resolveLandlord, buildContractPdfBytes } from '../sign/_contractpdf.js';
import { storageUpload } from '../agent/_lib.js';
import { mandateTermsHash } from '../magic-sign/_shared.js';
import MANDATO from '../../js/mandato-engine.js';
import { buildPaPdf } from './_pdf.js';
// Il dizionario del contratto: il preflight dice PRIMA quali puntini il PDF
// stamperebbe (per parte), invece di farli scoprire aprendo il PDF.
import FIELDS from '../../js/contract-fields.js';

const BASE = 'https://www.boomrome.com';
const clip = (v, n = 200) => (v == null ? null : String(v).trim().slice(0, n) || null);

// Il tipo di contratto DECIDE il modello del PDF (js/contract-pdf.js:
// studenti → Allegato C, tutto il resto → Allegato B). Una copia sola della
// regola, esportata perché si testa: il chiamante esplicito vince, altrimenti
// si legge la proposta. `lease.type` è la tendina della console
// («Student Housing (Allegato C)»), non testo libero del cliente.
export function leaseType(explicit, lease) {
  // La regola vive in js/mandato-engine.js (la foto delle condizioni
  // approvate deve derivare il modello ESATTAMENTE come la conversione).
  return MANDATO.modelOfLease(explicit, lease);
}

// Il back-link proposta → contratto, in UNA copia (creazione e ramo «esiste
// già»). convertedAt non si riscrive se la proposta lo porta già.
async function backlinkPa({ paId, pa, contractId, tenantSignToken, landlordSignToken, delegated, actor, propertyId }) {
  try {
    await fsPatch('preAgreements/' + paId, {
      contractId,
      // l'immobile del contratto torna sulla proposta (scelto alla
      // conversione o creato da essa): la console lo legge per 🖊 e per
      // il Fascicolo, e non deve più dire «crealo prima da Immobili».
      ...(propertyId ? { propertyId } : {}),
      convertedAt: (pa && pa.convertedAt) || new Date().toISOString(),
      convertedBy: (pa && pa.convertedBy) || actor,
      tenantSignUrl: tenantSignToken ? `${BASE}/sign?sign=${tenantSignToken}` : null,
      landlordSignUrl: landlordSignToken ? `${BASE}/sign?sign=${landlordSignToken}` : null,
      delegated: !!delegated,   // the console shapes the landlord-link action on this
    });
  } catch (e) { console.warn('[preagreement/convert] pa back-link:', e.message); }
}

// ── L'IMMOBILE CHE MANCA SI CREA DALLA PROPOSTA (Sprint 1, 1.1) ──────
// Nel backup del 13/09: 6 proposte PAGATE senza contratto, 3 su un indirizzo
// assente da `properties`. Senza immobile non partono contratto, rate,
// journey né registrazione — e la riga diceva «crealo prima da Immobili»,
// cioè un'altra pagina, a mano, ribattendo dati che la proposta ha già.
// Qui il doc `properties` minimo nasce dalla proposta, nella FORMA che il
// portal scrive (saveProperty) e che i lettori (convert, fascicolo, pdf)
// leggono: address/floor/interno/unit/ownerName/rent. Catasto, mq e zona
// restano da completare dal portal — la scheda ARPE li dichiara mancanti,
// mai inventati. Id deterministico: un doppio tap non crea due immobili.
// L'immobile è OBBLIGATORIO alla conversione, non alla creazione della
// proposta: una stanza o una casa in trattativa restano proponibili.
export function propertyFromPa({ pa, paId, actor = 'system' }) {
  const p = (pa && pa.property) || {}, ll = (pa && pa.landlord) || {}, m = (pa && pa.money) || {};
  const address = clip(p.address, 200) || '';
  const short = address.split(',')[0].trim();
  const unit = clip(p.unit, 40) || '';
  const cond = String(p.condition || '');
  return {
    name: [short, unit ? 'int. ' + unit : ''].filter(Boolean).join(' ') || ('Immobile ' + ((pa && pa.ref) || paId)),
    address,
    city: 'Roma',
    ownerId: null,
    ownerName: clip(ll.name, 120) || '',
    ownerEmail: clip(ll.email, 160) || '',
    ownerPhone: clip(ll.phone, 40) || '',
    rent: Number(m.rent) || 0,
    floor: clip(p.floor, 40) || '',
    unit,
    interno: unit,
    furnished: /furnish/i.test(cond) ? !/unfurnish/i.test(cond) : null,
    propertyType: 'apartment',
    availabilityStatus: 'rented',
    source: 'preagreement',
    preAgreementId: paId,
    preAgreementRef: (pa && pa.ref) || null,
    notes: 'Creato dalla proposta ' + ((pa && pa.ref) || paId) + ' — completa catasto, mq e zona dal portal.',
    createdAt: new Date().toISOString(),
    createdBy: 'preagreement_convert:' + actor,
  };
}
export const propertyIdForPa = (paId) => 'prop_pa_' + paId;

// La scheda `users` del conduttore, nella forma che i lettori (Allegato,
// Scheda, dizionario) conoscono. UNA copia: la usa il bootstrap vero e il
// preflight (dove il profilo non esiste ancora).
function tenantUserFromPa(t, uploads) {
  return {
    role: 'tenant',
    name: t.fullName, email: t.email || '', phone: t.phone || '',
    cf: t.cf || '', dob: t.dob || '', pob: t.birthPlace || '',
    address: t.address || '', docNum: t.idDoc || '', nationality: t.nationality || '',
    // il TIPO di documento (passport|id|permit|patente) arriva dalla
    // proposta: senza, il contratto stampava «identificato/a mediante ………»
    docType: t.idDocType || '', idDocType: t.idDocType || '',
    identityDocs: (uploads || []).filter(u => (u.tenantIndex || 0) === 0).map(u => ({ url: u.url, name: u.name, at: u.at })),
    createdBy: 'preagreement_convert', createdAt: new Date().toISOString(),
  };
}

// ── DUE CONTRATTI VIVI SULLA STESSA CASA NON PASSANO (Sprint 1, 1.2) ──
// Nel dump: Brand New Duplex con due contratti attivi a date sovrapposte.
// Il lucchetto (_lock.js) protegge solo l'ACCETTAZIONE fra proposte; la
// conversione non guardava i contratti esistenti. Regola pura, testata per
// mutazione: stesso immobile + entrambi attivi + date che si toccano =
// conflitto, A MENO CHE gli interni siano dichiarati e diversi (due stanze
// della stessa casa sono legittime; la stessa stanza no; un interno vuoto
// non esclude niente). Il contratto della STESSA proposta (retry) non
// conta mai. `force:true` scavalca — è l'operatore che decide, a voce alta.
const normUnit = (v) => String(v || '').trim().toLowerCase().replace(/^int(erno)?\.?\s*/, '').replace(/\s+/g, '');
const OPEN_END = '9999-12-31';
export function overlapConflict(contracts, { paId, unit, startDate, endDate }) {
  if (!startDate) return null;
  const s = String(startDate).slice(0, 10), e = String(endDate || OPEN_END).slice(0, 10);
  const mine = normUnit(unit);
  for (const c of (Array.isArray(contracts) ? contracts : [])) {
    if (!c || c.status !== 'active') continue;
    if (paId && (c.id === 'pa_' + paId || c.preAgreementId === paId)) continue;
    if (!c.startDate) continue;
    const cs = String(c.startDate).slice(0, 10), ce = String(c.endDate || OPEN_END).slice(0, 10);
    if (ce < s || cs > e) continue;                 // periodi disgiunti
    const theirs = normUnit(c.unit || c.interno);
    if (mine && theirs && mine !== theirs) continue; // due interni diversi, dichiarati
    return {
      contractId: c.id || null,
      tenantName: c.tenantName || '',
      startDate: cs, endDate: c.endDate ? ce : null,
      unit: c.unit || c.interno || '',
      signatureStatus: c.signatureStatus || 'none',
    };
  }
  return null;
}
// La fine del periodo della proposta: la data dichiarata, altrimenti i mesi
// dopo l'inizio (basta per la guardia; il contratto vero porta la sua).
function leaseEnd(le) {
  if (le && le.endDate) return String(le.endDate).slice(0, 10);
  if (!le || !le.startDate) return null;
  const d = new Date(String(le.startDate).slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCMonth(d.getUTCMonth() + Math.max(1, Number(le.months) || 12));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
async function findOverlap({ propId, paId, unit, le }) {
  try {
    const rows = await fsList('contracts', { filter: { field: 'propertyId', op: 'EQUAL', value: propId }, limit: 60 });
    return overlapConflict(rows || [], { paId, unit, startDate: le && le.startDate, endDate: leaseEnd(le) });
  } catch (e) {
    // la guardia è di cortesia: se la lettura fallisce lo si dice e si va
    // avanti (fsGet dell'immobile avrebbe già fatto cadere la conversione)
    console.warn('[preagreement/convert] overlap check skipped:', e.message);
    return null;
  }
}

// ── IL PREFLIGHT (Sprint 1, 3.3): i puntini PRIMA del PDF ─────────────
// Lo stesso contratto che la conversione scriverebbe, passato dal dizionario
// (js/contract-fields.js) con l'immobile, il profilo del conduttore com'è
// sulla proposta e il locatore: cosa manca a chi, e quanti puntini
// stamperebbe il PDF. Etichette pronte (IT per operatore/locatore, EN per
// il conduttore). Si può procedere lo stesso — non al buio.
function preflightOf({ contract, property, tenantUser, landlord }) {
  const hydrated = FIELDS.hydrateParties(contract, tenantUser || {}, landlord || {}, property || {});
  const ctx = { contract: hydrated, property: property || {}, tenant: tenantUser || {}, landlord: landlord || {} };
  const comp = FIELDS.completeness(ctx, { level: 'registration' });
  const lab = (e, lang) => (e && e.label && typeof e.label === 'object') ? (e.label[lang] || e.label.it || e.key) : ((e && e.label) || (e && e.key) || '');
  const list = (arr, lang) => (arr || []).map(e => ({ key: e.key, label: lab(e, lang), group: e.group || '' }));
  return {
    template: comp.template,
    ready: comp.ready,
    dots: list(comp.dots, 'it'),
    byOwner: {
      tenant: list(comp.byOwner.tenant.missing, 'en'),
      landlord: list(comp.byOwner.landlord.missing, 'it'),
      operator: list(comp.byOwner.operator.missing, 'it'),
    },
    cotenants: (comp.cotenants || []).filter(c => c.missing && c.missing.length)
      .map(c => ({ name: c.name, missing: c.missing.map(m => lab(m, 'en')) })),
  };
}
// Il locatore, risolto come lo risolve il PDF (resolveLandlord: users +
// landlords per ownerId, poi landlords per email): preflight e documento
// non possono contraddirsi su cosa manca.
async function landlordCtxOf(property, contract) {
  try { return (await resolveLandlord(contract, property)) || {}; } catch (_) { return {}; }
}


// IL MANDATO SUL CONTRATTO, UNA COPIA (21/09/2026). Lo costruiscono in due:
// la conversione (contratto che nasce da una proposta col mandato) e
// api/preagreement/mandate.js (mandato dato DOPO l'accettazione, sul
// contratto già nato — il caso «ha accettato, poi ha perso interesse»).
// La BASE è la foto presa all'accettazione (pa.approvedTerms, v2). Per una
// proposta accettata prima della v2 la foto si prende dalla proposta stessa
// — che la console non lascia modificare dopo l'accettazione — e la
// provenienza resta dichiarata. MAI dal contratto: il contratto è ciò che si
// VERIFICA, non la base. termsHash è la stessa impronta che
// magic-sign/submit ricalcola al momento della firma (un canone o una data
// ritoccati dopo = 409 mandate_terms_changed, mai una firma).
export function tenantMandateFor(pa, paId, contract) {
  const snap = (pa.approvedTerms && pa.approvedTerms.terms && pa.approvedTerms.hash) ? pa.approvedTerms : null;
  const terms = snap ? snap.terms : MANDATO.termsFromProposal(pa);
  const termsHash = snap ? snap.hash : mandateTermsHash(terms);
  const diff = MANDATO.diffTerms(terms, MANDATO.termsFromContract(contract));
  return {
    given: true,
    at: pa.mandate.at || null,
    ref: pa.ref || null,
    paId,
    hash: pa.mandate.hash || null,
    text: pa.mandate.text || '',
    ip: pa.mandate.ip || '',
    termsVersion: MANDATO.VERSION,
    termsHash,
    terms,
    termsSource: snap ? (snap.source || 'proposal-at-acceptance') : 'proposal-at-conversion',
    // La verifica: il contratto riproduce le condizioni approvate? Se no
    // (es. modello scelto a mano diverso dalla proposta), il mandato resta
    // registrato ma DICHIARATO non spendibile: il server rifiuterà la firma
    // (409) e il portal lo mostra.
    termsMatch: diff.length === 0,
    termsDiff: diff.map(d => d.key),
    termsCheckedAt: new Date().toISOString(),
  };
}
// ── Core conversion, shared by the console handler and the auto pipeline ──
// Returns { ok, already?, contractId, tenantId, tenantSignUrl,
//           landlordSignUrl, delegate } or { ok:false, error }.
export async function convertPaToContract({ pa, paId, propertyId, delegate = false, delegateName, type, actor = 'system', createProperty = false, force = false, dryRun = false, draftPdf = false }) {
  if (!pa || !paId) return { ok: false, error: 'no_pa' };
  if (pa.status !== 'accepted' && pa.status !== 'paid') return { ok: false, error: 'not_accepted_yet' };

  // Idempotent: already converted → hand back the existing contract's links.
  if (pa.contractId) {
    try {
      const c = await fsGet('contracts/' + pa.contractId);
      if (c) {
        return {
          ok: true, already: true, contractId: pa.contractId, tenantId: c.tenantId || null,
          ...(dryRun ? { dryRun: true } : {}),
          tenantSignUrl: c.tenantSignToken ? `${BASE}/sign?sign=${c.tenantSignToken}` : null,
          landlordSignUrl: c.landlordSignToken ? `${BASE}/sign?sign=${c.landlordSignToken}` : null,
          delegate: c.landlordDelegate || null,
        };
      }
    } catch (_) { /* stale pointer — fall through and convert again */ }
  }

  let propId = propertyId || pa.propertyId;
  let property = null, propertyCreated = false;
  const canCreate = !!((pa.property || {}).address);
  if (!propId && createProperty === true && canCreate) {
    const newId = propertyIdForPa(paId);
    if (dryRun) {
      // il preflight si valuta sull'immobile CHE NASCEREBBE, senza crearlo
      property = propertyFromPa({ pa, paId, actor });
    } else {
      try {
        await fsCreate('properties', propertyFromPa({ pa, paId, actor }), newId);
        propertyCreated = true;
      } catch (e) {
        if (!e.exists) { console.error('[preagreement/convert] property create failed:', e.message); return { ok: false, error: 'property_create_failed' }; }
      }
    }
    propId = newId;
  }
  if (!propId) return { ok: false, error: 'no_property', canCreate };
  if (!property) {
    try { property = await fsGet('properties/' + propId); }
    catch (e) { return { ok: false, error: 'property_lookup_failed' }; }
  }
  if (!property) return { ok: false, error: 'property_not_found' };

  const tenants = Array.isArray(pa.tenants) && pa.tenants.length ? pa.tenants : [pa.tenant || {}];
  const t = tenants[0];
  if (!t || !t.fullName) return { ok: false, error: 'no_tenant_identity' };
  const uploads = Array.isArray(pa.uploads) ? pa.uploads : [];
  const unit = clip((pa.property || {}).unit, 40) || '';

  // ID deterministico dal PA: due conversioni concorrenti (double-submit,
  // retry del webhook con back-link stantio) collassano sullo stesso doc.
  const contractId = 'pa_' + paId;
  // LA PROPOSTA ORFANA / IL RETRY, riconosciuti PRIMA di ogni guardia: se
  // contracts/pa_<paId> esiste già (il caso Léa: firmato da entrambi, back-
  // link perso) si ricuce e si torna — la guardia sovrapposizioni non deve
  // MAI impedire a una proposta di ritrovare il SUO contratto (il contratto
  // vicino, attivo sullo stesso immobile, la bloccherebbe per sempre).
  let existing = null;
  try { existing = await fsGet('contracts/' + contractId); } catch (_) { existing = null; }
  if (existing) {
    if (dryRun) return { ok: true, dryRun: true, already: true, exists: true, contractId, propertyId: existing.propertyId || propId };
    await backlinkPa({ paId, pa, contractId, tenantSignToken: existing.tenantSignToken, landlordSignToken: existing.landlordSignToken, delegated: !!(existing.landlordDelegate && existing.landlordDelegate.name), actor, propertyId: existing.propertyId || propId });
    return {
      ok: true, already: true, contractId, tenantId: existing.tenantId || null,
      tenantSignUrl: existing.tenantSignToken ? `${BASE}/sign?sign=${existing.tenantSignToken}` : null,
      landlordSignUrl: existing.landlordSignToken ? `${BASE}/sign?sign=${existing.landlordSignToken}` : null,
      delegate: existing.landlordDelegate || null,
    };
  }

  // La guardia sovrapposizioni: PRIMA di creare profili e contratto. In
  // dryRun si riporta soltanto (la console avvisa prima del tap).
  const overlap = await findOverlap({ propId, paId, unit, le: pa.lease || {} });
  if (overlap && force !== true && !dryRun) return { ok: false, error: 'overlap', overlap };

  // ── 1. Tenant user: reuse by email, else bootstrap from the PA identity ──
  // The users doc MUST be keyed by a real Firebase Auth uid: /casa and
  // /api/payments/pay authorize on tenantId === auth.uid. So when no
  // profile matches by email, we mint the Auth account server-side
  // (Identity Toolkit signUp, random password — the tenant sets their own
  // via "Password dimenticata" on /login) and key the doc on its localId.
  let tenantId = null;
  if (!dryRun) try {
    if (t.email) {
      const hits = await fsList('users', { filter: { field: 'email', op: 'EQUAL', value: t.email }, limit: 1 });
      if (hits && hits[0]) tenantId = hits[0].id;
    }
    let authUid = null;
    if (!tenantId && t.email && process.env.FIREBASE_API_KEY) {
      try {
        const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${process.env.FIREBASE_API_KEY}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: t.email, password: crypto.randomBytes(18).toString('base64url'), returnSecureToken: false }),
        });
        const d = await r.json().catch(() => ({}));
        if (d && d.localId) authUid = d.localId;
        // EMAIL_EXISTS with no users doc → fall through to auto-ID (rare;
        // the operator links the profile from the portal)
      } catch (_) {}
    }
    if (!tenantId) {
      // BUG storico: il vecchio `const { id } = await fsCreate(...).then(r
      // => { … })` destrutturava il ritorno del .then (undefined) e faceva
      // fallire l'INTERA conversione su ogni inquilino mai visto prima.
      try {
        const r = await fsCreate('users', tenantUserFromPa(t, uploads), authUid || undefined);
        tenantId = authUid || (r && r.id);
      } catch (e) { if (e && e.exists && authUid) tenantId = authUid; else throw e; }
    }
  } catch (e) {
    console.error('[preagreement/convert] tenant bootstrap failed:', e.message);
    return { ok: false, error: 'tenant_bootstrap_failed' };
  }

  // ── 2. The contract, shaped exactly like portal.html's saveContract ──
  const m = pa.money || {}, le = pa.lease || {};
  const months = Math.max(1, Number(le.months) || 12);
  const rent = Number(m.rent) || 0;
  // instalment cadence (1|2|3|6|12 months) — the schedule generator and the
  // tenant portal both read it from the contract
  const installmentMonths = [1, 2, 3, 6, 12].includes(Number(m.installmentMonths)) ? Number(m.installmentMonths) : 1;
  const installmentAmount = Math.round((Number(m.installmentAmount) || rent * installmentMonths) * 100) / 100;
  // energy allowance collected with the rent (default) or settled apart
  const billEnergyCredit = m.billEnergyCredit !== false && Number(m.energyCredit) > 0;
  // IL TIPO NON PUÒ DIPENDERE DA CHI CHIAMA. La console lo manda esplicito,
  // ma la conversione AUTOMATICA (_auto.js — il caso normale quando
  // l'immobile è collegato) non lo mandava affatto: uno studente chiudeva il
  // deal da solo e il contratto nasceva Allegato B, in silenzio. Ora si legge
  // dalla proposta, che è dove l'operatore l'ha scritto; il parametro resta
  // come conferma esplicita, non come unica fonte.
  const cType = leaseType(type, le);
  const stud = (le.studenti && typeof le.studenti === 'object') ? le.studenti : {};
  const delegateOn = delegate === true;
  const dName = clip(delegateName, 120) || 'Valentino Egidi';
  const newToken = () => crypto.randomUUID();

  const contract = {
    propertyId: propId,
    // l'interno viaggia sul contratto: due stanze della stessa casa sono
    // due contratti legittimi SOLO se lo dichiarano (guardia sovrapposizioni)
    unit,
    tenantId,
    type: cType,
    startDate: le.startDate || null,
    endDate: le.endDate || null,
    rent,
    deposit: Number(m.deposit) || 0,
    depositMonths: Number(m.depositMonths) || 1,
    // LA VERITÀ SUL DEPOSITO: quanto è GIÀ incassato col pre-agreement
    // (dueAtSigning pagato via Stripe include depositAtSigning). Senza
    // questo campo la firma Magic Sign chiedeva il deposito PIENO mentre
    // esisteva anche la rata depbal_: tripla esposizione dello stesso
    // deposito. depositPaid solo quando non resta alcun saldo.
    depositAlreadyPaidEur: (pa.status === 'paid' && Number(m.depositAtSigning) > 0) ? Number(m.depositAtSigning) : 0,
    depositPaid: pa.status === 'paid' && Number(m.depositAtSigning) > 0 && !(Number(m.depositAtMoveIn) > 0),
    // La provvigione smette di sparire: viaggia sul contratto SOLO come
    // dato interno (fattura, recap, incassi). REGOLA DI BUSINESS: la fee
    // BOOM non compare MAI nel contratto di locazione stampato/firmato/
    // registrato (Allegato B/C, sign.html, fascicolo) — vive nel
    // pre-agreement (che il cliente sottoscrive) e nei gestionali interni.
    // Nessun generatore deve leggere questo campo per stamparlo sul PDF.
    agencyFee: (Number(m.feeTotal) > 0 || Number(m.fee) > 0) ? {
      totalEur: Number(m.feeTotal) || Number(m.fee) || 0,
      baseEur: Number(m.fee) || 0,
      vatPct: Number(m.feeVatPct) || 22,
      due: m.feeDue || 'move-in',
      mode: m.feeMode || 'pct',
      paidWithSigning: pa.status === 'paid' && m.feeDue === 'signing',
    } : null,
    accessoryCharges: Number(m.energyCredit) || 0,
    paymentMethod: 'bonifico bancario',
    paymentDay: 5,
    installmentMonths,
    installmentAmount,
    billEnergyCredit,
    canone: {
      monthly: rent,
      total: Math.round(rent * months * 100) / 100,
      // installments stays the MONTH count: portal.html validates
      // monthly × installments === total and offers a destructive auto-fix
      // when it doesn't. The cadence lives in its own fields.
      installments: months,
      installmentMonths,
      installmentAmount,
      paymentDay: 5,
      paymentMethod: 'bonifico bancario',
      cedolareSecca: true,
      oneriMode: 'tabella_allegato_d',
    },
    durata: { text: months + ' mesi', startDate: le.startDate || null, endDate: le.endDate || null },
    transitionalReason: le.reason || '',
    // Il documento che prova l'esigenza: se il cliente l'ha caricato sulla
    // proposta (kind:'extra') il contratto lo NOMINA invece di stampare
    // puntini — è lo stesso file che il Pack allega alla registrazione.
    transitionalDocs: uploads.some(u => u && u.kind === 'extra') ? (clip(pa.extraDoc, 120) || 'attestazione allegata alla proposta') : '',
    // I dati dello studente arrivano dalla proposta (console → lease.studenti)
    // e alimentano l'Allegato C. Su un transitorio restano vuoti: un dato
    // universitario su un contratto di lavoro sarebbe rumore sul documento.
    universityName: cType === 'studenti' ? (stud.universita || '') : '',
    courseName: cType === 'studenti' ? (stud.corsoStudi || '') : '',
    // I co-conduttori del PA sopravvivono con l'IDENTITÀ COMPLETA (prima
    // restavano solo i nomi concatenati): pack, PDF, scheda 360° e la
    // co-firma leggono da qui. La stringa cohabitants resta per i
    // generatori Allegato, ma ora porta anagrafica, non solo nomi.
    cohabitants: tenants.slice(1).filter(x => x && x.fullName).map(x =>
      [x.fullName, x.birthPlace ? 'nato/a a ' + x.birthPlace : '', x.dob ? 'il ' + x.dob : '',
       x.cf ? 'C.F. ' + String(x.cf).toUpperCase() : ''].filter(Boolean).join(', ')).join('; '),
    coTenants: tenants.slice(1).filter(x => x && x.fullName).map((x, i) => ({
      name: x.fullName, cf: String(x.cf || '').toUpperCase(), dob: x.dob || '',
      birthPlace: x.birthPlace || '', address: x.address || '', idDoc: x.idDoc || '', docType: x.idDocType || '',
      nationality: x.nationality || '', email: x.email || '', phone: x.phone || '',
      tenantIndex: i + 1, paSignedName: x.signName || x.typedSignature || x.signature || '',
    })),
    otherClauses: [
      ...(Array.isArray(pa.customClauses) ? pa.customClauses : []),
      ...(tenants.length > 1 ? [
        'I co-conduttori (' + tenants.slice(1).map(x => x.fullName).filter(Boolean).join(', ')
        + ') hanno sottoscritto la proposta accettata ' + (pa.ref || paId)
        + ' e si obbligano in solido con il conduttore per tutte le obbligazioni derivanti dal presente contratto.',
      ] : []),
    ].join('\n'),
    studenti: cType === 'studenti' ? {
      corsoStudi: stud.corsoStudi || '',
      universita: stud.universita || '',
      universitaIndirizzo: stud.universitaIndirizzo || '',
      tipoIscrizione: stud.tipoIscrizione || '',
      annoAccademico: stud.annoAccademico || '',
    } : null,
    notes: `Da pre-agreement ${pa.ref || paId} — accettato ${String(pa.acceptedAt || '').slice(0, 10)}${pa.paidAt ? ` · pagato €${pa.paidEur} il ${String(pa.paidAt).slice(0, 10)}` : ''}${uploads.length ? ` · ${uploads.length} documento/i d'identità allegati` : ''}.`,
    cadastral: '', energyClass: '',
    renditaCatastale: 0,
    cedolareSecca: 'si',
    requiresAsseverazione: true,
    linkedLeadId: '', linkedLeadSource: '', linkedViewingId: '',
    preAgreementId: paId,
    preAgreementRef: pa.ref || null,
    // kind viaggia col documento: 'extra' = attestazione dell'esigenza
    // (transitoria/studenti) — il Pack Registrazione la distingue dai
    // documenti d'identità. Prima si perdeva nella conversione.
    identityDocs: uploads.map(u => ({ url: u.url, name: u.name, tenantIndex: u.tenantIndex || 0, at: u.at, ...(u.kind === 'extra' ? { kind: 'extra' } : {}) })),
    status: 'active',
    signatureStatus: 'none',
    signingOrder: 'sequential',           // tenant first; landlord countersigns when ready
    // Landlord identity from the PA — magic-sign shows the real name even
    // when the portal property has no ownerId/users profile (owner-direct
    // signing is the default now).
    // Il nome del conduttore sta sul contratto (prima solo sul profilo
    // users): è una delle PARTI della foto delle condizioni approvate, e la
    // firma per mandato la confronta sul contratto, senza risalire la catena.
    tenantName: t.fullName || '',
    landlordName: (pa.landlord || {}).name || property.ownerName || '',
    landlordEmail: (pa.landlord || {}).email || null,
    landlordPhone: (pa.landlord || {}).phone || null,
    tenantSignToken: newToken(),
    landlordSignToken: newToken(),
    landlordDelegate: delegateOn ? {
      name: dName,
      onBehalfOf: (pa.landlord || {}).name || property.ownerName || '',
      basis: 'delega scritta del proprietario',
      basisKind: 'declared',   // base dichiarata dall'operatore (non un atto del proprietario)
      setAt: new Date().toISOString(),
      setBy: actor,
    } : null,
    // L'accettazione digitale della proposta viaggia sul contratto: e' la
    // firma del conduttore sulla Scheda di calcolo del canone (Allegato
    // 2/B) — il consenso della proposta la copre esplicitamente
    // (_consent.js) — e la base del mandato. Solo fatti: data, protocollo,
    // hash del testo accettato.
    paAcceptance: (pa.consent && pa.consent.at) ? {
      at: pa.consent.at,
      ref: pa.ref || null,
      hash: pa.consent.hash || null,
      schedaSigned: pa.consent.schedaSigned === true,
    } : null,
    tenantMandate: null,   // riempito sotto: l'impronta si calcola sul contratto INTERO
    paymentsGenerated: false,
    welcomeEmailSent: false,
    createdAt: new Date().toISOString(),
    createdBy: 'preagreement_convert:' + actor,
  };

  // IL MANDATO DEL CONDUTTORE — conferito sulla proposta (spunta a parte,
  // mai pre-selezionata), vale SOLO per questi termini: termsHash e' la
  // stessa impronta che magic-sign/submit ricalcola al momento della firma
  // (un canone o una data ritoccati dopo = 409 mandate_terms_changed, mai
  // una firma). Senza `pa.mandate.given` il contratto NON ha mandato e la
  // firma al posto del conduttore resta impossibile (403 mandate_missing).
  if (pa.mandate && pa.mandate.given === true) {
    contract.tenantMandate = tenantMandateFor(pa, paId, contract);
  }

  // (contractId: dichiarato sopra, prima del riconoscimento dell'orfana.)
  // Nella GARA fra due conversioni la seconda riceve 409 da fsCreate e
  // restituisce il contratto della prima, con i token firma intatti.

  // Il preflight ESCE QUI: stesso contratto, nessuna scrittura (né profilo,
  // né immobile, né contratto). La console lo chiama al cambio immobile
  // nel modale e prima di 🖊 su un deal ancora da convertire.
  if (dryRun) {
    let exists = false;
    try { exists = !!(await fsGet('contracts/' + contractId)); } catch (_) {}
    const landlord = { ...(await landlordCtxOf(property, contract)), name: contract.landlordName || undefined, email: contract.landlordEmail || undefined, phone: contract.landlordPhone || undefined };
    const tenantUser = tenantUserFromPa(t, uploads);
    const out = {
      ok: true, dryRun: true, contractId, propertyId: propId, exists,
      overlap: overlap || null,
      completeness: preflightOf({ contract, property, tenantUser, landlord }),
    };
    // LA BOZZA PRIMA DELLA CONVERSIONE (21/09/2026 — «scaricare il contratto
    // auto creato dalle cose del pre-agreement»): lo STESSO impaginato che
    // la conversione scriverebbe (buildContractPdfBytes, una copia), su
    // preagreements/<paId>/bozza-contratto.pdf, ricordato sulla proposta —
    // e nessun contratto, profilo o immobile scritto. La console la apre
    // prima di → Contratto; la pagina della proposta la mostra al cliente
    // accanto al mandato (lookup: solo a soldi ricevuti o dovuto zero).
    // Stesso hash = stessa bozza: non si ricarica.
    if (draftPdf === true) {
      try {
        const built = buildContractPdfBytes({ contractId, contract, property, tenant: tenantUser, landlord });
        if (pa.draftPdfUrl && pa.draftPdfHash === built.hash) {
          out.draftPdfUrl = pa.draftPdfUrl; out.draftPdfHash = built.hash; out.draftPdfAt = pa.draftPdfAt || null; out.draftPdfSame = true;
        } else {
          const url = await storageUpload(`preagreements/${paId}/bozza-contratto.pdf`, built.bytes, 'application/pdf');
          if (!url) throw new Error('storage_upload_failed');
          const at = new Date().toISOString();
          await fsPatch('preAgreements/' + paId, { draftPdfUrl: url, draftPdfHash: built.hash, draftPdfAt: at, draftPdfDots: (out.completeness && Array.isArray(out.completeness.dots)) ? out.completeness.dots.length : null });
          out.draftPdfUrl = url; out.draftPdfHash = built.hash; out.draftPdfAt = at; out.draftPdfSame = false;
        }
      } catch (e) {
        console.warn('[preagreement/convert] draft pdf:', e.message);
        out.draftPdfError = String(e.message || 'draft_failed').slice(0, 120);
      }
    }
    return out;
  }
  try {
    await fsCreate('contracts', contract, contractId);
  } catch (e) {
    if (e.exists) {
      try {
        const c = await fsGet('contracts/' + contractId);
        if (c) {
          // LA PROPOSTA ORFANA (13/09/2026, il caso Léa): il contratto
          // pa_<paId> esiste — firmato da entrambi il 14/08 — ma la
          // proposta non porta contractId, perché il back-link qui sotto
          // era fire-and-forget e si è perso dopo la risposta. Ogni volta
          // che si arrivava qui si restituivano i link SENZA riscrivere
          // il back-link: l'orfana restava orfana per sempre e la console
          // la mostrava «paid · → Contratto». Ora il ramo «esiste già»
          // ricuce la proposta al suo contratto, e lo ATTENDE.
          await backlinkPa({ paId, pa, contractId, tenantSignToken: c.tenantSignToken, landlordSignToken: c.landlordSignToken, delegated: !!(c.landlordDelegate && c.landlordDelegate.name), actor, propertyId: c.propertyId || propId });
          return {
            ok: true, already: true, contractId, tenantId: c.tenantId || null,
            tenantSignUrl: c.tenantSignToken ? `${BASE}/sign?sign=${c.tenantSignToken}` : null,
            landlordSignUrl: c.landlordSignToken ? `${BASE}/sign?sign=${c.landlordSignToken}` : null,
            delegate: c.landlordDelegate || null,
          };
        }
      } catch (_) { /* cade nel ramo errore sotto */ }
    }
    console.error('[preagreement/convert] contract create failed:', e.message);
    return { ok: false, error: 'contract_create_failed' };
  }

  // Deposit balance as a REAL installment: when the PA split the deposit
  // (n% at signing, rest upon move-in), the remainder becomes a payments
  // doc due on move-in day — payable by card from /casa (Canone via BOOM)
  // or by transfer (bank reconciliation matches it like any rent). The
  // journey's T-7 email reminds the tenant automatically.
  const depBal = Number(m.depositAtMoveIn) || 0;
  if (depBal > 0 && le.startDate) {
    try {
      await fsCreate('payments', {
        type: 'deposit-balance',
        contractId, tenantId, propertyId: propId,
        amount: depBal, month: 'saldo deposito',
        dueDate: le.startDate, status: 'pending',
        createdAt: new Date().toISOString(), createdBy: 'preagreement_convert',
      }, 'depbal_' + contractId);
    } catch (e) { if (!e.exists) console.error('[preagreement/convert] depbal:', e.message); }
  }

  // Schede cliente dei CO-CONDUTTORI (best-effort, dedupe per email):
  // l'anagrafica raccolta dal PA diventa un profilo vero anche per loro.
  for (let i = 0; i < tenants.slice(1).length; i++) {
    const x = tenants[i + 1];
    if (!x || !x.fullName) continue;
    try {
      if (x.email) {
        const dup = await fsList('users', { filter: { field: 'email', op: 'EQUAL', value: x.email }, limit: 1 });
        if (dup && dup[0]) continue;
      }
      await fsCreate('users', {
        role: 'tenant', name: x.fullName, email: x.email || '', phone: x.phone || '',
        cf: String(x.cf || '').toUpperCase(), dob: x.dob || '', pob: x.birthPlace || '',
        address: x.address || '', docNum: x.idDoc || '', nationality: x.nationality || '',
        identityDocs: uploads.filter(u => (u.tenantIndex || 0) === i + 1).map(u => ({ url: u.url, name: u.name, at: u.at })),
        notes: 'Co-conduttore — PA ' + (pa.ref || paId),
        createdBy: 'preagreement_convert', createdAt: new Date().toISOString(),
      });
    } catch (e) { console.warn('[preagreement/convert] co-tenant user:', e.message); }
  }

  // Il mandato ha un documento suo (best-effort): il PDF della proposta
  // accettata — che stampa la sezione "Mandate to sign" col testo firmato —
  // salvato accanto al contratto, cosi' il Pack Registrazione e l'archivio
  // lo trovano senza risalire alla proposta.
  if (contract.tenantMandate) {
    try {
      const buf = await buildPaPdf({ ...pa, id: paId, ref: pa.ref || paId });
      if (buf) {
        const url = await storageUpload(`contracts/${contractId}/mandato-conduttore.pdf`, buf, 'application/pdf');
        if (url) {
          contract.tenantMandate.docUrl = url;
          // la mappa si riscrive INTERA (fsPatch non conosce i percorsi a
          // punti): il contratto e' appena nato, nessuno l'ha toccata.
          await fsPatch('contracts/' + contractId, { tenantMandate: contract.tenantMandate }).catch(() => {});
        }
      }
    } catch (e) { console.warn('[preagreement/convert] mandato pdf:', e.message); }
  }

  // Back-link on the PA — ATTESO, non best-effort: senza contractId la
  // console non sa che il contratto esiste (il caso Léa qui sopra). Sign
  // URLs are stored here too so the console can offer 🖊 Magic Sign /
  // WhatsApp share without extra reads (preAgreements is admin-only).
  await backlinkPa({ paId, pa, contractId, tenantSignToken: contract.tenantSignToken, landlordSignToken: contract.landlordSignToken, delegated: delegateOn, actor, propertyId: propId });
  await logActivity('preagreement_converted', 'contract',
    { paId, ref: pa.ref || '', contractId, tenant: t.fullName, delegate: delegateOn, auto: actor === 'auto' }, actor)
    .catch(() => {});
  // Il PDF del contratto nasce QUI, server-side (js/contract-pdf.js — lo
  // STESSO impaginato Allegato B/C del portal, jsPDF su Node): sign.html
  // mostra "View full contract PDF" PRIMA della firma e _finalize.js può
  // costruire il contratto firmato in allegato anche sul rail PA. Il
  // promemoria Telegram "genera dal portal" resta solo come fallback se la
  // generazione fallisce — e comunque send-sign e la prima apertura del
  // link riprovano da soli.
  let pdfUrl = null;
  try {
    pdfUrl = await ensureContractPdf(contractId, { ...contract });
  } catch (e) { console.error('[preagreement/convert] contract pdf:', e.message); }
  if (!pdfUrl) {
    await fsCreate('agentNotifications', {
      type: 'contract.pdf_missing',
      summary: `📄 Contratto ${contractId} creato dal pre-agreement: PDF non generato automaticamente — genera dal portal (🔄 Rigenera PDF) o ripremi 🖊 Magic Sign`,
      priority: 'low', ref: { collection: 'contracts', id: contractId },
      dedupKey: 'pdf-missing-' + contractId, status: 'pending',
      actor: 'preagreement-convert', createdAt: new Date().toISOString(), attempts: 0,
    }).catch(() => {});
  }

  return {
    ok: true, contractId, tenantId,
    propertyId: propId,
    ...(propertyCreated ? { propertyCreated: true } : {}),
    ...(overlap ? { overlapForced: overlap } : {}),
    tenantSignUrl: `${BASE}/sign?sign=${contract.tenantSignToken}`,
    landlordSignUrl: `${BASE}/sign?sign=${contract.landlordSignToken}`,
    delegate: contract.landlordDelegate,
    mandate: !!contract.tenantMandate,
    mandateTermsMatch: contract.tenantMandate ? contract.tenantMandate.termsMatch : null,
  };
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin', 'owner', 'landlord']);
  if (!auth) return;

  const b = await readJson(req);
  const paId = clip(b && b.id, 80);
  if (!paId) return res.status(400).json({ ok: false, error: 'id_required' });

  let pa;
  try { pa = await fsGet('preAgreements/' + paId); }
  catch (e) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  if (!pa) return res.status(404).json({ ok: false, error: 'not_found' });

  const out = await convertPaToContract({
    pa, paId,
    propertyId: clip(b.propertyId, 80),
    delegate: b.delegate === true,
    delegateName: b.delegateName,
    type: b.type,
    actor: auth.email || auth.uid,
    createProperty: b.createProperty === true,
    force: b.force === true,
    dryRun: b.dryRun === true,
    draftPdf: b.draftPdf === true,
  });
  if (!out.ok) {
    const code = out.error === 'not_accepted_yet' ? 409
      : out.error === 'no_property' ? 400
      : out.error === 'property_not_found' ? 404
      : out.error === 'overlap' ? 409
      : out.error === 'no_tenant_identity' ? 409 : 500;
    return res.status(code).json({ ok: false, error: out.error, status: pa.status, ...(out.overlap ? { overlap: out.overlap } : {}), ...(out.canCreate != null ? { canCreate: out.canCreate } : {}) });
  }
  return res.status(200).json(out);
}
