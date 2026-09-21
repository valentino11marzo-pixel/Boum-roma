// tests/doctext/run.mjs
// «Qualsiasi cosa» diventa testo: il lettore ZIP minimo (STORE e DEFLATE) e
// le estrazioni Word/Excel/OpenDocument/.doc/email/HTML/RTF/testo di
// api/_doctext.js, più il riconoscimento del tipo VERO dai byte. Zero
// dipendenze, zero rete: se un formato smette di aprirsi lo si vede qui,
// non dall'operatore.
//
//   node tests/doctext/run.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { deflateRawSync } from 'node:zlib';
import { crc32 } from '../../api/_zip.js';
import { zipEntries, zipEntryBytes, isZip } from '../../api/_unzip.js';
import { unzipEntries, unzipEntry, unzipFile, sniffType, extractText, docText, htmlText, rtfText, emlText, bytesToText, decodeEntities, TEXTY, MEDIA, FORMATS_HUMAN } from '../../api/_doctext.js';

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  const ok = !!cond;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${ok || !extra ? '' : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

// Uno scrittore ZIP minimo per i test (STORE o DEFLATE): l'unica cosa che
// api/_zip.js non fa è comprimere, e qui serve entrambe le vie.
function mkZip(entries, deflate) {
  const locals = [], cds = []; let off = 0;
  for (const [name, str] of entries) {
    const nameB = Buffer.from(name), raw = Buffer.from(str), data = deflate ? deflateRawSync(raw) : raw, crc = crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(deflate ? 8 : 0, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nameB.length, 26); lh.writeUInt16LE(0, 28);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0, 8); cd.writeUInt16LE(deflate ? 8 : 0, 10);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(raw.length, 24); cd.writeUInt16LE(nameB.length, 28); cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32); cd.writeUInt32LE(off, 42);
    locals.push(lh, nameB, data); cds.push(cd, nameB); off += 30 + nameB.length + data.length;
  }
  const cdBuf = Buffer.concat(cds);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cdBuf, eocd]);
}

console.log('\n\x1b[1mLo ZIP del Pendolare, con la lettura in memoria di una voce\x1b[0m');
const Z1 = mkZip([['a.txt', 'ciao mondo'], ['dir/b.txt', 'x'.repeat(5000)]], false);
const Z2 = mkZip([['a.txt', 'ciao mondo'], ['dir/b.txt', 'x'.repeat(5000)]], true);
check('isZip riconosce la firma PK', isZip(Z1) && isZip(Z2) && !isZip(Buffer.from('%PDF-1.4')));
check('zipEntries (API del Pendolare, intatta): elenco con name/method/compSize/size/localOffset', zipEntries(Z1).length === 2 && zipEntries(Z1)[1].name === 'dir/b.txt' && zipEntries(Z1)[1].size === 5000 && zipEntries(Z2)[1].method === 8);
check('STORE: byte esatti via zipEntryBytes e via unzipFile', zipEntryBytes(Z1, zipEntries(Z1)[0]).toString() === 'ciao mondo' && unzipFile(Z1, 'dir/b.txt').length === 5000);
check('DEFLATE: gli stessi byte dopo l\'inflate (e il file è davvero più piccolo)', unzipFile(Z2, 'dir/b.txt').toString() === 'x'.repeat(5000) && Z2.length < Z1.length, `${Z2.length} vs ${Z1.length}`);
check('una voce assente → null, mai un\'eccezione', unzipFile(Z1, 'nope') === null && zipEntryBytes(Z1, null) === null);
check('non-ZIP → eccezione (EOCD assente)', (() => { try { unzipEntries(Buffer.from('non sono uno zip, davvero, per niente')); return false; } catch (e) { return /EOCD/.test(e.message); } })());
check('una voce che dichiara 100 MB non si gonfia (zip bomb): zip_entry_too_large', (() => {
  const e = { name: 'x', method: 8, compSize: 10, size: 100 * 1024 * 1024, localOffset: 0 };
  try { zipEntryBytes(Z2, e); return false; } catch (err) { return err.message === 'zip_entry_too_large'; }
})());

