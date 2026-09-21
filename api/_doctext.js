// api/_doctext.js — «qualsiasi cosa» diventa testo per il modello.
// (Lo ZIP lo apre api/_unzip.js, il lettore del Pendolare: qui si aggiunge
// solo la lettura in memoria di una voce, zipEntryBytes.)
//
// LA SECONDA LEZIONE DEL 21 SETTEMBRE 2026: l'Innesto accettava SOLO PDF e
// immagini, e rifiutava «per grandezza» prima ancora di spedire. Un
// operatore non deve scegliere il formato: manda quello che ha — il Word del
// referente, l'Excel delle rate, l'email del proprietario, l'export della
// chat — e il server lo riduce a testo, senza dipendenze npm, senza rete.
// Qui c'è UNA copia della lettura: readFiles (api/portal/ingest.js) e i
// test la usano tale e quale.
//
// Cosa si legge:
//   DOCX  (word/document.xml)        XLSX (sharedStrings + worksheets)
//   ODT   (content.xml)              DOC 97-2003 (OLE → piece table, docText)
//   EML   (header + parte text/plain o HTML spogliato, QP/base64/RFC 2047)
//   HTML  (script/style via, tag → spazi)    RTF (control words via)
//   TXT · CSV · MD · JSON (UTF-8 con BOM, ripiego windows-1252)
// Il resto (PDF, immagini) passa com'è; HEIC/HEIF è dichiarato con nome
// perché il modello non lo legge e il rimedio va detto all'operatore.
import { zipEntries, zipEntryBytes, isZip } from './_unzip.js';

// Le voci per nome (il lettore del Pendolare le dà in elenco) e i byte di una
// voce: due nomi locali, così il resto del file legge come un dizionario.
export const unzipEntries = (buf) => new Map(zipEntries(buf).map((e) => [e.name, e]));
export const unzipEntry = (buf, entry) => zipEntryBytes(buf, entry);
export const unzipFile = (buf, name, entries) => { const m = entries || unzipEntries(buf); return m.has(name) ? unzipEntry(buf, m.get(name)) : null; };

export const MEDIA = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  odt: 'application/vnd.oasis.opendocument.text',
  doc: 'application/msword',
  eml: 'message/rfc822',
  html: 'text/html',
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
  json: 'application/json',
  rtf: 'application/rtf',
  heic: 'image/heic',
};
const EXT_MEDIA = {
  pdf: MEDIA.pdf, docx: MEDIA.docx, xlsx: MEDIA.xlsx, odt: MEDIA.odt, doc: MEDIA.doc, eml: MEDIA.eml,
  html: MEDIA.html, htm: MEDIA.html, txt: MEDIA.txt, text: MEDIA.txt, csv: MEDIA.csv, tsv: MEDIA.csv,
  md: MEDIA.md, markdown: MEDIA.md, json: MEDIA.json, rtf: MEDIA.rtf,
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  heic: MEDIA.heic, heif: 'image/heif',
};
// I formati che arrivano al modello come TESTO (non come documento/immagine).
export const TEXTY = new Set([MEDIA.docx, MEDIA.xlsx, MEDIA.odt, MEDIA.doc, MEDIA.eml, MEDIA.html, MEDIA.txt, MEDIA.csv, MEDIA.md, MEDIA.json, MEDIA.rtf, 'text/rtf', 'text/x-markdown', 'text/tab-separated-values']);
export const TEXTY_LABEL = {
  [MEDIA.docx]: 'Word', [MEDIA.xlsx]: 'Excel', [MEDIA.odt]: 'OpenDocument', [MEDIA.doc]: 'Word 97-2003',
  [MEDIA.eml]: 'email', [MEDIA.html]: 'pagina HTML', [MEDIA.txt]: 'testo', [MEDIA.csv]: 'CSV', [MEDIA.md]: 'testo',
  [MEDIA.json]: 'JSON', [MEDIA.rtf]: 'RTF', 'text/rtf': 'RTF', 'text/x-markdown': 'testo', 'text/tab-separated-values': 'CSV',
};
export const FORMATS_HUMAN = 'PDF, foto (JPG/PNG/WebP), Word (.docx/.doc), Excel (.xlsx), OpenDocument (.odt), email (.eml), pagine HTML, testo/CSV/Markdown/RTF';

