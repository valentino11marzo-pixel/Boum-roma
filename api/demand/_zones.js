// api/demand/_zones.js
// Zone canon shared by /api/demand/zones and /api/valuation/estimate.
//
// The 10 tracked Rome zones. slugs / labels / matchTerms are copied VERBATIM
// from scripts/neighborhoods-data.js (the SSG source of truth that builds
// /apartments-in/{slug}). If a zone is added there, mirror it here.
//
// Pure module — no Firestore or network deps. Also hosts the budget parsing
// helpers (adapted from api/homie/_match.js clientBudgetRange) and small
// stats utilities so both endpoints compute percentiles the same way.

export const ZONES = [
  {
    slug: 'trastevere',
    label: 'Trastevere',
    matchTerms: ['trastevere', 'gianicolo', 'monteverde vecchio'],
  },
  {
    slug: 'centro-storico',
    label: 'Centro Storico',
    matchTerms: ['centro storico', 'centro-storico', 'historic centre', 'historic center', 'pantheon', 'navona', 'centro', 'coronari', 'campo de\' fiori', 'campo dei fiori', 'piazza farnese', 'trevi', 'spanish steps', 'piazza di spagna'],
  },
  {
    slug: 'monti',
    label: 'Monti',
    matchTerms: ['monti', 'rione monti', 'colosseo', 'colosseum', 'cavour', 'fori imperiali', 'santa maria maggiore', 'esquilino-monti'],
  },
  {
    slug: 'prati',
    label: 'Prati',
    matchTerms: ['prati', 'mazzini', 'delle vittorie', 'vatican', 'vaticano', 'cola di rienzo', 'ottaviano', 'lepanto', 'castel sant\'angelo', 'angelico'],
  },
  {
    slug: 'pigneto',
    label: 'Pigneto',
    matchTerms: ['pigneto', 'via del pigneto', 'centocelle', 'casilina'],
  },
  {
    slug: 'testaccio',
    label: 'Testaccio',
    matchTerms: ['testaccio', 'monte testaccio', 'mattatoio', 'piramide-testaccio'],
  },
  {
    slug: 'ostiense',
    label: 'Ostiense',
    matchTerms: ['ostiense', 'garbatella', 'marconi', 'piramide', 'gazometro', 'roma tre'],
  },
  {
    slug: 'trieste-coppede',
    label: 'Trieste & Coppedè',
    matchTerms: ['trieste', 'coppedè', 'coppede', 'salario', 'parioli', 'villa ada', 'villa torlonia', 'nomentano', 'levico'],
  },
  {
    slug: 'san-lorenzo',
    label: 'San Lorenzo',
    matchTerms: ['san lorenzo', 'sapienza', 'verano', 'tiburtina', 'via dei volsci'],
  },
  {
    slug: 'esquilino',
    label: 'Esquilino',
    matchTerms: ['esquilino', 'piazza vittorio', 'termini', 'vittorio emanuele', 'manzoni', 'mercato esquilino'],
  },
];

export const ZONE_BY_SLUG = new Map(ZONES.map(z => [z.slug, z]));