console.log('\n\x1b[1mIl tipo VERO: prima i byte, poi il nome, poi la dichiarazione\x1b[0m');
const DOCX = mkZip([['[Content_Types].xml', '<Types/>'], ['word/document.xml', '<w:document><w:body><w:p><w:r><w:t>Contratto di locazione</w:t></w:r></w:p><w:p><w:r><w:t>Canone &#8364;1.100</w:t><w:tab/><w:t>deposito &amp; spese</w:t></w:r><w:br/><w:r><w:t>riga nuova</w:t></w:r></w:p></w:body></w:document>']], true);
const XLSX = mkZip([['xl/workbook.xml', '<workbook><sheets><sheet name="Rate 2026" sheetId="1" r:id="rId1"/></sheets></workbook>'], ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>'], ['xl/sharedStrings.xml', '<sst><si><t>Mese</t></si><si><t>Importo</t></si><si><r><t>Sett</t></r><r><t>embre</t></r></si></sst>'], ['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>1100</v></c><c r="C2" t="b"><v>1</v></c><c r="D2" t="inlineStr"><is><t>ok</t></is></c></row><row r="3"/></sheetData></worksheet>']], true);
const ODT = mkZip([['mimetype', 'application/vnd.oasis.opendocument.text'], ['content.xml', '<office:document-content><office:body><office:text><text:h>Titolo</text:h><text:p>Prima<text:tab/>riga<text:line-break/>seconda</text:p></office:text></office:body></office:document-content>']], false);
check('%PDF → pdf, anche se il nome dice .zip e il client dice octet-stream', sniffType(Buffer.from('%PDF-1.7 ...'), 'x.zip', 'application/octet-stream') === MEDIA.pdf);
check('JPEG/PNG/WebP/GIF dai byte', sniffType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]), 'x.heic', 'image/heic') === 'image/jpeg'
  && sniffType(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(12)]), 'a', '') === 'image/png'
  && sniffType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]), 'a', '') === 'image/webp'
  && sniffType(Buffer.from('GIF89a' + '\0'.repeat(10)), 'a.txt', 'text/plain') === 'image/gif');
check('HEIC vera (ftypheic) → image/heic anche se il nome dice .jpg', sniffType(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(16)]), 'IMG.jpg', 'image/jpeg') === MEDIA.heic);
check('PK con word/document.xml → Word; con xl/workbook.xml → Excel; con content.xml+mimetype → OpenDocument; PK anonimo → application/zip',
  sniffType(DOCX, 'x.bin', '') === MEDIA.docx && sniffType(XLSX, 'x', 'application/octet-stream') === MEDIA.xlsx && sniffType(ODT, '', '') === MEDIA.odt && sniffType(mkZip([['a', 'b']], false), 'a.docx', '') === 'application/zip');
check('OLE (D0CF11E0) → .doc; con nome .xls → vnd.ms-excel (non lo leggiamo, ma non lo chiamiamo Word)', sniffType(Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(8)]), 'x.doc', '') === MEDIA.doc
  && sniffType(Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(8)]), 'x.xls', '') === 'application/vnd.ms-excel');
check('{\\rtf → RTF dai byte', sniffType(Buffer.from('{\\rtf1\\ansi ciao}'), 'x.txt', 'text/plain') === MEDIA.rtf);
check('senza firma vale l\'estensione: .eml, .md, .csv, .html, .json, .txt', sniffType(Buffer.from('From: a\n\nb'), 'm.eml', '') === MEDIA.eml && sniffType(Buffer.from('# t'), 'n.md', '') === MEDIA.md && sniffType(Buffer.from('a;b'), 'r.csv', 'application/octet-stream') === MEDIA.csv && sniffType(Buffer.from('<p>'), 'p.htm', '') === MEDIA.html && sniffType(Buffer.from('{}'), 'd.json', '') === MEDIA.json && sniffType(Buffer.from('x'), 'note.txt', '') === MEDIA.txt);
check('senza firma né estensione vale la dichiarazione (image/jpg normalizzato)', sniffType(Buffer.from('xxxxxxxxxxxxxxxx'), 'blob', 'image/jpg') === 'image/jpeg' && sniffType(Buffer.from('xxxxxxxxxxxxxxxx'), '', '') === 'application/octet-stream');
check('TEXTY copre i formati testuali e FORMATS_HUMAN li elenca per l\'operatore', TEXTY.has(MEDIA.docx) && TEXTY.has(MEDIA.eml) && TEXTY.has(MEDIA.rtf) && !TEXTY.has(MEDIA.pdf) && /Word/.test(FORMATS_HUMAN) && /email/.test(FORMATS_HUMAN));

