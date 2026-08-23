// api/listings-availability.js — LA PORTA UNICA DELLE DATE DI DISPONIBILITÀ.
//
// Prima esistevano tre porte di scrittura e nessuna si parlava:
//   • il portal, con un campo di TESTO LIBERO il cui placeholder suggeriva
//     proprio i formati che la vetrina non sapeva leggere ("Es: Feb 1,
//     Sep 2026, Immediate");
//   • `/modifica <id> disponibile <valore>` sul bot Telegram;
//   • il parser NL del bot, l'unico che normalizzava in ISO — e vale per UN
//     immobile per messaggio.
// Il campo che la vetrina legge per PRIMO, `availableFrom`, non lo scriveva
// nessuna delle tre.
//
// Qui la disponibilità si scrive in un posto solo, con il motore puro
// js/dispo-engine.js — lo STESSO che leggono vetrina, scheda, feed e
// Pubblicista. È la disciplina di _avail.js per le visite: se la regola
// vivesse in due copie, un giorno direbbero cose diverse e nessuno saprebbe
// quale è quella in vigore.
//
// ─── PERCHÉ IL CERVELLO STA QUI E NON NEL BOT ────────────────────────────
// Il wizard Telegram gira sul Mac mini e può essere giù (lo è stato). Se il
// multi-annuncio vivesse nel Python del bot, la funzione sarebbe nata già
// spenta. Stando sul server è viva SUBITO dal portal, e il bot la eredita
// quando torna su: il bot diventa una tastiera, non un cervello.
//
// ─── PROTOCOLLO ──────────────────────────────────────────────────────────
// Auth: Bearer CRON_SECRET · X-Homie-Secret · X-Wizard-Secret · Bearer
//       Firebase ID token di un admin/owner/landlord.
//
// GET  /api/listings-availability
//      → { ok, listings:[{id,name,zone,status,kind,iso,label,raw}],
//          audit:{now,date,unknown,rented,waitlist,total,gaps[]} }
//        Il quadro completo: chi ha una data, chi tace. Alimenta
//        /disponibilita sul bot e il pannello del portal.
//
// POST { text: "Levico dal 1 settembre, Cavour subito" [, apply:true] }
//      → il PIANO (chi cambia, da cosa a cosa). Senza `apply` non scrive:
//        l'operatore vede e conferma. È lo stesso ritmo del wizard NL.
// POST { updates:[{id, iso:'2026-09-01'} | {id, kind:'now'} | {id, kind:'unknown'}] }
//      → scrive. Ogni voce passa comunque dal motore: un client non può
//        depositare una stringa che le pagine non sanno leggere.
//
// Risposta di scrittura: { ok, applied:[{id,name,from,to}], failed:[], plan }

import DISPO from '../js/dispo-engine.js';
import { fsList, fsPatch, fsGet, readJson, secretEqual, logActivity } from './homie/_lib.js';

const ADMIN_ROLES = new Set(['admin', 'owner', 'landlord']);
const MAX_UPDATES = 60;          // il catalogo vero è ~20: largo, ma non infinito
const CATALOG_LIMIT = 400;

/* ── auth: le quattro chiavi che già esistono, nessuna nuova ───────────── */

async function verifyFirebaseToken(token) {
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey || !token) return null;
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    }
  );
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.users || !data.users[0]) return null;
  return data.users[0];
}

async function requireActor(req, res) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (bearer && process.env.CRON_SECRET && secretEqual(bearer, process.env.CRON_SECRET)) return 'cron';

  // il bot: la stessa chiave con cui pubblica e carica foto
  const wizard = req.headers['x-wizard-secret'] || req.headers['x-homie-secret'];
  const expected = process.env.WIZARD_SECRET || process.env.HOMIE_SECRET;
  if (wizard && expected && secretEqual(String(wizard), expected)) return 'telegram';

  if (bearer) {
    try {
      const user = await verifyFirebaseToken(bearer);
      if (user) {
        const profile = await fsGet('users/' + user.localId);
        if (profile && ADMIN_ROLES.has(profile.role)) return 'portal:' + (profile.email || user.localId);
        res.status(403).json({ ok: false, error: 'admin_required' });
        return null;
      }
    } catch (e) {
      console.error('[listings-availability] token verify failed:', e.message);
    }
  }

  res.status(401).json({ ok: false, error: 'unauthorized' });
  return null;
}

/* ── il catalogo, letto una volta per richiesta ────────────────────────── */

async function loadCatalog() {
  const rows = await fsList('listings', { limit: CATALOG_LIMIT });
  return rows.map((l) => ({
    id: l.id,
    name: l.name || l.title || l.id,
    zone: l.zone || l.neighborhood || '',
    address: l.address || '',
    type: l.type || '',
    status: String(l.status || l.availabilityStatus || 'available').toLowerCase(),
    availableFrom: l.availableFrom,
    availableDate: l.availableDate,
  }));
}

