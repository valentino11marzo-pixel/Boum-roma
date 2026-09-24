// design/owners/genera-fascicolo.mjs — IL FASCICOLO D'ESEMPIO di /owners.
//
// La pagina dei proprietari dice «Non ti chiediamo fiducia. Ti diamo le
// carte.» Questo script le produce: ogni PDF esce dal BUILDER DI PRODUZIONE
// (lo stesso codice che genera i documenti veri) alimentato con una casa
// d'esempio inventata — Anna Esempio, Lukas Beispiel, Via dell'Esempio 12 —
// e ogni pagina viene timbrata «ESEMPIO — dati inventati».
//
//   node design/owners/genera-fascicolo.mjs
//
// Scrive in carte/:
//   - 8 PDF (verbale, inventario d'ingresso e d'uscita col confronto,
//     contratto studenti Allegato C, rendiconto di uno e di tre immobili,
//     proposta, scheda di calcolo del canone);
//   - una miniatura WebP 560px della prima pagina di ciascuno (pdfjs-dist in
//     Chromium, MAI nel repo: PDFJS_DIR, default <tmpdir>/pdfjs);
//   - la schermata dei guasti di /casa (tenant.html vero, Firebase finto);
//   - fascicolo-esempio.zip (api/_zip.js) + LEGGIMI.txt;
//   - manifest.json (la forma del contratto §6: la legge l'integratore).
//
// Regole:
//   - nessuna rete, nessun Firestore: i builder ricevono i dati in mano;
//   - le date le passiamo noi (una linea del tempo TUTTA nel passato): un
//     builder che stamperebbe «oggi» riceve la data del fatto;
//   - idempotente: PDF, ZIP, miniature e manifest a byte identici fra due
//     giri, su qualunque fuso orario (date fisse, fuso di Roma, ID del file
//     derivato dai fatti del documento, file vecchi in carte/ rimossi);
//   - nessuna richiesta esce dalla macchina: le pagine aperte in Chromium
//     hanno ogni host esterno bloccato, e il browser stesso esce da un proxy
//     morto (127.0.0.1:9) per il suo traffico di fondo;
//   - «la riga che conta» si legge dal PDF con pdfjs (getTextContent), non
//     si scrive a mano: il manifest dice ciò che il PDF stampa davvero.
//
// Il timbro (verificabile con il solo pdf-lib, vedi stampEsempio):
//   - ogni pagina ha nelle Resources un XObject di nome /BoomEsempio (la
//     scritta diagonale) e un content stream NON compresso che contiene la
//     banda a piè di pagina con il testo letterale «(ESEMPIO …) Tj»;
//   - Info: Title, Subject e Keywords contengono «ESEMPIO — dati inventati».

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  PDFDocument, PDFName, PDFDict, PDFHexString, StandardFonts,
} from 'pdf-lib';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = join(ROOT, 'carte');
// pdfjs-dist serve SOLO a questo generatore e non entra nel repo né nel
// package.json: si installa a parte, una volta, in una cartella temporanea
//   npm i --prefix "$TMPDIR/pdfjs" pdfjs-dist@4
// e si passa con PDFJS_DIR (default: <tmpdir>/pdfjs/node_modules/pdfjs-dist).
const PDFJS_DIR = process.env.PDFJS_DIR
  || join(tmpdir(), 'pdfjs', 'node_modules', 'pdfjs-dist');
const DUMP = process.argv.includes('--dump');          // stampa le righe di ogni PDF
const NO_RASTER = process.argv.includes('--no-raster');

const req = createRequire(join(ROOT, 'package.json'));
const sharp = req('sharp');
const INV = req('./js/inventario-engine.js');
const CANONE = req('./js/canone-engine.js');
const FIELDS = req('./js/contract-fields.js');
const OFFER_MOD = req('./js/owner-offer.js');

const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { buildVerbalePdf } = await imp('api/contracts/verbale.js');
const { buildInventarioPdf } = await imp('api/contracts/inventario.js');
const { buildContractPdfBytes } = await imp('api/sign/_contractpdf.js');
const { buildPdf: buildRendicontoPdf } = await imp('api/owners/rendiconto.js');
const { buildPaPdf } = await imp('api/preagreement/_pdf.js');
const { deriveMoney } = await imp('api/preagreement/create.js');
const { PA_CONSENT_TEXT, PA_CONSENT_HASH } = await imp('api/preagreement/_consent.js');
const { buildSchedaPdf, schedaFacts, resolveCanoneInput } = await imp('api/fiscal/fascicolo.js');
const { buildZip } = await imp('api/_zip.js');

export const STAMP = 'ESEMPIO — dati inventati';

// ─────────────────────────────────────────────────────────────────────────
// 1 · LA CASA D'ESEMPIO (contratto §1): una fonte sola per tutti i PDF
// ─────────────────────────────────────────────────────────────────────────

// Codice fiscale col carattere di controllo VERO (stessa tabella di
// js/dataops-engine.js validateCF): un CF col controllo sbagliato sarebbe il
// primo «errore» che un commercialista vede nel fascicolo. I dati da cui
// nasce sono inventati: nome, cognome, data e luogo di fantasia.
function cf(first15) {
  const ODD = { 0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21, A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23 };
  const even = (ch) => (ch >= '0' && ch <= '9' ? ch.charCodeAt(0) - 48 : ch.charCodeAt(0) - 65);
  let sum = 0;
  for (let i = 0; i < 15; i++) sum += i % 2 === 0 ? ODD[first15[i]] : even(first15[i]);
  return first15 + String.fromCharCode(65 + (sum % 26));
}

const CASA = {
  address: 'Via dell\u2019Esempio 12, 00193 Roma',
  zonaCod: 'C40',
  mq: 70,
  rent: 1200,
  depositMonths: 2,
  start: '2025-09-01',
  end: '2026-08-31',
};
const OWNER = {
  name: 'Anna Esempio',
  cf: cf('SMPNNA68C52H501'),               // Esempio Anna, 12/03/1968, Roma
  dob: '1968-03-12', pob: 'Roma',
  address: 'Largo della Prova 5, 00197 Roma',
  email: 'anna.esempio@example.com',
};
const TENANT = {
  name: 'Lukas Beispiel',
  cf: cf('BSPLKS04E14Z112'),               // Beispiel Lukas, 14/05/2004, Germania
  dob: '2004-05-14', pob: 'Monaco di Baviera (Germania)',
  address: 'Beispielstraße 1, 80331 München (Germania)',
  nationality: 'tedesca',
  docType: 'passport', docNum: 'XA0000001', docIssuer: 'Stadt München', docIssueDate: '2022-02-01',
  email: 'lukas.beispiel@example.com',
  phone: '+49 000 0000000',
};
const OPERATORE = 'Operatore BOOM (esempio)';

