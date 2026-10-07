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
//   op:'links'   Bearer admin/owner/landlord { propertyIds[] } → { links }
//   op:'notify'  Bearer { id }  → il ping all'operatore per una segnalazione
//                scritta dal browser (/casa): prima /casa chiamava
//                /api/agent/notify SENZA credenziale e riceveva 401 a ogni
//                segnalazione — l'operatore non ne sapeva niente.
//
// Regole dure (tests/manutenzione/run.mjs):
// - Il link È la credenziale, DERIVATO: sha256("guasto:<propertyId>:<HOMIE_
//   SECRET>") — ogni interno ne ha già uno, niente da coniare né migrare;
//   ruotare HOMIE_SECRET li revoca tutti. Un link apre UN interno: non si
//   può segnalare per un altro.
// - Il proprietario segnala e ottiene link SOLO per i suoi interni (ownerId);
//   gli altri si omettono (links) o rispondono 403 (report), mai un dato.
// - lookup non dice chi abita lì: solo palazzo e interno.
// - Ogni segnalazione accende la card su Telegram (agentNotifications,
//   priority high/urgent → notify-pending entro un minuto). La segnalazione
//   si scrive PRIMA del ping: un ping fallito non perde mai il guasto.
// - Foto facoltativa, solo JPEG/PNG/WEBP ≤ 4 MB, sotto maintenance/guasto-<id>/
//   (il match di storage.rules esiste già e ammette l'admin).

import crypto from 'node:crypto';
import { fsGet, fsCreate, fsPatch, fsGetMany, readJson } from '../homie/_lib.js';
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

export function guastoToken(propertyId) {
  const secret = process.env.HOMIE_SECRET || '';
  if (!secret || !ID_RE.test(String(propertyId || ''))) return '';
  return crypto.createHash('sha256').update('guasto:' + propertyId + ':' + secret).digest('base64url').slice(0, 22);
}
export function guastoLink(propertyId) {
  const t = guastoToken(propertyId);
  return t ? BASE + '/guasto?t=' + encodeURIComponent(propertyId + '.' + t) : '';
}
// "<propertyId>.<token>" → propertyId, oppure null. Confronto a tempo costante.
export function propertyFromToken(raw) {
  const s = String(raw || '');
  const i = s.lastIndexOf('.');
  if (i <= 0) return null;
  const pid = s.slice(0, i), tok = s.slice(i + 1), want = guastoToken(pid);
  if (!want || tok.length !== want.length) return null;
  return crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(want)) ? pid : null;
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
    const pid = propertyFromToken(b.t);
    if (!pid) return res.status(404).json({ ok: false, error: 'invalid_link' });
    const p = await fsGet('properties/' + pid).catch(() => null);
    if (!p || p.deleted === true || p.status === 'archived') return res.status(404).json({ ok: false, error: 'invalid_link' });
    return res.status(200).json({ ok: true, unit: unitLabel(p), categories: CATEGORIES, priorities: PRIORITIES });
  }

  if (op === 'report') {
    if (b.company) return res.status(200).json({ ok: true, id: null });   // honeypot: silenzio
    let pid = null, reporter;
    if (b.t) {
      if (!rateOk(clientIp(req))) return res.status(429).json({ ok: false, error: 'rate_limited' });
      pid = propertyFromToken(b.t);
      if (!pid) return res.status(404).json({ ok: false, error: 'invalid_link' });
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

    let photoUrl = '';
    if (b.photo && b.photo.base64) {
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
      source: reporter.via === 'link' ? 'guasto-link' : 'palazzo', interno: where.interno
    };
    let created;
    try { created = await fsCreate('maintenance', doc); }
    catch (e) { console.error('[guasto] scrittura:', e.message); return res.status(500).json({ ok: false, error: 'write_failed' }); }
    const id = created && created.id;
    try { await ping({ ...doc, id }, property, reporter); } catch (e) { console.warn('[guasto] ping:', e.message); }
    return res.status(200).json({ ok: true, id, photo: !!photoUrl });
  }

  if (op === 'links') {
    const auth = await requireRole(req, res, ['admin', 'owner', 'landlord']);
    if (!auth) return;
    const ids = [...new Set((Array.isArray(b.propertyIds) ? b.propertyIds : []).map(x => clip(x, 120)).filter(x => ID_RE.test(x)))].slice(0, 120);
    const map = ids.length ? await fsGetMany(ids.map(id => 'properties/' + id)) : new Map();
    const links = {};
    for (const id of ids) {
      const p = map.get('properties/' + id);
      if (!p) continue;
      if (auth.profile.role !== 'admin' && p.ownerId !== auth.uid) continue;
      links[id] = guastoLink(id);
    }
    return res.status(200).json({ ok: true, links });
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