function view(l, today) {
  const r = DISPO.resolve(l, today);
  const m = DISPO.marketLane(l, today);
  return {
    id: l.id,
    name: l.name,
    zone: l.zone,
    status: r.status,
    kind: r.kind,
    iso: r.iso,
    label: DISPO.label(r, 'it', today).text,
    raw: l.availableFrom || l.availableDate || '',
    // la corsia commerciale: è ciò che il cliente vede e che decide se
    // quella casa si può vendere oggi (now), prenotare (ahead) o niente
    lane: m.lane,
    vetrina: DISPO.laneCopy(m, 'it', today).short,
    // l'anno l'ha messo il motore, non l'operatore: da confermare
    yearGuessed: m.yearGuessed,
    daysOut: m.daysOut,
  };
}

/* ── la scrittura ──────────────────────────────────────────────────────── */

/**
 * Ogni voce passa dal motore, sempre. Un client (il bot, il portal, un
 * domani un cron) non può depositare sul documento una stringa che le pagine
 * non saprebbero rileggere: sarebbe ricreare esattamente il difetto che
 * questo endpoint esiste per chiudere.
 */
function normalize(u, today) {
  if (!u || !u.id) return null;
  let av;
  if (u.kind === 'now') av = DISPO.parseAvailability('Subito', today);
  else if (u.kind === 'unknown') av = DISPO.parseAvailability('da concordare', today);
  else {
    const src = u.iso || u.value || u.text || '';
    av = DISPO.parseAvailability(src, today);
    if (av.kind === 'unknown' && String(src).trim()) return null;
  }
  // Le parole VERE dell'operatore, non la data che ne abbiamo derivato: se un
  // domani una lettura si rivelasse sbagliata, sul documento resta la frase da
  // cui rileggerla. Stessa disciplina di descriptionOriginal.
  if (u.phrase) av = { ...av, raw: String(u.phrase) };
  return av;
}

async function applyUpdates(updates, catalog, actor, today) {
  const byId = new Map(catalog.map((l) => [l.id, l]));
  const applied = [], failed = [];

  for (const u of updates.slice(0, MAX_UPDATES)) {
    const l = byId.get(u.id);
    if (!l) { failed.push({ id: u.id, error: 'not_found' }); continue; }

    const av = normalize(u, today);
    if (!av) { failed.push({ id: u.id, error: 'unreadable_date' }); continue; }

    const before = DISPO.resolve(l, today);
    try {
      await fsPatch('listings/' + u.id, DISPO.writePatch(av, actor));
      applied.push({
        id: u.id,
        name: l.name,
        from: before.kind === 'date' ? before.iso : before.kind,
        to: av.kind === 'date' ? av.iso : av.kind,
      });
    } catch (e) {
      failed.push({ id: u.id, error: e.message });
    }
  }

  if (applied.length) {
    // best-effort: la traccia non deve mai far fallire una scrittura riuscita
    try {
      await logActivity('availability_updated', 'listing', {
        count: applied.length, ids: applied.map((a) => a.id),
      }, actor);
    } catch (_) { /* noop */ }
  }
  return { applied, failed };
}

/* ── handler ───────────────────────────────────────────────────────────── */

export default async function handler(req, res) {
  const actor = await requireActor(req, res);
  if (!actor) return;

  const today = DISPO.todayIso();

  try {
    if (req.method === 'GET') {
      const catalog = await loadCatalog();
      const listings = catalog.map((l) => view(l, today))
        .sort((a, b) => {
          // prima chi non ha una data, poi le date con l'ANNO INDOVINATO:
          // è la lista di lavoro, non un archivio — e una data inferita di
          // un anno è ciò che manda via un cliente che potrebbe entrare
          // domani, quindi viene subito dopo il buco vero
          const rank = (x) => (x.kind === 'unknown' ? 0 : x.yearGuessed ? 1
            : x.kind === 'date' ? 2 : 3);
          return rank(a) - rank(b) || String(a.name).localeCompare(String(b.name));
        });
      return res.status(200).json({ ok: true, today, listings, audit: DISPO.audit(catalog, today) });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    }

    const body = await readJson(req);
    const catalog = await loadCatalog();

    /* — via 1: il messaggio unico — */
    if (body && typeof body.text === 'string' && body.text.trim()) {
      // solo gli annunci vivi entrano nel riconoscimento: aggiornare la data
      // di una casa già affittata da un messaggio veloce non è ciò che si
      // intendeva quasi mai, e il nome di un archiviato ruberebbe il match.
      const live = catalog.filter((l) => l.status !== 'rented' && l.status !== 'off_market');
      const plan = DISPO.parseBatch(body.text, live, today);

      if (!body.apply || !plan.ok) {
        return res.status(200).json({ ok: plan.ok, dry: true, plan, today });
      }
      const { applied, failed } = await applyUpdates(
        plan.updates.map((u) => ({ id: u.id, kind: u.kind, iso: u.iso, phrase: u.phrase })),
        catalog, actor, today
      );
      return res.status(200).json({ ok: true, applied, failed, plan, today });
    }

    /* — via 2: aggiornamenti espliciti (il pannello del portal) — */
    if (body && Array.isArray(body.updates) && body.updates.length) {
      const { applied, failed } = await applyUpdates(body.updates, catalog, actor, today);
      return res.status(200).json({ ok: failed.length === 0, applied, failed, today });
    }

    return res.status(400).json({ ok: false, error: 'nothing_to_do' });
  } catch (e) {
    console.error('[listings-availability]', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
