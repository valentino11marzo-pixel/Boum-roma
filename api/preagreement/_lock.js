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
// fsCommit con precondizioni sulla versione di TUTTI i mesi: anche il
// subentro a una presa scaduta è atomico. Errori di lettura fermano il
// pagamento; cleanup e spazzino non cancellano una presa subentrata.
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
import { fsGetVersioned, fsCommit, fsDelete, fsList } from '../homie/_lib.js';
import { paidOnRecord } from './_state.js';

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
export async function acquireLock({ pa, paId, firm = false, allow = [], renew = false, proposalVersion = null }) {
  const base = propertyKey(pa), key = lockKey(pa), months = leaseMonths(pa.lease);
  if (!key || !months.length) return { ok: false, reason: 'unlockable' };
  const unit = unitOf(pa), allowed = new Set((Array.isArray(allow) ? allow : []).map(String));
  for (let attempt = 0; attempt < 3; attempt++) {
    const now = new Date(), snapshots = await Promise.all(months.map(m => fsGetVersioned('propertyLocks/' + lockId(key, m))));
    const proposalGuards = new Map();
    for (let i = 0; i < snapshots.length; i++) {
      const held = snapshots[i]?.data;
      if (!held || String(held.paId) === String(paId)) continue;
      const effective = await effectiveHolding(held, now.getTime(), proposalGuards);
      if (effective) return heldBy(effective, months[i], now, { unit: normUnit(held.unit) || unit || null, level: unit ? 'unit' : 'whole', sameUnit: !!unit });
    }
    const entries = months.map((month, i) => {
      const before = snapshots[i], owned = before && String(before.data.paId) === String(paId);
      const fields = { paId:String(paId), key, baseKey:base, unit:unit || null, month,
        ref:pa.tenant?.fullName || null, address:pa.property?.address || null,
        heldAt:owned && !renew ? before.data.heldAt : now.toISOString(), firm:!!firm || !!(owned && before.data.firm) };
      return { id:lockId(key,month), before, fields };
    });
    const guards = [...proposalGuards].map(([id, snapshot]) => snapshot
      ? {docPath:'preAgreements/'+id, fields:{}, precondition:{updateTime:snapshot.updateTime}}
      : {docPath:'preAgreements/'+id, assertAbsent:true});
    if (proposalVersion) guards.push({docPath:'preAgreements/'+paId, fields:{}, precondition:{updateTime:proposalVersion}});
    let commit;
    try {
      commit = await fsCommit([...entries.map(e => ({docPath:'propertyLocks/'+e.id,fields:e.fields,
        precondition:e.before ? {updateTime:e.before.updateTime} : {exists:false}})), ...guards]);
    } catch (error) { if (!error.conflict || proposalVersion) throw error; continue; }
    entries.forEach((e,i) => { e.updateTime = commit.writeResults[i].updateTime; });
    try {
      const conflict = unit ? await wholeHolding({base,months,paId,unit,allowed,now}) : await unitHolding({base,months,paId,now});
      if (conflict) { await rollback(entries); return conflict; }
    } catch (error) { await rollback(entries); throw error; }
    return {ok:true,key,months,unit:unit || null,
      guards:entries.map(e=>({docPath:'propertyLocks/'+e.id,fields:{},precondition:{updateTime:e.updateTime}})),
      proposalVersion:proposalVersion ? commit.writeResults[entries.length + guards.length - 1].updateTime : null};
  }
  throw new Error('Property lock changed concurrently');
}

