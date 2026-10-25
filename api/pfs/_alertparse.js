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
export function classifyAlertEmail({ from = '', subject = '', aliasMarket = null }) {
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
    // ── idealista.com (Spagna, radar per mercato 25/10/2026) ──────────────
    // Il ramo italiano qui sopra resta il primo e resta identico. Le parole
    // degli oggetti spagnoli NON sono verificate su un'email vera: per questo
    // l'alias della casella (+radar-madrid) basta da solo a dire "alert" —
    // una formulazione diversa del portale non deve bloccare la consegna.
    // I negativi vengono prima: un messaggio sull'annuncio, una fattura o una
    // password non diventano mai un alert, alias o no.
    if (f.includes('idealista.com') || aliasMarket) {
      // (+ desactiv/caducad/newsletter: «hemos desactivado tu alerta» e la
      // newsletter arrivano allo stesso alias e non sono alert)
      if (/mensaje|contacto|te ha escrito|respuesta|tu anuncio|factura|contrase|verifica|bienvenid|valoraci|desactiv|caducad|newsletter/i.test(s)) {
        return { source: 'idealista_es', isSearchAlert: false, advertiserHint: null };
      }
      if (/tus? b[uú]squedas?|your search|alerta|nuev[oa]s? (pisos?|anuncios?|inmuebles?|casas?|[aá]ticos?|estudios?|d[uú]plex)|bajad[ao] de precio|price drop/i.test(s) || aliasMarket) {
        return {
          source: 'idealista_es',
          isSearchAlert: true,
          // Applicato dal chiamante SOLO se l'email porta un annuncio solo:
          // in un riepilogo l'oggetto non dice di quale.
          advertiserHint: /particular|private (owner|advertiser)/i.test(s) ? 'private' : null,
        };
      }
      return { source: 'idealista_es', isSearchAlert: false, advertiserHint: null };
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
  // idealista.com (Spagna): /inmueble/<id>/, con prefisso di lingua opzionale.
  // Forma VERIFICATA (www.idealista.com/inmueble/95705077/, 25/10/2026); che i
  // link delle email la contengano dopo il decode è un'IPOTESI, come per .it.
  // Il pattern .it non può prendere .com e viceversa (dominio letterale).
  { portal: 'idealista_es', re: /idealista\.com(?:%2F|\/)(?:(?:en|es|ca|it|pt|de|fr)(?:%2F|\/))?inmueble(?:%2F|\/)(\d{5,12})/gi, canonical: id => `https://www.idealista.com/inmueble/${id}/` },
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

// Extract listing data from the text window around one link occurrence.
function parseWindow(text) {
  const out = { price: null, bedrooms: null, sqm: null, title: null };
  // "1.200 €/mese" | "€ 1.200/mese" | "1.200 € al mese" | bare "1.200 €"
  let m = text.match(/(?:€\s*([\d.,]+)|([\d.,]+)\s*€)\s*(?:\/|al\s)?\s*mese/i)
       || text.match(/€\s*([\d.,]+)/) || text.match(/([\d.,]+)\s*€/);
  if (m) out.price = parseEuro(m[1] || m[2]);
  m = text.match(/(\d+)\s*(?:cam(?:er[ae])?\.?|local[ei]|bedroom)/i);
  if (m) out.bedrooms = parseInt(m[1], 10);
  m = text.match(/(\d+)\s*m[²2]/i);
  if (m) out.sqm = parseInt(m[1], 10);
  return out;
}

// ── Le città fuori Roma (idealista.com) ──────────────────────────────
// I portali romani restano su parseWindow/parseEuro, identici. Per la Spagna
// serve un'altra lettura, perché i formati veri lo esigono:
//   "1.400€/mes 1 hab. 57 m²"            (spagnolo, punto delle migliaia)
//   "1,400€/month 1 bed. 63 m²"          (inglese, VIRGOLA delle migliaia —
//                                          parseEuro la leggeva come decimale
//                                          e restituiva 1)
//   "Ha bajado 60 € … 1.690 € /mes"      (il ribasso non è il canone)

// Senza locale: un separatore seguito da TRE cifre è delle migliaia, da una
// o due è il decimale. "1.400" e "1,400" = 1400; "1.400,50" = 1400.
export function parseMoney(str) {
  if (str == null) return null;
  const t = String(str).trim();
  let n = null;
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) n = parseInt(t.replace(/[.,]/g, ''), 10);
  else if (/^\d{1,3}(?:[.,]\d{3})*[.,]\d{1,2}$/.test(t)) n = parseInt(t.replace(/[.,]\d{1,2}$/, '').replace(/[.,]/g, ''), 10);
  else if (/^\d+$/.test(t)) n = parseInt(t, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const ES_AMOUNT = '(\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{1,2})?|\\d{2,6})';
const ES_PERIOD_AFTER = new RegExp('(?<![\\d.,])' + ES_AMOUNT + '\\s*€\\s*\\/?\\s*(mes|month|maand)\\b', 'i');
const ES_PERIOD_BEFORE = new RegExp('€\\s*' + ES_AMOUNT + '\\s*(?:\\/|per|al)\\s*(mes|month|maand)\\b', 'i');
const ES_ANY_AMOUNT = new RegExp('(?<![\\d.,])' + ES_AMOUNT + '\\s*€|€\\s*' + ES_AMOUNT, 'gi');
const ES_NOT_MONTHLY = /^\s*\/?\s*(?:al |per |a la |por )?(d[ií]a|day|noche|night|semana|week)\b/i;
const ES_TITLE = /(?<![a-z\u00c0-\u024f])((?:alquiler de )?(?:piso|[aá]tico|estudio|d[uú]plex|apartamento|loft|casa|chalet|flat(?: \/ apartment)?|apartment|penthouse|studio|duplex|house)\s+(?:en|in)\s+(?!tus?\s+b[uú]squeda|your\s+search)[^€\n]{4,140}?)(?=\s*\d{1,3}(?:[.,]\d{3})*\s*€|\s+(?:ha bajado|bajada de precio|price (?:drop|reduced))|\n|$)/i;
const PRICE_MIN = 150, PRICE_MAX = 20000;

function plausible(n) { return n != null && n >= PRICE_MIN && n <= PRICE_MAX ? n : null; }

function parseWindowEs(text, { single = false } = {}) {
  const out = { price: null, bedrooms: null, sqm: null, title: null };
  const t = String(text || '').replace(/[ \t\u00a0]+/g, ' ');
  // Prezzo: prima l'importo AGGANCIATO al mese ("€/mes", "/month").
  let m = t.match(ES_PERIOD_AFTER) || t.match(ES_PERIOD_BEFORE);
  if (m) {
    const after = t.slice(m.index + m[0].length);
    if (!ES_NOT_MONTHLY.test(after)) out.price = plausible(parseMoney(m[1]));
  }
  // Ripiego: solo in un'email da UN annuncio e solo se c'è UN importo solo.
  if (out.price == null && single) {
    const seen = new Map();
    let a;
    ES_ANY_AMOUNT.lastIndex = 0;
    while ((a = ES_ANY_AMOUNT.exec(t))) {
      const v = parseMoney(a[1] || a[2]);
      if (v == null) continue;
      if (!seen.has(v)) seen.set(v, a.index + a[0].length);
    }
    if (seen.size === 1) {
      const [[v, end]] = [...seen.entries()];
      if (!ES_NOT_MONTHLY.test(t.slice(end))) out.price = plausible(v);
    }
  }
  m = t.match(/(\d{1,2})\s*(?:hab\.?|habitaci[oó]n(?:es)?|dormitorios?|bed(?:room)?s?\.?)(?![a-z])/i);
  if (m) out.bedrooms = parseInt(m[1], 10);
  m = t.match(/(\d{2,4})\s*m(?:²|2)(?![a-z0-9])/i);
  if (m) out.sqm = parseInt(m[1], 10);
  m = t.match(ES_TITLE);
  if (m) out.title = m[1].replace(/\s+/g, ' ').trim().slice(0, 160);
  if (out.bedrooms == null && out.title && /^(?:alquiler de )?(?:estudio|studio)\b/i.test(out.title)) out.bedrooms = 0;
  // NIENTE inserzionista dal corpo: un piè di pagina "¿Eres particular?"
  // avvelenerebbe ogni annuncio dell'email.
  return out;
}

// I portali romani passano da parseWindow, intatto; idealista.com dal suo.
export function parseWindowFor(portal, text, opts = {}) {
  if (portal === 'idealista_es') return parseWindowEs(text, opts);
  return parseWindow(text);
}

// html: full email body (HTML or plain text).
// Returns [{ sourceUrl, source, price?, bedrooms?, sqm? }] — deduped.
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
      hits.push({ index: m.index, sourceUrl: canonical(m[1]), source: portal });
      if (hits.length > 200) break;
    }
  }
  if (!hits.length) return [];
  hits.sort((a, b) => a.index - b.index);

  // Strip tags once so the per-listing windows are readable text
  const text = body.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  // Map raw-body indices to approximate text windows: use unique URL order
  const seen = new Map(); // sourceUrl → listing
  const uniques = [];
  for (const h of hits) {
    if (!seen.has(h.sourceUrl)) { seen.set(h.sourceUrl, h); uniques.push(h); }
  }

  if (uniques.length === 1) {
    // Single-listing alert (Idealista's usual shape): parse the whole text
    return [{ ...uniques[0], index: undefined, ...parseWindowFor(uniques[0].source, text, { single: true }) }]
      .map(({ index, ...rest }) => (rest.source === 'idealista_es' ? { ...rest, windowText: clip(text) } : rest));
  }

  // Multi-listing digest: window = body slice between this link and the next.
  // L'ultimo annuncio di un riepilogo spagnolo si ferma a 1500 caratteri
  // (non 4000): oltre c'è il piè di pagina. Roma resta a 4000, com'era.
  return uniques.map((h, i) => {
    const next = uniques[i + 1];
    const cap = h.source === 'idealista_es' ? 1500 : 4000;
    const windowRaw = body.slice(h.index, next ? next.index : Math.min(body.length, h.index + cap));
    const windowText = windowRaw.replace(/<[^>]+>/g, ' ');
    const { index, ...rest } = { ...h, ...parseWindowFor(h.source, windowText) };
    return rest.source === 'idealista_es' ? { ...rest, windowText: clip(windowText) } : rest;
  });
}

// Il pezzo di testo intorno all'annuncio, ripulito, per decidere la città
// (radar-markets.resolveListingMarket). Mai il contenuto nei log.
function clip(t) {
  return String(t || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 600);
}
