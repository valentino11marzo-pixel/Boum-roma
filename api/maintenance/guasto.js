// api/maintenance/guasto.js — LA SEGNALAZIONE DI UN GUASTO, una porta sola.
//
// Chi abita in un palazzo gestito da BOOM non ha sempre un account (gli
// inquilini caricati dalla tabella della proprietaria non ce l'hanno): deve
// comunque poter dire "si è rotta la caldaia" senza una password. E la
// proprietaria deve poterlo dire dalla scheda dell'interno. Tutti arrivano
// QUI, e la segnalazione nasce nella stessa collection `maintenance` che il
// portal già mostra (Manutenzione, Oggi, il Gestore, Il Palazzo).
//
// Method: POST { op, … }
//   op:'lookup'  { t }                         → l'interno del link (solo etichette)
//   op:'report'  { t | Bearer, propertyId?, category, priority, description,
//                  name?, phone?, photo?{base64,type}, company(honeypot) }
//   op:'links'   Bearer admin/owner/landlord { propertyIds[] } → { links,
//                seats (contractId del link o null se libero), byContract
//                (un link per contratto quando i vivi sono più d'uno) }
//   lookup/report col link: 404 se il link non è più vivo, 503 se
//   l'archivio dei contratti non risponde (mai "link falso" per un guasto).
//   op:'notify'  Bearer { id }  → il ping all'operatore per una segnalazione
//                scritta dal browser (/casa): prima /casa chiamava
//                /api/agent/notify SENZA credenziale e riceveva 401 a ogni
//                segnalazione — l'operatore non ne sapeva niente.
//
// Regole dure (tests/manutenzione/run.mjs):
// - Il link È la credenziale, DERIVATO per interno E per contratto vivo:
//   sha256("guasto:v2:<propertyId>:<contractId|vacant>:<HOMIE_SECRET>") —
//   niente da coniare né migrare. Un link apre UN interno, e solo finché il
//   contratto per cui è nato è vivo: AL CAMBIO DI INQUILINO il link del
//   contratto finito risponde 404 (prima la derivazione era solo per
//   interno: chi usciva continuava ad aprire guasti, e l'unica revoca era
//   ruotare HOMIE_SECRET, che spegne anche /rata, /scheda e le firme).
//   Ruotare HOMIE_SECRET li revoca comunque tutti.
// - I link nati prima (formula per solo interno) restano validi finché
//   tutti i contratti vivi dell'interno sono nati prima di LEGACY_CUTOFF:
//   il primo inquilino nuovo li spegne.
// - Il proprietario segnala e ottiene link SOLO per i suoi interni (ownerId);
//   gli altri si omettono (links) o rispondono 403 (report), mai un dato.
// - lookup non dice chi abita lì: solo palazzo e interno.
// - Ogni segnalazione accende la card su Telegram (agentNotifications,
//   priority high/urgent → notify-pending entro un minuto). La segnalazione
//   si scrive PRIMA del ping: un ping fallito non perde mai il guasto.
// - Foto facoltativa, solo JPEG/PNG/WEBP ≤ 4 MB, sotto maintenance/guasto-<id>/
//   (il match di storage.rules esiste già e ammette l'admin).

import crypto from 'node:crypto';
import { fsGet, fsCreate, fsPatch, fsGetMany, fsList, readJson } from '../homie/_lib.js';
import { storageUpload } from '../agent/_lib.js';
import { requireRole, setCors } from '../_auth.js';

const BASE = process.env.PUBLIC_BASE_URL || 'https://www.boomrome.com';
const ID_RE = /^[\w.-]{1,120}$/;
const CATEGORIES = { plumbing: 'Idraulica', electrical: 'Elettricità', heating: 'Riscaldamento / caldaia', appliance: 'Elettrodomestici',
  locks: 'Porte e serrature', leaks: 'Infiltrazioni / umidità', common: 'Parti comuni', other: 'Altro' };
const PRIORITIES = { low: 'Non urgente', medium: 'Normale', high: 'Urgente', urgent: 'Emergenza' };
const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_PHOTO = 4 * 1024 * 1024;