// Lowercase + strip accents (same normalization api/homie/_match.js uses),
// so "Coppedè" ≡ "coppede" and "Sant'Angelo" matches regardless of casing.
export function normalizeText(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Pre-normalize the terms once (module scope — pure data).
const NORM_TERMS = ZONES.map(z => ({
  slug: z.slug,
  terms: z.matchTerms.map(t => normalizeText(t)),
}));

// matchZone(freeText) → slug | null
// Case-insensitive substring match of every zone's matchTerms against the
// text. When several zones match (e.g. "centro" is a term of centro-storico
// but "centro storico" also contains it), the LONGEST matched term wins —
// the most specific zone. A bare slug ("trieste-coppede") also matches.
export function matchZone(freeText) {
  const text = normalizeText(freeText);
  if (!text) return null;
  if (ZONE_BY_SLUG.has(text)) return text; // exact slug passed in
  let best = null;
  let bestLen = 0;
  for (const z of NORM_TERMS) {
    for (const term of z.terms) {
      if (term.length > bestLen && text.includes(term)) {
        best = z.slug;
        bestLen = term.length;
      }
    }
  }
  return best;
}

// Terms too generic to trust inside FREE TEXT (titles/addresses): "vicino al
// centro commerciale" is not Centro Storico. They stay valid for structured
// zone fields, where "Centro" genuinely means the centre.
const AMBIGUOUS_TERMS = new Set(['centro']);

// matchZoneStrict(freeText) → slug | null — like matchZone but ignores the
// ambiguous terms. Use it when matching listing titles/addresses.
export function matchZoneStrict(freeText) {
  const text = normalizeText(freeText);
  if (!text) return null;
  if (ZONE_BY_SLUG.has(text)) return text;
  let best = null;
  let bestLen = 0;
  for (const z of NORM_TERMS) {
    for (const term of z.terms) {
      if (!AMBIGUOUS_TERMS.has(term) && term.length > bestLen && text.includes(term)) {
        best = z.slug;
        bestLen = term.length;
      }
    }
  }
  return best;
}

// matchZones(freeText) → string[] of distinct slugs
// For texts that name several zones at once ("Trastevere, Monti, Prati" —
// pfsClients.preferred_areas / leads.zone are free comma strings).
export function matchZones(freeText) {
  const text = normalizeText(freeText);
  if (!text) return [];
  const out = new Set();
  if (ZONE_BY_SLUG.has(text)) out.add(text);
  for (const z of NORM_TERMS) {
    if (z.terms.some(term => text.includes(term))) out.add(z.slug);
  }
  return [...out];
}

// ─── Budget parsing (adapted from api/homie/_match.js) ─────────────────────

// "€800-€1,200" → { min: 800, max: 1200 }
// "€3,000+"     → { min: 3000, max: Infinity }
// "1500"        → { min: 1500, max: 1500 }
export function parseBudgetRange(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).replace(/€/g, '').replace(/[,.\s](?=\d{3}\b)/g, '').trim();
  if (!s) return null;
  if (s.endsWith('+')) {
    const n = parseFloat(s.slice(0, -1));
    if (!isFinite(n)) return null;
    return { min: n, max: Infinity };
  }
  const m = s.match(/^([\d.]+)\s*-\s*([\d.]+)$/);
  if (m) {
    const lo = parseFloat(m[1]);
    const hi = parseFloat(m[2]);
    if (!isFinite(lo) || !isFinite(hi)) return null;
    return { min: Math.min(lo, hi), max: Math.max(lo, hi) };
  }
  const single = parseFloat(s);
  if (isFinite(single)) return { min: single, max: single };
  return null;
}

// Normalizes both pfsClients shapes to { min, max } (mirrors
// api/homie/_match.js clientBudgetRange — number = ceiling, string range
// = stripe intake, bare numeric string = ceiling).
export function clientBudgetRange(client) {
  if (!client) return null;
  const raw = client.budget;
  if (raw == null || raw === '') return null;
  const minB = Number(client.minBudget);
  const floor = isFinite(minB) && minB > 0 ? minB : 0;
  if (typeof raw === 'number') {
    return isFinite(raw) && raw > 0 ? { min: floor, max: raw } : null;
  }
  const s = String(raw).trim();
  if (/^[€\d.,\s]+$/.test(s) && !/-/.test(s)) {
    const parsed = parseBudgetRange(s);
    return parsed ? { min: floor, max: parsed.max } : null;
  }
  return parseBudgetRange(s);
}

// Collapse whatever budget shape we have (number, numeric string,
// "€800-€1,200", { min, max }) into ONE representative €/month number for
// aggregation: the ceiling when finite, else the floor. null when unusable.
export function budgetNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return isFinite(value) && value > 0 ? Math.round(value) : null;
  if (typeof value === 'object') {
    const { min, max } = value;
    if (isFinite(max) && max > 0) return Math.round(max);
    if (isFinite(min) && min > 0) return Math.round(min);
    return null;
  }
  const parsed = parseBudgetRange(value);
  return parsed ? budgetNumber(parsed) : null;
}

// ─── Small stats helpers ────────────────────────────────────────────────────

// quantile(sortedNumbersAsc, 0.25) — linear interpolation between ranks.
export function quantile(sortedAsc, p) {
  if (!Array.isArray(sortedAsc) || sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

export function median(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  return quantile(sorted, 0.5);
}
