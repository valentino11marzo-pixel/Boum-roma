// api/sign/_tokens.js
// LE CHIAVI DI FIRMA, FUORI DAL CONTRATTO (1/10/2026).
//
// Il difetto: `contracts/{id}` portava `tenantSignToken` e `landlordSignToken`
// in chiaro. Le rules fanno leggere il contratto all'inquilino (tenantId) e
// al proprietario dell'immobile (ownsProperty), e Firestore non sa nascondere
// un CAMPO: chi legge il documento li riceve tutti e due. /casa lo legge
// davvero, quindi l'inquilino aveva in mano `/sign?sign=<landlordSignToken>`
// — e a lato conduttori completo submit accettava quella firma come del
// locatore. Il proprietario, al contrario, leggeva il link dell'inquilino.
// Il certificato avrebbe registrato IP e dispositivo, ma l'atto restava falso.
//
// Ora i due token stanno in `signTokens/{contractId}` = { contractId, tenant,
// landlord }, admin-only nelle rules: nessuna pagina di inquilino o
// proprietario può leggerlo. Restano token CASUALI per contratto (non derivati
// da HOMIE_SECRET come cosign/scheda): quel segreto vive anche sul Mac di
// Homie, e firmare come una parte principale non deve dipendere da lui.
// Il formato del link non cambia: i link già nelle email continuano a valere.
//
// Transizione: un contratto nato prima porta ancora i campi in chiaro. La
// lettura li accetta (findSignTokenHolder, ramo legacy) finché la migrazione
// (`migrateLegacySignTokens`, ogni ora dal reminder-cron + l'endpoint admin
// /api/sign/links op:'migrate') non li sposta qui e li cancella dal
// contratto. Un token RUOTATO nel deposito revoca quello vecchio rimasto sul
// contratto: il ramo legacy controlla prima il deposito.

import crypto from 'node:crypto';
import { fsGet, fsList, fsCreate, fsCommit, fsGetVersioned, getAdminToken, FS_BASE } from '../homie/_lib.js';

export const TOKEN_COLLECTION = 'signTokens';
export const ROLES = ['tenant', 'landlord'];
// I nomi dei campi in chiaro che il contratto NON deve più portare. Le rules
// li rifiutano in scrittura (aggiunta o modifica; la cancellazione passa).
export const LEGACY_FIELDS = { tenant: 'tenantSignToken', landlord: 'landlordSignToken' };
const BASE = 'https://www.boomrome.com';

export const newSignToken = () => crypto.randomUUID();
export const isSignToken = (v) => typeof v === 'string' && v.length >= 8;
const signedOf = (c, role) => role === 'tenant' ? !!(c && c.tenantSignature) : !!(c && c.landlordSignature);

export function signUrl(token, { delegate = false, base = BASE } = {}) {
  if (!isSignToken(token)) return null;
  return `${base}/sign?sign=${encodeURIComponent(token)}${delegate ? '&delegate=1' : ''}`;
}

// Una copia del contratto senza i token in chiaro: per chi copia un contratto
// in un altro documento o in una risposta.
export function stripSignTokens(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  for (const f of Object.values(LEGACY_FIELDS)) delete out[f];
  return out;
}

async function contractOf(contractId, contract) {
  if (contract !== undefined) return contract;
  return fsGet('contracts/' + contractId);
}

// I token di un contratto: prima il deposito, poi (transizione) il campo in
// chiaro ancora sul contratto. Non conia nulla. `contract` evita una lettura
// quando il chiamante l'ha già in mano; undefined = lo legge.
export async function readSignTokens(contractId, contract) {
  if (!contractId) return { tenant: null, landlord: null };
  const s = (await fsGet(`${TOKEN_COLLECTION}/${contractId}`)) || {};
  const c = (await contractOf(contractId, contract)) || {};
  const out = {};
  for (const role of ROLES) {
    out[role] = isSignToken(s[role]) ? s[role]
      : isSignToken(c[LEGACY_FIELDS[role]]) ? c[LEGACY_FIELDS[role]] : null;
  }
  return out;
}