console.log('\n\x1b[1mLe estrazioni\x1b[0m');
let t = extractText(DOCX, MEDIA.docx);
check('DOCX: paragrafi a capo, tab, <w:br/>, entità decodificate (€, &)', t.label === 'Word' && /Contratto di locazione\nCanone €1\.100\tdeposito & spese\nriga nuova/.test(t.text), JSON.stringify(t.text));
t = extractText(XLSX, MEDIA.xlsx);
check('XLSX: nome del foglio dal workbook, stringhe condivise (anche a run), numeri, booleani, inlineStr, righe vuote saltate', /^FOGLIO: Rate 2026\nMese\tImporto\nSettembre\t1100\tVERO\tok$/.test(t.text) && t.label === 'Excel', JSON.stringify(t.text));
const XLSX_NOREL = mkZip([['xl/workbook.xml', '<workbook/>'], ['xl/worksheets/sheet2.xml', '<worksheet><sheetData><row><c><v>2</v></c></row></sheetData></worksheet>'], ['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row><c><v>1</v></c></row></sheetData></worksheet>']], false);
check('XLSX senza rels: i fogli in ordine numerico', /FOGLIO: Foglio 1\n1\nFOGLIO: Foglio 2\n2/.test(extractText(XLSX_NOREL, MEDIA.xlsx).text), JSON.stringify(extractText(XLSX_NOREL, MEDIA.xlsx).text));
const sparseSheet = (middle = '') => mkZip([
  ['xl/workbook.xml', '<workbook/>'],
  ['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Persona</t></is></c><c r="B1" t="inlineStr"><is><t>Deposito</t></is></c><c r="C1" t="inlineStr"><is><t>Canone</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Esempio</t></is></c>' + middle + '<c r="C2"><v>1100</v></c></row></sheetData></worksheet>'],
], false);
check('XLSX: B2 assente conserva il canone in C, non sotto Deposito', extractText(sparseSheet(), MEDIA.xlsx).text.endsWith('Esempio\t\t1100'));
check('XLSX: B2 vuota autochiusa non ingloba la cella C2 seguente', extractText(sparseSheet('<c r="B2"/>'), MEDIA.xlsx).text.endsWith('Esempio\t\t1100'));
check('XLSX: una coordinata oltre XFD si rifiuta senza creare colonne illimitate', (() => {
  const bad = mkZip([['xl/workbook.xml', '<workbook/>'], ['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row><c r="XFE1"><v>1</v></c></row></sheetData></worksheet>']], false);
  try { extractText(bad, MEDIA.xlsx); return false; } catch (e) { return /xlsx_invalid_cell/.test(e.message); }
})());
t = extractText(ODT, MEDIA.odt);
check('ODT: titoli e paragrafi a capo, tab e line-break', /^Titolo\nPrima\triga\nseconda$/.test(t.text), JSON.stringify(t.text));
const doc = readFileSync(new URL('../../reference/contratto_tipo_32_Roma_2023.doc', import.meta.url));
t = extractText(doc, MEDIA.doc);
check('.doc 97-2003 VERO (il modello 3+2 dell\'associazione): il testo esce, con «locazione» e la legge 431', t.label === 'Word 97-2003' && t.chars > 5000 && /locazione/i.test(t.text) && /431/.test(t.text), `${t.chars} caratteri`);
check('…e docText resta esportato per i test dei modelli (tests/_doc.mjs)', typeof docText === 'function' && (await import('../_doc.mjs')).docText === docText);
// OLE sintetico: i limiti del parser si verificano senza bloccare la suite
// se si rimette il difetto. Il timeout è solo il guardiano del test; il
// parser deve lanciare un proprio errore, mai arrivare al timeout della VM.
function tinyOle() {
  const b = Buffer.alloc(512 * 5);
  b.writeUInt32LE(0xE011CFD0, 0); b.writeUInt32LE(0xE11AB1A1, 4);
  b.writeUInt16LE(0x003e, 24); b.writeUInt16LE(3, 26); b.writeUInt16LE(0xfffe, 28);
  b.writeUInt16LE(9, 0x1e); b.writeUInt16LE(6, 0x20);
  b.writeUInt32LE(1, 0x2c); b.writeUInt32LE(1, 0x30); b.writeUInt32LE(4096, 0x38);
  b.writeUInt32LE(2, 0x3c); b.writeUInt32LE(1, 0x40); b.writeUInt32LE(0xfffffffe, 0x44);
  for (let i = 0; i < 109; i++) b.writeUInt32LE(0xffffffff, 0x4c + i * 4);
  b.writeUInt32LE(0, 0x4c);
  for (let i = 0; i < 128; i++) b.writeUInt32LE(0xffffffff, 512 + i * 4);
  b.writeUInt32LE(0xfffffffd, 512);
  for (let i = 1; i <= 3; i++) b.writeUInt32LE(0xfffffffe, 512 + i * 4);
  for (const [i, name, type, start, size] of [[0, 'Root Entry', 5, 3, 64], [1, 'WordDocument', 2, 0, 32]]) {
    const o = 1024 + i * 128, nb = Buffer.from(name + '\0', 'utf16le');
    nb.copy(b, o); b.writeUInt16LE(nb.length, o + 0x40); b[o + 0x42] = type;
    b.writeUInt32LE(start, o + 0x74); b.writeUInt32LE(size, o + 0x78);
  }
  b.writeUInt32LE(0xfffffffe, 1536);
  return b;
}
function boundedOleError(buf) {
  try { new vm.Script('(' + docText.toString() + ')(buf)').runInNewContext({ Buffer, buf }, { timeout: 100 }); return false; }
  catch (e) { return e.code !== 'ERR_SCRIPT_EXECUTION_TIMEOUT' && /^ole_invalid_/.test(e.message); }
}
const miniCycle = tinyOle(); miniCycle.writeUInt32LE(0, 1536);
check('DOC: miniFAT ciclica termina con errore del parser, senza loop o timeout', boundedOleError(miniCycle));
const fatCycle = tinyOle(); fatCycle.writeUInt32LE(1, 512 + 4);
check('DOC: FAT ciclica termina con errore prima di duplicare i settori', boundedOleError(fatCycle));
const difatCycle = tinyOle(); difatCycle.writeUInt32LE(2, 0x44); difatCycle.writeUInt32LE(0xffffffff, 0x48); difatCycle.writeUInt32LE(2, 2044);
check('DOC: numero DIFAT impossibile si rifiuta prima del traversal', boundedOleError(difatCycle));
const miniOutside = tinyOle(); miniOutside.writeUInt32LE(123, 1536);
check('DOC: miniFAT fuori dal file si rifiuta, senza troncare il documento', boundedOleError(miniOutside));
const EML = Buffer.from('From: Marta Neri <marta@x.com>\r\nTo: info@boomrome.com\r\nDate: Mon, 21 Sep 2026 10:00:00 +0200\r\nSubject: =?utf-8?B?Q2FzYSBhIFRyYXN0ZXZlcmU=?=\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nCerco un bilocale, budget =E2=82=AC1200.\r\nGrazie=\r\n mille\r\n');
t = extractText(EML, MEDIA.eml);
check('EML semplice: From/To/Date/Subject (RFC 2047 base64) + corpo quoted-printable (€, soft line break)', /^From: Marta Neri <marta@x\.com>\nTo: info@boomrome\.com\nDate: .*\nSubject: Casa a Trastevere\n\nCerco un bilocale, budget €1200\.\nGrazie mille$/.test(t.text) && t.label === 'email', JSON.stringify(t.text));
const UTF8_EML = Buffer.from('Subject: Disponibilità città\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\nCittà, disponibilità: €1200.\r\n', 'utf8');
check('EML UTF-8 8bit conserva accenti ed euro nei byte del corpo', extractText(UTF8_EML, MEDIA.eml).text.endsWith('Città, disponibilità: €1200.'));
check('EML UTF-8 conserva anche un header internazionale non RFC2047', extractText(UTF8_EML, MEDIA.eml).text.startsWith('Subject: Disponibilità città'));
const MIME = Buffer.from(['Subject: =?ISO-8859-1?Q?Propriet=E0?=', 'Content-Type: multipart/alternative; boundary="B1"', '', '--B1', 'Content-Type: text/plain; charset=iso-8859-1', 'Content-Transfer-Encoding: 8bit', '', 'Testo semplice: caff\xe8', '--B1', 'Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: base64', '', Buffer.from('<p>Testo <b>HTML</b></p>').toString('base64'), '--B1--', ''].join('\r\n'), 'latin1');
t = extractText(MIME, MEDIA.eml);
check('EML multipart: si preferisce text/plain (latin1 decodificato), l\'oggetto Q-encoded si legge', /Subject: Proprietà/.test(t.text) && /Testo semplice: caffè/.test(t.text) && !/HTML/.test(t.text), JSON.stringify(t.text));
const HTMLONLY = Buffer.from('Subject: x\r\nContent-Type: multipart/mixed; boundary=B2\r\n\r\n--B2\r\nContent-Type: text/html\r\n\r\n<div>Solo <i>HTML</i><br>qui</div>\r\n--B2\r\nContent-Type: application/pdf\r\nContent-Transfer-Encoding: base64\r\n\r\nJVBERi0=\r\n--B2--\r\n');
check('EML con solo HTML e un allegato binario: l\'HTML si spoglia, l\'allegato non entra', /Solo HTML\nqui/.test(extractText(HTMLONLY, MEDIA.eml).text) && !/JVBER/.test(extractText(HTMLONLY, MEDIA.eml).text), JSON.stringify(extractText(HTMLONLY, MEDIA.eml).text));
check('HTML: script e style via, blocchi a capo, celle a tab, entità', htmlText('<html><head><style>p{}</style><script>alert(1)</script></head><body><h1>Titolo</h1><p>Ciao&nbsp;<b>Marta</b> &amp; Co</p><table><tr><td>a</td><td>b</td></tr></table></body></html>') === 'Titolo\nCiao Marta & Co\na\tb', JSON.stringify(htmlText('<h1>Titolo</h1><p>Ciao&nbsp;<b>Marta</b> &amp; Co</p><table><tr><td>a</td><td>b</td></tr></table>')));
check('RTF: control word via, \\par a capo, \\\'hh in cp1252 (€), \\u unicode, tabella font ignorata', rtfText("{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\fnil Arial;}}{\\colortbl;\\red0\\green0\\blue0;}\\f0\\fs24 Canone \\'80 1.100\\par Citt\\u224? di Roma}") === 'Canone € 1.100\nCittà di Roma', JSON.stringify(rtfText("{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\f0 Canone \\'80 1.100\\par Citt\\u224? di Roma}")));
check('testo: UTF-8 con BOM pulito; byte non UTF-8 → windows-1252 (è, €)', bytesToText(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('ciao')])) === 'ciao' && bytesToText(Buffer.from('caff\xe8 \x80', 'latin1')) === 'caffè €', JSON.stringify(bytesToText(Buffer.from('caff\xe8 \x80', 'latin1'))));
check('CSV/Markdown/JSON passano come testo', extractText(Buffer.from('a;b\n1;2'), MEDIA.csv).text === 'a;b\n1;2' && extractText(Buffer.from('# T\n\n\n\ntesto'), MEDIA.md).text === '# T\n\ntesto' && extractText(Buffer.from('{"a":1}'), MEDIA.json).label === 'JSON');
check('decodeEntities: numeriche, esadecimali, nominate; un\'entità ignota resta', decodeEntities('&#8364; &#xe0; &lt;b&gt; &amp; &boh;') === '€ à <b> & &boh;');
check('un formato non testuale → null (PDF e immagini passano com\'è, altrove)', extractText(Buffer.from('%PDF'), MEDIA.pdf) === null && extractText(Buffer.from('x'), 'image/jpeg') === null);
check('un DOCX rotto (non zip) → eccezione, che il chiamante traduce nel rimedio', (() => { try { extractText(Buffer.from('non zip'), MEDIA.docx); return false; } catch (_) { return true; } })());

console.log('\n────────────────────────────────────────────────');
console.log(`\x1b[1mResult: ${pass} passed, ${fail} failed\x1b[0m`);
if (fail) process.exit(1);
console.log('\x1b[32mQualsiasi cosa diventa testo, e il tipo lo dicono i byte.\x1b[0m');
