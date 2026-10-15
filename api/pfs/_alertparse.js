// api/pfs/_alertparse.js
// Pure parsing of portal alert emails (Idealista "della tua ricerca",
// Immobiliare saved-search alerts). No network, no Firestore — so it's
// trivially unit-testable.
//
// Strategy: alert emails wrap listing links in tracking redirects, so we
// never trust the href shape — we hunt for the listing ID pattern anywhere
// in the (URL-decoded) body and reconstruct the canonical URL from the ID.
// Per-listing data (price / rooms / sqm) is read from the text window
// between one listing link and the next.

// ── Email classification ─────────────────────────────────────────────
// Decides whether a message is a search alert worth parsing, and which
// portal it came from. Agency-side notifications (telefonate, messaggi
// sugli annunci ImmobiliarePro/Idealista Pro) are explicitly skipped.
export function classifyAlertEmail({ from = '', subject = '' }) {
  const f = String(from).toLowerCase();
  const s = String(subject).toLowerCase();

  if (f.includes('idealista')) {
    // e.g. "Nuovo appartamento di un privato della tua ricerca: ..."
    if (/della tua ricerca|tuoi criteri|nuov[oi].*annunci/.test(s)) {
      return {
        source: 'idealista',
        isSearchAlert: true,
        advertiserHint: /privat[oi]/.test(s) ? 'private' : null,
      };
    }
    return { source: 'idealista', isSearchAlert: false, advertiserHint: null };
  }

  if (f.includes('immobiliare')) {
    // Saved-search alerts; excludes "Telefonata ricevuta", "Nuovo contatto
    // per l'annuncio", "Messaggio di ..." (agency-side ImmobiliarePro mail)
    if (/telefonata|nuovo contatto per l|messaggio di /.test(s)) {
      return { source: 'immobiliare', isSearchAlert: false, advertiserHint: null };
    }
    if (/nuov[oi].*annunc|tua ricerca|ricerca salvata|in linea con/.test(s)) {
      return {
        source: 'immobiliare',
        isSearchAlert: true,
        advertiserHint: /privat[oi]/.test(s) ? 'private' : null,
      };
    }
    return { source: 'immobiliare', isSearchAlert: false, advertiserHint: null };
  }

  if (f.includes('casafari')) {
    // Casafari only sends saved-search match alerts (no agency-side phone/
    // message noise like the portals), so any Casafari mail is treated as a
    // search alert. Listing links are pulled from the body by ID_PATTERNS
    // below — including the underlying idealista/immobiliare listings the
    // alert aggregates — and the advertiser is resolved later from the
    // listing detail page. Non-alert mail (billing, etc.) yields zero
    // listings downstream, so it's a harmless no-op.
    return { source: 'casafari', isSearchAlert: true, advertiserHint: null };
  }

  return { source: null, isSearchAlert: false, advertiserHint: null };
}

const ID_PATTERNS = [
  { portal: 'idealista',   re: /idealista\.it(?:%2F|\/)immobile(?:%2F|\/)(\d+)/gi,  canonical: id => `https://www.idealista.it/immobile/${id}/` },
  { portal: 'immobiliare', re: /immobiliare\.it(?:%2F|\/)annunci(?:%2F|\/)(\d+)/gi, canonical: id => `https://www.immobiliare.it/annunci/${id}/` },
  // Best-effort native Casafari listing links. Casafari alert emails usually
  // also reference the underlying portal listing (caught by the patterns
  // above); this is the fallback for links that stay on casafari.com. The
  // exact path segment should be confirmed against a real Casafari alert.
  { portal: 'casafari',    re: /casafari\.com(?:%2F|\/)(?:[a-z]{2}(?:%2F|\/))?(?:propert(?:y|ies)|listing|immobile|inmueble|imovel)(?:%2F|\/)(\d{4,})/gi, canonical: id => `https://www.casafari.com/property/${id}` },
];

function parseEuro(str) {
  if (!str) return null;
  const n = parseInt(String(str).replace(/[.\s]/g, '').replace(/,\d+$/, ''), 10);
  return isFinite(n) && n > 0 ? n : null;
}

