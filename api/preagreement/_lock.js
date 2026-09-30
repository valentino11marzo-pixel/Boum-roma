// api/preagreement/_lock.js
// IL LUCCHETTO SULL'IMMOBILE — impedisce che due candidati chiudano lo stesso
// appartamento per lo stesso periodo.
//
// IL PROBLEMA. submit.js controllava solo che QUELLA proposta non fosse già
// accettata (idempotenza sul doppio tocco). Nessuno guardava le ALTRE
// proposte: mandare lo stesso appartamento a due candidati seri è la prassi
// giusta, ma entrambi potevano accettare, entrambi ricevere la richiesta
// Stripe, entrambi pagare — e con autoConvert attivo nascevano due contratti
// sullo stesso immobile. Con un deposito da restituire e una telefonata da
// fare.
//
// COME. Un documento di lucchetto PER OGNI MESE della locazione, a id
// deterministico: `propertyLocks/<immobile>__<YYYY-MM>`. Creato con
// fsCreate(..., docId), che su documento esistente riceve 409 da Firestore —
// quindi è un compare-and-set atomico vero, non un "leggi poi scrivi" che due
// tocchi nello stesso secondo attraversano entrambi.
//
// Perché un doc per mese e non uno per immobile: due proposte sullo stesso
// appartamento per periodi che non si toccano sono LEGITTIME (libero da
// settembre / libero da gennaio). Bucketando per mese, la sovrapposizione si
// rileva da sé — due locazioni che si accavallano condividono almeno un mese —
// e due periodi disgiunti non si disturbano.
//
// SCADENZA. Il lucchetto lo prende l'ACCETTAZIONE, ma se c'è un dovuto alla
// firma e non arriva entro HOLD_HOURS, scade: una riserva che non paga non
// congela l'immobile per sempre. Quando il pagamento arriva (o se non c'è
// nulla da pagare) il lucchetto diventa definitivo.

import crypto from 'node:crypto';
import { fsCreate, fsGet, fsPatch, fsDelete, fsList } from '../homie/_lib.js';

export const HOLD_HOURS = 48;

