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
    return [{ ...uniques[0], index: undefined, ...parseWindow(text) }]
      .map(({ index, ...rest }) => rest);
  }

  // Multi-listing digest: window = body slice between this link and the next
  return uniques.map((h, i) => {
    const next = uniques[i + 1];
    const windowRaw = body.slice(h.index, next ? next.index : Math.min(body.length, h.index + 4000));
    const windowText = windowRaw.replace(/<[^>]+>/g, ' ');
    const { index, ...rest } = { ...h, ...parseWindow(windowText) };
    return rest;
  });
}