// I token di un contratto, creati dove mancano. Un token in chiaro rimasto
// sul contratto si SPOSTA (stesso valore: il link già spedito resta valido);
// uno mancante si conia solo per una parte che non ha ancora firmato e che è
// fra `mint` (default: entrambe). Scrittura sotto precondizione: due chiamate
// concorrenti non coniano due token diversi per la stessa parte — la seconda
// rilegge e usa quello della prima.
export async function ensureSignTokens(contractId, contract, { mint = ROLES } = {}) {
  if (!contractId) throw new Error('contractId_required');
  const c = await contractOf(contractId, contract);
  if (!c) throw new Error('contract_not_found');
  const path = `${TOKEN_COLLECTION}/${contractId}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await fsGetVersioned(path);
    const s = (cur && cur.data) || {};
    const want = {}, fields = {};
    for (const role of ROLES) {
      if (isSignToken(s[role])) { want[role] = s[role]; continue; }
      const legacy = c[LEGACY_FIELDS[role]];
      if (isSignToken(legacy)) { want[role] = fields[role] = legacy; continue; }
      if (mint.includes(role) && !signedOf(c, role)) { want[role] = fields[role] = newSignToken(); continue; }
      want[role] = null;
    }
    if (!Object.keys(fields).length) return want;
    const nowISO = new Date().toISOString();
    fields.contractId = contractId;
    fields.updatedAt = nowISO;
    try {
      if (!cur) await fsCreate(TOKEN_COLLECTION, { ...fields, createdAt: nowISO }, contractId);
      else await fsCommit([{ docPath: path, fields, precondition: { updateTime: cur.updateTime } }]);
      return want;
    } catch (e) {
      if (e && (e.exists || e.conflict)) continue;   // qualcuno ha scritto nel mezzo: rileggi
      throw e;
    }
  }
  throw new Error('sign_tokens_contention');
}

// Chi tiene questo token? → { contractId, role, source, contract? } | null.
// Ambiguo (due documenti con lo stesso token) = rifiutato, come prima.
export async function findSignTokenHolder(token) {
  if (!isSignToken(token)) return null;
  for (const role of ROLES) {
    const hits = await fsList(TOKEN_COLLECTION, { filter: { field: role, op: 'EQUAL', value: token }, limit: 2 });
    if (hits.length > 1) return null;
    if (hits.length === 1) return { contractId: hits[0].id, role, source: 'store' };
  }
  // Transizione: il token ancora in chiaro sul contratto.
  for (const role of ROLES) {
    const hits = await fsList('contracts', { filter: { field: LEGACY_FIELDS[role], op: 'EQUAL', value: token }, limit: 2 });
    if (hits.length > 1) return null;
    if (hits.length === 1) {
      const c = hits[0];
      // Un token ruotato nel deposito revoca quello in chiaro. Se il deposito
      // non risponde si rifiuta (errore), mai si accetta alla cieca.
      const s = await fsGet(`${TOKEN_COLLECTION}/${c.id}`);
      if (s && isSignToken(s[role]) && s[role] !== token) return null;
      return { contractId: c.id, role, source: 'legacy', contract: c };
    }
  }
  return null;
}

// Cancella campi da un documento, sotto la precondizione updateTime: i campi
// nella updateMask e assenti dal corpo vengono rimossi da Firestore.
async function deleteFields(docPath, fieldPaths, updateTime) {
  const token = await getAdminToken();
  const base = FS_BASE.replace(/^https?:\/\/[^/]+\/v1\//, '');
  const res = await fetch(`${FS_BASE}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes: [{
      update: { name: `${base}/${docPath}`, fields: {} },
      updateMask: { fieldPaths },
      currentDocument: { updateTime },
    }] }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const err = new Error('field_delete_failed_' + res.status);
    err.conflict = [409, 412].includes(res.status)
      || ['ABORTED', 'FAILED_PRECONDITION'].includes(body && body.error && body.error.status);
    throw err;
  }
}

// LA MIGRAZIONE: sposta i token in chiaro nel deposito e li cancella dal
// contratto. Idempotente; ogni contratto sotto precondizione (se cambia nel
// mezzo — una firma — si salta e si riprova al giro dopo). Mai cancella un
// token che il deposito non tiene: il link spedito deve restare valido.
// `maxMs` tiene il giro dentro il budget del cron.
export async function migrateLegacySignTokens({ limit = 100, dryRun = false, maxMs = 8000, concurrency = 4 } = {}) {
  const t0 = Date.now();
  const report = { found: 0, migrated: 0, conflicts: 0, skipped: 0, errors: 0, remaining: 0, dryRun: !!dryRun };
  const ids = new Set();
  for (const role of ROLES) {
    // `> ''` = il campo esiste ed è una stringa non vuota (i null restano fuori:
    // un null non è un segreto).
    const rows = await fsList('contracts', { filter: { field: LEGACY_FIELDS[role], op: 'GREATER_THAN', value: '' }, limit });
    rows.forEach(r => ids.add(r.id));
  }
  report.found = ids.size;
  if (dryRun) { report.remaining = ids.size; report.pending = [...ids].slice(0, 50); return report; }

  const queue = [...ids];
  const one = async (id) => {
    const cur = await fsGetVersioned('contracts/' + id);
    if (!cur) { report.skipped++; return; }
    const c = cur.data;
    const present = ROLES.filter(r => c[LEGACY_FIELDS[r]] != null);
    if (!present.length) { report.skipped++; return; }
    const stored = await ensureSignTokens(id, c, { mint: [] });
    for (const role of present) {
      const legacy = c[LEGACY_FIELDS[role]];
      if (!isSignToken(legacy)) continue;               // vuoto/strano: si toglie e basta
      if (!stored[role]) throw new Error('store_missing_' + role);
      if (stored[role] !== legacy) report.conflicts++;   // ruotato: vince il deposito
    }
    await deleteFields('contracts/' + id, present.map(r => LEGACY_FIELDS[r]), cur.updateTime);
    report.migrated++;
  };
  const worker = async () => {
    while (queue.length) {
      if (Date.now() - t0 > maxMs) return;
      const id = queue.shift();
      try { await one(id); }
      catch (e) { if (e && e.conflict) report.skipped++; else { report.errors++; console.warn('[sign/tokens] migrate', id, e && e.message); } }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  report.remaining = queue.length;
  return report;
}