const ext = (name) => { const m = /\.([a-z0-9]{1,8})$/i.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
const zipKind = (buf) => {
  try {
    const names = unzipEntries(buf);
    if (names.has('word/document.xml')) return MEDIA.docx;
    if (names.has('xl/workbook.xml')) return MEDIA.xlsx;
    if (names.has('content.xml')) {
      const mt = names.has('mimetype') ? unzipEntry(buf, names.get('mimetype')).toString('utf8').trim() : '';
      if (!mt || /opendocument\.text/.test(mt)) return MEDIA.odt;
    }
  } catch (_) { /* uno ZIP che non si apre non è un documento Office */ }
  return 'application/zip';
};

// Il tipo VERO del file: prima i byte (la firma), poi il nome, poi ciò che
// il client ha dichiarato. Un browser manda "" per .eml e .md, e
// "application/octet-stream" per quasi tutto ciò che non conosce.
export function sniffType(buf, name, declared) {
  const d = String(declared || '').split(';')[0].trim().toLowerCase();
  const e = ext(name);
  if (Buffer.isBuffer(buf)) {
    const n = buf.length;
    const head = (k) => (n >= k ? buf.subarray(0, k).toString('latin1') : '');
    if (n >= 4 && head(4) === '%PDF') return MEDIA.pdf;
    if (n >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
    if (n >= 4 && buf.readUInt32BE(0) === 0x89504E47) return 'image/png';
    if (n >= 12 && head(4) === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
    if (n >= 4 && head(4) === 'GIF8') return 'image/gif';
    if (n >= 12 && buf.subarray(4, 8).toString('latin1') === 'ftyp') {
      const brand = buf.subarray(8, 12).toString('latin1').toLowerCase();
      if (/^(heic|heix|hevc|heim|heis|hevm|hevs|mif1|msf1)/.test(brand)) return MEDIA.heic;
    }
    if (n >= 8 && buf.readUInt32LE(0) === 0xE011CFD0) return e === 'xls' ? 'application/vnd.ms-excel' : e === 'ppt' ? 'application/vnd.ms-powerpoint' : MEDIA.doc;
    if (isZip(buf)) return zipKind(buf);
    if (n >= 5 && head(5) === '{\\rtf') return MEDIA.rtf;
  }
  if (EXT_MEDIA[e]) return EXT_MEDIA[e];
  if (d && d !== 'application/octet-stream') return d === 'image/jpg' ? 'image/jpeg' : d;
  return d || 'application/octet-stream';
}

// ── XML → testo ─────────────────────────────────────────────────────────
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' };
export function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
    return Object.prototype.hasOwnProperty.call(ENT, e.toLowerCase()) ? ENT[e.toLowerCase()] : m;
  });
}
// I TAB restano: sono le colonne di un Excel e le celle di una tabella Word
// — spazi e nbsp si compattano, i tab no.
const tidy = (s) => String(s || '').replace(/\r\n?/g, '\n').replace(/[ \u00a0]+/g, ' ').replace(/ *\t */g, '\t').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();

function docxText(buf) {
  const entries = unzipEntries(buf);
  const xml = unzipEntry(buf, entries.get('word/document.xml')).toString('utf8');
  const body = xml
    .replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n').replace(/<w:cr\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n').replace(/<\/w:tc>/g, '\t').replace(/<\/w:tr>/g, '\n')
    .replace(/<[^>]+>/g, '');
  return tidy(decodeEntities(body));
}

function odtText(buf) {
  const entries = unzipEntries(buf);
  const xml = unzipEntry(buf, entries.get('content.xml')).toString('utf8');
  const body = xml
    .replace(/<text:tab\/>/g, '\t').replace(/<text:line-break\/>/g, '\n').replace(/<text:s(\s[^>]*)?\/>/g, ' ')
    .replace(/<\/text:(p|h)>/g, '\n').replace(/<\/table:table-cell>/g, '\t').replace(/<\/table:table-row>/g, '\n')
    .replace(/<[^>]+>/g, '');
  return tidy(decodeEntities(body));
}

