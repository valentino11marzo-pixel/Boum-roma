// api/media/rehost.js
// LE FOTO DEL SITO SONO NOSTRE.
//
// Fino ad agosto 2026 sei pagine PUBBLICHE — corporate, partners,
// universities, research, virtual-viewing e le schede storiche —
// caricavano le loro immagini da i.imgur.com. Cioe': una pagina che vende
// un servizio da centinaia di euro dipendeva, per la prova visiva, da un
// host di terzi che non controlliamo, che puo' bloccare l'hotlink quando
// vuole, rallentare, o semplicemente cancellare un file. Nessun errore,
// nessun allarme: un giorno le foto smettono di esserci e la pagina resta
// in piedi a vendere con dei riquadri vuoti.
//
// Questa e' la porta che le riporta a casa. Il server (che ha rete vera)
// scarica l'originale, lo verifica, lo mette su Firebase Storage sotto
// site/ con cache lunga, e restituisce la mappa vecchio→nuovo. La riscrittura
// dei file HTML la fa scripts/rehost-images.mjs con quella mappa; il test
// tests/media/hosts.mjs impedisce che la dipendenza rientri domani.
//
// Perche' una porta e non uno script che scarica da solo: l'ambiente di
// sviluppo puo' non raggiungere l'host di partenza (il nostro non lo
// raggiunge), Vercel si'. E' la stessa divisione di sempre — il server
// pensa e ha le chiavi, il resto esegue.
//
// La chiave e' DERIVATA dall'URL di partenza (sha1), quindi:
//   · rieseguire non duplica mai un file;
//   · la mappa e' ricostruibile senza stato;
//   · un file gia' caricato non viene riscaricato (si guarda in Storage).
//
// Metodo:  POST { urls: [...] }  → { ok, mapped:{vecchio:nuovo}, saltati[] }
//          GET                   → la mappa gia' registrata
// Auth:    Bearer CRON_SECRET · X-Homie-Secret · Bearer ID token admin

import crypto from 'node:crypto';
import { getAdminToken, fsGet, fsPatch, readJson } from '../homie/_lib.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';

const BUCKET = process.env.FIREBASE_BUCKET
  || 'boom-property-dashboards.firebasestorage.app';
const CACHE_LUNGA = 'public,max-age=31536000,immutable';
const MAPPA = 'settings/mediaRehost';

const MAX_URL = 60;             // per chiamata
const MAX_BYTE = 12 * 1024 * 1024;
const TIMEOUT_MS = 15000;

// Un'immagine e' un'immagine: il tipo lo decide il server guardando i byte
// veri, non l'estensione nell'URL ne' quello che dice l'host.
const FIRME = [
  [[0xff, 0xd8, 0xff], 'image/jpeg', 'jpg'],
  [[0x89, 0x50, 0x4e, 0x47], 'image/png', 'png'],
  [[0x47, 0x49, 0x46, 0x38], 'image/gif', 'gif'],
];

export function sniff(buf) {
  for (const [firma, tipo, est] of FIRME) {
    if (firma.every((b, i) => buf[i] === b)) return { tipo, est };
  }
  // WEBP: "RIFF"…"WEBP"
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
      && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    return { tipo: 'image/webp', est: 'webp' };
  }
  return null;
}

// La chiave e' derivata: stesso URL → stesso file, per sempre.
export function chiaveDi(url, est) {
  const h = crypto.createHash('sha1').update(String(url)).digest('hex').slice(0, 16);
  return `site/${h}.${est}`;
}

export function urlPubblico(chiave) {
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/`
    + `${encodeURIComponent(chiave)}?alt=media`;
}

async function esisteGia(token, chiave) {
  const r = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(chiave)}`,
    { headers: { Authorization: `Bearer ${token}` } });
  return r.ok;
}

async function carica(token, chiave, buf, tipo) {
  const up = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?name=${encodeURIComponent(chiave)}`,
    { method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': tipo },
      body: buf });
  if (!up.ok) throw new Error('storage_' + up.status);
  try {
    await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(chiave)}`,
      { method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cacheControl: CACHE_LUNGA }) });
  } catch { /* best-effort: la foto serve lo stesso, senza cache lunga */ }
}

async function scarica(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ac.signal, redirect: 'follow' });
    if (!r.ok) return { errore: 'http_' + r.status };
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) return { errore: 'vuoto' };
    if (buf.length > MAX_BYTE) return { errore: 'troppo_grande' };
    const f = sniff(buf);
    // Imgur risponde 200 con una PLACEHOLDER quando il file non c'e' piu':
    // senza guardare i byte l'avremmo copiata e servita come se fosse la
    // foto vera. Un tipo sconosciuto qui e' un NO, non un forse.
    if (!f) return { errore: 'non_e_un_immagine' };
    return { buf, ...f };
  } catch (e) {
    return { errore: e.name === 'AbortError' ? 'timeout' : 'rete' };
  } finally { clearTimeout(t); }
}

export default async function handler(req, res) {
  const attore = await requireCronOrAdmin(req, res);
  if (!attore) return;

  const doc = await fsGet(MAPPA).catch(() => null);
  const mappa = (doc && doc.mappa) || {};

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, mapped: mappa, count: Object.keys(mappa).length });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const body = await readJson(req).catch(() => ({}));
  const urls = [...new Set((Array.isArray(body.urls) ? body.urls : [])
    .map(String).filter(u => /^https:\/\//.test(u)))].slice(0, MAX_URL);
  if (!urls.length) return res.status(400).json({ ok: false, error: 'no_urls' });

  const token = await getAdminToken();
  const fatti = {}, saltati = [];

  for (const url of urls) {
    if (mappa[url]) { fatti[url] = mappa[url]; continue; }
    const g = await scarica(url);
    if (g.errore) { saltati.push({ url, motivo: g.errore }); continue; }
    const chiave = chiaveDi(url, g.est);
    try {
      if (!await esisteGia(token, chiave)) await carica(token, chiave, g.buf, g.tipo);
      fatti[url] = urlPubblico(chiave);
    } catch (e) {
      saltati.push({ url, motivo: String(e.message || e) });
    }
  }

  const nuova = { ...mappa, ...fatti };
  if (Object.keys(fatti).length) {
    await fsPatch(MAPPA, { mappa: nuova, updatedAt: new Date().toISOString(),
                           updatedBy: attore }).catch(() => {});
  }
  return res.status(200).json({
    ok: true, mapped: fatti, saltati,
    totale: Object.keys(nuova).length,
    // Un salto NON e' un dettaglio: quell'immagine resta su un host di
    // terzi e la pagina continua a dipenderne. Si dice, non si nasconde.
    nota: saltati.length ? `${saltati.length} immagini NON riportate a casa` : null,
  });
}
