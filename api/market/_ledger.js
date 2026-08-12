// api/market/_ledger.js — la porta UNICA del libro mastro di mercato.
//
// Qualsiasi fonte veda un annuncio (alert email via pfs/_ingest, gli occhi
// di Homie, lo scan, un ingest manuale) passa da qui: si legge l'esistente,
// si applica il fold puro di js/market-engine (observe) e si riscrive.
// Le regole — niente contatti, storia prezzi solo sui cambi, rientri che
// archiviano la vita precedente — vivono NEL MOTORE, quindi valgono per
// tutte le porte insieme e sono già testate per mutazione.
//
// Best-effort per contratto: il chiamante principale è l'ingestione PFS, che
// serve clienti PAGANTI — il libro mastro non deve mai romperla. Ogni errore
// qui viene ingoiato e loggato, mai propagato.

import ME from '../../js/market-engine.js';
import { fsGet, fsPatch } from '../homie/_lib.js';

// L'id è lo STESSO spazio di pfsProperties (sha1 dell'URL, calcolato dal
// chiamante che lo possiede già): un annuncio è lo stesso annuncio nei due
// mondi, senza join fragili.
export async function recordObservation(stableId, raw, { nowIso } = {}) {
  try {
    if (!stableId || !raw || !raw.sourceUrl) return { ok: false, error: 'bad_input' };
    const existing = await fsGet('marketListings/' + stableId).catch(() => null);
    const next = ME.observe(existing, raw, nowIso);
    await fsPatch('marketListings/' + stableId, next);
    return { ok: true, id: stableId, status: next.status };
  } catch (err) {
    console.error('[market/_ledger]', err.message);
    return { ok: false, error: err.message };
  }
}

export { ME };