// ── Vendita o affitto ────────────────────────────────────────────────
// LA LEZIONE DEL 30 SETTEMBRE 2026 (/api/meteo vuoto in produzione): l'unica
// ricerca salvata che scriveva alla casella degli alert era una ricerca di
// VENDITA ("Case e appartamenti a Centro", 475.000 € · 6.507 €/m²). Il parser
// non sapeva distinguere e leggeva come canone mensile il primo numero dopo
// un "€" — cioè i 6.507 €/m² del prezzo di vendita. Una casa in vendita
// entrava nel radar PFS e nel libro mastro del Perito come «affitto privato
// da €6.507/mese»: un numero inventato, proprio quello che il Perito giura
// di non pubblicare mai. Qui si decide sulla PROVA dentro l'email: prima
// quella STRUTTURALE che il portale stampa sui suoi link (campagna utm
// `…_sale_…`, percorso `/vendita-case/`), poi le parole ("in vendita",
// "€/mese") — perché la descrizione di una casa in vendita può dire "spese
// condominiali 120 €/mese". Due segnali opposti dello stesso livello → null:
// non si indovina.
const SALE_STRUCT = [
  /utm_campaign=[^&"'\s<>]*[_-]sale(?=[_\-&"'\s<>]|$)/gi,
  /\/vendita-[a-z-]+\//gi,
];
const RENT_STRUCT = [
  /utm_campaign=[^&"'\s<>]*[_-]rent(?=[_\-&"'\s<>]|$)/gi,
  /\/affitto-[a-z-]+\//gi,
];
const SALE_WORDS = [/\bin vendita\b/gi];
const RENT_WORDS = [/\bin affitto\b/gi, /€\s*(?:\/|al\s)\s*mese\b/gi, /\bal mese\b/gi];
const countSigns = (list, text) => list.reduce((n, re) => { re.lastIndex = 0; return n + ((String(text).match(re) || []).length); }, 0);
function verdict(saleList, rentList, text) {
  const sale = countSigns(saleList, text), rent = countSigns(rentList, text);
  if (sale && !rent) return 'sale';
  if (rent && !sale) return 'rent';
  return sale ? 'ambiguous' : null;
}

export function transactionOf(text) {
  if (!text) return null;
  const structural = verdict(SALE_STRUCT, RENT_STRUCT, text);
  if (structural === 'ambiguous') return null;
  if (structural) return structural;
  const words = verdict(SALE_WORDS, RENT_WORDS, text);
  return words === 'ambiguous' ? null : words;
}

// Nessun canone mensile a Roma arriva a questa cifra: sopra, il numero letto
// è un prezzo di VENDITA (o un errore di lettura), mai un affitto. È la
// rete sotto transactionOf, per le email che non dichiarano cosa sono.
export const MAX_PLAUSIBLE_RENT = 30000;

// Il cancello prima dell'ingestione: un annuncio entra nel radar come
// AFFITTO solo se niente dice il contrario. Puro, così si testa.
export function rentGate(listing, price) {
  if (listing && listing.transaction === 'sale') return { ok: false, reason: 'sale_listing' };
  if (Number.isFinite(price) && price > MAX_PLAUSIBLE_RENT) return { ok: false, reason: 'price_not_rent' };
  return { ok: true };
}

// ── Il titolo dell'annuncio (dove sta la ZONA) ───────────────────────
// Idealista scrive "Trilocale in Via Domenichino, 4, Monti, Roma" nel title
// del link all'annuncio e come testo del link stesso. Prima si buttava via e
// scan-inbox passava come titolo l'OGGETTO dell'email ("…della tua ricerca:
// Case e appartamenti a Centro!") — cioè l'etichetta della RICERCA, da cui
// inferZone non ricava niente (o, peggio, la zona della ricerca invece di
// quella della casa). Senza zona il Perito non scrive nessuna statistica.
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&(?:apos|rsquo|lsquo);/g, "'")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function attr(tag, name) {
  const m = new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"', 'i').exec(tag || '')
         || new RegExp('\\b' + name + "\\s*=\\s*'([^']*)'", 'i').exec(tag || '');
  return m ? m[1] : null;
}
function cleanTitle(t) {
  const s = decodeEntities(t).replace(/\s+/g, ' ').trim();
  return s.length >= 8 && s.length <= 160 && /[a-zà-ú]{3,}\s+\S+/i.test(s) ? s : null;
}
// Il titolo dal link che contiene l'occorrenza (idx dentro href): prima il
// suo attributo title, poi il testo del link, poi il title dell'immagine
// dentro il link. Solo dai link <a>: un id citato nel testo non ha titolo.
function linkTitle(body, idx) {
  const start = body.lastIndexOf('<', idx);
  const end = body.indexOf('>', idx);
  if (start < 0 || end < 0 || body.lastIndexOf('>', idx) > start) return null;
  const tag = body.slice(start, end + 1);
  if (!/^<a\b/i.test(tag)) return null;
  const own = cleanTitle(attr(tag, 'title'));
  if (own) return own;
  const close = body.indexOf('</a>', end);
  if (close < 0 || close - end > 3000) return null;
  const inner = body.slice(end + 1, close);
  const img = /<img\b[^>]*>/i.exec(inner);
  return cleanTitle(inner.replace(/<[^>]+>/g, ' ')) || (img ? cleanTitle(attr(img[0], 'title')) : null);
}

// Extract listing data from the text window around one link occurrence.
function parseWindow(text) {
  const out = { price: null, bedrooms: null, sqm: null };
  // "1.200 €/mese" | "€ 1.200/mese" | "1.200 € al mese" | bare "1.200 €".
  // Il numero seguito da "€/m²" è un PREZZO AL METRO, mai il prezzo: la
  // vecchia terza regola (€ poi numero) scavalcava gli spazi e leggeva
  // "475.000 €   6.507 €/m²" come 6.507.
  let m = text.match(/(?:€\s*(\d[\d.,]*)|(\d[\d.,]*)\s*€)\s*(?:\/|al\s)?\s*mese/i)
       || text.match(/(\d[\d.,]*)\s*€(?!\s*\/\s*m)/)
       || text.match(/€\s*(\d[\d.,]*)(?![\d.,]*\s*(?:€\s*)?\/\s*m)/);
  if (m) out.price = parseEuro(m[1] || m[2]);
  m = text.match(/(\d+)\s*(?:cam(?:er[ae])?\.?|local[ei]|bedroom)/i);
  if (m) out.bedrooms = parseInt(m[1], 10);
  m = text.match(/(\d+)\s*m[²2]/i);
  if (m) out.sqm = parseInt(m[1], 10);
  return out;
}

// html: full email body (HTML or plain text).
// Returns [{ sourceUrl, source, price?, bedrooms?, sqm?, title?, transaction? }]
// — deduped. transaction: 'sale' | 'rent' | null (non dichiarato → null).
export function extractListings(html) {
  if (!html) return [];
  let body = String(html);
  try { body = decodeURIComponent(body.replace(/%(?![0-9a-fA-F]{2})/g, '%25')); }
  catch { /* keep raw body if decode fails */ }

  // Collect every (position, canonicalUrl) hit across both portals
  const hits = [];
  for (const { portal, re, canonical } of ID_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(body))) {
      // Il link PRINCIPALE all'annuncio, non una sua sottopagina
      // (".../immobile/<id>/segnalazione-immobile" porta il title "avisar
      // que no es particular": non è il nome della casa).
      const after = body.slice(m.index + m[0].length, m.index + m[0].length + 2);
      const main = !/^\/[a-z]/i.test(after);
      hits.push({ index: m.index, sourceUrl: canonical(m[1]), source: portal, main });
      if (hits.length > 200) break;
    }
  }
  if (!hits.length) return [];
  hits.sort((a, b) => a.index - b.index);

  // Il titolo di ogni annuncio: il primo link principale che ne porta uno.
  const titles = new Map();
  for (const h of hits) {
    if (!h.main || titles.has(h.sourceUrl)) continue;
    const t = linkTitle(body, h.index);
    if (t) titles.set(h.sourceUrl, t);
  }
  const mailTx = transactionOf(body);

  // Strip tags once so the per-listing windows are readable text
  const text = body.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  // Map raw-body indices to approximate text windows: use unique URL order
  const seen = new Map(); // sourceUrl → listing
  const uniques = [];
  for (const h of hits) {
    if (!seen.has(h.sourceUrl)) { seen.set(h.sourceUrl, h); uniques.push(h); }
  }

  const shape = (h, win, rawWin) => ({
    sourceUrl: h.sourceUrl,
    source: h.source,
    ...parseWindow(win),
    title: titles.get(h.sourceUrl) || null,
    // La prova della SUA finestra prima; poi quella dell'email intera.
    transaction: transactionOf(rawWin) || mailTx,
  });

  if (uniques.length === 1) {
    // Single-listing alert (Idealista's usual shape): parse the whole text
    return [shape(uniques[0], text, body)];
  }

  // Multi-listing digest: window = body slice between this link and the next
  return uniques.map((h, i) => {
    const next = uniques[i + 1];
    const windowRaw = body.slice(h.index, next ? next.index : Math.min(body.length, h.index + 4000));
    const windowText = windowRaw.replace(/<[^>]+>/g, ' ');
    return shape(h, windowText, windowRaw);
  });
}