// ─── La chiave dell'immobile ──────────────────────────────────────────────
// A scaletta, perché il collegamento al portale è opzionale: una proposta
// compilata a mano non ha né propertyId né listingId e resterebbe senza
// protezione. L'indirizzo normalizzato è l'ultima rete — imperfetta (un
// indirizzo scritto in due modi diversi non collide) ma meglio di niente.
export function propertyKey(pa) {
  const p = pa || {};
  if (p.propertyId) return 'p_' + String(p.propertyId).replace(/[^\w-]/g, '');
  if (p.listingId) return 'l_' + String(p.listingId).replace(/[^\w-]/g, '');
  const addr = String((p.property || {}).address || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // via cavòur → via cavour
    .replace(/\b(via|viale|piazza|piazzale|largo|corso|vicolo|lungotevere)\b/g, '')
    .replace(/\broma\b|\brm\b|\bitalia\b/g, '')
    .replace(/[^a-z0-9]/g, '');
  if (!addr) return null;                                // niente su cui bloccare
  return 'a_' + crypto.createHash('sha1').update(addr).digest('hex').slice(0, 16);
}

// ─── L'interno (30/09/2026 — «non è la stessa unità») ─────────────────────
// La chiave qui sopra non guardava MAI l'interno: due stanze della stessa
// casa (stesso propertyId, o stesso indirizzo con l'interno nel campo a
// parte) collidevano sempre, e «✅ Sblocca la riserva» rileggeva lo stesso
// lucchetto — cioè non poteva sbloccare mai. La regola è la stessa di
// convert.overlapConflict: due interni DICHIARATI e diversi convivono; lo
// stesso interno no; un interno vuoto (la casa intera) non esclude niente.
//
// Come, restando atomici: un interno dichiarato blocca su una chiave SUA
// (`<immobile>~u<interno>__<mese>`), così due stanze non si toccano mai a
// livello di id. Il confronto casa-intera ⇄ stanza è un secondo controllo,
// fatto DOPO aver preso i propri mesi (prima scrivo, poi guardo): due
// accettazioni simultanee si vedono a vicenda, al peggio si fermano
// entrambe — mai passano entrambe.
export const normUnit = (v) => String(v == null ? '' : v).trim().toLowerCase()
  .replace(/^int(erno)?\.?\s*/, '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/g, '')
  .slice(0, 24);
export const unitOf = (pa) => normUnit(((pa || {}).property || {}).unit);

// La chiave su cui QUESTA proposta prende i suoi mesi.
export function lockKey(pa) {
  const base = propertyKey(pa);
  if (!base) return null;
  const u = unitOf(pa);
  return u ? `${base}~u${u}` : base;
}

// ─── I mesi coperti dalla locazione ───────────────────────────────────────
// Cronologici: l'ordine conta, perché al primo mese occupato si abortisce e si
// restituisce quel che si era già preso.
export function leaseMonths(lease) {
  const l = lease || {};
  const start = String(l.startDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return [];
  const end = /^\d{4}-\d{2}-\d{2}$/.test(String(l.endDate || '').slice(0, 10))
    ? String(l.endDate).slice(0, 10)
    : null;
  const months = Math.max(1, Math.min(60, Number(l.months) || 12));
  const s = new Date(start + 'T00:00:00Z');
  const e = end ? new Date(end + 'T00:00:00Z')
                : new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + months, s.getUTCDate()));
  const out = [];
  const cur = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1));
  while (cur <= e && out.length < 72) {
    out.push(cur.toISOString().slice(0, 7));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

export const lockId = (key, month) => `${key}__${month}`;

// Un lucchetto è ancora valido? Definitivo → sempre. In attesa di pagamento →
// solo entro la finestra.
export function lockLive(lock, now = Date.now()) {
  if (!lock) return false;
  if (lock.firm) return true;
  const at = Date.parse(lock.heldAt || '');
  if (!isFinite(at)) return true;               // data illeggibile: non rischiamo
  return now - at < HOLD_HOURS * 3600 * 1000;
}

// ─── Acquisizione ─────────────────────────────────────────────────────────
// { ok:true, key, months }                          → l'immobile è tuo
// { ok:false, reason:'held', by, byRef, until }      → l'ha già un altro
// { ok:false, reason:'unlockable' }                  → niente su cui bloccare
//                                                      (nessun id, nessun indirizzo)
//
// `allow` = id di proposte che l'OPERATORE ha dichiarato «non la stessa
// unità» (resolve.js, admin). Vale SOLO nel confronto casa-intera ⇄ stanza e
// SOLO contro chi non ha dichiarato l'interno: due interni dichiarati uguali
// restano un conflitto, qualunque cosa si dichiari.
export async function acquireLock({ pa, paId, firm = false, allow = [] }) {
  const base = propertyKey(pa);
  const key = lockKey(pa);
  if (!key) return { ok: false, reason: 'unlockable' };
  const months = leaseMonths(pa.lease);
  if (!months.length) return { ok: false, reason: 'unlockable' };
  const unit = unitOf(pa);
  const allowed = new Set((Array.isArray(allow) ? allow : []).map(String));

  const now = new Date();
  const mine = {
    paId: String(paId), key, baseKey: base,
    unit: unit || null,
    ref: (pa.tenant || {}).fullName || null,
    heldAt: now.toISOString(),
    firm: !!firm,
    address: ((pa.property || {}).address) || null,
  };

  const taken = [];
  for (const m of months) {
    const id = lockId(key, m);
    try {
      await fsCreate('propertyLocks', { ...mine, month: m }, id);
      taken.push(id);
    } catch (e) {
      if (!e || !e.exists) {                     // errore vero: si rilascia e si alza
        await releaseLocks(taken);
        throw e;
      }
      // Esiste: di chi è, ed è ancora valido?
      let held = null;
      try { held = await fsGet('propertyLocks/' + id); } catch (_) {}
      if (held && String(held.paId) === String(paId)) { taken.push(id); continue; }  // già nostro
      if (held && lockLive(held)) {
        await releaseLocks(taken);
        return heldBy(held, m, now, { unit: normUnit(held.unit) || unit || null, level: unit ? 'unit' : 'whole', sameUnit: !!unit });
      }
      // Scaduto (riserva che non ha pagato): lo si prende sovrascrivendo.
      try { await fsPatch('propertyLocks/' + id, { ...mine, month: m }); taken.push(id); }
      catch (err) { await releaseLocks(taken); throw err; }
    }
  }

  // ── Il secondo controllo: casa intera ⇄ stanza ─────────────────────────
  let conflict = null;
  try {
    conflict = unit
      ? await wholeHolding({ base, months, paId, unit, allowed, now })
      : await unitHolding({ base, months, paId, now });
  } catch (e) {
    // Il controllo incrociato non ha potuto leggere: i propri mesi sono presi
    // e il confronto stessa-chiave (quello che conta di più) è già passato.
    // Si registra, non si blocca una chiusura legittima.
    console.error('[pa/lock] controllo incrociato non verificabile:', e.message);
  }
  if (conflict) { await releaseLocks(taken); return conflict; }
  return { ok: true, key, months, unit: unit || null };
}

function heldBy(held, month, now, extra = {}) {
  return {
    ok: false, reason: 'held',
    by: held.paId || null, byRef: held.ref || null,
    month,
    until: held.firm ? null
      : new Date(Date.parse(held.heldAt || now.toISOString()) + HOLD_HOURS * 3600 * 1000).toISOString(),
    ...extra,
  };
}

// Io ho un interno: c'è una presa sulla CASA INTERA (chiave senza interno)
// che copre uno dei miei mesi? Le prese nate prima del 30/09 stanno tutte
// lì, anche quelle di proposte che l'interno ce l'hanno: per loro l'interno
// si legge dalla proposta che tiene. Interno dichiarato e diverso → convivono.
async function wholeHolding({ base, months, paId, unit, allowed, now }) {
  const units = new Map();
  for (const m of months) {
    let held = null;
    try { held = await fsGet('propertyLocks/' + lockId(base, m)); } catch (_) { held = null; }
    if (!held || String(held.paId) === String(paId) || !lockLive(held, now.getTime())) continue;
    let theirs = normUnit(held.unit);
    if (!theirs && held.paId) {
      if (!units.has(held.paId)) {
        let hp = null;
        try { hp = await fsGet('preAgreements/' + held.paId); } catch (_) {}
        units.set(held.paId, unitOf(hp));
      }
      theirs = units.get(held.paId);
    }
    if (theirs && theirs !== unit) continue;                         // due interni dichiarati, diversi
    if (!theirs && allowed.has(String(held.paId))) continue;          // l'operatore l'ha dichiarato
    return heldBy(held, m, now, { unit: theirs || null, level: 'whole', sameUnit: !!theirs });
  }
  return null;
}

// Io sono la casa intera: qualcuno tiene una STANZA per uno dei miei mesi?
async function unitHolding({ base, months, paId, now }) {
  const rows = await fsList('propertyLocks', { filter: { field: 'baseKey', op: 'EQUAL', value: base }, limit: 400 });
  const want = new Set(months);
  for (const lk of rows || []) {
    if (!lk || !normUnit(lk.unit)) continue;                         // la casa intera la copre già l'id
    if (String(lk.paId) === String(paId) || !want.has(lk.month)) continue;
    if (!lockLive(lk, now.getTime())) continue;
    return heldBy(lk, lk.month, now, { unit: normUnit(lk.unit), level: 'unit' });
  }
  return null;
}

// Gli id che questa proposta può tenere per un mese: la sua chiave e — se
// l'interno è stato dichiarato dopo la presa — la chiave della casa intera.
function candidateIds(pa, month) {
  const base = propertyKey(pa), key = lockKey(pa);
  if (!key) return [];
  return key === base ? [lockId(key, month)] : [lockId(key, month), lockId(base, month)];
}

// Il pagamento è arrivato (o non c'era nulla da pagare): il lucchetto non
// scade più.
export async function confirmLock({ pa, paId }) {
  if (!lockKey(pa)) return 0;
  let n = 0;
  for (const m of leaseMonths(pa.lease)) {
    for (const id of candidateIds(pa, m)) {
      try {
        const held = await fsGet('propertyLocks/' + id);
        if (held && String(held.paId) === String(paId)) {
          await fsPatch('propertyLocks/' + id, { firm: true, firmAt: new Date().toISOString() });
          n++;
          break;
        }
      } catch (_) { /* best-effort: un lucchetto non confermato scade, non rompe */ }
    }
  }
  return n;
}

// Revoca / annullamento: l'immobile torna disponibile.
export async function releaseLock({ pa, paId }) {
  if (!lockKey(pa)) return 0;
  const ids = [];
  for (const m of leaseMonths(pa.lease)) {
    for (const id of candidateIds(pa, m)) {
      try {
        const held = await fsGet('propertyLocks/' + id);
        if (held && String(held.paId) === String(paId)) ids.push(id);
      } catch (_) {}
    }
  }
  return releaseLocks(ids);
}

// ─── Lo spazzino ──────────────────────────────────────────────────────────
// La console revoca una proposta con una scrittura client-side su Firestore:
// nessun endpoint da agganciare, quindi il lucchetto resterebbe appeso e
// l'appartamento congelato. Questa passata gira dentro reminder-cron e libera
// tutto ciò che non ha più diritto di tenere l'immobile — comprese le
// modifiche fatte a mano sul database.
//
// Rilascia quando: la proposta non esiste più · è stata revocata · è tornata
// in bozza/inviata (l'accettazione è stata annullata) · oppure è una presa non
// confermata più vecchia della finestra.
export async function sweepLocks({ limit = 400 } = {}) {
  const out = { checked: 0, released: 0 };
  let locks = [];
  try { locks = await fsList('propertyLocks', { limit }); } catch (e) {
    console.error('[pa/lock] sweep list:', e.message);
    return out;
  }
  const paCache = new Map();
  const now = Date.now();
  for (const lk of locks || []) {
    out.checked++;
    const keep = await (async () => {
      if (!lk.paId) return false;
      if (!lock_alive_shape(lk, now)) return false;
      if (!paCache.has(lk.paId)) {
        let pa = null;
        try { pa = await fsGet('preAgreements/' + lk.paId); } catch (_) {}
        paCache.set(lk.paId, pa);
      }
      const pa = paCache.get(lk.paId);
      if (!pa) return false;                                   // proposta sparita
      return ['accepted', 'paid'].includes(String(pa.status));  // solo chi ha chiuso tiene
    })();
    if (!keep) {
      try { await fsDelete('propertyLocks/' + lk.id); out.released++; } catch (_) {}
    }
  }
  return out;
}
// Stessa regola di lockLive, ma su un documento già letto dalla lista.
const lock_alive_shape = (lk, now) => lockLive(lk, now);

async function releaseLocks(ids) {
  let n = 0;
  for (const id of ids || []) {
    try { await fsDelete('propertyLocks/' + id); n++; } catch (_) {}
  }
  return n;
}
