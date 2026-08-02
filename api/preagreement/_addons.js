// api/preagreement/_addons.js
// L'UPSELL DENTRO IL DEAL.
//
// Il pre-agreement è il momento in cui il cliente ha già deciso e ha la carta
// in mano: è il punto del funnel con la conversione più alta di tutto BOOM.
// Fino a oggi quella pagina non offriva nient'altro. Qui il cliente può
// aggiungere al dovuto due servizi che sappiamo già consegnare, con un tocco.
//
// Le regole che tengono in piedi la cosa:
//   1. Il PREZZO viene dal catalogo server-side. Il browser manda solo i
//      `kind`: un cliente che modifica il payload non può regalarsi un
//      pacchetto da €149 a €1.
//   2. Si offre SOLO ciò che è già consegnabile senza nuovo lavoro operativo
//      (i due prodotti del journey). Vendere una promessa che non sappiamo
//      mantenere brucia il deal, non lo migliora.
//   3. Un servizio già comprato non si ripropone — stessa regola dei test del
//      journey (`tests/journey/steps.mjs`), che è il posto dove quella regola
//      commerciale è pinnata.

import { CATALOG } from '../_catalog.js';

/** I soli add-on proponibili alla firma: già a catalogo, già consegnabili. */
export const OFFERABLE = ['movein-pack', 'cleaning-premium'];

/** Perché serve al cliente ADESSO, non cos'è (la scheda prodotto è altrove). */
const PITCH = {
  'movein-pack': {
    en: 'Electricity, gas and internet in your name before you arrive — plus the residency guide.',
    it: 'Luce, gas e internet a tuo nome prima che arrivi — più la guida alla residenza.',
  },
  'cleaning-premium': {
    en: 'Professional deep clean the day before your keys — you walk into a hotel-fresh apartment.',
    it: 'Pulizia profonda professionale il giorno prima delle chiavi — entri in una casa impeccabile.',
  },
};

/**
 * Cosa mostrare sulla pagina della proposta.
 * @param {object} pa il pre-agreement (per escludere ciò che è già stato scelto/comprato)
 * @returns {Array<{kind,eur,label,pitch,pitchIt}>}
 */
export function offeredAddons(pa = {}) {
  if (pa.noAddons) return [];                       // interruttore della console
  const already = new Set([...(pa.addons || []).map(a => a.kind || a)]);
  return OFFERABLE
    .filter(k => CATALOG[k] && !already.has(k))
    .map(k => ({
      kind: k,
      eur: CATALOG[k].eur,
      label: CATALOG[k].label.split('—')[0].trim(),
      pitch: (PITCH[k] || {}).en || CATALOG[k].desc,
      pitchIt: (PITCH[k] || {}).it || CATALOG[k].desc,
    }));
}

/**
 * Quello che il browser manda → quello che il server accetta.
 * Scarta silenziosamente kind sconosciuti, non offribili o ripetuti: un
 * payload manomesso non deve produrre un errore in faccia a un cliente che
 * sta firmando, deve semplicemente non comprare niente di strano.
 */
export function normalizeAddons(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of input.slice(0, 10)) {
    const kind = String(raw && raw.kind ? raw.kind : raw || '').trim();
    if (!OFFERABLE.includes(kind) || seen.has(kind) || !CATALOG[kind]) continue;
    seen.add(kind);
    out.push({ kind, eur: CATALOG[kind].eur, label: CATALOG[kind].label });
  }
  return out;
}

/** Somma in euro degli add-on già normalizzati. */
export function addonsTotal(list) {
  return (list || []).reduce((s, a) => s + (Number(a.eur) || 0), 0);
}
