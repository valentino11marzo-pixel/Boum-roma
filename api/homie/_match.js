// api/homie/_match.js
// Pure scoring helpers for the Homie → PFS bridge.
// Takes a scraped property + a PFS client doc and returns a 0–100 match
// score with human-readable reasons. Has no Firestore or network deps,
// so it's straightforward to unit-test or call from the admin UI bulk
// matcher in the future.
//
// Why this lives next to the endpoint and not in /js/: pfsClients fields
// are persisted as the raw strings the form collected ("€800-€1,200",
// "Studio", "3+", "Trastevere, Monti"), so the parsing logic is tightly
// coupled to the existing pfsClients schema written by stripe-webhook.js.

// ─── Budget parsing ──────────────────────────────────────────────────
// "€800-€1,200" → { min: 800, max: 1200 }
// "€3,000+"     → { min: 3000, max: Infinity }
// "1500"        → { min: 1500, max: 1500 } (single number fallback)
export function parseBudgetRange(raw) {
  if (!raw) return null;
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

// Resolve a client's budget window regardless of which schema wrote the doc:
//   • stripe-webhook.js → budget = "€800-€1,200" / "€3,000+" (string range)
//   • portal.html admin → budget = 1200 (numeric max) + minBudget = 800
// A bare numeric `budget` is treated as the MAX (0..max, or minBudget..max),
// not an exact target, so a cheaper-than-max flat still counts as in-range.
export function clientBudgetRange(client) {
  if (!client) return null;
  const budgetStr = String(client.budget ?? '').trim();
  const looksNumeric = budgetStr !== '' && /^\d[\d.,\s]*$/.test(budgetStr); // no €, -, +
  const maxNum = Number(budgetStr.replace(/[,\s]/g, ''));
  if (looksNumeric && isFinite(maxNum) && maxNum > 0) {
    const minNum = Number(String(client.minBudget ?? '').replace(/[,\s]/g, ''));
    const lo = (isFinite(minNum) && minNum > 0) ? Math.min(minNum, maxNum) : 0;
    return { min: lo, max: Math.max(minNum > 0 ? minNum : 0, maxNum) };
  }
  return parseBudgetRange(client.budget);
}

// ─── Bedrooms parsing ────────────────────────────────────────────────
// "Studio"  → 0
// "1"       → 1
// "3+"      → 3 (treated as >= 3)
export function parseBedrooms(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().toLowerCase();
  if (s === 'studio' || s === '0') return 0;
  if (/^\d+\+?$/.test(s)) return parseInt(s, 10);
  const n = parseInt(s, 10);
  return isFinite(n) ? n : null;
}

// ─── Areas parsing ───────────────────────────────────────────────────
// "Trastevere, Monti, Centro" → ['trastevere', 'monti', 'centro']
// Splits on , ; / & "and" "e ", strips diacritics, lowercases.
export function parseAreas(raw) {
  if (!raw) return [];
  return String(raw)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .split(/[,;/&]| and | e (?=[a-z])/)
    .map(s => s.trim())
    .filter(s => s.length >= 3);
}

// Normalize a property's address/zone the same way for comparison.
export function normalizeForMatch(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ─── Scoring ─────────────────────────────────────────────────────────
// Returns { score: 0..100, reasons: string[], reject: string|null }.
// `reject` is set when a hard veto applies (e.g. budget way over) — the
// caller can still see the score for debug but should skip the push.
export function scoreMatch(property, client) {
  const reasons = [];
  let score = 0;
  let reject = null;

  // Budget (0–50)
  const budgetRange = clientBudgetRange(client);
  const price = typeof property.price === 'number' ? property.price : parseFloat(property.price);
  if (budgetRange && isFinite(price)) {
    if (price >= budgetRange.min && price <= budgetRange.max) {
      score += 50;
      reasons.push('Budget ✓ €' + Math.round(price) + ' in range');
    } else {
      // Soft window: within 20% of range bounds
      const lower = budgetRange.min * 0.8;
      const upper = budgetRange.max === Infinity ? Infinity : budgetRange.max * 1.2;
      if (price >= lower && price <= upper) {
        score += 25;
        reasons.push('Budget ≈ €' + Math.round(price) + ' near range');
      } else if (price > upper) {
        reject = 'over_budget';
        reasons.push('Budget ✗ €' + Math.round(price) + ' over max');
      } else {
        reasons.push('Budget · €' + Math.round(price) + ' below range');
      }
    }
  } else if (!budgetRange) {
    reasons.push('Budget · unknown (client)');
  } else {
    reasons.push('Budget · unknown (property)');
  }

  // Bedrooms (0–30)
  const wantBeds = parseBedrooms(client.bedrooms);
  const haveBeds = typeof property.bedrooms === 'number'
    ? property.bedrooms
    : (typeof property.rooms === 'number' ? property.rooms : null);
  if (wantBeds != null && haveBeds != null) {
    // "3+" matches anything >= 3
    const wantsThreePlus = String(client.bedrooms || '').trim().endsWith('+');
    const exact = wantsThreePlus ? (haveBeds >= wantBeds) : (haveBeds === wantBeds);
    if (exact) {
      score += 30;
      reasons.push('Beds ✓ ' + haveBeds);
    } else if (Math.abs(haveBeds - wantBeds) === 1) {
      score += 15;
      reasons.push('Beds ≈ ' + haveBeds + ' (wanted ' + wantBeds + ')');
    } else {
      reasons.push('Beds ✗ ' + haveBeds + ' (wanted ' + wantBeds + ')');
    }
  }

  // Areas (0–20). preferred_areas (stripe) or zone (admin form) — same parser.
  const wantedAreas = parseAreas(client.preferred_areas || client.zone);
  const propertyText = normalizeForMatch(
    [property.address, property.zone, property.title].filter(Boolean).join(' ')
  );
  if (wantedAreas.length && propertyText) {
    const matchedArea = wantedAreas.find(a => propertyText.includes(a));
    if (matchedArea) {
      score += 20;
      reasons.push('Area ✓ ' + matchedArea);
    } else {
      reasons.push('Area ✗ none of [' + wantedAreas.join(', ') + ']');
    }
  } else if (wantedAreas.length === 0) {
    // No preference recorded — give a small neutral bump so areas don't tank the score
    score += 10;
    reasons.push('Area · no preference');
  }

  return { score: Math.min(100, score), reasons, reject };
}

// Default threshold above which we push a property to a client's deck.
export const DEFAULT_THRESHOLD = 60;
