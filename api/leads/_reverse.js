// api/leads/_reverse.js — LA RICERCA ROVESCIATA.
//
// L'ASIMMETRIA CHE NESSUNO STAVA SFRUTTANDO.
// Oggi si pubblica un annuncio e si ASPETTA che degli sconosciuti lo trovino.
// Nel frattempo, in archivio, ci sono decine di persone che tre settimane fa
// hanno scritto cercando esattamente quella casa — e a cui non lo dice
// nessuno. BOOM fa marketing al traffico freddo mentre ha una lista calda.
//
// I lead sono un ASSET che si raffredda. Questo modulo lo riscuote: quando un
// immobile viene pubblicato, torna libero o cala di prezzo, dice CHI in
// archivio lo stava cercando — ordinati, con il messaggio già scritto nella
// LORO lingua.
//
// E costa zero: nessun modello, solo letture che il bot fa già.
//
// IL TRUCCO. Un lead non ha un modulo compilato: ha due cose che valgono di
// più di qualunque form.
//   1. LA CASA CHE HA CHIESTO È IL SUO BRIEFING. Chi ha scritto per un
//      trilocale da €1.400 a Pigneto sta cercando QUELLO: quella zona, quella
//      taglia, quella fascia. È un brief involontario e onestissimo — nessuno
//      compila un form dicendo la verità quanto lo dice chiedendo una casa
//      precisa.
//   2. LE SUE PAROLE. "cercavo un bilocale a Trastevere sotto i 1200 per
//      settembre" contiene zona, taglia, tetto e tempistica.
//
// Da queste due si derivano i criteri, e da lì si punteggia con la stessa
// aritmetica di api/homie/_match.js (budget 50 · camere 30 · zona 20) così i
// due motori non possono dare due verdetti diversi sulla stessa casa.

import { parseBudgetRange, normalizeForMatch } from '../homie/_match.js';
import { replyLang } from '../_lang.js';

// ── quanto vale un lead che invecchia ──────────────────────────────────────
// Mai zero: una persona che cercava casa due mesi fa è ancora una persona, e
// a Roma le ricerche durano mesi. Ma va dopo chi ha scritto ieri.
export function freshnessFactor(createdAt, now = Date.now()) {
  const t = new Date(createdAt || 0).getTime();
  if (!t) return 0.5;                       // data ignota: né premiata né punita
  const days = (now - t) / 86400000;
  if (days < 0) return 1;
  if (days <= 14) return 1;
  if (days <= 45) return 0.85;
  if (days <= 90) return 0.6;
  if (days <= 180) return 0.35;
  return 0.2;
}

// ── taglia: come la dice un italiano ───────────────────────────────────────
const TYPE_BEDS = {
  monolocale: 0, bilocale: 1, trilocale: 2, quadrilocale: 3, quadrilocali: 3,
  studio: 0, 'one bedroom': 1, 'two bedroom': 2, 'three bedroom': 3,
};
const NUM_IT = { un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5 };