function xlsxText(buf) {
  const entries = unzipEntries(buf);
  const shared = [];
  if (entries.has('xl/sharedStrings.xml')) {
    const xml = unzipEntry(buf, entries.get('xl/sharedStrings.xml')).toString('utf8');
    for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push(decodeEntities(Array.from(m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((t) => t[1]).join('')));
    }
  }
  // I nomi dei fogli dal workbook (nell'ordine), i file dai rels; senza
  // rels si prendono i worksheets in ordine numerico.
  const names = [];
  if (entries.has('xl/workbook.xml')) {
    const wb = unzipEntry(buf, entries.get('xl/workbook.xml')).toString('utf8');
    for (const m of wb.matchAll(/<sheet\b[^>]*\bname="([^"]*)"[^>]*\br:id="([^"]*)"/g)) names.push({ name: decodeEntities(m[1]), rid: m[2] });
  }
  const rels = new Map();
  if (entries.has('xl/_rels/workbook.xml.rels')) {
    const r = unzipEntry(buf, entries.get('xl/_rels/workbook.xml.rels')).toString('utf8');
    for (const m of r.matchAll(/<Relationship\b[^>]*\bId="([^"]*)"[^>]*\bTarget="([^"]*)"/g)) rels.set(m[1], m[2].replace(/^\/?(xl\/)?/, 'xl/'));
    for (const m of r.matchAll(/<Relationship\b[^>]*\bTarget="([^"]*)"[^>]*\bId="([^"]*)"/g)) if (!rels.has(m[2])) rels.set(m[2], m[1].replace(/^\/?(xl\/)?/, 'xl/'));
  }
  let sheets = names.map((s) => ({ name: s.name, file: rels.get(s.rid) })).filter((s) => s.file && entries.has(s.file));
  if (!sheets.length) {
    sheets = Array.from(entries.keys()).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
      .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10)).map((k, i) => ({ name: 'Foglio ' + (i + 1), file: k }));
  }
  const out = [];
  let rows = 0;
  for (const s of sheets) {
    const xml = unzipEntry(buf, entries.get(s.file)).toString('utf8');
    out.push('FOGLIO: ' + s.name);
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const c of row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b[^>]*\/>/g)) {
        const attrs = c[1] || '', inner = c[2] || '';
        const t = (/\bt="([^"]*)"/.exec(attrs) || [])[1] || '';
        let v = '';
        if (t === 's') { const i = parseInt((/<v>([^<]*)<\/v>/.exec(inner) || [])[1] || '', 10); v = shared[i] != null ? shared[i] : ''; }
        else if (t === 'inlineStr') v = decodeEntities(Array.from(inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((x) => x[1]).join(''));
        else if (t === 'b') v = (/<v>1<\/v>/.test(inner)) ? 'VERO' : 'FALSO';
        else v = decodeEntities((/<v>([^<]*)<\/v>/.exec(inner) || [])[1] || '');
        cells.push(v);
      }
      if (cells.some((x) => x !== '')) { out.push(cells.join('\t').replace(/\t+$/, '')); rows++; }
      if (rows >= 3000) { out.push('… (righe oltre 3000 non lette)'); break; }
    }
    if (rows >= 3000) break;
  }
  return tidy(out.join('\n'));
}

// ── Word 97-2003 (.doc): OLE compound file → WordDocument + Table → FIB →
// piece table → testo. Nato in tests/_doc.mjs per confrontare i modelli
// dell'associazione in reference/ con le clausole stampate; ora vive qui e
// i test lo importano da qui. Non è un convertitore: campi, immagini e
// note non interessano.
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

// ── testo semplice: UTF-8 (con BOM) e, se non è UTF-8 valido, windows-1252
export function bytesToText(buf) {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(buf); }
  catch (_) {
    try { return new TextDecoder('windows-1252').decode(buf); }
    catch (_2) { return buf.toString('latin1'); }
  }
}

export function htmlText(html) {
  const s = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h[1-6]|blockquote|section|article|header|footer|pre)>/gi, '\n')
    .replace(/<\/(td|th)>/gi, '\t')
    .replace(/<[^>]+>/g, ' ');
  return tidy(decodeEntities(s));
}

export function rtfText(rtf) {
  let s = String(rtf || '');
  // gruppi da ignorare del tutto (font, colori, info, immagini)
  s = s.replace(/\{\\\*\\[^{}]*(\{[^{}]*\})*[^{}]*\}/g, ' ')
    .replace(/\{\\(fonttbl|colortbl|stylesheet|info|pict|object|header|footer)[\s\S]*?\}(?=\s*(\\|\{|\}|$))/g, ' ');
  s = s.replace(/\\'([0-9a-f]{2})/gi, (m, h) => { const b = Buffer.from([parseInt(h, 16)]); try { return new TextDecoder('windows-1252').decode(b); } catch (_) { return b.toString('latin1'); } })
    .replace(/\\u(-?\d+)\??/g, (m, n) => { let c = parseInt(n, 10); if (c < 0) c += 65536; return String.fromCharCode(c); })
    .replace(/\\(par|line|row)\b/g, '\n').replace(/\\(tab|cell)\b/g, '\t')
    .replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '').replace(/\\([\\{}])/g, '$1');
  return tidy(s);
}

