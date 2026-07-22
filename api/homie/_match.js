// api/homie/_match.js
// Pure scoring helpers for the Homie → PFS bridge.
// Takes a scraped property + a PFS client doc and returns a 0–100 match
// score with human-readable reasons. Has no Firestore or network deps,
// so it's straightforward to unit-test or call from the admin UI bulk
// matcher in the future.
//
// Why this lives next to the endpoint and not in /js/: pfsClients docs
// are written by two different surfaces with two different shapes, and the
// parsing logic is tightly coupled to both:
//   - stripe-webhook.js: raw intake strings ("€800-€1,200", "Studio",
//     "3+", preferred_areas: "Trastevere, Monti")
//   - portal.html admin form (savePFSClient/updatePFSClient): numeric
//     budget (= max) + numeric minBudget, zone: "Trastevere, Monti",
//     bedrooms: '' | '1' | '2' | '3' (where '3' is the "3+" option)

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

// ─── Client budget range ─────────────────────────────────────────────
// Normalizes both pfsClients shapes to { min, max }:
//   - number (portal form)        → max, with optional numeric minBudget floor
//   - bare numeric string "1500"  → ceiling, NOT an exact-match point
//   - "€800-€1,200" / "3000+"     → parsed range (stripe intake)
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
    // "3+" matches anything >= 3. The portal form's top option saves the
    // bare value '3' but its label is "3+ bedrooms", so numeric 3 means 3+.
    const wantsThreePlus = String(client.bedrooms || '').trim().endsWith('+') || wantBeds >= 3;
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
  } else if (wantBeds != null) {
    // Property beds unknown (alert emails often carry price only, and
    // detail-page enrichment 403s from datacenter IPs). Half credit: an
    // unknown must stay NEUTRAL — zero here made well-specified clients
    // receive FEWER matches than clients with no criteria at all.
    score += 15;
    reasons.push('Beds · unknown (property) — neutral');
  }

  // Areas (0–20) — stripe intake writes preferred_areas, portal form writes zone
  const wantedAreas = parseAreas(client.preferred_areas || client.zone);
  const propertyText = normalizeForMatch(
    [property.address, property.zone, property.title].filter(Boolean).join(' ')
  );
  // A title alone ("Bilocale luminoso") says nothing about WHERE the home
  // is — only count a non-match as a real ✗ when address/zone are known.
  const zoneKnown = !!(property.address || property.zone);
  if (wantedAreas.length) {
    const matchedArea = propertyText ? wantedAreas.find(a => propertyText.includes(a)) : null;
    if (matchedArea) {
      score += 20;
      reasons.push('Area ✓ ' + matchedArea);
    } else if (zoneKnown) {
      reasons.push('Area ✗ none of [' + wantedAreas.join(', ') + ']');
    } else {
      // Zone unknown — neutral half credit, same rationale as beds above.
      score += 10;
      reasons.push('Area · unknown (property) — neutral');
    }
  } else {
    // No preference recorded — give a small neutral bump so areas don't tank the score
    score += 10;
    reasons.push('Area · no preference');
  }

  return { score: Math.min(100, score), reasons, reject };
}

// Default threshold above which we push a property to a client's deck.
export const DEFAULT_THRESHOLD = 60;