// Firma disegnata (PNG da un tracciato SVG, via sharp): un tratto, non una
// calligrafia — nessuna persona vera ha firmato questi fogli.
async function signaturePng(seed) {
  const h = createHash('sha1').update(seed).digest();
  let d = 'M 12 58';
  let x = 12;
  for (let i = 0; i < 9; i++) {
    const dx = 22 + (h[i] % 14), up = 14 + (h[i + 9] % 30), dn = 8 + (h[(i + 3) % 20] % 20);
    d += ` C ${x + dx * 0.3} ${58 - up}, ${x + dx * 0.7} ${58 - up}, ${x + dx * 0.55} ${58 - up * 0.2}`;
    d += ` S ${x + dx * 0.9} ${58 + dn}, ${x + dx} ${56}`;
    x += dx;
  }
  d += ` M 20 72 L ${x - 10} ${66}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${x + 20}" height="90"><path d="${d}" fill="none" stroke="#1b2a4a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toBuffer();
  return 'data:image/png;base64,' + png.toString('base64');
}

// L'inventario d'ingresso e quello d'uscita, costruiti perché il confronto
// mostri i quattro casi che contano:
//   1. divano: strappo DICHIARATO all'ingresso → all'uscita non è un danno
//      nuovo (il motore lo conta fra gli integri: non compare fra i danni);
//   2. lampada da terra: all'uscita manca → «Mancanti»;
//   3. tavolo allungabile: dichiarato in buono stato all'ingresso, rovinato
//      all'uscita → «Danneggiati» (qui la prova c'è);
//   4. armadio della camera: all'ingresso nessuno ne ha dichiarato lo stato
//      → all'uscita «non verificabile», e il danno non si imputa.
// Le condizioni dichiarate vengono da un UMANO (source human): il video non
// può scrivere «buono stato» (regola 2 del motore) — qui scrive l'operatore.
const ENTRY_ROOMS = [
  { room: 'ingresso', items: [
    { name: 'Armadio a muro a due ante', qty: 1, condition: 'buono' },
    { name: 'Cassaforte a muro (nell\u2019armadio)', qty: 1, condition: 'buono' },
    { name: 'Specchio da parete', qty: 1 },
  ] },
  { room: 'soggiorno', items: [
    { name: 'Divano 3 posti', qty: 1, condition: 'danneggiato', note: 'strappo sul bracciolo destro' },
    { name: 'Tavolino basso', qty: 1, condition: 'buono' },
    { name: 'Lampada da terra', qty: 1, condition: 'buono' },
    { name: 'Libreria a cinque ripiani', qty: 1 },
    { name: 'Tende alle due finestre', qty: 2 },
  ] },
  { room: 'cucina', items: [
    { name: 'Frigorifero con congelatore', qty: 1, condition: 'buono' },
    { name: 'Piano cottura a gas 4 fuochi', qty: 1, condition: 'buono' },
    { name: 'Forno elettrico', qty: 1 },
    { name: 'Tavolo allungabile', qty: 1, condition: 'buono' },
    { name: 'Sedie', qty: 4 },
  ] },
  { room: 'balcone', items: [
    { name: 'Caldaia murale a gas', qty: 1, condition: 'buono', note: 'libretto di impianto consegnato' },
    { name: 'Stendibiancheria', qty: 1 },
  ] },
  { room: 'camera', items: [
    { name: 'Letto matrimoniale con materasso', qty: 1, condition: 'nuovo' },
    { name: 'Armadio a due ante', qty: 1 },
    { name: 'Comodini', qty: 2 },
  ] },
  { room: 'studio', items: [
    { name: 'Scrivania', qty: 1, condition: 'buono' },
    { name: 'Sedia da ufficio', qty: 1 },
    { name: 'Lampada da tavolo', qty: 1 },
  ] },
  { room: 'bagno', items: [
    { name: 'Lavatrice', qty: 1, condition: 'buono' },
    { name: 'Specchio con mensola', qty: 1 },
  ] },
];
function exitRooms() {
  const rooms = JSON.parse(JSON.stringify(ENTRY_ROOMS));
  const sog = rooms.find((r) => r.room === 'soggiorno');
  sog.items = sog.items.filter((it) => it.name !== 'Lampada da terra');                 // 2. mancante
  const cuc = rooms.find((r) => r.room === 'cucina');
  const tav = cuc.items.find((it) => it.name === 'Tavolo allungabile');
  tav.condition = 'danneggiato'; tav.note = 'bruciatura circolare sul piano';            // 3. danno nuovo
  const cam = rooms.find((r) => r.room === 'camera');
  const arm = cam.items.find((it) => it.name === 'Armadio a due ante');
  arm.condition = 'danneggiato'; arm.note = 'anta sinistra fuori squadra';               // 4. non verificabile
  return rooms;
}
const invOf = (rooms, at) => {
  const inv = INV.normalizeProposal({ rooms }, { source: 'human' });
  inv.reviewed = true;
  inv.at = at;
  return inv;
};

// ─────────────────────────────────────────────────────────────────────────
// 2 · IL TIMBRO
// ─────────────────────────────────────────────────────────────────────────

// WinAnsi in una stringa letterale PDF: ASCII così com'è, il resto in
// ottale — «—» è 0x97 (\227), «·» 0xB7, le accentate Latin-1 sé stesse.
const WIN_EXTRA = { '\u2014': 0x97, '\u2013': 0x96, '\u2019': 0x92, '\u2018': 0x91, '\u201C': 0x93, '\u201D': 0x94, '\u2026': 0x85, '\u20AC': 0x80 };
const pdfLit = (s) => '(' + Array.from(String(s)).map((ch) => {
  if (ch === '\\' || ch === '(' || ch === ')') return '\\' + ch;
  const c = ch.codePointAt(0);
  if (c >= 0x20 && c < 0x7F) return ch;
  const b = WIN_EXTRA[ch] != null ? WIN_EXTRA[ch] : (c >= 0xA0 && c <= 0xFF ? c : null);
  return b == null ? '' : '\\' + b.toString(8).padStart(3, '0');
}).join('') + ')';

const BAND_TEXT = STAMP + ' · documento prodotto dal codice di produzione BOOM, con dati di fantasia';

async function stampEsempio(bytes, meta) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const ctx = doc.context;
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRef = font.ref;
  const gsRef = ctx.register(ctx.obj({ Type: 'ExtGState', ca: 0.11, CA: 0.11 }));
  const pages = doc.getPages();
  const xobjs = new Map();          // una forma per formato di pagina
  const w1000 = font.widthOfTextAtSize('ESEMPIO', 1000);
  for (const page of pages) {
    const { width: W, height: H } = page.getSize();
    const key = W.toFixed(2) + 'x' + H.toFixed(2);
    if (!xobjs.has(key)) {
      // La scritta diagonale: grande, rossa, trasparente all'11% — si
      // legge in miniatura e non copre la riga che conta.
      const ang = Math.atan2(H, W);
      const size = Math.min(150, (Math.hypot(W, H) * 0.62) / (w1000 / 1000));
      const tw = (w1000 / 1000) * size;
      const c = Math.cos(ang), s = Math.sin(ang);
      const cx = W / 2 - (c * tw) / 2 + s * size * 0.35, cy = H / 2 - (s * tw) / 2 - c * size * 0.35;
      const content = [
        '/Artifact <</Type /Pagination /Subtype /Watermark>> BDC',
        'q /GS0 gs 0.78 0.11 0.09 rg',
        'BT /F0 ' + size.toFixed(2) + ' Tf',
        [c, s, -s, c, cx, cy].map((n) => n.toFixed(4)).join(' ') + ' Tm',
        pdfLit('ESEMPIO') + ' Tj ET Q EMC',
      ].join('\n');
      const form = ctx.stream(content, {
        Type: 'XObject', Subtype: 'Form', FormType: 1,
        BBox: [0, 0, W, H],
        Resources: { Font: { F0: fontRef }, ExtGState: { GS0: gsRef } },
      });
      xobjs.set(key, ctx.register(form));
    }
    // Resources della pagina: XObject BoomEsempio + font del timbro.
    const res = page.node.Resources() || (() => { const d = ctx.obj({}); page.node.set(PDFName.of('Resources'), d); return d; })();
    let xo = res.lookup(PDFName.of('XObject'));
    if (!(xo instanceof PDFDict)) { xo = ctx.obj({}); res.set(PDFName.of('XObject'), xo); }
    xo.set(PDFName.of('BoomEsempio'), xobjs.get(key));
    let fo = res.lookup(PDFName.of('Font'));
    if (!(fo instanceof PDFDict)) { fo = ctx.obj({}); res.set(PDFName.of('Font'), fo); }
    fo.set(PDFName.of('BoomEsF'), fontRef);

    // La banda a piè di pagina, sotto il piede legale (y 0–15): oro pieno,
    // testo nero. Content stream NON compresso: «ESEMPIO» si legge anche
    // aprendo il file con un editor di testo.
    const bandH = 15;
    const txt = BAND_TEXT;
    const tsz = 7;
    const band = [
      '/Artifact <</Type /Pagination /Subtype /Watermark>> BDC',
      'q 1 0.843 0 rg 0 0 ' + W.toFixed(2) + ' ' + bandH + ' re f',
      '0 0 0 rg BT /BoomEsF ' + tsz + ' Tf 1 0 0 1 12 4.6 Tm ' + pdfLit(txt) + ' Tj ET',
      '/BoomEsempio Do Q EMC',
    ].join('\n');
    // Il contenuto esistente va chiuso fra q/Q: un CTM lasciato aperto da un
    // builder sposterebbe il timbro.
    page.node.wrapContentStreams(ctx.getPushGraphicsStateContentStream(), ctx.getPopGraphicsStateContentStream());
    page.node.addContentStream(ctx.register(ctx.stream(band, {})));
  }
  doc.setTitle(`${STAMP} · ${meta.titolo}`, { showInWindowTitleBar: true });
  doc.setSubject(`${STAMP}: ${meta.subject || 'documento d\u2019esempio generato dal codice di produzione BOOM con dati di fantasia'}`);
  doc.setKeywords(['ESEMPIO', STAMP, 'BOOM Roma', 'casa d\u2019esempio']);
  doc.setAuthor('BOOM Roma — esempio');
  doc.setCreator('design/owners/genera-fascicolo.mjs');
  doc.setProducer('BOOM · builder di produzione + pdf-lib');
  doc.setLanguage('it-IT');
  const d = new Date(meta.date + 'T10:00:00Z');
  doc.setCreationDate(d);
  doc.setModificationDate(d);
  // ID del file DERIVATO dai fatti del documento, non dai byte del builder
  // (che portano l'ora in cui è girato): due giri, stesso file.
  const id = createHash('md5').update([STAMP, meta.id, meta.date, meta.titolo, pages.length].join('|')).digest('hex').toUpperCase();
  ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(id), PDFHexString.of(id)]);
  return Buffer.from(await doc.save({ useObjectStreams: true, updateFieldAppearances: false }));
}

// La ricetta di verifica (la stessa che può usare tests/owners, solo pdf-lib).
export async function verifyStamp(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const out = { pages: doc.getPageCount(), stampedPages: 0, title: doc.getTitle() || '', subject: doc.getSubject() || '' };
  for (const p of doc.getPages()) {
    const res = p.node.Resources();
    const xo = res && res.lookup(PDFName.of('XObject'));
    if (xo instanceof PDFDict && xo.has(PDFName.of('BoomEsempio'))) out.stampedPages++;
  }
  out.rawHasLiteral = Buffer.from(bytes).toString('latin1').split('(ESEMPIO \\227 dati inventati').length - 1;
  out.ok = out.stampedPages === out.pages && out.rawHasLiteral >= out.pages
    && out.title.includes(STAMP) && out.subject.includes(STAMP);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// 3 · I DOCUMENTI (builder veri, dati in mano)
// ─────────────────────────────────────────────────────────────────────────

const PROPERTY = {
  id: 'prop_esempio_12',
  name: 'Via dell\u2019Esempio 12',
  address: CASA.address,
  city: 'Roma',
  zone: 'Prati',
  canoneZonaCod: CASA.zonaCod,
  sqm: CASA.mq,
  floor: '3',
  scala: 'A',
  interno: '7',
  rooms: '4,5',
  accessories: 'balcone di servizio (cucina)',
  furnished: true,
  foglio: '999', particella: '999', sub: '7', categoria: 'A/2',
  cadastralData: 'foglio 999, particella 999, sub 7, cat. A/2',
  renditaCatastale: 1087.57,
  energyClass: 'E',
  impiantiStato: 'conformi',
  features: ['ascensore', 'porta blindata', 'doppi vetri', 'riscaldamento autonomo', 'videocitofono', 'balcone'],
  // riscaldamento autonomo e contatore dell'acqua individuale: quelle
  // tabelle non ci sono, e il contratto stampa «—» (non un numero finto).
  tabelleMillesimali: { proprieta: '38,40', scale: '41,20', ascensore: '40,10' },
  ownerId: 'owner_esempio',
};

async function contractFixture() {
  const [tenantSig, landlordSig] = await Promise.all([signaturePng('lukas'), signaturePng('anna')]);
  const contract = {
    id: 'contratto_esempio',
    type: 'studenti',
    propertyId: PROPERTY.id,
    propertyAddress: CASA.address,
    startDate: CASA.start,
    endDate: CASA.end,
    durationMonths: 12,
    rent: CASA.rent,
    deposit: CASA.rent * CASA.depositMonths,
    depositMonths: CASA.depositMonths,
    paymentDay: 5,
    paymentMethod: 'bonifico bancario',
    installmentMonths: 1,
    installmentAmount: CASA.rent,
    cedolareSecca: 'si',
    condoMode: 'acconto',
    oneriQuota: 60,
    // gli spazi «--» del modello dell'associazione, riempiti come li
    // riempirebbe l'operatore (nessuno resta un trattino da compilare)
    consegnaStato: 'unità immobiliare in buono stato locativo, arredata come da inventario allegato al verbale di consegna',
    garanzieAltre: 'nessuna',
    subentroModalita: 'previo consenso scritto del locatore',
    accessiModalita: 'previo accordo con il conduttore, con almeno 24 ore di preavviso',
    signaturePlace: 'Roma',
    signatureDate: '2025-08-25',
    cohabitants: 'nessuno',
    studenti: {
      corsoStudi: 'Laurea magistrale in Ingegneria informatica',
      universita: 'Sapienza Università di Roma',
      universitaIndirizzo: 'Piazzale Aldo Moro 5, 00185 Roma',
      tipoIscrizione: 'iscrizione al primo anno',
      annoAccademico: '2025/2026',
    },
    courseName: 'Laurea magistrale in Ingegneria informatica',
    universityName: 'Sapienza Università di Roma',
    tenantName: TENANT.name, tenantCF: TENANT.cf, tenantDob: TENANT.dob, tenantPob: TENANT.pob,
    tenantAddress: TENANT.address, tenantDocType: TENANT.docType, tenantDocNum: TENANT.docNum,
    tenantDocIssuer: TENANT.docIssuer, tenantDocIssueDate: TENANT.docIssueDate,
    tenantNationality: TENANT.nationality, tenantEmail: TENANT.email, tenantPhone: TENANT.phone,
    landlordName: OWNER.name, landlordCF: OWNER.cf, landlordDob: OWNER.dob, landlordPob: OWNER.pob,
    landlordAddress: OWNER.address, landlordEmail: OWNER.email,
    energyClass: 'E',
    renditaCatastale: 1087.57,
    canoneScheda: { zonaCod: CASA.zonaCod, mqBal: 4 },
    // la scheda si firma con la proposta (api/preagreement/_consent.js)
    paAcceptance: { at: '2025-08-20T16:42:00Z', ref: 'BOOM-ESEMPIO', schedaSigned: true },
    tenantSignature: tenantSig, tenantSignedAt: '2025-08-25T18:05:00Z',
    landlordSignature: landlordSig, landlordSignedAt: '2025-08-26T09:12:00Z',
    signatureStatus: 'completed',
    status: 'active',
  };
  const tenantUser = { name: TENANT.name, cf: TENANT.cf, dob: TENANT.dob, pob: TENANT.pob, address: TENANT.address, docType: TENANT.docType, docNum: TENANT.docNum, docIssuer: TENANT.docIssuer, docIssueDate: TENANT.docIssueDate, email: TENANT.email };
  const landlordUser = { name: OWNER.name, cf: OWNER.cf, dob: OWNER.dob, pob: OWNER.pob, address: OWNER.address, email: OWNER.email };
  return { contract, tenantUser, landlordUser, tenantSig, landlordSig };
}

async function buildAll() {
  const fx = await contractFixture();
  const { contract } = fx;
  const out = [];

  // ── Verbale di consegna (01/09/2025) ──
  const entry = invOf(ENTRY_ROOMS, '2025-09-01T07:40:00Z');
  const opSig = await signaturePng('operatore');
  out.push({
    id: 'verbale', file: 'verbale-consegna-esempio', date: '2025-09-01',
    titolo: 'Verbale di consegna delle chiavi',
    bytes: await buildVerbalePdf({
      contract, property: PROPERTY,
      keys: [
        { label: 'Portone del palazzo', qty: 1 },
        { label: 'Porta di casa (blindata)', qty: 2 },
        { label: 'Cassetta della posta', qty: 1 },
      ],
      meters: {
        luce: { lettura: '004512 kWh', pod: 'IT001E00012345' },
        gas: { lettura: '01873 Smc', pdr: '00880000012345' },
        acqua: { lettura: '0341 mc', matricola: 'ESEMPIO-0012' },
      },
      condition: 'buono',
      notes: 'Libretto della caldaia e istruzioni degli elettrodomestici consegnati al conduttore.',
      firme: [
        { name: TENANT.name, kind: 'conduttore', sig: fx.tenantSig },
        { name: OPERATORE, kind: 'consegnante', sig: opSig },
      ],
      photos: [],
      when: { d: '01/09/2025', t: '10:30', iso: '2025-09-01T08:30:00Z' },
      inventario: entry,
    }),
  });

  // ── Inventario d'ingresso (consegna, 01/09/2025) ──
  out.push({
    id: 'inventario-ingresso', file: 'inventario-ingresso-esempio', date: '2025-09-01',
    titolo: 'Inventario alla consegna',
    bytes: await buildInventarioPdf({
      property: PROPERTY, contract, inv: entry, kind: 'consegna', note: '',
      shots: [], when: { d: '01/09/2025', t: '09:40', iso: '2025-09-01T07:40:00Z' },
      diff: null, author: OPERATORE,
    }),
  });

  // ── Inventario d'uscita col confronto (riconsegna, 31/08/2026) ──
  const exit = invOf(exitRooms(), '2026-08-31T09:00:00Z');
  const diff = INV.diffInventory(entry, exit);
  out.push({
    id: 'inventario-uscita', file: 'inventario-uscita-esempio', date: '2026-08-31',
    titolo: 'Inventario alla riconsegna, con il confronto',
    diff,
    bytes: await buildInventarioPdf({
      property: PROPERTY, contract, inv: exit, kind: 'riconsegna', note: '',
      shots: [], when: { d: '31/08/2026', t: '11:00', iso: '2026-08-31T09:00:00Z' },
      diff, author: OPERATORE,
    }),
  });

  // ── Contratto per studenti, Allegato C (firmato il 25–26/08/2025) ──
  // Il PDF del contratto nasce PRIMA delle firme e non si rigenera mai sotto
  // una firma viva (ensureContractPdf): è il documento che le parti leggono
  // e firmano dal telefono. Quindi qui niente firme grafiche — pagina delle
  // firme e certificato li aggiunge _finalize, e passano alla V2.
  const hydrated = FIELDS.hydrateParties(contract, fx.tenantUser, fx.landlordUser, PROPERTY);
  const forSigning = { ...hydrated, signatureStatus: 'none' };
  ['tenantSignature', 'landlordSignature', 'tenantSignedAt', 'landlordSignedAt'].forEach((k) => delete forSigning[k]);
  const built = buildContractPdfBytes({ contractId: contract.id, contract: forSigning, property: PROPERTY, tenant: fx.tenantUser, landlord: fx.landlordUser });
  const completeness = FIELDS.completeness({ contract: hydrated, property: PROPERTY, tenant: fx.tenantUser, landlord: fx.landlordUser });
  out.push({
    id: 'contratto-studenti', file: 'contratto-studenti-esempio', date: '2025-08-25',
    titolo: 'Contratto di locazione per studenti universitari (Allegato C)',
    completeness,
    bytes: built.bytes,
  });

  // ── Rendiconto di un immobile (Luglio 2026) ──
  const lukasContract = { tenantName: TENANT.name, rent: CASA.rent, status: 'active' };
  const secEsempio = {
    prop: { address: CASA.address },
    contract: lukasContract,
    paid: [{ month: '2026-07', paidVia: 'bank', paidDate: '2026-07-03', amount: 1200 }],
    open: [], late: [],
    maint: [{ title: 'Scarico del lavandino lento', status: 'resolved' }],
  };
  out.push({
    id: 'rendiconto', file: 'rendiconto-esempio', date: '2026-08-01',
    titolo: 'Rendiconto mensile — Luglio 2026',
    bytes: await buildRendicontoPdf({ ownerName: OWNER.name, label: 'Luglio 2026', month: '2026-07', sections: [secEsempio], collected: 1200, expected: 1200, arrears: 0 }),
  });

  // ── Rendiconto con tre immobili (Luglio 2026) ──
  const tre = [
    secEsempio,
    {
      prop: { address: 'Via del Facsimile 8, 00153 Roma' },
      contract: { tenantName: 'Sofia Campione', rent: 950, status: 'active' },
      paid: [{ month: '2026-07', paidVia: 'stripe', paidDate: '2026-07-05', amount: 950 }],
      open: [], late: [],
      maint: [{ title: 'Tapparella del soggiorno bloccata', status: 'open' }],
    },
    {
      prop: { address: 'Vicolo del Modulo 3, 00186 Roma' },
      contract: { tenantName: 'Chloé Exemple', rent: 1450, status: 'active' },
      paid: [{ month: '2026-07', paidVia: 'sepa', paidDate: '2026-07-03', amount: 1450 }],
      open: [],
      late: [{ month: '2026-06', dueDate: '2026-06-05', amount: 1450 }],
      maint: [],
    },
  ];
  out.push({
    id: 'rendiconto-tre-case', file: 'rendiconto-tre-case-esempio', date: '2026-08-01',
    titolo: 'Rendiconto mensile di tre immobili — Luglio 2026',
    bytes: await buildRendicontoPdf({ ownerName: OWNER.name, label: 'Luglio 2026', month: '2026-07', sections: tre, collected: 1200 + 950 + 1450, expected: 1200 + 950 + 1450, arrears: 1450 }),
  });

  // ── Proposta (accettata il 20/08/2025) ──
  const money = deriveMoney({ rent: CASA.rent, depositMonths: CASA.depositMonths, depositSplitPct: 100, feeMode: 'pct', feePct: 10, feeVatPct: 22, feeDue: 'move-in', installmentMonths: 1, utilities: 'excluded' });
  const pa = {
    ref: 'BOOM-ESEMPIO',
    status: 'paid', paidEur: money.dueAtSigning, paidAt: '2025-08-20T16:55:00Z',
    acceptedAt: '2025-08-20T16:42:00Z',
    property: { address: CASA.address, type: 'Entire Apartment', condition: 'Furnished', use: 'Residential', floor: '3', unit: '7' },
    landlord: { name: OWNER.name },
    tenants: [{
      fullName: TENANT.name, dob: '14/05/2004', birthPlace: 'München (Germany)', nationality: 'German',
      address: 'Beispielstraße 1, 80331 München, Germany', cf: TENANT.cf, idDoc: 'Passport ' + TENANT.docNum,
      email: TENANT.email, phone: TENANT.phone, signature: TENANT.name,
    }],
    lease: { startDate: CASA.start, months: 12, endDate: CASA.end, type: 'Student Housing (Allegato C)' },
    money,
    extras: [], customClauses: [],
    consent: { at: '2025-08-20T16:42:00Z', ip: '203.0.113.24', text: PA_CONSENT_TEXT, hash: PA_CONSENT_HASH },
  };
  out.push({
    id: 'proposta', file: 'proposta-esempio', date: '2025-08-20',
    titolo: 'Proposta di locazione (Rental Proposal)',
    money,
    bytes: await buildPaPdf(pa),
  });

  // ── Scheda di calcolo del canone (Allegato 2/B) — a cancello ──
  const input = resolveCanoneInput({ contract, property: PROPERTY, listing: null, cfg: undefined });
  const calc = input.zona && input.mq > 0 ? CANONE.solve(input) : { ok: false };
  const facts = schedaFacts({ contract, property: PROPERTY, calc, input });
  out.push({
    id: 'scheda-canone', file: 'scheda-canone-esempio', date: '2025-08-25',
    titolo: 'Scheda di calcolo del canone concordato (Allegato 2/B)',
    gate: 'canone.verificato',
    calc,
    bytes: Buffer.from(await buildSchedaPdf(facts)),
  });

  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// 4 · LA RIGA CHE CONTA (pdfjs getTextContent, nel processo Node)
// ─────────────────────────────────────────────────────────────────────────

let _pdfjs = null;
async function pdfjs() {
  if (_pdfjs) return _pdfjs;
  const p = join(PDFJS_DIR, 'legacy/build/pdf.mjs');
  if (!existsSync(p)) throw new Error('pdfjs-dist non trovato in ' + PDFJS_DIR + ' (imposta PDFJS_DIR)');
  _pdfjs = await import(pathToFileURL(p).href);
  return _pdfjs;
}

// Le righe di ogni pagina: item sulla stessa linea di base uniti in ordine
// di x (spazio singolo fra item staccati), con il riquadro in punti PDF,
// origine in ALTO a sinistra.
async function textLines(bytes) {
  const lib = await pdfjs();
  const task = lib.getDocument({
    data: new Uint8Array(bytes), verbosity: 0, isEvalSupported: false, useSystemFonts: false,
    standardFontDataUrl: join(PDFJS_DIR, 'standard_fonts') + '/',
  });
  const doc = await task.promise;
  const lines = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = tc.items.filter((it) => it.str && it.str.trim() && it.fontName)
      .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, size: Math.hypot(it.transform[2], it.transform[3]) || it.height, rot: Math.abs(it.transform[1]) > 0.01 }))
      .filter((it) => !it.rot);
    const groups = [];
    for (const it of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
      const g = groups.find((gg) => Math.abs(gg.y - it.y) < 1.2);
      if (g) g.items.push(it); else groups.push({ y: it.y, items: [it] });
    }
    for (const g of groups) {
      g.items.sort((a, b) => a.x - b.x);
      let text = '', prevEnd = null;
      for (const it of g.items) {
        if (prevEnd != null) {
          const gap = it.x - prevEnd;
          if (gap > it.size * 0.15 && !/\s$/.test(text) && !/^\s/.test(it.str)) text += ' ';
        }
        text += it.str;
        prevEnd = it.x + it.w;
      }
      text = text.replace(/\s+/g, ' ').trim();
      const size = Math.max(...g.items.map((i) => i.size));
      const x0 = Math.min(...g.items.map((i) => i.x)), x1 = Math.max(...g.items.map((i) => i.x + i.w));
      lines.push({
        page: n, text, size, H: vp.height, W: vp.width,
        box: { x: x0, top: vp.height - g.y - size * 0.8, bottom: vp.height - g.y + size * 0.25, x1 },
      });
    }
  }
  await doc.destroy();
  return lines;
}


// Le misure dei font standard (le stesse AFM di jsPDF e pdf-lib): servono
// per il riquadro di un PEZZO di riga (una frase dentro una riga più lunga).
let _measure = null;
async function measurer() {
  if (_measure) return _measure;
  const d = await PDFDocument.create();
  const f = { helvetica: await d.embedFont(StandardFonts.Helvetica), times: await d.embedFont(StandardFonts.TimesRoman) };
  _measure = (font, text, size) => {
    try { return f[font || 'helvetica'].widthOfTextAtSize(text, size); } catch { return text.length * size * 0.5; }
  };
  return _measure;
}

const r1 = (n) => Math.round(n * 10) / 10;
function riquadroOf(sel) {
  const pad = 3;
  const x = Math.max(0, Math.min(...sel.map((l) => l.box.x)) - pad);
  const top = Math.max(0, Math.min(...sel.map((l) => l.box.top)) - pad);
  const x1 = Math.min(sel[0].W, Math.max(...sel.map((l) => l.box.x1)) + pad);
  const bottom = Math.min(sel[0].H, Math.max(...sel.map((l) => l.box.bottom)) + pad);
  return { page: sel[0].page, x: r1(x), y: r1(top), w: r1(x1 - x), h: r1(bottom - top) };
}

// «La riga che conta» di ogni documento: quella che risponde alla paura
// del proprietario. Si CERCA nel testo che il PDF stampa (mai scritta a
// mano): `match` deve trovare UNA riga sola, `n` righe consecutive si
// uniscono con uno spazio (la frase che va a capo), `sub` ritaglia la
// frase dentro righe più lunghe.
const RIGHE = {
  verbale: { match: /^Le letture sopra riportate fanno fede/, n: 1 },
  'inventario-ingresso': { match: /^n\. 1 Divano 3 posti danneggiato$/, n: 2 },
  'inventario-uscita': {
    match: /^- Camera: Armadio a due ante — condizione alla consegna non dichiarata$/, n: 1,
    alt: { match: /^- Cucina: Tavolo allungabile — alla consegna buono stato$/, n: 1 },
  },
  'contratto-studenti': {
    match: /^Il contratto è stipulato per la durata/, n: 1, font: 'times',
    sub: /Il contratto è stipulato per la durata di [^.]+\/\d{4}\./,
    alt: { match: /^ovvero a mezzo di bonifico bancario/, n: 2, font: 'times',
      sub: /in n\. \d+ rate eguali anticipate di € [\d.]+ \([\d.]+\/00\) ciascuna, entro il \d+ di ogni mese\./ },
  },
  // la modalità come la stampa il builder (dal 23/09 in italiano: «bonifico»)
  rendiconto: { match: /^Incassata rata 2026-07 \([^)]+\) il 03\/07\/2026/, n: 1 },
  'rendiconto-tre-case': {
    match: /^Via dell’Esempio 12, 00193 Roma$/, n: 1,
    alt: { match: /^ARRETRATO rata 2026-06/, n: 1 },
  },
  proposta: { match: /^Note: Agency fee:/, n: 2 },
  'scheda-canone': { match: /^Importo massimo canone mensile:/, n: 1 },
};

async function pickRiga(lines, spec, id) {
  const hits = lines.map((l, i) => (spec.match.test(l.text) ? i : -1)).filter((i) => i >= 0);
  if (hits.length !== 1) throw new Error(`${id}: la riga ${spec.match} compare ${hits.length} volte (ne serve una)`);
  const sel = lines.slice(hits[0], hits[0] + spec.n);
  if (sel.length !== spec.n || sel.some((l) => l.page !== sel[0].page)) throw new Error(`${id}: la riga va a capo fuori pagina`);
  const text = sel.map((l) => l.text).join(' ');
  if (!spec.sub) return { riga: text, riquadro: riquadroOf(sel) };
  const m = spec.sub.exec(text);
  if (!m) throw new Error(`${id}: la frase ${spec.sub} non c'è`);
  const measure = await measurer();
  const start = m.index, end = start + m[0].length;
  const parts = [];
  let off = 0;
  for (const l of sel) {
    const a = off, b = off + l.text.length;
    const s = Math.max(start, a), e = Math.min(end, b);
    if (s < e) {
      const full = measure(spec.font, l.text, l.size);
      const k = full > 0 ? (l.box.x1 - l.box.x) / full : 1;
      const x0 = l.box.x + measure(spec.font, l.text.slice(0, s - a), l.size) * k;
      const x1 = x0 + measure(spec.font, l.text.slice(s - a, e - a), l.size) * k;
      parts.push({ ...l, box: { ...l.box, x: x0, x1 } });
    }
    off = b + 1;
  }
  return { riga: m[0], riquadro: riquadroOf(parts) };
}