export function bedsFromText(text) {
  const t = normalizeForMatch(text);
  for (const [word, n] of Object.entries(TYPE_BEDS)) {
    if (t.includes(word)) return n;
  }
  const m = t.match(/(\d|un[oa]?|due|tre|quattro|cinque)\s*(?:camer|stanz|bedroom)/);
  if (m) {
    const raw = m[1];
    const n = NUM_IT[raw] != null ? NUM_IT[raw] : parseInt(raw, 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// ── tetto di spesa: come lo scrive una persona vera ────────────────────────
export function budgetFromText(text) {
  const t = normalizeForMatch(text).replace(/\./g, '');
  // un intervallo esplicito: "1000-1200", "tra 900 e 1100"
  let m = t.match(/(\d{3,4})\s*(?:-|a|to|e)\s*(\d{3,4})\s*(?:€|eur|euro)?/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a >= 200 && b > a && b <= 20000) return { min: a, max: b };
  }
  // un tetto: "sotto i 1200", "max 1300", "fino a 1100", "budget 1000"
  m = t.match(/(?:sotto|entro|fino a|max|massimo|non piu di|under|up to|budget(?: di)?)\D{0,6}(\d{3,4})/);
  if (m) {
    const n = +m[1];
    if (n >= 200 && n <= 20000) return { min: 0, max: n };
  }
  return null;
}

// ── le zone che nomina, dette col vocabolario del catalogo vero ────────────
export function zonesFromText(text, knownZones) {
  const t = normalizeForMatch(text);
  const hit = [];
  for (const z of knownZones || []) {
    const n = normalizeForMatch(z);
    if (n && n.length >= 4 && t.includes(n)) hit.push(z);
  }
  return [...new Set(hit)];
}

/**
 * I criteri di un lead, dedotti. In ordine di forza:
 *   1. la casa che ha chiesto (il brief involontario)
 *   2. le sue parole
 *   3. i campi espliciti, se per caso ci sono
 * @param lead
 * @param listingById  Map id → listing (per leggere la casa richiesta)
 * @param knownZones   le zone del catalogo reale
 */
export function leadCriteria(lead, listingById = new Map(), knownZones = []) {
  const text = [lead.message, lead.brief, lead.notes].filter(Boolean).join(' ');
  const asked = lead.propertyId ? listingById.get(lead.propertyId) : null;

  // budget: parole > campo esplicito > la casa chiesta (±15%, la fascia in
  // cui si muove chi ha guardato quella)
  let budget = budgetFromText(text);
  if (!budget && lead.budget) budget = parseBudgetRange(String(lead.budget));
  const askedPrice = asked ? Number(asked.price) : (Number(lead.propertyPrice) || null);
  if (!budget && Number.isFinite(askedPrice) && askedPrice > 0) {
    budget = { min: Math.round(askedPrice * 0.8), max: Math.round(askedPrice * 1.15), from: 'asked' };
  }

  // camere: parole > la casa chiesta
  let beds = bedsFromText(text);
  if (beds == null && asked) {
    const b = Number(asked.beds != null ? asked.beds : asked.bedrooms);
    if (Number.isFinite(b)) beds = b;
  }

  // zone: parole + la zona della casa chiesta + il campo esplicito
  const zones = zonesFromText(text, knownZones);
  if (asked && asked.zone && !zones.includes(asked.zone)) zones.push(asked.zone);
  if (lead.zone) for (const z of String(lead.zone).split(/[,;/]/).map(s => s.trim()).filter(Boolean)) {
    if (!zones.includes(z)) zones.push(z);
  }

  return { budget, beds, zones, askedId: lead.propertyId || null, askedPrice };
}

// Oltre questo, a Roma, una ricerca è finita: chi scriveva a marzo ha già
// firmato altrove. È una decisione COMMERCIALE, quindi è un veto esplicito e
// leggibile — non un punteggio che scende finché sparisce da solo.
export const MAX_AGE_DAYS = 120;

// ── i veti: chi non va MAI disturbato ──────────────────────────────────────
// Un veto è più importante di un punteggio: proporre la casa sbagliata alla
// persona sbagliata costa la reputazione, non un'occasione. E un veto DICE
// perché — un'esclusione silenziosa è indistinguibile da un bug.
export function vetoFor(lead, listing, now = Date.now()) {
  const status = String(lead.status || '').toLowerCase();
  if (lead.grade === 'dead') return 'lead morto (spam o non raggiungibile)';
  const t = new Date(lead.createdAt || 0).getTime();
  if (t && (now - t) / 86400000 > MAX_AGE_DAYS) return `scritto oltre ${MAX_AGE_DAYS} giorni fa`;
  if (['converted', 'won', 'tenant'].includes(status)) return 'è già diventato inquilino';
  if (status === 'lost' && lead.lostReason === 'not_looking') return 'ha detto che non cerca più';
  if (!lead.phone && !lead.email) return 'nessun recapito';
  // la casa che ha già chiesto: la conosce, riproporgliela è un insulto
  if (lead.propertyId && listing && lead.propertyId === listing.id) return 'è la casa che aveva già chiesto';
  // già avvisato di QUESTA casa
  const told = Array.isArray(lead.notifiedListings) ? lead.notifiedListings : [];
  if (listing && told.includes(listing.id)) return 'già avvisato per questa casa';
  return null;
}

/**
 * Quanto questa casa somiglia a quello che il lead cercava.
 * Stessa aritmetica di homie/_match.js — budget 50 · camere 30 · zona 20 —
 * poi moltiplicata per la freschezza, perché chi ha scritto ieri va prima.
 * @returns { score, base, reasons[] }
 */
export function scoreLeadForListing(crit, listing, lead = {}, now = Date.now()) {
  const reasons = [];
  let base = 0;
  const price = Number(listing.price);

  // budget (0–50)
  if (crit.budget && Number.isFinite(price)) {
    const { min, max } = crit.budget;
    if (price >= min && price <= max) {
      base += 50;
      reasons.push(`budget ✓ €${Math.round(price)}`);
    } else if (price <= max * 1.2 && price >= min * 0.8) {
      base += 25;
      reasons.push(`budget ≈ €${Math.round(price)} (cercava ~€${Math.round(max)})`);
    } else if (price > max * 1.2) {
      reasons.push(`fuori budget (cercava ~€${Math.round(max)})`);
      return { score: 0, base, reasons };          // troppo cara: non si propone
    } else {
      base += 10;
      reasons.push('sotto il budget che cercava');
    }
  } else {
    base += 20;                                     // budget ignoto: né premio né condanna
    reasons.push('budget non dichiarato');
  }

  // camere (0–30)
  const have = Number(listing.beds != null ? listing.beds : listing.bedrooms);
  if (crit.beds != null && Number.isFinite(have)) {
    if (have === crit.beds) { base += 30; reasons.push(`${have} camere ✓`); }
    else if (Math.abs(have - crit.beds) === 1) { base += 15; reasons.push(`${have} camere (ne cercava ${crit.beds})`); }
    else reasons.push(`${have} camere (ne cercava ${crit.beds})`);
  } else {
    base += 12;
  }

  // zona (0–20)
  const hay = normalizeForMatch([listing.zone, listing.address, listing.name].filter(Boolean).join(' '));
  if (crit.zones.length) {
    const hit = crit.zones.find(z => hay.includes(normalizeForMatch(z)));
    if (hit) { base += 20; reasons.push(`zona ✓ ${hit}`); }
    else reasons.push(`altra zona (cercava ${crit.zones.slice(0, 2).join(', ')})`);
  } else {
    base += 8;
  }

  const fresh = freshnessFactor(lead.createdAt, now);
  const score = Math.round(Math.min(100, base) * fresh);
  if (fresh < 1) reasons.push(`scritto ${Math.round((now - new Date(lead.createdAt || 0).getTime()) / 86400000)}gg fa`);
  return { score, base: Math.min(100, base), reasons };
}

export const MATCH_THRESHOLD = 55;

/**
 * Chi, in archivio, stava cercando questa casa. Ordinati, con il motivo.
 *
 * TRE MESTIERI SEPARATI, e tenerli separati è il punto:
 *   · il VETO decide chi è eleggibile     (morto, inquilino, troppo vecchio…)
 *   · la SOGLIA decide se la casa gli calza (base: budget, camere, zona)
 *   · la FRESCHEZZA decide solo l'ORDINE
 * Mescolarli — com'era prima, moltiplicando tutto — faceva sparire un match
 * perfetto di due mesi fa sotto la soglia, indistinguibile da uno mediocre.
 *
 * @returns [{ lead, score, base, reasons, lang }]
 */
export function rankLeadsForListing(listing, leads, listingById = new Map(), knownZones = [], now = Date.now()) {
  const out = [];
  for (const lead of leads || []) {
    if (!lead) continue;
    if (vetoFor(lead, listing, now)) continue;
    const crit = leadCriteria(lead, listingById, knownZones);
    const { score, base, reasons } = scoreLeadForListing(crit, listing, lead, now);
    if (base < MATCH_THRESHOLD) continue;      // la soglia guarda la QUALITÀ del calzare
    if (score === 0) continue;                 // veto duro dal punteggio (fuori budget)
    out.push({ lead, score, base, reasons, lang: replyLang(lead) });
  }
  return out.sort((a, b) => b.score - a.score);  // la freschezza decide l'ordine
}

// ── il messaggio già scritto ───────────────────────────────────────────────
// Nella LORO lingua, che nomina la casa che avevano chiesto: è la differenza
// fra "abbiamo una novità" e "ti sei ricordato di me".
export function outreachText(match, listing, siteUrl = 'https://www.boomrome.com') {
  const { lead, lang } = match;
  const first = String(lead.name || '').trim().split(/\s+/)[0] || '';
  const link = `${siteUrl}/listing/${encodeURIComponent(listing.id)}`;
  const price = Number(listing.price);
  const priceStr = Number.isFinite(price)
    ? '€' + price.toLocaleString('it-IT', { useGrouping: true, maximumFractionDigits: 0 })
    : '';
  const was = lead.propertyTitle ? String(lead.propertyTitle) : null;

  if (lang === 'it') {
    return `Ciao${first ? ' ' + first : ''}, sono Valentino di BOOM 👋 ` +
      (was ? `Tempo fa mi avevi scritto per "${was}". ` : 'Ti scrivo perché mi eri rimasto in mente. ') +
      `È appena uscita una casa che credo faccia per te: ${listing.name || 'questa'}` +
      (listing.zone ? ` a ${listing.zone}` : '') + (priceStr ? `, ${priceStr}/mese` : '') + `.\n${link}\n` +
      `Se ti piace la vediamo quando vuoi — dal vivo o in videochiamata.`;
  }
  return `Hi${first ? ' ' + first : ''}, Valentino from BOOM here 👋 ` +
    (was ? `You wrote to me a while back about "${was}". ` : 'You were on my mind. ') +
    `Something just came up that I think fits you: ${listing.name || 'this one'}` +
    (listing.zone ? ` in ${listing.zone}` : '') + (priceStr ? `, ${priceStr}/month` : '') + `.\n${link}\n` +
    `Happy to show you — in person or on a live video call, whenever suits.`;
}

export function waLink(match, listing, siteUrl) {
  const digits = String(match.lead.phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const num = digits.length === 10 && digits.startsWith('3') ? '39' + digits : digits;
  return `https://wa.me/${num}?text=${encodeURIComponent(outreachText(match, listing, siteUrl))}`;
}
