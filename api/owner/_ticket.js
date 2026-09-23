// api/owner/_ticket.js — il biglietto di un minuto per aprire UN file.
//
// Perché esiste. Il PDF del proprietario si apre con una navigazione vera
// (su iPhone `location.assign` porta al visore nativo): una navigazione non
// porta l'header Authorization, e mettere l'ID token Firebase nell'URL vorrebbe
// dire spedirlo nei log di Vercel e nella cronologia del browser. Allora il
// browser chiede, CON il suo token, un biglietto firmato dal server che vale
// sessanta secondi per quel file, per quel visitatore, per quel proprietario —
// e naviga su quello.
//
// Il biglietto NON è una credenziale del file: alla lettura il server rilegge
// il ruolo del visitatore (un proprietario diventato inquilino nel frattempo
// non apre niente) e rifà da capo la stessa risoluzione del POST. Il biglietto
// dice solo «chi ha chiesto cosa, fino a quando».
//
// Forma: base64url(JSON {v, o, r, e}) + '.' + base64url(HMAC-SHA256(k, payload))
//   v = uid del visitatore · o = uid del proprietario · r = ref del file
//   e = scadenza (secondi epoch)
//   k = HMAC-SHA256(HOMIE_SECRET, 'owner-file-ticket:v1') — una chiave DERIVATA:
//   il contesto è diverso da ogni altro token derivato del repo, quindi un
//   biglietto non vale come link di firma, di Scheda o di pagamento.
// Ruotare HOMIE_SECRET invalida ogni biglietto in volo (durano un minuto).
//
// Errori di lettura (ERRATA E5 — tre casi, non due, perché il rimedio è diverso):
//   bad_ticket     forma sbagliata (400: il link è rotto, non manomesso)
//   ticket_invalid firma che non torna (401: qualcuno l'ha toccato)
//   ticket_expired scaduto (410: riapri dall'archivio)
import crypto from 'node:crypto';

const CONTEXT = 'owner-file-ticket:v1';
const MAX_LEN = 1200;

function secretKey() {
  const s = process.env.HOMIE_SECRET;
  if (!s) { const e = new Error('not_configured'); e.code = 'not_configured'; throw e; }
  return crypto.createHmac('sha256', s).update(CONTEXT).digest();
}
const b64u = (buf) => Buffer.from(buf).toString('base64url');
function epochSec(now) {
  const ms = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(ms)) throw new Error('now non valido');
  return Math.floor(ms / 1000);
}

export function mintTicket({ viewerUid, ownerUid, ref, now = Date.now(), ttlSec = 60 } = {}) {
  const k = secretKey();
  if (!viewerUid || !ownerUid || !ref) throw new Error('ticket: campi mancanti');
  const payload = b64u(JSON.stringify({ v: String(viewerUid), o: String(ownerUid), r: String(ref), e: epochSec(now) + Math.max(1, Number(ttlSec) || 60) }));
  const sig = b64u(crypto.createHmac('sha256', k).update(payload).digest());
  return payload + '.' + sig;
}

// La scadenza del biglietto appena coniato, in ISO (per la risposta del POST).
export function ticketExpiry(t) {
  try { const p = JSON.parse(Buffer.from(String(t).split('.')[0], 'base64url').toString('utf8')); return new Date(p.e * 1000).toISOString(); }
  catch (_) { return null; }
}

export function readTicket(t, now = Date.now()) {
  const k = secretKey();   // senza segreto non si legge nulla: lancia not_configured
  if (typeof t !== 'string' || !t || t.length > MAX_LEN || !/^[\w-]+\.[\w-]+$/.test(t)) return { ok: false, error: 'bad_ticket' };
  const [payload, sig] = t.split('.');
  const want = crypto.createHmac('sha256', k).update(payload).digest();
  let got;
  try { got = Buffer.from(sig, 'base64url'); } catch (_) { return { ok: false, error: 'bad_ticket' }; }
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return { ok: false, error: 'ticket_invalid' };
  let p;
  try { p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch (_) { return { ok: false, error: 'bad_ticket' }; }
  if (!p || typeof p !== 'object' || typeof p.v !== 'string' || typeof p.o !== 'string' || typeof p.r !== 'string' || !Number.isFinite(p.e)) {
    return { ok: false, error: 'bad_ticket' };
  }
  if (epochSec(now) > p.e) return { ok: false, error: 'ticket_expired' };
  return { ok: true, viewerUid: p.v, ownerUid: p.o, ref: p.r };
}