// ─────────────────────────────────────────────────────────────────────────
// 5 · LE MINIATURE (pdfjs in Chromium) e LA SCHERMATA DI /casa
// ─────────────────────────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.png': 'image/png',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const RENDER_HTML = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff"><canvas id="c"></canvas>
<script type="module">
import * as pdfjs from '/pdfjs/build/pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.mjs';
window.renderFirst = async (url, width) => {
  const doc = await pdfjs.getDocument({ url, standardFontDataUrl: '/pdfjs/standard_fonts/', cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, useSystemFonts: false, isEvalSupported: false }).promise;
  const page = await doc.getPage(1);
  const v1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: width / v1.width });
  const c = document.getElementById('c');
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const out = c.toDataURL('image/png');
  await doc.destroy();
  return out;
};
window.__ready = true;
</script>`;

function startServer() {
  const server = createServer(async (rq, rs) => {
    const p = decodeURIComponent(rq.url.split('?')[0]);
    if (p === '/__render.html') { rs.writeHead(200, { 'Content-Type': MIME['.html'] }); rs.end(RENDER_HTML); return; }
    let file;
    if (p.startsWith('/pdfjs/')) file = join(PDFJS_DIR, p.slice(7));
    else if (p.startsWith('/carte/')) file = join(OUT, p.slice(7));
    else file = join(ROOT, p.replace(/^\/+/, '') || 'index.html');
    if (!/\.[a-z0-9]+$/i.test(file) && existsSync(file + '.html')) file += '.html';
    try {
      const body = await readFile(file);
      rs.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
      rs.end(body);
    } catch { rs.writeHead(404).end('nope'); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function toWebp(png, width, height, maxBytes) {
  for (const q of [84, 78, 72, 66, 60, 54, 48, 42]) {
    const buf = await sharp(png).resize(width, height, { fit: 'fill', kernel: 'lanczos3' }).webp({ quality: q, effort: 6 }).toBuffer();
    if (buf.length <= maxBytes) return { buf, q };
  }
  throw new Error('miniatura oltre ' + maxBytes + ' byte anche a qualità minima');
}

// Firebase finto per /casa (il metodo di tests/safari/boot.mjs, con i dati
// della casa d'esempio per collezione). Gira PRIMA degli script di pagina.
function casaStub(D) {
  try { localStorage.setItem('boom:casa:lang', 'it'); } catch (e) {}
  const user = { uid: D.uid, email: D.email, getIdToken: () => Promise.resolve('tok-esempio') };
  const mkDoc = (id, data) => ({ id, exists: !!data, data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined) });
  const snap = (rows) => ({
    forEach: (f) => rows.forEach((r) => f(mkDoc(r.id, r.data))),
    size: rows.length, empty: rows.length === 0,
    docs: rows.map((r) => mkDoc(r.id, r.data)),
  });
  const coll = (name) => {
    const rows = D.cols[name] || [];
    const q = {
      where: () => q, orderBy: () => q, limit: () => q, startAfter: () => q,
      get: () => Promise.resolve(snap(rows)),
      onSnapshot: (...a) => { const f = a.find((x) => typeof x === 'function'); setTimeout(() => f(snap(rows)), 10); return () => {}; },
      add: () => Promise.resolve({ id: 'nuovo' }),
      doc: (id) => {
        const r = rows.find((x) => x.id === id);
        return {
          id, collection: coll,
          get: () => Promise.resolve(mkDoc(id, r ? r.data : null)),
          onSnapshot: (f) => { setTimeout(() => f(mkDoc(id, r ? r.data : null)), 10); return () => {}; },
          set: () => Promise.resolve(), update: () => Promise.resolve(), delete: () => Promise.resolve(),
        };
      },
    };
    return q;
  };
  const fs = () => ({
    collection: coll,
    doc: (path) => { const [c, id] = String(path).split('/'); return coll(c).doc(id); },
    enablePersistence: () => Promise.resolve(), settings: () => {},
    batch: () => ({ set() {}, update() {}, delete() {}, commit: () => Promise.resolve() }),
  });
  window.firebase = {
    apps: [], initializeApp: () => {},
    auth: Object.assign(() => ({
      onAuthStateChanged: (cb) => { setTimeout(() => cb(user), 10); return () => {}; },
      setPersistence: () => Promise.resolve(), signOut: () => Promise.resolve(), currentUser: user,
    }), { Auth: { Persistence: { LOCAL: 'l', SESSION: 's' } } }),
    firestore: Object.assign(fs, {
      FieldValue: { serverTimestamp: () => 'ts', increment: (n) => n, arrayUnion: (...a) => a, arrayRemove: (...a) => a, delete: () => null },
      Timestamp: { now: () => ({ toDate: () => new Date() }), fromDate: (d) => ({ toDate: () => d }) },
    }),
    storage: () => ({ ref: () => ({ put: () => Promise.resolve(), child: () => ({}) }) }),
  };
}

function casaData() {
  const uid = 'u_lukas_esempio';
  const pays = [];
  const months = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'];
  months.forEach((m) => pays.push({ id: `pay_contratto_esempio_${m}`, data: { tenantId: uid, contractId: 'contratto_esempio', propertyId: PROPERTY.id, type: 'rent', month: m, dueDate: m + '-05', amount: 1200, status: 'paid', paidVia: 'bank', paidDate: m + '-03' } }));
  pays.push({ id: 'pay_contratto_esempio_2026-08', data: { tenantId: uid, contractId: 'contratto_esempio', propertyId: PROPERTY.id, type: 'rent', month: '2026-08', dueDate: '2026-08-05', amount: 1200, status: 'pending' } });
  return {
    uid, email: TENANT.email,
    cols: {
      users: [{ id: uid, data: { role: 'tenant', name: TENANT.name, email: TENANT.email, propertyId: PROPERTY.id } }],
      contracts: [{ id: 'contratto_esempio', data: { tenantId: uid, tenantName: TENANT.name, propertyId: PROPERTY.id, status: 'active', type: 'studenti', startDate: CASA.start, endDate: CASA.end, rent: CASA.rent, deposit: 2400, signatureStatus: 'completed' } }],
      payments: pays,
      maintenance: [
        { id: 'm_caldaia', data: { userId: uid, tenantId: uid, tenantName: TENANT.name, propertyId: PROPERTY.id, propertyName: CASA.address, category: 'riscaldamento', priority: 'normal', description: 'Caldaia: acqua tiepida', status: 'pending', createdAt: '2026-08-03T18:20:00.000Z' } },
        { id: 'm_scarico', data: { userId: uid, tenantId: uid, tenantName: TENANT.name, propertyId: PROPERTY.id, propertyName: CASA.address, category: 'idraulica', priority: 'normal', description: 'Scarico del lavandino lento', status: 'resolved', createdAt: '2026-07-06T09:10:00.000Z', resolvedAt: '2026-07-09T15:00:00.000Z' } },
      ],
      properties: [{ id: PROPERTY.id, data: { address: CASA.address, name: PROPERTY.name } }],
      payout: [],
    },
  };
}

async function shootCasa(browser, base) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'it-IT', timezoneId: 'Europe/Rome',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1',
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Nessuna richiesta esce dalla macchina: gli SDK Firebase e l'analytics
  // diventano script vuoti (lo stub è già al suo posto), i font esterni no.
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => {
    const u = r.request().url();
    if (/gstatic\.com|googletagmanager\.com/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    return r.abort();
  });
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00+02:00'));   // la casa, un giorno d'agosto
  await page.addInitScript(casaStub, casaData());
  await page.goto(base + '/tenant.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#s-fix .mrow', { timeout: 15000 });
  // I font di ripiego (quelli di Google sono bloccati) si risolvono in modo
  // asincrono: si aspettano prima di toccare la pagina.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
  await page.evaluate((stamp) => {
    document.querySelectorAll('.rv').forEach((e) => { e.classList.add('in'); e.style.transition = 'none'; e.style.transitionDelay = '0ms'; });
    const card = document.getElementById('s-fix');
    document.documentElement.style.scrollBehavior = 'auto';
    // Barra in alto, navigazione rapida e dock del pagamento sono fissi o
    // «sticky»: in una schermata della sola card finirebbero sopra di lei.
    document.querySelectorAll('body *').forEach((el) => {
      if (card.contains(el) || el.contains(card)) return;
      const pos = getComputedStyle(el).position;
      if (pos === 'fixed' || pos === 'sticky') el.style.setProperty('visibility', 'hidden', 'important');
    });
    // scroll a un intero: la card sta a ~24px dal bordo alto della finestra
    window.scrollTo(0, Math.round(card.getBoundingClientRect().top + window.scrollY - 24));
    card.style.position = 'relative';
    const s = document.createElement('div');
    // Il timbro sta nel vuoto a destra del bottone «Invia»: non copre né il
    // titolo della sezione né le due segnalazioni.
    const [w1, w2] = stamp.split(' — ');
    s.innerHTML = '<b style="display:block;font-size:12px;letter-spacing:2.5px">' + w1 + '</b><span style="display:block;font-size:8.5px;letter-spacing:1px;margin-top:1px">' + (w2 || '') + '</span>';
    s.setAttribute('style', [
      'position:absolute', 'right:22px', 'z-index:5', 'padding:5px 9px 4px', 'text-align:center',
      'border:1.5px solid #ff5a4e', 'border-radius:4px', 'color:#ff5a4e', 'background:rgba(8,8,10,.86)',
      'font:600 10px/1.15 ui-monospace,Menlo,Consolas,monospace', 'text-transform:uppercase',
      'transform:rotate(-5deg)', 'pointer-events:none',
    ].join(';'));
    card.appendChild(s);
    const send = card.querySelector('#mSend');
    const cr0 = card.getBoundingClientRect(), br = send.getBoundingClientRect();
    s.style.top = Math.round(br.top - cr0.top + (br.height - s.getBoundingClientRect().height) / 2) + 'px';
  }, STAMP);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  // Ritaglio della finestra (la card ci sta intera): niente scroll fatto dal
  // browser al momento dello scatto, quindi niente mezzi pixel che cambiano
  // da un giro all'altro.
  // Le misure si prendono QUI, con la card sullo schermo (fuori schermo la
  // pagina può saltarne il contenuto, e innerText torna vuoto).
  const { clip, info } = await page.evaluate(async () => {
    const card = document.getElementById('s-fix');
    window.scrollTo(0, Math.round(card.getBoundingClientRect().top + window.scrollY - 24));
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    const r = card.getBoundingClientRect();
    const row = card.querySelector('.mrow');
    const span = row.querySelector('span');
    const rr = span.getBoundingClientRect();
    return {
      clip: { x: Math.floor(r.left), y: Math.floor(r.top), width: Math.ceil(r.right) - Math.floor(r.left), height: Math.ceil(r.bottom) - Math.floor(r.top) },
      info: {
        riga: span.textContent.replace(/\s+/g, ' ').trim(),
        rows: [...card.querySelectorAll('.mrow')].map((m) => [...m.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim()).join(' · ')),
        card: { w: Math.ceil(r.right) - Math.floor(r.left), h: Math.ceil(r.bottom) - Math.floor(r.top) },
        box: { x: rr.left - Math.floor(r.left), y: rr.top - Math.floor(r.top), w: rr.width, h: rr.height },
      },
    };
  });
  if (clip.y < 0 || clip.y + clip.height > 844) throw new Error('/casa: la card dei guasti non sta nella finestra ' + JSON.stringify(clip));
  const png = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
  await ctx.close();
  return { png, info, errors };
}

// ─────────────────────────────────────────────────────────────────────────
// 6 · LO ZIP, IL LEGGIMI, IL MANIFEST
// ─────────────────────────────────────────────────────────────────────────

const ZIP_NAMES = {
  proposta: '01_Proposta_di_locazione_ESEMPIO.pdf',
  'contratto-studenti': '02_Contratto_studenti_Allegato_C_ESEMPIO.pdf',
  verbale: '03_Verbale_di_consegna_ESEMPIO.pdf',
  'inventario-ingresso': '04_Inventario_ingresso_ESEMPIO.pdf',
  'inventario-uscita': '05_Inventario_uscita_con_confronto_ESEMPIO.pdf',
  rendiconto: '06_Rendiconto_mensile_ESEMPIO.pdf',
  'rendiconto-tre-case': '07_Rendiconto_tre_immobili_ESEMPIO.pdf',
  'scheda-canone': '08_Scheda_calcolo_canone_ESEMPIO.pdf',
};

function leggimi(entries, schedaIn) {
  const rows = {
    proposta: 'la proposta che l\'inquilino accetta e firma prima del contratto (in questo esempio paga il deposito alla firma). È in inglese perché l\'inquilino tipo arriva dall\'estero. Nelle condizioni economiche c\'è la provvigione di agenzia, 10% del canone annuo più IVA: la paga l\'inquilino.',
    'contratto-studenti': 'il contratto per studenti universitari sul modello del contratto tipo dell\'accordo territoriale di Roma depositato il 27/07/2023 (Allegato C), così come arriva alle parti per la firma elettronica dal telefono. Le firme grafiche, la pagina delle firme e il certificato di firma non sono in questo esempio.',
    verbale: 'il verbale di consegna delle chiavi: chiavi consegnate, letture dei contatori, stato della casa, firme.',
    'inventario-ingresso': 'l\'inventario d\'ingresso, stanza per stanza. Dove nessuno ha verificato lo stato di un oggetto c\'è scritto «non dichiarata», mai «buono stato».',
    'inventario-uscita': 'l\'inventario alla riconsegna con il confronto: cosa manca, cosa è rovinato rispetto all\'ingresso, e cosa non si può verificare perché all\'ingresso il suo stato non era scritto.',
    rendiconto: 'il rendiconto mensile di un immobile: canoni incassati con data e modalità, rate aperte, arretrati, manutenzioni.',
    'rendiconto-tre-case': 'lo stesso rendiconto per chi ha più immobili: una sezione per casa, in un solo documento.',
    'scheda-canone': 'la scheda di calcolo del canone concordato (Allegato 2/B dell\'accordo territoriale).',
  };
  const L = [];
  L.push('FASCICOLO D\'ESEMPIO — BOOM Roma');
  L.push('==================================');
  L.push('');
  L.push('Questi documenti sono ESEMPI con dati inventati. Anna Esempio (la proprietaria),');
  L.push('Lukas Beispiel (l\'inquilino) e Via dell\'Esempio 12, 00193 Roma non esistono:');
  L.push('nomi, indirizzi, codici fiscali, documenti, date e cifre sono di fantasia.');
  L.push('Ogni pagina porta il timbro «' + STAMP + '».');
  L.push('');
  L.push('Non sono impaginati a mano: li ha prodotti lo stesso codice che produce i');
  L.push('documenti veri di BOOM, a cui abbiamo dato questi dati inventati al posto di');
  L.push('quelli di un cliente.');
  L.push('');
  L.push('La storia d\'esempio: proposta accettata il 20/08/2025; contratto per studenti');
  L.push('dal 01/09/2025 al 31/08/2026, canone 1.200 euro al mese, deposito di due');
  L.push('mensilità, cedolare secca; chiavi consegnate il 01/09/2025; rendiconto di');
  L.push('luglio 2026; riconsegna il 31/08/2026.');
  L.push('');
  L.push('COSA C\'È DENTRO');
  L.push('');
  for (const e of entries) {
    if (!e.id) continue;
    L.push('- ' + e.name);
    L.push('  ' + rows[e.id]);
  }
  L.push('- LEGGIMI.txt');
  L.push('  questo file.');
  L.push('');
  L.push('COSA NON C\'È, E PERCHÉ');
  L.push('');
  L.push('- Il mandato di gestione: il modello aggiornato con i prezzi della pagina');
  L.push('  /owners non c\'è ancora. Entrerà qui quando esisterà.');
  L.push('- Il certificato di firma e il fascicolo fiscale: arrivano nella prossima');
  L.push('  versione di questo pacchetto.');
  if (!schedaIn) {
    L.push('- La scheda di calcolo del canone concordato: la tabella delle zone la sta');
    L.push('  ricontrollando l\'associazione. Finché non è confermata, la scheda');
    L.push('  d\'esempio resta fuori.');
  }
  L.push('');
  L.push('Egidi Immobiliare S.r.l. · P.IVA 17322991005 · via dei Coronari 181, Roma · boomrome.com');
  return L.join('\r\n') + '\r\n';
}

const ALT = {
  verbale: 'Prima pagina del verbale di consegna d’esempio: chiavi consegnate, letture dei contatori e stato della casa, con il timbro «ESEMPIO — dati inventati».',
  'inventario-ingresso': 'Prima pagina dell’inventario d’ingresso d’esempio: arredi stanza per stanza con la condizione dichiarata, timbro «ESEMPIO — dati inventati».',
  'inventario-uscita': 'Prima pagina dell’inventario alla riconsegna d’esempio: lo stato di ogni oggetto all’uscita, timbro «ESEMPIO — dati inventati».',
  'contratto-studenti': 'Prima pagina del contratto per studenti d’esempio (Allegato C dell’accordo territoriale di Roma), timbro «ESEMPIO — dati inventati».',
  rendiconto: 'Il rendiconto mensile d’esempio di un immobile: canone incassato con data e modalità, arretrati, manutenzioni, timbro «ESEMPIO — dati inventati».',
  'rendiconto-tre-case': 'Il rendiconto mensile d’esempio con tre immobili, una sezione per casa, timbro «ESEMPIO — dati inventati».',
  proposta: 'Prima pagina della proposta di locazione d’esempio, in inglese, con le parti e l’immobile, timbro «ESEMPIO — dati inventati».',
  'scheda-canone': 'La scheda di calcolo del canone concordato d’esempio (Allegato 2/B), timbro «ESEMPIO — dati inventati».',
  'casa-guasti': 'La sezione dei guasti dell’app dell’inquilino (/casa) con due segnalazioni d’esempio, una aperta e una risolta, timbro «ESEMPIO — dati inventati».',
};

async function cleanOut(keep) {
  for (const f of await readdir(OUT)) if (!keep.has(f)) await rm(join(OUT, f), { force: true });
}

// ─────────────────────────────────────────────────────────────────────────
// 7 · IL GIRO
// ─────────────────────────────────────────────────────────────────────────
async function main() {
  // Le date dei builder passano da toLocaleDateString senza fuso: a Los
  // Angeles «2025-09-01» diventerebbe il 31/08. Il fuso è quello di Roma,
  // così il fascicolo esce uguale su qualunque macchina.
  process.env.TZ = 'Europe/Rome';
  await mkdir(OUT, { recursive: true });
  const docs = await buildAll();
  const report = [];
  for (const d of docs) {
    d.stamped = await stampEsempio(d.bytes, { titolo: d.titolo, date: d.date, id: d.id });
    const v = await verifyStamp(d.stamped);
    if (!v.ok) throw new Error(`${d.id}: timbro incompleto ${JSON.stringify(v)}`);
    if (d.stamped.length > 250 * 1024) throw new Error(`${d.id}: ${d.stamped.length} byte, oltre 250 KB`);
    d.pages = v.pages;
    d.lines = await textLines(d.stamped);
    const spec = RIGHE[d.id];
    const main = await pickRiga(d.lines, spec, d.id);
    d.riga = main.riga; d.riquadro = main.riquadro;
    if (spec.alt) { const a = await pickRiga(d.lines, spec.alt, d.id); d.alt = { riga: a.riga, riquadro: a.riquadro }; }
    await writeFile(join(OUT, d.file + '.pdf'), d.stamped);
    if (DUMP) {
      console.log('\n=== ' + d.id + ' — ' + d.stamped.length + ' B, pagine ' + v.pages);
      if (d.completeness) console.log('  puntini:', (d.completeness.dots || []).map((x) => x.key).join(',') || 'nessuno');
      if (d.diff) console.log('  diff:', JSON.stringify(d.diff));
      if (d.calc) console.log('  calc:', JSON.stringify({ ok: d.calc.ok, sc: d.calc.sc, fascia: d.calc.fascia, cMax: d.calc.cMax, fits: d.calc.fits }));
      for (const l of d.lines) console.log(`  p${l.page} ${l.box.top.toFixed(0).padStart(4)} ${l.size.toFixed(1).padStart(5)} | ${l.text}`);
    }
    report.push(`${d.id.padEnd(20)} ${String(d.stamped.length).padStart(6)} B  ${v.pages}p  riga: ${d.riga}`);
  }

  // Miniature + schermata di /casa
  let casa = null;
  if (!NO_RASTER) {
    const { loadChromium, launchOptions } = await imp('tests/_browser.mjs');
    const chromium = await loadChromium();
    if (!chromium) throw new Error('playwright non trovato: le miniature servono Chromium (vedi tests/_browser.mjs)');
    const server = await startServer();
    const base = 'http://127.0.0.1:' + server.address().port;
    // Il loopback resta diretto (Playwright altrimenti lo forza nel proxy).
    process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK = '1';
    // Chromium senza traffico di fondo (aggiornamenti, metriche): nessuna
    // richiesta esce dalla macchina, nemmeno quelle del browser.
    const browser = await chromium.launch(launchOptions({ args: ['--no-sandbox', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-default-apps', '--no-first-run', '--metrics-recording-only', '--disable-domain-reliability', '--disable-client-side-phishing-detection', '--safebrowsing-disable-auto-update', '--no-pings', '--dns-prefetch-disable', '--disable-gpu', '--force-color-profile=srgb', '--disable-lcd-text', '--disable-partial-raster', '--disable-checker-imaging', '--num-raster-threads=1',
      // senza questi due il testo dei <select> di /casa cambia antialias da un
      // avvio all'altro (layout identico al millesimo: misurato) → miniatura
      // diversa a ogni giro. Con questi, 10 giri su 10 danno gli stessi byte.
      '--font-render-hinting=none', '--disable-font-subpixel-positioning', '--disable-features=NetworkTimeServiceQuerying,OptimizationHints,Translate,MediaRouter,DialMediaRouteProvider,AutofillServerCommunication,NetworkPrediction'],
      // ogni richiesta che non sia la nostra (127.0.0.1) va a una porta morta
      proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1,localhost' } }));
    try {
      const ctx = await browser.newContext({ viewport: { width: 1200, height: 1700 }, deviceScaleFactor: 1 });
      const pg = await ctx.newPage();
      const perr = [];
      pg.on('pageerror', (e) => perr.push(e.message));
      await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
      await pg.goto(base + '/__render.html');
      await pg.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
      for (const d of docs) {
        const dataUrl = await pg.evaluate(([u, w]) => window.renderFirst(u, w), ['/carte/' + d.file + '.pdf', 1120]);
        const png = Buffer.from(dataUrl.split(',')[1], 'base64');
        // l'altezza dalla pagina vera (595×842 → 560×792), non dal canvas
        // arrotondato: la miniatura resta proporzionale al riquadro in punti
        const W = 560, H = Math.round(560 * d.lines[0].H / d.lines[0].W);
        const { buf, q } = await toWebp(png, W, H, 60 * 1024);
        await writeFile(join(OUT, d.file + '.webp'), buf);
        d.thumb = { src: '/carte/' + d.file + '.webp', w: W, h: H, bytes: buf.length, q };
      }
      if (perr.length) throw new Error('pdfjs in Chromium: ' + perr[0]);
      await ctx.close();

      const shot = await shootCasa(browser, base);
      if (shot.errors.length) console.warn('  /casa: errori di pagina', shot.errors);
      const meta = await sharp(shot.png).metadata();
      const W = 560, H = Math.round(560 * meta.height / meta.width);
      const { buf, q } = await toWebp(shot.png, W, H, 80 * 1024);
      await writeFile(join(OUT, 'casa-guasti-esempio.webp'), buf);
      const k = W / shot.info.card.w;
      casa = {
        info: shot.info, errors: shot.errors,
        thumb: {
          src: '/carte/casa-guasti-esempio.webp', w: W, h: H, bytes: buf.length, q,
          riquadroPx: { x: Math.round(shot.info.box.x * k), y: Math.round(shot.info.box.y * k), w: Math.round(shot.info.box.w * k), h: Math.round(shot.info.box.h * k) },
        },
      };
    } finally {
      await browser.close();
      server.close();
    }
  }

  // Lo ZIP: i PDF della V1 in ordine di lettura, la scheda SOLO a cancello
  // aperto (js/owner-offer.js OFFER.canone.verificato === true).
  const OFFER = OFFER_MOD.OFFER || {};
  const canoneAperto = !!(OFFER.canone && OFFER.canone.verificato === true);
  const zipDate = new Date(2026, 8, 23, 12, 0, 0);
  const order = ['proposta', 'contratto-studenti', 'verbale', 'inventario-ingresso', 'inventario-uscita', 'rendiconto', 'rendiconto-tre-case', 'scheda-canone'];
  const entries = [];
  for (const id of order) {
    const d = docs.find((x) => x.id === id);
    if (d.gate === 'canone.verificato' && !canoneAperto) continue;
    entries.push({ id, name: ZIP_NAMES[id], data: d.stamped, date: zipDate });
  }
  const readme = leggimi(entries, entries.some((e) => e.id === 'scheda-canone'));
  entries.push({ name: 'LEGGIMI.txt', data: Buffer.from(readme, 'utf8'), date: zipDate });
  const zip = buildZip(entries.map(({ name, data, date }) => ({ name, data, date })));
  if (zip.length > 2.5 * 1024 * 1024) throw new Error('ZIP oltre 2,5 MB');
  await writeFile(join(OUT, 'fascicolo-esempio.zip'), zip);
  await writeFile(join(OUT, 'LEGGIMI.txt'), readme);

  // Il manifest (contratto §6)
  const items = docs.map((d) => ({
    id: d.id,
    titolo: d.titolo,
    pdf: '/carte/' + d.file + '.pdf',
    bytes: d.stamped.length,
    pages: d.pages,
    thumb: d.thumb ? { src: d.thumb.src, w: d.thumb.w, h: d.thumb.h, bytes: d.thumb.bytes } : null,
    alt: ALT[d.id],
    riga: d.riga,
    riquadro: d.riquadro,
    ...(d.alt ? { rigaAlternativa: d.alt } : {}),
    gate: d.gate || null,
  }));
  items.push({
    id: 'casa-guasti',
    titolo: 'L’app dell’inquilino (/casa): i guasti',
    pdf: null, bytes: null, pages: null,
    thumb: casa ? { src: casa.thumb.src, w: casa.thumb.w, h: casa.thumb.h, bytes: casa.thumb.bytes, riquadroPx: casa.thumb.riquadroPx } : null,
    alt: ALT['casa-guasti'],
    riga: casa ? casa.info.riga : null,
    riquadro: null,
    gate: null,
  });
  const manifest = {
    generatedBy: 'design/owners/genera-fascicolo.mjs',
    stamp: STAMP,
    items,
    zip: { file: '/carte/fascicolo-esempio.zip', bytes: zip.length, entries: entries.map((e) => e.name) },
  };
  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  const keep = new Set(['manifest.json', 'fascicolo-esempio.zip', 'LEGGIMI.txt', 'casa-guasti-esempio.webp']);
  for (const d of docs) { keep.add(d.file + '.pdf'); keep.add(d.file + '.webp'); }
  if (!NO_RASTER) await cleanOut(keep);

  console.log('carte/ — fascicolo d\'esempio');
  for (const r of report) console.log('  ' + r);
  for (const d of docs) if (d.thumb) console.log(`  ${d.id.padEnd(20)} miniatura ${d.thumb.w}x${d.thumb.h} ${d.thumb.bytes} B (q${d.thumb.q})`);
  if (casa) console.log(`  casa-guasti          miniatura ${casa.thumb.w}x${casa.thumb.h} ${casa.thumb.bytes} B (q${casa.thumb.q}) · riga: ${casa.info.riga} · righe: ${JSON.stringify(casa.info.rows)}`);
  console.log(`  ZIP ${zip.length} B: ${entries.map((e) => e.name).join(', ')}${canoneAperto ? '' : ' (scheda fuori: cancello canone chiuso)'}`);
}

export default { STAMP, verifyStamp };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
