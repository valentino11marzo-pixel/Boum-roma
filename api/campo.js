// api/campo.js — LA PORTA DI CAMPO: tutto quello che serve alla collaboratrice
// di campo (ruolo `staff`), e niente di più.
//
// Perché una porta a parte e non il portal: il ruolo admin, in questo codice,
// firma contratti per conto dei clienti (preagreement/sign-for), cambia l'IBAN
// stampato sulle fatture (settings/company), cancella dati (Bonifica), approva
// messaggi ai clienti e legge ogni documento d'identità. Niente di questo è il
// lavoro di chi fa le visite. Qui le regole Firestore restano admin-only e il
// server serve, campo per campo, solo ciò che il lavoro chiede — lo stesso
// schema di /scheda e /sign. STUDIO_PRIMA_ASSUNZIONE_2026-10.md, Appendice B.
//
//   GET  /api/campo                → la giornata: visite (in persona), persone,
//                                    consegne chiavi, manutenzioni, case
//   POST /api/campo {op:'esito', viewingId, outcome, prob?, why?, asks?, qual?}
//   POST /api/campo {op:'casa', listingId, keys?, notes?}
//   POST /api/campo {op:'manutenzione', id, note}
//
// Auth: Bearer ID token Firebase di un utente con ruolo `staff` o `admin`.
// Cosa NON esce mai da qui: email dei clienti, codici fiscali, documenti,
// IBAN, importi dei contratti, link di firma. Cosa NON si fa mai da qui:
// cancellare, toccare soldi, firmare, scrivere ai clienti.

import { fsGet, fsList, fsPatch, readJson, logActivity } from './homie/_lib.js';
import { requireRole, setCors } from './_auth.js';
import { startOf } from './viewings/_lib.js';
import { closeTask, autoTaskId } from './regista/_tasks.js';
import { tgNotify } from './pfs/_health.js';

export const CAMPO_ROLES = ['staff', 'admin'];
export const OUTCOMES = { interested: 'interessati', thinking: 'ci pensano', no: 'no', noshow: 'non si sono presentati' };
const NOTES_COLL = 'campoNotes';
const H = 3600000, D = 24 * H;
// la giornata di campo: gli esiti ancora da scrivere (ultimi 3 giorni) e la
// settimana davanti
const PAST_MS = 3 * D, AHEAD_MS = 7 * D;
// un esito si scrive dalla visita in poi (15' di margine per chi arriva prima)
const ESITO_EARLY_MS = 15 * 60000;
const OPEN_MAINT = s => !['resolved', 'closed', 'done', 'cancelled', 'canceled'].includes(String(s || '').toLowerCase());
const DEAD_CONTRACT = s => ['terminated', 'cancelled', 'canceled', 'expired', 'draft_deleted'].includes(String(s || '').toLowerCase());