// A paid proposal cannot lose protection because its webhook has not yet
// firmed the lock. An unreadable owner is unknown, never an expired vacancy.
async function effectiveHolding(held, now, guards) {
  if (lockLive(held, now)) return held;
  if (!held.paId) throw new Error('Property lock owner unavailable');
  const snapshot = await fsGetVersioned('preAgreements/' + held.paId);
  if (guards) guards.set(String(held.paId), snapshot);
  return paidOnRecord(snapshot?.data) ? {...held,firm:true} : null;
}
async function rollback(entries) {
  for (const entry of entries) {
    try {
      if (!entry.before) await fsDelete('propertyLocks/' + entry.id, {updateTime:entry.updateTime});
      else {
        const fields = Object.fromEntries(Object.keys(entry.fields).map(key=>[key,entry.before.data[key] ?? null]));
        await fsCommit([{docPath:'propertyLocks/'+entry.id,fields,precondition:{updateTime:entry.updateTime}}]);
      }
    } catch (error) { if (!error.conflict) throw error; }
  }
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
    const snapshot = await fsGetVersioned('propertyLocks/' + lockId(base, m));
    let held = snapshot?.data;
    if (!held || String(held.paId) === String(paId)) continue;
    held = await effectiveHolding(held, now.getTime());
    if (!held) continue;
    let theirs = normUnit(held.unit);
    if (!theirs && held.paId) {
      if (!units.has(held.paId)) {
        const hp = await fsGetVersioned('preAgreements/' + held.paId);
        units.set(held.paId, unitOf(hp?.data));
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
  if (rows.length >= 400) throw new Error('Property lock coverage incomplete');
  const want = new Set(months);
  for (const lk of rows || []) {
    if (!lk || !normUnit(lk.unit)) continue;                         // la casa intera la copre già l'id
    if (String(lk.paId) === String(paId) || !want.has(lk.month)) continue;
    const held = await effectiveHolding(lk, now.getTime());
    if (!held) continue;
    return heldBy(held, lk.month, now, { unit: normUnit(lk.unit), level: 'unit' });
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
  for (let attempt=0; attempt<3; attempt++) {
    const entries=[];
    for (const month of leaseMonths(pa.lease)) {
      for (const id of candidateIds(pa,month)) {
        const snapshot=await fsGetVersioned('propertyLocks/'+id);
        if (snapshot && String(snapshot.data.paId)===String(paId)) { entries.push({id,snapshot}); break; }
      }
    }
    if (!entries.length) return 0;
    try { await fsCommit(entries.map(e=>({docPath:'propertyLocks/'+e.id,fields:{firm:true,firmAt:new Date().toISOString()},precondition:{updateTime:e.snapshot.updateTime}}))); return entries.length; }
    catch(error) { if(!error.conflict)throw error; }
  }
  throw new Error('Property lock changed concurrently');
}

export async function releaseLock({ pa, paId }) {
  let n=0;
  for (const month of leaseMonths(pa?.lease)) for (const id of candidateIds(pa,month)) {
    const snapshot=await fsGetVersioned('propertyLocks/'+id);
    if (!snapshot || String(snapshot.data.paId)!==String(paId)) continue;
    try { await fsDelete('propertyLocks/'+id,{updateTime:snapshot.updateTime}); n++; }
    catch(error) { if(!error.conflict)throw error; }
  }
  return n;
}

// Re-read each candidate before deleting it. Read failures preserve ownership;
// the caller receives an explicit error count rather than fictitious vacancy.
export async function sweepLocks({limit=400}={}) {
  const out={checked:0,released:0,errors:0};
  const locks=await fsList('propertyLocks',{limit});
  for (const row of locks) {
    out.checked++;
    try {
      const snapshot=await fsGetVersioned('propertyLocks/'+row.id);
      if (!snapshot)continue;
      const held=snapshot.data, pa=held.paId ? await fsGetVersioned('preAgreements/'+held.paId) : null;
      if (paidOnRecord(pa?.data)) continue;
      if (lockLive(held) && ['accepted','paid'].includes(String(pa?.data.status))) continue;
      await fsDelete('propertyLocks/'+row.id,{updateTime:snapshot.updateTime,guards:held.paId ? [{docPath:'preAgreements/'+held.paId,...(pa ? {updateTime:pa.updateTime} : {exists:false})}] : []}); out.released++;
    } catch(error) { if(!error.conflict)out.errors++; }
  }
  return out;
}
