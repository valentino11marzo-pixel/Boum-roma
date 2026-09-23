// api/owner/file.js — un documento dell'Archivio del Proprietario, i BYTE.
//
//   POST {ref, as?}   Bearer → controlla TUTTO e conia un biglietto di 60 s
//                     → { ok, url:'/api/owner/file?ticket=…', expiresAt, name, size, contentType }
//   GET  ?ticket=     navigazione vera (niente header): rilegge il ruolo del
//                     visitatore, rifà la stessa risoluzione e serve i byte
//   GET  ?ref=[&as=]  Bearer → gli stessi byte (la condivisione «al commercialista»)
//
// Una sola risoluzione per le tre porte (resolveFile): ref → record → perimetro
// del proprietario → BOOM_OWNER.fileFor (la STESSA funzione che decide cosa la
// pagina elenca) → metadati Storage per percorso → byte per percorso.
//
// Mai un URL tokenizzato fuori dal server: né nella risposta, né nei log. Il
// download va per PERCORSO col Bearer admin sull'host di Storage; l'URL
// salvato si prova solo dopo un 401/403 e solo se punta allo stesso
// bucket+percorso (api/owner/_load.js → storageBytes).
//
// 4,4 MB: Vercel documenta 4,5 MB come tetto del corpo di risposta. Oltre,
// 413 e il messaggio onesto — lo streaming richiede prima la prova (spec §G).
import { setCors } from '../_auth.js';
import { fsGet, fsList } from '../homie/_lib.js';
import OWNER from '../../js/owner-archive-engine.js';
import RENT from '../../js/rent-engine.js';
import FIELDS from '../../js/contract-fields.js';
import DOSSIER from '../../js/property-dossier-engine.js';
import { resolveOwner, loadOwnerView, storageMeta, storageBytes, BUCKETS, UPLOAD_BUCKET, LIMITS } from './_load.js';
import { mintTicket, readTicket, ticketExpiry } from './_ticket.js';

const DEPS = { rent: RENT, fields: FIELDS, dossier: DOSSIER };
const NO_STORE = 'private, no-store, max-age=0';
const DEFAULT_MAX = 4400000;
const SERVABLE = /^(application\/pdf|image\/(jpeg|png|webp))$/;

function maxBytes() {
  const n = Number(process.env.OWNER_FILE_MAX_BYTES);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX;
}
function bodyOf(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  if (typeof b === 'string' || Buffer.isBuffer(b)) { try { return JSON.parse(String(b)) || {}; } catch (_) { return {}; } }
  return {};
}
const q1 = (v) => (v == null ? '' : String(Array.isArray(v) ? v[0] : v));

