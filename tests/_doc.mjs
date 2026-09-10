// Lettore MINIMO di Word 97-2003 (.doc), senza dipendenze: OLE compound
// file → stream WordDocument + Table → FIB → piece table → testo. Serve a
// UNA cosa: confrontare i modelli dell'associazione in reference/ con le
// clausole che js/contract-pdf.js stampa, frase per frase. Non e' un
// convertitore: campi, immagini e note non interessano.
export function docText(buf) {
  const u32 = (o) => buf.readUInt32LE(o), u16 = (o) => buf.readUInt16LE(o);
  if (buf.readUInt32LE(0) !== 0xE011CFD0) throw new Error('not an OLE file');
  const ssz = 1 << u16(0x1E), mssz = 1 << u16(0x20);
  const nfat = u32(0x2C), dirStart = u32(0x30), miniCut = u32(0x38), miniFatStart = u32(0x3C), nMiniFat = u32(0x40);
  const difatStart = u32(0x44), nDifat = u32(0x48);
  const sec = (i) => buf.subarray((i + 1) * ssz, (i + 2) * ssz);
  const difat = []; for (let i = 0; i < 109; i++) difat.push(u32(0x4C + 4 * i));
  for (let s = difatStart, n = 0; n < nDifat && s < 0xFFFFFFFA; n++) { const b = sec(s); for (let i = 0; i < ssz / 4 - 1; i++) difat.push(b.readUInt32LE(4 * i)); s = b.readUInt32LE(ssz - 4); }
  const fatBuf = Buffer.concat(difat.slice(0, nfat).filter(x => x < 0xFFFFFFFA).map(sec));
  const FAT = []; for (let i = 0; i < fatBuf.length / 4; i++) FAT.push(fatBuf.readUInt32LE(4 * i));
  const chain = (start) => { const out = []; let s = start, n = 0; while (s < 0xFFFFFFFA && n++ < 1e6) { out.push(s); s = FAT[s]; } return out; };
  const read = (start, size) => Buffer.concat(chain(start).map(sec)).subarray(0, size);
  const dir = read(dirStart, 1e9);
  const entries = [];
  for (let i = 0; i * 128 < dir.length; i++) {
    const e = dir.subarray(i * 128, (i + 1) * 128);
    const nl = e.readUInt16LE(0x40);
    entries.push({ name: e.subarray(0, Math.max(0, nl - 2)).toString('utf16le'), type: e[0x42], start: e.readUInt32LE(0x74), size: e.readUInt32LE(0x78) });
  }
  const root = entries[0]; const mini = read(root.start, root.size);
  const mfatBuf = nMiniFat ? Buffer.concat(chain(miniFatStart).map(sec)) : Buffer.alloc(0);
  const MFAT = []; for (let i = 0; i < mfatBuf.length / 4; i++) MFAT.push(mfatBuf.readUInt32LE(4 * i));
  const mread = (start, size) => { const parts = []; let s = start; while (s < 0xFFFFFFFA) { parts.push(mini.subarray(s * mssz, (s + 1) * mssz)); s = MFAT[s]; } return Buffer.concat(parts).subarray(0, size); };
  const streams = {};
  for (const e of entries) if (e.type === 2) streams[e.name] = e.size >= miniCut ? read(e.start, e.size) : mread(e.start, e.size);
  const wd = streams.WordDocument; if (!wd) throw new Error('no WordDocument stream');
  const tbl = streams[(wd.readUInt16LE(0x0A) & 0x0200) ? '1Table' : '0Table'];
  const fcClx = wd.readUInt32LE(0x1A2), lcbClx = wd.readUInt32LE(0x1A6), ccpText = wd.readUInt32LE(0x4C);
  const clx = tbl.subarray(fcClx, fcClx + lcbClx);
  let p = 0; while (clx[p] === 1) p += 3 + clx.readUInt16LE(p + 1);
  if (clx[p] !== 2) throw new Error('bad CLX');
  const lcb = clx.readUInt32LE(p + 1), plc = clx.subarray(p + 5, p + 5 + lcb);
  const n = (lcb - 4) / 12; const cps = []; for (let i = 0; i <= n; i++) cps.push(plc.readUInt32LE(4 * i));
  let text = '';
  for (let i = 0; i < n; i++) {
    const pcd = plc.subarray(4 * (n + 1) + 8 * i, 4 * (n + 1) + 8 * i + 8);
    let fc = pcd.readUInt32LE(2); const comp = fc & 0x40000000; fc &= 0x3FFFFFFF;
    const len = cps[i + 1] - cps[i];
    text += comp ? wd.subarray(fc / 2, fc / 2 + len).toString('latin1') : wd.subarray(fc, fc + 2 * len).toString('utf16le');
  }
  // Solo il corpo (niente intestazioni), campi saltati, marcatori → testo.
  let out = '', skip = 0;
  for (const ch of text.slice(0, ccpText)) {
    const o = ch.charCodeAt(0);
    if (o === 0x13) { skip++; continue; } if (o === 0x14) { skip = 0; continue; } if (o === 0x15) continue; if (skip) continue;
    if (o === 0x0D || o === 0x0B) out += '\n'; else if (o === 0x07) out += ' '; else if (o === 0x09) out += ' '; else if (o < 0x20) continue; else out += ch;
  }
  // cp1252 → i caratteri che latin1 non mappa (virgolette tipografiche, €)
  return out.replace(/[\x80-\x9F]/g, (c) => ({ '\x80': '€', '\x91': '‘', '\x92': '’', '\x93': '“', '\x94': '”', '\x96': '–', '\x97': '—', '\x85': '…' }[c] || c));
}
