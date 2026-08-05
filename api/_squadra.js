// api/_squadra.js — LE MANOPOLE DEI DIPENDENTI, lato server.
//
// Le soglie con cui lavorano gli agenti erano costanti nel sorgente:
// `LATE_AFTER_DAYS = 3` dentro gestore.js, `HUMAN_WINDOW_MS = 20 min` dentro
// commerciale.js, `DAILY_AI_CALL_CAP = 12` dentro leads/brain.js. Cambiare
// "sollecita dopo 5 giorni invece di 3" richiedeva un deploy — cioè in pratica
// non si cambiava mai, e l'operatore subiva una regola scritta una volta da
// qualcun altro.
//
// I valori stanno su `settings/squadra`, i DEFAULT e gli intervalli ammessi
// stanno in js/squadra-registry.js — lo STESSO file che legge la console. Non
// è pigrizia: è la lezione di _avail.js. Se la pagina mostrasse un default
// diverso da quello in vigore, l'operatore modificherebbe una regola che non
// è quella applicata, e non avrebbe modo di accorgersene.
//
// A runtime non si esplode MAI: un valore corrotto (doc modificato a mano,
// campo di una versione precedente) torna al suo default e finisce fra i
// `rejected`, che l'agente stampa nel proprio report invece di ingoiarlo.
// Un cron che muore perché qualcuno ha scritto "tre" in un campo numerico
// sarebbe il modo peggiore di scoprire un refuso.
//
// Fail-open per costruzione: se Firestore non risponde, si lavora coi
// default. Un'impostazione irraggiungibile non deve fermare la squadra.

import SQ from '../js/squadra-registry.js';
import { fsGet } from './homie/_lib.js';

const DOC = 'settings/squadra';

// Una lettura per run, non una per agente: il documento è unico.
let _cache = null, _cacheAt = 0;
const TTL_MS = 30 * 1000;

export async function loadSquadraSettings({ fresh = false } = {}) {
  if (!fresh && _cache && (Date.now() - _cacheAt) < TTL_MS) return _cache;
  let raw = null;
  try { raw = await fsGet(DOC); } catch { raw = null; }
  _cache = raw && typeof raw === 'object' ? raw : {};
  _cacheAt = Date.now();
  return _cache;
}

/**
 * Le manopole IN VIGORE per un agente.
 *   const { k, rejected } = await knobs('gestore');
 *   if (-days < k.lateAfterDays) continue;
 *
 * `rejected` non è mai vuoto per caso: contiene solo valori che qualcuno ha
 * scritto e che non sono accettabili. Chi lo riceve lo mette nel report.
 */
export async function knobs(agentKey, opts) {
  const all = await loadSquadraSettings(opts);
  const { values, rejected } = SQ.resolveKnobs(agentKey, all[agentKey]);
  return { k: values, rejected };
}

/** Solo i valori, per i chiamanti che non vogliono gestire i rifiuti. */
export async function knobValues(agentKey, opts) {
  return (await knobs(agentKey, opts)).k;
}

/** Una riga da appendere al report quando c'è un valore illeggibile: il
 *  silenzio su un'impostazione ignorata è come non averla. */
export function rejectedLine(rejected) {
  if (!rejected || !rejected.length) return '';
  return '⚠️ impostazioni ignorate (torno al default): '
    + rejected.map(r => `${r.key}="${r.got}" ${r.why}`).join(' · ');
}

export { SQ };