const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

// I link derivati per solo interno sono nati prima di questa data: valgono
// ancora per gli inquilini che c'erano, e muoiono col primo contratto nuovo.
export const LEGACY_CUTOFF = '2026-10-14';
const VACANT = 'vacant';

// Il "posto" del link: il contratto vivo per cui nasce, o 'vacant' se
// l'interno è libero.
export function guastoToken(propertyId, seat) {
  const secret = process.env.HOMIE_SECRET || '';
  const s = seat == null || seat === '' ? VACANT : String(seat);
  if (!secret || !ID_RE.test(String(propertyId || '')) || !ID_RE.test(s)) return '';
  return crypto.createHash('sha256').update('guasto:v2:' + propertyId + ':' + s + ':' + secret).digest('base64url').slice(0, 22);
}
// La formula di prima (solo interno): serve SOLO a riconoscere i link già
// spediti, mai a crearne di nuovi.
export function legacyToken(propertyId) {
  const secret = process.env.HOMIE_SECRET || '';
  if (!secret || !ID_RE.test(String(propertyId || ''))) return '';
  return crypto.createHash('sha256').update('guasto:' + propertyId + ':' + secret).digest('base64url').slice(0, 22);
}
export function guastoLink(propertyId, seat) {
  const t = guastoToken(propertyId, seat);
  return t ? BASE + '/guasto?t=' + encodeURIComponent(propertyId + '.' + t) : '';
}
// "<propertyId>.<token>" → { pid, tok } oppure null (solo la forma).
export function parseToken(raw) {
  const s = String(raw || '');
  const i = s.lastIndexOf('.');
  if (i <= 0) return null;
  const pid = s.slice(0, i), tok = s.slice(i + 1);
  return ID_RE.test(pid) && tok ? { pid, tok } : null;
}
function sameToken(a, b) {
  return !!a && !!b && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Giorno YYYY-MM-DD da una data qualunque del documento (stringa, ISO,
// Date, timestamp {seconds}); '' se non c'è.
function dayOf(v) {
  if (!v) return '';
  if (typeof v === 'string') return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '';
  if (v instanceof Date) return isNaN(v) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'object' && v.seconds != null) return new Date(Number(v.seconds) * 1000).toISOString().slice(0, 10);
  return '';
}
export function romeToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = t => (parts.find(p => p.type === t) || {}).value || '';
  return get('year') + '-' + get('month') + '-' + get('day');
}

// I contratti VIVI di un interno oggi: non annullati né bozze, e non finiti
// (fine = la prima fra terminatedAt e endDate). Un contratto futuro è vivo
// (l'inquilino in arrivo), un segnaposto senza date pure (l'interno è
// occupato, il contratto è da caricare). Pura: si testa senza rete.
const SEAT_DEAD = { cancelled: 1, canceled: 1, rejected: 1, void: 1, draft: 1, deleted: 1, archived: 1 };
const SEAT_ENDED = { expired: 1, ended: 1, completed: 1, closed: 1, terminated: 1 };
export function liveSeats(contracts, today) {
  const out = [];
  for (const c of Array.isArray(contracts) ? contracts : []) {
    if (!c || !ID_RE.test(String(c.id || '')) || c.deleted === true) continue;
    const st = String(c.status || '').toLowerCase().trim();
    if (SEAT_DEAD[st]) continue;
    const endD = dayOf(c.endDate), termD = dayOf(c.terminatedAt) || (st === 'terminated' ? dayOf(c.terminationDate) : '');
    const end = termD && (!endD || termD < endD) ? termD : endD;
    if (end ? end < today : SEAT_ENDED[st]) continue;
    out.push({ id: String(c.id), start: dayOf(c.startDate), end, born: dayOf(c.createdAt) || dayOf(c.startDate) });
  }
  return out;
}
// Il posto "di adesso": il contratto in corso iniziato per ultimo; se non
// c'è, il primo in arrivo; se non c'è nessuno, l'interno è libero.
export function primarySeat(seats, today) {
  const now = seats.filter(s => !s.start || s.start <= today).sort((a, b) => (b.start || '').localeCompare(a.start || ''));
  if (now.length) return now[0].id;
  const next = seats.slice().sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  return next.length ? next[0].id : VACANT;
}
// Il token apre l'interno se è quello di un contratto vivo (o di 'vacant'
// quando non ce n'è nessuno). Il link di prima vale solo se TUTTI i
// contratti vivi sono nati prima di LEGACY_CUTOFF. → { seat, legacy? } | null
export function matchSeat(pid, tok, seats, today) {
  const cands = seats.length ? seats.map(s => s.id) : [VACANT];
  for (const s of cands) if (sameToken(tok, guastoToken(pid, s))) return { seat: s };
  if (seats.length && seats.every(s => s.born && s.born < LEGACY_CUTOFF) && sameToken(tok, legacyToken(pid)))
    return { seat: primarySeat(seats, today), legacy: true };
  return null;
}

