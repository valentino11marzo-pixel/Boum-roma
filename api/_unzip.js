// api/_unzip.js — lettore ZIP minimale, zero dipendenze npm.
//
// Il gemello di api/_zip.js (che SCRIVE): questo LEGGE. Serve al Pendolare
// per aprire il GTFS di Roma Mobilità (stop_times.txt supera i 300 MB
// inflati: si processa in STREAMING riga per riga, mai tutto in memoria) e
// ai test, che gli danno in pasto uno zip STORE costruito con buildZip.
// Supporta method 0 (STORE) e 8 (DEFLATE, via node:zlib inflateRaw).

import zlib from 'node:zlib';
import { StringDecoder } from 'node:string_decoder';

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

// L'End Of Central Directory sta in coda, con un commento di lunghezza
// variabile davanti alla fine del file: si scandisce all'indietro.
function trovaEocd(buf) {
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error('zip: EOCD non trovato');
}

/** Elenca le voci dello zip: [{ name, method, compSize, size, localOffset }] */
export function zipEntries(buf) {
  const eocd = trovaEocd(buf);
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) throw new Error('zip: central directory corrotta');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    out.push({ name, method, compSize, size, localOffset });
    p += 46 + nameLen + extraLen + commLen;
  }
  return out;
}

function datiVoce(buf, e) {
  if (buf.readUInt32LE(e.localOffset) !== LOC_SIG)
    throw new Error('zip: local header corrotto per ' + e.name);
  const nameLen = buf.readUInt16LE(e.localOffset + 26);
  const extraLen = buf.readUInt16LE(e.localOffset + 28);
  const start = e.localOffset + 30 + nameLen + extraLen;
  return buf.subarray(start, start + e.compSize);
}

/**
 * Consegna la voce RIGA PER RIGA a `onLine(riga)` senza mai materializzare
 * il testo intero: DEFLATE passa da uno stream inflateRaw a blocchi, STORE
 * viene affettato. Le righe sono senza \n finale; \r in coda rimosso.
 * onLine può restituire false per fermarsi (il resto non viene decodificato).
 */
export function streamEntryLines(buf, entry, onLine) {
  return new Promise((resolve, reject) => {
    const dec = new StringDecoder('utf8');
    let resto = '';
    let stop = false;
    function mangia(chunkStr) {
      if (stop) return;
      resto += chunkStr;
      let da = 0, a;
      while ((a = resto.indexOf('\n', da)) >= 0) {
        let riga = resto.slice(da, a);
        if (riga.endsWith('\r')) riga = riga.slice(0, -1);
        if (onLine(riga) === false) { stop = true; break; }
        da = a + 1;
      }
      resto = resto.slice(da);
    }
    function fine() {
      if (!stop && resto) {
        let riga = resto + dec.end();
        if (riga.endsWith('\r')) riga = riga.slice(0, -1);
        if (riga) onLine(riga);
      }
      resolve();
    }
    const raw = datiVoce(buf, entry);
    if (entry.method === 0) {
      // STORE: si affetta a blocchi da 4 MB per non decodificare 300 MB in colpo solo
      const PASSO = 4 * 1024 * 1024;
      let i = 0;
      (function giro() {
        while (i < raw.length && !stop) {
          mangia(dec.write(raw.subarray(i, Math.min(raw.length, i + PASSO))));
          i += PASSO;
          if (i < raw.length && i % (32 * PASSO) === 0)
            return setImmediate(giro);   // respiro per l'event loop
        }
        fine();
      })();
    } else if (entry.method === 8) {
      const inf = zlib.createInflateRaw();
      inf.on('data', (c) => { if (!stop) mangia(dec.write(c)); else inf.destroy(); });
      inf.on('end', fine);
      inf.on('error', (e) => stop ? resolve() : reject(e));
      inf.on('close', () => { if (stop) resolve(); });
      inf.end(raw);
    } else {
      reject(new Error('zip: method ' + entry.method + ' non supportato (' + entry.name + ')'));
    }
  });
}

/** Comodità: la voce per nome (esatto), o null. */
export function zipEntry(buf, name) {
  return zipEntries(buf).find((e) => e.name === name) || null;
}