// ── email (.eml): intestazioni utili + corpo, con MIME multipart, QP e base64
function rfc2047(s) {
  return String(s || '').replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (m, cs, enc, data) => {
    try {
      const bytes = /b/i.test(enc) ? Buffer.from(data, 'base64') : qpDecode(data.replace(/_/g, ' '));
      return new TextDecoder(cs.toLowerCase().replace(/^iso-?8859-?1$/, 'latin1')).decode(bytes);
    } catch (_) { return m; }
  }).replace(/\?=\s+=\?/g, '?==?');
}
function qpDecode(s) {
  const str = String(s || '').replace(/=\r?\n/g, '');
  const out = [];
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '=' && /^[0-9a-f]{2}$/i.test(str.substr(i + 1, 2))) { out.push(parseInt(str.substr(i + 1, 2), 16)); i += 2; }
    else out.push(str.charCodeAt(i) & 0xff);
  }
  return Buffer.from(out);
}
function mimeDecode(body, headers) {
  const cte = (headers['content-transfer-encoding'] || '').toLowerCase();
  const ct = headers['content-type'] || '';
  const cs = ((/charset="?([^";\s]+)"?/i.exec(ct) || [])[1] || 'utf-8').toLowerCase();
  let bytes;
  if (cte.includes('base64')) bytes = Buffer.from(body.replace(/\s+/g, ''), 'base64');
  else if (cte.includes('quoted-printable')) bytes = qpDecode(body);
  else bytes = Buffer.from(body, 'latin1');
  try { return new TextDecoder(cs.replace(/^iso-?8859-?1$/, 'latin1')).decode(bytes); }
  catch (_) { return bytesToText(bytes); }
}
function parseHeaders(block) {
  const h = {};
  block.replace(/\r\n?/g, '\n').replace(/\n[ \t]+/g, ' ').split('\n').forEach((line) => {
    const i = line.indexOf(':'); if (i <= 0) return;
    h[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  });
  return h;
}
function mimeBody(raw, depth) {
  const norm = String(raw).replace(/\r\n?/g, '\n');
  const cut = norm.indexOf('\n\n');
  const headers = parseHeaders(cut < 0 ? norm : norm.slice(0, cut));
  const body = cut < 0 ? '' : norm.slice(cut + 2);
  const ct = (headers['content-type'] || 'text/plain').toLowerCase();
  const boundary = (/boundary="?([^";\n]+)"?/i.exec(headers['content-type'] || '') || [])[1];
  if (ct.startsWith('multipart/') && boundary && depth < 6) {
    const parts = body.split('--' + boundary).slice(1).filter((p) => !/^--/.test(p.trim().slice(0, 2)) || p.trim().length > 2);
    const found = parts.map((p) => mimeBody(p.replace(/^\n/, ''), depth + 1)).filter((x) => x && x.text);
    const plain = found.find((x) => x.kind === 'plain'), html = found.find((x) => x.kind === 'html');
    const best = plain || html || found[0] || { text: '', kind: 'plain' };
    return { headers, text: best.text, kind: best.kind };
  }
  if (ct.startsWith('text/html')) return { headers, text: htmlText(mimeDecode(body, headers)), kind: 'html' };
  if (ct.startsWith('text/')) return { headers, text: tidy(mimeDecode(body, headers)), kind: 'plain' };
  return { headers, text: '', kind: 'other' };   // allegati binari: non qui
}
export function emlText(buf) {
  const raw = bytesToText(buf);
  const r = mimeBody(raw, 0);
  const h = r.headers || {};
  const head = ['From', 'To', 'Cc', 'Date', 'Subject'].map((k) => (h[k.toLowerCase()] ? k + ': ' + rfc2047(h[k.toLowerCase()]) : '')).filter(Boolean).join('\n');
  return tidy(head + '\n\n' + (r.text || ''));
}

// ── la porta unica: byte + tipo → testo (o null se non è un formato testuale)
export function extractText(buf, mediaType) {
  const mt = String(mediaType || '').toLowerCase();
  if (!TEXTY.has(mt)) return null;
  let text;
  if (mt === MEDIA.docx) text = docxText(buf);
  else if (mt === MEDIA.xlsx) text = xlsxText(buf);
  else if (mt === MEDIA.odt) text = odtText(buf);
  else if (mt === MEDIA.doc) text = tidy(docText(buf));
  else if (mt === MEDIA.eml) text = emlText(buf);
  else if (mt === MEDIA.html) text = htmlText(bytesToText(buf));
  else if (mt === MEDIA.rtf || mt === 'text/rtf') text = rtfText(bytesToText(buf));
  else text = tidy(bytesToText(buf));
  return { text, label: TEXTY_LABEL[mt] || 'testo', chars: text.length };
}