// I contratti di più interni, a blocchi di 30 (il tetto della IN).
async function contractsFor(pids) {
  const byPid = new Map(pids.map(p => [p, []]));
  for (let i = 0; i < pids.length; i += 30) {
    const chunk = pids.slice(i, i + 30);
    const rows = await fsList('contracts', { filter: chunk.length === 1
      ? { field: 'propertyId', op: 'EQUAL', value: chunk[0] }
      : { field: 'propertyId', op: 'IN', value: chunk }, limit: 300 });
    for (const c of rows || []) if (byPid.has(c.propertyId)) byPid.get(c.propertyId).push(c);
  }
  return byPid;
}
// "<propertyId>.<token>" → { pid, seat, legacy } se il link è vivo, null
// se non lo è più (o non lo è mai stato). Lancia se l'archivio non risponde:
// "non so" non è "link falso".
export async function resolveToken(raw, today = romeToday()) {
  const p = parseToken(raw);
  if (!p) return null;
  const seats = liveSeats((await contractsFor([p.pid])).get(p.pid), today);
  const m = matchSeat(p.pid, p.tok, seats, today);
  return m ? { pid: p.pid, seat: m.seat, legacy: !!m.legacy } : null;
}

export function cleanPhone(v) {
  const s = clip(v, 40), digits = s.replace(/\D/g, '').replace(/^00/, '');
  if (digits.length < 6 || digits.length > 15) return '';
  return (/^\s*(\+|00)/.test(s) ? '+' : '') + digits;
}

// Il guasto, validato. Pura: si testa senza rete.
export function buildReport(body) {
  const b = body || {};
  const category = CATEGORIES[b.category] ? b.category : 'other';
  const priority = PRIORITIES[b.priority] ? b.priority : (b.priority === 'emergency' ? 'urgent' : 'medium');
  const description = clip(b.description, 1200);
  if (description.length < 8) return { error: 'description_short' };
  const first = description.split(/[.\n!?]/)[0].trim();
  const title = (CATEGORIES[category] + ' — ' + (first.length > 60 ? first.slice(0, 57) + '…' : first)).slice(0, 90);
  return { category, priority, description, title, name: clip(b.name, 80), phone: cleanPhone(b.phone) };
}

const rl = new Map();
function rateOk(ip, max = 6, windowMs = 10 * 60_000) {
  const now = Date.now(), e = rl.get(ip);
  if (!e || now - e.t >= windowMs) { rl.set(ip, { c: 1, t: now }); if (rl.size > 2000) rl.clear(); return true; }
  e.c += 1;
  return e.c <= max;
}
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  return typeof xff === 'string' && xff ? xff.split(',')[0].trim() : (req.headers['x-real-ip'] || 'unknown');
}
function unitLabel(p) {
  const interno = clip(p.interno, 12);
  return { building: clip(p.palazzoNome || String(p.address || '').split(',')[0] || p.name, 120), interno, label: interno ? 'Int. ' + interno : clip(p.name, 120) };
}

