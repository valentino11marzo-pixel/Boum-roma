// api/agent/_memo.js — la FOTOGRAFIA riusata per le porte che il Mac interroga
// di continuo.
//
// LA MISURA DEL 4/10/2026 (log di Vercel, 24 ore): Homie chiama
// `agent/state.snapshot` 741 volte e `agent/risk.scan` 719 volte al giorno —
// una ogni due minuti — e ogni risk.scan rilegge contratti, pagamenti, lead,
// immobili, utenti e adempimenti (fino a ~2.280 documenti), ogni snapshot
// fino a ~350. Centinaia di migliaia di letture pagate al giorno per dati che
// cambiano nell'arco di ore, e quattro dei pochi 5xx della settimana.
//
// Qui la fotografia si calcola UNA volta e si riusa per `MEMO_TTL_MS`:
//   1. in memoria (istanza calda: zero letture);
//   2. nel documento `heartbeat/agent-memo-<chiave>` (istanza fredda: UNA
//      lettura invece di centinaia);
//   3. scaduta → si ricalcola e si riscrive.
// Il valore viaggia come stringa JSON: la conversione Firestore delle mappe è
// lossy (i `null`, i tipi) e qui deve tornare esattamente ciò che si è
// calcolato. Chi ha bisogno del dato di ADESSO passa `fresh: true`. La
// risposta dice sempre quanti anni ha la fotografia (`cachedAt`).
//
// Un guasto della memoria (lettura o scrittura del documento) non ferma mai
// la risposta: si ricade sul calcolo diretto, come prima.

import { fsGet, fsPatch } from '../homie/_lib.js';

export const MEMO_TTL_MS = 10 * 60 * 1000;
const MEMO_DOC = (key) => 'heartbeat/agent-memo-' + String(key).replace(/[^\w.-]/g, '_').slice(0, 120);

const _mem = new Map();       // chiave → { at, value }
const _inflight = new Map();  // chiave → Promise (due chiamate insieme = un calcolo)

export function _resetMemoForTests() { _mem.clear(); _inflight.clear(); }

export async function memoized(key, compute, { ttlMs = MEMO_TTL_MS, fresh = false, now = Date.now } = {}) {
  const t = now();
  if (!fresh) {
    const m = _mem.get(key);
    if (m && t - m.at >= 0 && t - m.at < ttlMs) return { value: m.value, cachedAt: new Date(m.at).toISOString(), source: 'memory' };
    try {
      const d = await fsGet(MEMO_DOC(key));
      const at = d && Date.parse(d.at || '');
      if (d && typeof d.json === 'string' && at && t - at >= 0 && t - at < ttlMs) {
        const value = JSON.parse(d.json);
        _mem.set(key, { at, value });
        return { value, cachedAt: new Date(at).toISOString(), source: 'store' };
      }
    } catch (e) { console.warn('[agent/_memo] lettura', key, e.message); }
    if (_inflight.has(key)) return _inflight.get(key);
  }
  const run = (async () => {
    const value = await compute();
    const at = now();
    _mem.set(key, { at, value });
    try { await fsPatch(MEMO_DOC(key), { key: String(key), at: new Date(at).toISOString(), json: JSON.stringify(value) }); }
    catch (e) { console.warn('[agent/_memo] scrittura', key, e.message); }
    return { value, cachedAt: null, source: 'fresh' };
  })();
  if (!fresh) _inflight.set(key, run);
  try { return await run; }
  finally { if (_inflight.get(key) === run) _inflight.delete(key); }
}