const clip = (v, n) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim().slice(0, n);
const clipBlock = (v, n) => (v == null ? '' : String(v)).replace(/\r/g, '').trim().slice(0, n);
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const mapsUrl = (address, lat, lng) => (lat != null && lng != null && isFinite(lat) && isFinite(lng))
  ? `https://www.google.com/maps/search/?api=1&query=${Number(lat)},${Number(lng)}`
  : (address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address + ', Roma')}` : null);
const propLabel = p => p ? [p.address || p.name, p.floor ? `piano ${p.floor}` : '', p.unit ? `int. ${p.unit}` : ''].filter(Boolean).join(', ') : '';
const dayKey = d => new Date(d).toISOString().slice(0, 10);

/**
 * Pura: la visita come la vede chi la fa. Mai l'email, mai le note interne
 * dell'operatore, solo ciò che serve alla porta di casa.
 */
export function viewingForField(v, listing, notes) {
  const s = startOf(v);
  const dur = Number(v.durationMinutes) || 45;
  const address = (listing && listing.address) || v.listingAddress || v.meetingPoint || '';
  const lat = v.lat != null ? Number(v.lat) : (listing && listing.lat != null ? Number(listing.lat) : null);
  const lng = v.lng != null ? Number(v.lng) : (listing && listing.lng != null ? Number(listing.lng) : null);
  const e = v.campoEsito || null;
  return {
    id: v.id,
    start: s ? s.toISOString() : null,
    end: s ? new Date(s.getTime() + dur * 60000).toISOString() : null,
    durationMinutes: dur,
    status: v.status || 'pending',
    listingId: v.listingId || null,
    listingName: clip(v.listingName || (listing && listing.name) || 'Visita', 120),
    address: clip(address, 160),
    mapsUrl: mapsUrl(address, lat, lng),
    client: {
      name: clip(v.clientName || v.name || 'Cliente', 80),
      phone: clip(v.clientPhone || v.phone || '', 32) || null,
      language: ['it', 'en'].includes(v.language) ? v.language : null,
    },
    clientNotes: clipBlock(v.notes, 300) || null,
    keys: notes ? (notes.keys || null) : null,
    houseNotes: notes ? (notes.notes || null) : null,
    esito: e ? { outcome: e.outcome || null, prob: e.prob || null, why: e.why || '', asks: e.asks || '', qual: e.qual || '', by: e.byName || e.by || '', at: e.at || null } : null,
  };
}

/** Pura: il filtro della giornata di campo. In persona, vivi, nella finestra. */
export function inFieldWindow(v, now = Date.now()) {
  if (!v || v.voided) return false;
  if (v.mode === 'video') return false;
  if (!['confirmed', 'pending', 'completed'].includes(v.status)) return false;
  const s = startOf(v);
  if (!s) return false;
  const t = s.getTime();
  return t >= now - PAST_MS && t <= now + AHEAD_MS;
}

/** Pura: un esito valido o la ragione per cui non lo è. */
export function validateEsito(body, viewing, now = Date.now()) {
  const outcome = String(body.outcome || '');
  if (!OUTCOMES[outcome]) return { error: 'outcome_invalid' };
  let prob = body.prob == null || body.prob === '' ? null : Number(body.prob);
  if (prob != null && !(Number.isInteger(prob) && prob >= 1 && prob <= 5)) return { error: 'prob_invalid' };
  if (!viewing) return { error: 'not_found', status: 404 };
  if (viewing.voided || viewing.status === 'cancelled') return { error: 'viewing_cancelled', status: 409 };
  const s = startOf(viewing);
  if (!s) return { error: 'viewing_without_time', status: 409 };
  if (s.getTime() - ESITO_EARLY_MS > now) return { error: 'viewing_not_started', status: 409 };
  return {
    value: {
      outcome,
      prob: outcome === 'no' || outcome === 'noshow' ? null : prob,
      why: clipBlock(body.why, 400),
      asks: clipBlock(body.asks, 400),
      qual: clipBlock(body.qual, 400),
    },
  };
}

async function listViewings() {
  const out = [];
  for (const [status, limit] of [['confirmed', 200], ['pending', 100], ['completed', 150]]) {
    try { out.push(...await fsList('viewingRequests', { filter: { field: 'status', op: 'EQUAL', value: status }, limit })); }
    catch (e) { console.warn('[campo] viewings', status, e.message); }
  }
  return out;
}

async function notesMap() {
  const rows = await fsList(NOTES_COLL, { limit: 400 }).catch(() => []);
  const m = new Map();
  for (const r of rows) m.set(r.id, r);
  return m;
}

export async function buildDay(now = Date.now()) {
  const [viewingsRaw, listings, notes, contracts, properties, maintenance] = await Promise.all([
    listViewings(),
    fsList('listings', { limit: 300 }).catch(() => []),
    notesMap(),
    fsList('contracts', { limit: 400 }).catch(() => []),
    fsList('properties', { limit: 400 }).catch(() => []),
    fsList('maintenance', { limit: 200 }).catch(() => []),
  ]);
  const listingById = new Map(listings.map(l => [l.id, l]));
  const propById = new Map(properties.map(p => [p.id, p]));

  const viewings = viewingsRaw
    .filter(v => inFieldWindow(v, now))
    .map(v => viewingForField(v, listingById.get(v.listingId), notes.get(v.listingId)))
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));

  // consegne chiavi: contratti che partono dentro la finestra
  const today = dayKey(now);
  const from = dayKey(now - 3 * D), to = dayKey(now + 14 * D);
  const handovers = contracts
    .filter(c => !DEAD_CONTRACT(c.status) && typeof c.startDate === 'string' && c.startDate.slice(0, 10) >= from && c.startDate.slice(0, 10) <= to)
    .map(c => {
      const p = propById.get(c.propertyId);
      const address = propLabel(p) || clip(c.propertyAddress, 160);
      return {
        id: c.id,
        startDate: c.startDate.slice(0, 10),
        past: c.startDate.slice(0, 10) < today,
        address,
        mapsUrl: mapsUrl(p && p.address, p && p.lat, p && p.lng),
        tenant: { name: clip(c.tenantName || 'Inquilino', 80), phone: clip(c.tenantPhone || '', 32) || null },
        coTenants: (Array.isArray(c.coTenants) ? c.coTenants : []).map(x => clip(x && x.name, 80)).filter(Boolean),
        signed: c.signatureStatus === 'complete',
        verbale: !!c.verbaleConsegna,
      };
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  // manutenzioni aperte, con chi le ha chieste (nome e telefono, niente altro)
  const openMaint = maintenance.filter(m => !m.demo && OPEN_MAINT(m.status)).slice(0, 60);
  const tenantIds = [...new Set(openMaint.map(m => m.userId || m.tenantId).filter(Boolean))].slice(0, 60);
  const tenants = new Map();
  await Promise.all(tenantIds.map(async id => {
    const u = await fsGet('users/' + id).catch(() => null);
    if (u) tenants.set(id, { name: clip(u.name, 80), phone: clip(u.phone, 32) || null });
  }));
  const maint = openMaint.map(m => {
    const p = propById.get(m.propertyId);
    const n = notes.get('mnt_' + m.id);
    return {
      id: m.id,
      title: clip(m.title || m.category || 'Manutenzione', 120),
      description: clipBlock(m.description || m.notes, 400),
      category: clip(m.category, 40) || null,
      urgency: clip(m.urgency || m.priority, 20) || null,
      status: clip(m.status, 20),
      createdAt: m.createdAt || null,
      address: propLabel(p),
      mapsUrl: mapsUrl(p && p.address, p && p.lat, p && p.lng),
      tenant: tenants.get(m.userId || m.tenantId) || null,
      visit: n ? { note: n.note || '', by: n.updatedByName || n.updatedBy || '', at: n.updatedAt || null } : null,
    };
  });

  // le case in vetrina: dati pubblici + le note di campo (chiavi, accesso)
  const houses = listings
    .filter(l => ['available', 'waitlist'].includes(l.status))
    .map(l => {
      const n = notes.get(l.id);
      const photos = new Set([l.image, ...(Array.isArray(l.images) ? l.images : [])].filter(Boolean)).size;
      return {
        id: l.id,
        name: clip(l.name, 120),
        address: clip(l.address, 160),
        zone: clip(l.zone, 60),
        status: l.status,
        price: Number(l.price) || null,
        availableDate: clip(l.availableFrom || l.availableDate, 40) || null,
        photos,
        video: !!(l.videoUrl || l.youtubeUrl),
        mapsUrl: mapsUrl(l.address, l.lat, l.lng),
        keys: n ? (n.keys || '') : '',
        notes: n ? (n.notes || '') : '',
        notesBy: n ? (n.updatedByName || '') : '',
      };
    })
    .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'available' ? -1 : 1));

  return { viewings, handovers, maintenance: maint, houses };
}

const who = auth => ({ email: auth.email || '', name: clip(auth.profile && auth.profile.name, 80) || auth.email || 'campo' });

async function opEsito(body, auth, res) {
  const id = clip(body.viewingId, 128);
  if (!/^[\w-]{1,128}$/.test(id)) return res.status(400).json({ ok: false, error: 'viewingId_invalid' });
  const viewing = await fsGet('viewingRequests/' + id).catch(() => null);
  const v = validateEsito(body, viewing && { ...viewing, id });
  if (v.error) return res.status(v.status || 400).json({ ok: false, error: v.error });
  if (viewing.mode === 'video') return res.status(409).json({ ok: false, error: 'video_viewing' });
  const me = who(auth);
  const esito = { ...v.value, by: me.email, byName: me.name, at: new Date().toISOString() };
  await fsPatch('viewingRequests/' + id, { campoEsito: esito });
  // l'attività «esito visita» del Regista si chiude da sola: l'esito è scritto
  await closeTask(autoTaskId('esito', id), 'campo').catch(() => null);
  const client = viewing.clientName || viewing.name || 'cliente';
  const line = `📋 <b>Esito visita</b> — ${esc(viewing.listingName || '')} · ${esc(client)}\n`
    + `<b>${esc(OUTCOMES[esito.outcome])}</b>${esito.prob ? ` · ${esito.prob}/5` : ''} — da ${esc(me.name)}`
    + (esito.why ? `\nPerché: ${esc(esito.why)}` : '')
    + (esito.asks ? `\nChiedono: ${esc(esito.asks)}` : '')
    + (esito.qual ? `\nQualifica: ${esc(esito.qual)}` : '');
  await tgNotify(line).catch(() => false);
  await logActivity('Esito visita (campo)', 'viewing', { viewingId: id, outcome: esito.outcome }, 'staff:' + me.email);
  return res.status(200).json({ ok: true, esito });
}

async function opCasa(body, auth, res) {
  const id = clip(body.listingId, 128);
  if (!/^[\w-]{1,128}$/.test(id)) return res.status(400).json({ ok: false, error: 'listingId_invalid' });
  if (body.keys == null && body.notes == null) return res.status(400).json({ ok: false, error: 'nothing_to_save' });
  const listing = await fsGet('listings/' + id).catch(() => null);
  if (!listing) return res.status(404).json({ ok: false, error: 'not_found' });
  const me = who(auth);
  const patch = { kind: 'listing', updatedAt: new Date().toISOString(), updatedBy: me.email, updatedByName: me.name };
  if (body.keys != null) patch.keys = clipBlock(body.keys, 600);
  if (body.notes != null) patch.notes = clipBlock(body.notes, 800);
  await fsPatch(`${NOTES_COLL}/${id}`, patch);
  await logActivity('Note di campo sulla casa', 'listing', { listingId: id }, 'staff:' + me.email);
  return res.status(200).json({ ok: true });
}

async function opManutenzione(body, auth, res) {
  const id = clip(body.id, 128);
  if (!/^[\w-]{1,128}$/.test(id)) return res.status(400).json({ ok: false, error: 'id_invalid' });
  const note = clipBlock(body.note, 800);
  if (!note) return res.status(400).json({ ok: false, error: 'note_required' });
  const m = await fsGet('maintenance/' + id).catch(() => null);
  if (!m) return res.status(404).json({ ok: false, error: 'not_found' });
  const me = who(auth);
  // la nota NON va sul documento della manutenzione: l'inquilino lo legge
  await fsPatch(`${NOTES_COLL}/mnt_${id}`, { kind: 'maintenance', maintenanceId: id, note, updatedAt: new Date().toISOString(), updatedBy: me.email, updatedByName: me.name });
  await logActivity('Sopralluogo manutenzione (campo)', 'maintenance', { maintenanceId: id }, 'staff:' + me.email);
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const auth = await requireRole(req, res, CAMPO_ROLES);
  if (!auth) return;
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    if (req.method === 'GET') {
      const day = await buildDay();
      return res.status(200).json({ ok: true, me: { name: who(auth).name, role: auth.profile.role }, now: new Date().toISOString(), ...day });
    }
    const body = (await readJson(req)) || {};
    if (body.op === 'esito') return await opEsito(body, auth, res);
    if (body.op === 'casa') return await opCasa(body, auth, res);
    if (body.op === 'manutenzione') return await opManutenzione(body, auth, res);
    return res.status(400).json({ ok: false, error: 'op_unknown' });
  } catch (e) {
    console.error('[campo]', e && e.message);
    return res.status(500).json({ ok: false, error: 'campo_failed' });
  }
}