async function ping(m, property, reporter) {
  const pr = m.priority === 'urgent' ? 'urgent' : 'high';
  const who = reporter.role === 'owner' ? 'la proprietaria' : reporter.role === 'admin' ? 'BOOM' : (reporter.name || 'l\'inquilino');
  const where = unitLabel(property || {});
  await fsCreate('agentNotifications', {
    type: 'maintenance.opened', status: 'pending', priority: pr,
    summary: '🔧 ' + where.building + ' · ' + where.label + ' — ' + m.title + ' (segnala ' + who + ')',
    ref: { collection: 'maintenance', id: m.id }, ownerId: (property && property.ownerId) || null,
    payload: { category: m.category, priority: m.priority, phone: reporter.phone || '', via: reporter.via },
    dedupKey: 'maint_' + m.id, actor: 'guasto', attempts: 0, createdAt: new Date().toISOString()
  }, 'maint_' + m.id);
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  res.setHeader('Cache-Control', 'private, no-store');
  const b = await readJson(req).catch(() => null);
  if (!b || typeof b !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });
  const op = String(b.op || '');

  if (op === 'lookup') {
    let seat;
    try { seat = await resolveToken(b.t); }
    catch (e) { console.warn('[guasto] lookup:', e.status || e.message); return res.status(503).json({ ok: false, error: 'unavailable' }); }
    if (!seat) return res.status(404).json({ ok: false, error: 'invalid_link' });
    const pid = seat.pid;
    const p = await fsGet('properties/' + pid).catch(() => null);
    if (!p || p.deleted === true || p.status === 'archived') return res.status(404).json({ ok: false, error: 'invalid_link' });
    return res.status(200).json({ ok: true, unit: unitLabel(p), categories: CATEGORIES, priorities: PRIORITIES });
  }

  if (op === 'report') {
    if (b.company) return res.status(200).json({ ok: true, id: null });   // honeypot: silenzio
    let pid = null, reporter, seat = null;
    if (b.t) {
      if (!rateOk(clientIp(req))) return res.status(429).json({ ok: false, error: 'rate_limited' });
      try { seat = await resolveToken(b.t); }
      catch (e) { console.warn('[guasto] report:', e.status || e.message); return res.status(503).json({ ok: false, error: 'unavailable' }); }
      if (!seat) return res.status(404).json({ ok: false, error: 'invalid_link' });
      pid = seat.pid;
      reporter = { role: 'tenant', via: 'link' };
    } else {
      const auth = await requireRole(req, res, ['admin', 'owner', 'landlord']);
      if (!auth) return;
      pid = clip(b.propertyId, 120);
      if (!ID_RE.test(pid)) return res.status(400).json({ ok: false, error: 'propertyId_required' });
      reporter = { role: auth.profile.role === 'admin' ? 'admin' : 'owner', via: 'palazzo', uid: auth.uid, name: clip(auth.profile.name || auth.email, 80) };
    }
    const r = buildReport(b);
    if (r.error) return res.status(400).json({ ok: false, error: r.error });
    const property = await fsGet('properties/' + pid).catch(() => null);
    if (!property || property.deleted === true) return res.status(404).json({ ok: false, error: 'not_found' });
    if (reporter.role === 'owner' && property.ownerId !== reporter.uid) return res.status(403).json({ ok: false, error: 'forbidden' });
    if (reporter.role === 'tenant') { reporter.name = r.name; reporter.phone = r.phone; }

    // photo: true = arrivata · false = c'era ma non è salita (la pagina lo
    // DICE: prima risultava "inviata" e basta) · null = nessuna foto.
    let photoUrl = '', photoSent = false;
    if (b.photo && b.photo.base64) {
      photoSent = true;
      const type = String(b.photo.type || '').toLowerCase(), ext = PHOTO_TYPES[type];
      const raw = String(b.photo.base64).replace(/^data:[^,]*,/, '');
      const buf = Buffer.from(raw, 'base64');
      if (!ext || !buf.length || buf.length > MAX_PHOTO) return res.status(400).json({ ok: false, error: 'bad_photo' });
      try { photoUrl = await storageUpload('maintenance/guasto-' + pid + '/' + Date.now() + '.' + ext, buf, type) || ''; }
      catch (e) { console.warn('[guasto] foto non caricata:', e.status || e.message); }
    }
    const where = unitLabel(property);
    const doc = {
      title: r.title, propertyId: pid, propertyName: clip(property.name, 160), category: r.category, priority: r.priority,
      description: r.description, photoUrl, comments: [], status: 'open', createdAt: new Date(),
      userId: reporter.uid || null, tenantName: reporter.role === 'tenant' ? r.name : '',
      reporter: { role: reporter.role, name: reporter.name || '', phone: reporter.phone || '', via: reporter.via },
      source: reporter.via === 'link' ? 'guasto-link' : 'palazzo', interno: where.interno,
      // Dal link: il contratto per cui il link è nato (chi abita lì oggi).
      contractId: seat && seat.seat !== VACANT ? seat.seat : null
    };
    let created;
    try { created = await fsCreate('maintenance', doc); }
    catch (e) { console.error('[guasto] scrittura:', e.message); return res.status(500).json({ ok: false, error: 'write_failed' }); }
    const id = created && created.id;
    try { await ping({ ...doc, id }, property, reporter); } catch (e) { console.warn('[guasto] ping:', e.message); }
    return res.status(200).json({ ok: true, id, photo: photoUrl ? true : photoSent ? false : null });
  }

  if (op === 'links') {
    const auth = await requireRole(req, res, ['admin', 'owner', 'landlord']);
    if (!auth) return;
    const ids = [...new Set((Array.isArray(b.propertyIds) ? b.propertyIds : []).map(x => clip(x, 120)).filter(x => ID_RE.test(x)))].slice(0, 120);
    const map = ids.length ? await fsGetMany(ids.map(id => 'properties/' + id)) : new Map();
    const mine = ids.filter(id => { const p = map.get('properties/' + id); return p && (auth.profile.role === 'admin' || p.ownerId === auth.uid); });
    // Il link è per il contratto vivo: senza contratti letti non si dà un
    // link che potrebbe essere quello sbagliato (un vecchio inquilino).
    let byPid;
    try { byPid = await contractsFor(mine); }
    catch (e) { console.warn('[guasto] links:', e.status || e.message); return res.status(503).json({ ok: false, error: 'unavailable' }); }
    const today = romeToday(), links = {}, seats = {}, byContract = {};
    for (const id of mine) {
      const live = liveSeats(byPid.get(id), today), seat = primarySeat(live, today);
      links[id] = guastoLink(id, seat);
      seats[id] = seat === VACANT ? null : seat;
      // Più contratti vivi sullo stesso interno (stanze, o l'inquilino in
      // arrivo accanto a quello che esce): un link per ciascuno.
      if (live.length > 1) byContract[id] = Object.fromEntries(live.map(s => [s.id, guastoLink(id, s.id)]));
    }
    return res.status(200).json({ ok: true, links, seats, byContract });
  }

  if (op === 'notify') {
    const auth = await requireRole(req, res, ['admin', 'owner', 'landlord', 'tenant']);
    if (!auth) return;
    const id = clip(b.id, 120);
    if (!ID_RE.test(id)) return res.status(400).json({ ok: false, error: 'id_required' });
    const m = await fsGet('maintenance/' + id).catch(() => null);
    if (!m) return res.status(404).json({ ok: false, error: 'not_found' });
    if (auth.profile.role !== 'admin' && m.userId !== auth.uid) return res.status(403).json({ ok: false, error: 'forbidden' });
    const property = m.propertyId ? await fsGet('properties/' + m.propertyId).catch(() => null) : null;
    try { await ping({ ...m, id }, property, { role: 'tenant', via: 'casa', name: m.tenantName || '', phone: '' }); }
    catch (e) {
      if (e.exists) return res.status(200).json({ ok: true, already: true });
      return res.status(500).json({ ok: false, error: 'notify_failed' });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ ok: false, error: 'unknown_op' });
}