// ── Gli errori: JSON per le chiamate, una pagina per la navigazione ─────
const STATUS = {
  bad_ref: 400, bad_ticket: 400, ticket_invalid: 401, ticket_expired: 410,
  not_your_property: 403, not_visible: 403, role_changed: 403,
  not_found: 404, too_large: 413, not_configured: 500, read_failed: 500, storage_error: 502,
};
const MSG = {
  bad_ref: 'Il collegamento al documento non è valido.',
  bad_ticket: 'Il collegamento non è valido. Torna all\'archivio e riapri il documento.',
  ticket_invalid: 'Il collegamento non è valido. Torna all\'archivio e riapri il documento.',
  ticket_expired: 'Il collegamento è scaduto: dura un minuto. Torna all\'archivio e riapri il documento.',
  not_your_property: 'Questo documento non è disponibile per il tuo account.',
  not_visible: 'Questo documento non è disponibile per il tuo account.',
  role_changed: 'Questo documento non è disponibile per il tuo account.',
  not_found: 'Il documento non è in archivio.',
  not_configured: 'Il servizio non è configurato. Scrivi a BOOM.',
  read_failed: 'Non riesco a leggere il tuo archivio adesso. Riprova tra poco.',
  storage_error: 'L\'archivio dei file non risponde adesso. Riprova tra poco.',
};
function tooLargeMsg(size) {
  const mb = (Math.round((Number(size) || 0) / 100000) / 10).toFixed(1).replace('.', ',');
  return `Documento di ${mb} MB: troppo grande da aprire qui. Chiedilo a BOOM: te lo mandiamo noi.`;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function htmlPage(message) {
  const wa = 'https://wa.me/' + OWNER.CONTACT.wa;
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex, nofollow"><meta name="color-scheme" content="dark"><title>Archivio — BOOM Roma</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#050506;color:#fff;font:300 17px/1.5 "Helvetica Neue",Helvetica,Arial,sans-serif;padding:24px;box-sizing:border-box}
main{max-width:420px;text-align:center}.m{color:#D4AF37;letter-spacing:6px;font-size:13px;margin-bottom:28px}p{margin:0 0 28px}
a.b{display:inline-block;min-height:44px;line-height:44px;padding:0 22px;border:1px solid #D4AF37;border-radius:18px;color:#D4AF37;text-decoration:none}
a.w{display:block;margin-top:18px;color:#999;font-size:14px}</style></head>
<body><main><div class="m">BOOM</div><p>${esc(message)}</p><a class="b" href="/proprietario">Torna all'archivio</a><a class="w" href="${wa}">Scrivi a BOOM su WhatsApp</a></main></body></html>`;
}
function fail(req, res, error, extra = {}) {
  const status = STATUS[error] || 500;
  const accept = String((req.headers && req.headers.accept) || '');
  if (req.method === 'GET' && accept.includes('text/html')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(status).send(htmlPage(error === 'too_large' ? tooLargeMsg(extra.size) : (MSG[error] || MSG.storage_error)));
  }
  return res.status(status).json({ ok: false, error, ...extra });
}

// ── La risoluzione: una sola per POST, GET ?ticket, GET ?ref ────────────
// → { ok:true, target, meta } | { ok:false, error, extra? }
async function resolveFile(ref, ownerUid, aliases, properties) {
  const r = OWNER.parseRef(ref);
  if (!r) return { ok: false, error: 'bad_ref' };
  const keys = OWNER.ownerKeys(ownerUid, aliases);
  let contracts = [], documents = [];
  if (r.scope !== 'r') {
    const pids = new Set(properties.map((p) => String(p.id)));
    try {
      // Il record chiesto si legge DIRETTO: un contratto su un immobile altrui
      // è «non tuo» (403), non «non trovato».
      if (r.scope === 'c') {
        const c = await fsGet('contracts/' + r.id);
        if (!c) return { ok: false, error: 'not_found' };
        const prop = pids.has(String(c.propertyId || '')) ? properties.find((p) => String(p.id) === String(c.propertyId)) : null;
        if (!prop || !keys.includes(String(prop.ownerId || ''))) return { ok: false, error: 'not_your_property' };
        contracts.push(c);
      } else if (r.scope === 'd') {
        const d = await fsGet('documents/' + r.id);
        if (!d) return { ok: false, error: 'not_found' };
        documents.push(d);
      } else if (r.scope === 'p' && !pids.has(r.id)) {
        return { ok: false, error: 'not_your_property' };
      }
      // Il perimetro completo, come lo vede build: tutti i contratti sugli
      // immobili posseduti (servono al prefisso contracts/<id>/ e alla regola
      // dei doppioni dei documents).
      const lists = await Promise.all([...pids].map((pid) =>
        fsList('contracts', { filter: { field: 'propertyId', op: 'EQUAL', value: pid }, limit: LIMITS.contracts, signal: AbortSignal.timeout(8000) })));
      const seen = new Set(contracts.map((c) => c.id));
      lists.flat().forEach((c) => { if (c && c.id && !seen.has(c.id)) { seen.add(c.id); contracts.push(c); } });
    } catch (_) {
      return { ok: false, error: 'read_failed' };
    }
  }
  const scope = OWNER.scopeFor({ ownerUid, aliases, properties, contracts, documents, buckets: BUCKETS, uploadBucket: UPLOAD_BUCKET });
  const target = OWNER.fileFor(ref, scope, DEPS);
  if (!target.ok) return { ok: false, error: target.error || 'not_found' };
  let meta;
  try { meta = await storageMeta(target.bucket, target.path); }
  catch (e) { console.warn('[owner/file] meta_failed', e && e.status); return { ok: false, error: 'storage_error' }; }
  if (!meta) return { ok: false, error: 'not_found' };
  const limit = maxBytes();
  // Una dimensione ignota non blocca: il download ha comunque il suo tetto.
  if (meta.size != null && meta.size > limit) return { ok: false, error: 'too_large', extra: { size: meta.size, limit } };
  return { ok: true, target, meta };
}

function contentTypeOf(target, meta) {
  const ct = String(meta.contentType || target.contentTypeHint || '').split(';')[0].trim().toLowerCase();
  return SERVABLE.test(ct) ? ct : 'application/octet-stream';
}

async function serveBytes(req, res, resolved) {
  const { target, meta } = resolved;
  let buf;
  try { buf = await storageBytes(target.bucket, target.path, maxBytes(), { fallbackUrl: target.fallbackUrl }); }
  catch (e) {
    if (e && e.status === 413) return fail(req, res, 'too_large', { size: e.size, limit: maxBytes() });
    if (e && e.status === 404) return fail(req, res, 'not_found');
    console.warn('[owner/file] bytes_failed', e && e.status);
    return fail(req, res, 'storage_error');
  }
  const ct = contentTypeOf(target, meta);
  const name = String(target.name || 'BOOM_documento.pdf').replace(/[^\w.-]/g, '_').slice(0, 120);
  res.setHeader('Content-Type', ct);
  res.setHeader('Content-Length', String(buf.length));
  res.setHeader('Content-Disposition', `${ct === 'application/octet-stream' ? 'attachment' : 'inline'}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex');
  console.log('[owner/file] served', target.kind, buf.length);
  return res.status(200).send(buf);
}

export default async function handler(req, res) {
  setCors(req, res);
  res.setHeader('Cache-Control', NO_STORE);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const query = req.query || {};

  // ── POST: il biglietto ──
  if (req.method === 'POST') {
    const who = await resolveOwner(req, res, { asFrom: 'body' });
    if (!who) return;
    const ref = String(bodyOf(req).ref || '');
    const r = await resolveFile(ref, who.ownerUid, who.aliases, who.properties);
    if (!r.ok) return fail(req, res, r.error, r.extra);
    let ticket;
    try { ticket = mintTicket({ viewerUid: who.viewer.uid, ownerUid: who.ownerUid, ref, now: Date.now() }); }
    catch (_) { return fail(req, res, 'not_configured'); }
    console.log('[owner/file] ticket', r.target.kind, who.viewer.role);
    return res.status(200).json({ ok: true, url: '/api/owner/file?ticket=' + ticket, expiresAt: ticketExpiry(ticket),
      name: r.target.name, size: r.meta.size, contentType: contentTypeOf(r.target, r.meta) });
  }

  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  // ── GET ?ticket=: la navigazione ──
  if (query.ticket != null) {
    let t;
    try { t = readTicket(q1(query.ticket), Date.now()); }
    catch (_) { return fail(req, res, 'not_configured'); }
    if (!t.ok) return fail(req, res, t.error);
    // Il ruolo si rilegge ADESSO: il biglietto dice chi ha chiesto, non chi è.
    let v;
    try { v = await fsGet('users/' + t.viewerUid); }
    catch (_) { return fail(req, res, 'read_failed'); }
    const role = v && v.role;
    if (role !== 'landlord' && role !== 'admin') return fail(req, res, 'role_changed');
    if (role === 'landlord' && t.viewerUid !== t.ownerUid) return fail(req, res, 'not_your_property');
    const view = await loadOwnerView(t.ownerUid, role === 'admin' ? { admin: true } : { knownUser: v });
    if (!view.ok) return fail(req, res, view.error === 'owner_not_found' ? 'not_your_property' : view.error);
    const r = await resolveFile(t.ref, t.ownerUid, view.aliases, view.properties);
    if (!r.ok) return fail(req, res, r.error, r.extra);
    return serveBytes(req, res, r);
  }

  // ── GET ?ref=: la condivisione, col Bearer ──
  if (query.ref != null) {
    const who = await resolveOwner(req, res, { asFrom: 'query' });
    if (!who) return;
    const r = await resolveFile(q1(query.ref), who.ownerUid, who.aliases, who.properties);
    if (!r.ok) return fail(req, res, r.error, r.extra);
    return serveBytes(req, res, r);
  }

  return fail(req, res, 'bad_ref');
}
