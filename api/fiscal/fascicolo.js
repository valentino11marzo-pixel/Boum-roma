// api/fiscal/fascicolo.js
// IL FASCICOLO FISCALE — un PDF, tre pagine, generato dal contratto:
//   1. LA SCHEDA DI CALCOLO DEL CANONE — Allegato 2/B, 1:1 col modulo ARPE
//      (accordo Roma 25/07/2023 + DM 16/01/2017) compilata DAL CONTRATTO:
//      parti, via/zona/catasto, superficie convenzionale, i 20 parametri
//      derivati dalle feature REALI di immobile/annuncio, maggiorazioni
//      provate, il calcolo riga per riga e i due importi finali. La stessa
//      pagina esce anche da sola (contract.schedaCanoneUrl): e' quella che
//      si manda ad ARPE.
//   2. DATI PER LA REGISTRAZIONE RLI (quadri: contratto, parti, immobile,
//      regime) — tutto quello che si ricopia sul modello AdE.
//   3. SCADENZARIO del contratto (le deadline già a sistema + i termini di
//      legge).
// Il calcolo usa js/canone-engine.js (stesso motore di scheda-canone.html):
// parametri e maggiorazioni SOLO da dati reali — mai inventati; se il canone
// non rientra il documento lo dice, non lo nasconde. Config accordo
// (pArr/pDur/soglie) da settings/canoneAccordo quando esiste.
//
// buildFascicolo(...) è esportato: finalize lo chiama alla firma completa
// (best-effort) e il fascicolo entra nell'email CAF. L'endpoint POST è per
// la console: rigenerare con override (zonaCod, parametri, pertinenze…) che
// vengono PERSISTITI su contract.canoneScheda — la rigenerazione è stabile.
//
// Method:   POST  { contractId, zonaCod?, parIdx?[], mag?[], mqBal?, mqBox?,
//                   boxPre?, mqPC?, mqSc?, mqVe?, normale?, regData? }
// Headers:  Authorization: Bearer <firebase-id-token>  (admin)
// Response: { ok, url, schedaUrl, calc } | { ok:false, error }

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
// Il dizionario del contratto: i campi di parte risalgono la catena users come
// nel PDF — un CF presente solo sul profilo non esce «-» sulla pagina RLI.
import FIELDS from '../../js/contract-fields.js';
import { fsGet, fsList, fsPatch, readJson } from '../homie/_lib.js';
import { storageUpload } from '../agent/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import CANONE from '../../js/canone-engine.js';

const clip = (v, n = 120) => String(v == null ? '' : v).trim().slice(0, n);

// WinAnsi safety: pdf-lib StandardFonts muoiono su caratteri fuori CP1252
// (→, ✓, − matematico, ☒…). Tutto il testo passa da qui.
function wa(s) {
  return String(s == null ? '' : s)
    .replace(/[\u2192\u2794\u27A1]/g, '->')
    .replace(/[\u2713\u2714\u2611\u2612]/g, 'X')
    .replace(/\u2212/g, '-')
    .replace(/[^\x20-\xFF\u2013\u2014\u2018\u2019\u201C\u201D\u2026\u20AC]/g, '');
}
// Numeri all'italiana DETERMINISTICI: 1.250,00 — mai toLocaleString, che
// su un runtime con ICU ridotta degrada in silenzio a "1250,00" (la lezione
// gia' pagata su /executive). Su un foglio che va a un'organizzazione e
// all'Agenzia delle Entrate il punto delle migliaia non e' un dettaglio.
function itNum(v) {
  const n = Number(v || 0);
  const neg = n < 0;
  const [i, d] = Math.abs(n).toFixed(2).split('.');
  return (neg ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d;
}
const eur = n => 'EUR ' + itNum(n);
const fmtN = n => itNum(n);
const dIT = s => { try { const d = new Date(String(s).slice(0, 10) + 'T00:00'); return isNaN(d) ? '' : d.toLocaleDateString('it-IT'); } catch { return ''; } };

// ── Input dal contratto: solo dati reali, override persistiti ────────────
function collectFeatures(property, listing) {
  const out = [];
  const push = v => { if (v) out.push(String(v)); };
  [property, listing].forEach(src => {
    if (!src) return;
    (Array.isArray(src.features) ? src.features : []).forEach(push);
    (Array.isArray(src.amenities) ? src.amenities : []).forEach(push);
    if (src.elevator) push('ascensore');
    if (src.aircon || src.airConditioning) push('aria condizionata');
    if (src.balcony) push('balcone');
  });
  return out;
}

// Il tipo del contratto nella grammatica del motore: 'stud' (Allegato C),
// '32' (canone concordato 3+2, Allegato A) o 'trans' (Allegato B).
export function contractTipo(contract) {
  const t = String((contract && contract.type) || '').toLowerCase();
  if (t === 'studenti') return 'stud';
  if (t === '32' || /^3\s*\+\s*2$/.test(t) || t === 'concordato') return '32';
  return 'trans';
}
export function resolveCanoneInput({ contract, property, listing, cfg }) {
  const saved = contract.canoneScheda || {};
  const zonaCod = saved.zonaCod || property.canoneZonaCod || '';
  const zona = (zonaCod && CANONE.matchZone(zonaCod))
    || CANONE.matchZone(property.zone || '')
    || CANONE.matchZone((listing || {}).zone || '')
    || CANONE.matchZone(property.address || '')
    || null;
  return {
    zona,
    mq: Number(saved.mq || property.sqm || (listing || {}).sqm || (listing || {}).size) || 0,
    mqBal: Number(saved.mqBal) || 0,
    mqBox: Number(saved.mqBox) || 0,
    boxPre: !!saved.boxPre,
    mqPC: Number(saved.mqPC) || 0,
    mqSc: Number(saved.mqSc) || 0,
    mqVe: Number(saved.mqVe) || 0,
    normale: saved.normale !== false,
    parIdx: Array.isArray(saved.parIdx) && saved.parIdx.length ? saved.parIdx : undefined,
    mag: Array.isArray(saved.mag) && saved.mag.length ? saved.mag : undefined,
    features: collectFeatures(property, listing),
    furnished: !!(property.furnished || (listing || {}).furnished),
    energyClass: contract.energyClass || property.energyClass || (listing || {}).energyClass || '',
    floorText: String(property.floor || (listing || {}).floor || ''),
    tipo: contractTipo(contract),
    canone: Number(contract.rent) || 0,
    cfg,
  };
}

// ── LA SCHEDA DI CALCOLO DEL CANONE — Allegato 2/B, 1:1 col modulo ARPE ──
// Il foglio che le parti FIRMANO e che va ad ARPE per l'attestazione di
// rispondenza: reference/caf/2023_scheda_calcolo_canone_ARPE.docx (accordo
// Roma 25/07/2023 + DM 16/01/2017). Stesse sezioni, stesse etichette, stesso
// ordine, stesse caselle, stessa geometria delle tabelle (larghezze in twip
// del modulo / 20): chi lo riceve deve riconoscere il PROPRIO modulo, gia'
// compilato. Cio' che il sistema sa e' scritto; cio' che non sa resta la
// riga vuota del modulo, da completare a mano — mai una stima. Su questa
// pagina NON c'e' la testata BOOM: e' il modulo dell'associazione, non un
// documento nostro. L'unico refuso normalizzato: il pie' di pagina del
// modulo dice "SCHEDA NON VALIDI"; qui "VALIDA".
//
// schedaFacts() e' pura: TUTTO cio' che la pagina stampa passa di qui, cosi'
// si testa senza aprire il PDF. drawSchedaArpe() e' solo geometria.
const SUB_NAME = { A: 'inferiore', B: 'media', C: 'massima' };
// OGNI stringa fissa che la pagina stampa sta qui, ed e' esportata: il test
// la cerca nel .docx del modulo, parola per parola. Cambiare una etichetta
// senza che il modulo sia cambiato = il test cade.
export const SCHEDA_TEXT = {
  header: 'Allegato 2/B',
  title1: 'SCHEDA DI CALCOLO DEL CANONE DELL’ACCORDO TERRITORIALE',
  title2: 'DEL COMUNE DI ROMA DEL 25/07/2023 E DM 16 GENNAIO 2017',
  tipi: ['Contratto: 3+2', 'Studenti universitari', 'Transitorio'],
  parti: ['LOCATORE:', 'CONDUTTORE:'],
  riga: ['Città:', 'ROMA', 'Via', 'COD. ZONA', 'Id. catastale:'],
  dichiarazione: 'Tutte le informazioni necessarie per determinare il calcolo del canone sono state fornite dalle parti.',
  hSuperficie: 'CALCOLO DELLA SUPERFICIE CONVENZIONALE',
  calpestabile: 'Superficie calpestabile appartamento:',
  brackets: [
    '<46 (x 1,30 fino a 52.90 mq.)',
    '46-70(x 1,15 fino a 70.00 mq.)',
    '70-120',
    '>120 (possibilità di diminuzione fino a – 15%)',
  ],
  pertinenze: [
    ['boxPre', 'Autorimessa e/o posto auto esclusivo Zona Pregio', 'x 0,80', 0.80],
    ['box',    'Autorimessa e/o posto auto esclusivo',             'x 0,50', 0.50],
    ['pc',     'Posto auto in autorimessa comune',                 'x 0,20', 0.20],
    ['bal',    'Balconi, terrazze, cantine e simili',              'x 0,25', 0.25],
    ['sc',     'Superficie scoperta in godimento esclusivo',       'x 0,15', 0.15],
    ['ve',     'Sup. verde condominiale (Sup. tot. cond / MM.Tab A)', 'x 0,10', 0.10],
  ],
  totale: 'TOTALE SUPERFICIE CONVENZIONALE Mq.',
  caratteristiche: 'CARATTERISTICHE:',
  caratt: ['Allaccio rete idrica', 'Allaccio rete fognante', 'Erogazione GAS o induzione', 'Impianto riscaldamento'],
  normale: 'Appartamento normale', si: 'SI', no: 'NO',
  hParametri: 'PARAMETRI',
  nParametri: 'NUMERO PARAMETRI DESCRITTIVI DELL’ALLOGGIO',
  hMagg: 'Maggiorazioni/Riduzioni applicabili:',
  magg: [
    [['arr', 'A – Ammobiliato + ____%'], ['sem', 'B – Seminterrato -10%'], ['asc', 'C – Senza ascensore –10%']],
    [['att', 'D – Attico + 10%'], ['clA', 'E – Classe energetica A/B/C + 10%'], ['eco', 'F – Interventi Eco Bonus + 5%']],
    [['sis', 'G – Interventi Sisma Bonus + 10%'], ['clD', 'H – Classe energetica D/E/F + 5%'], null],
  ],
  zona: 'ZONA', fascia: 'FASCIA DI OSCILLAZIONE MIN/MAX',
  parN: 'PARAMETRI n.', subfascia: 'SUBFASCIA: (inferiore/media/massima)', valore: 'Valore applicato €',
  calcolo: 'CALCOLO DEL CANONE: €', mqMese: 'MQ/MESE', xmq: 'x mq.',
  durata: 'Durata +', transitorio: 'Transitorio + 10%', vincolato: 'Immobile Vincolato oppure Cat. A1-A8+____%',
  importoMax: 'Importo massimo canone mensile: €', importoPatt: 'Importo canone mensile pattuito: €',
  firme: ['Il locatore', 'Il conduttore'],
  // Il modulo dice "SCHEDA NON VALIDI": l'unico refuso normalizzato.
  footer: 'SCHEDA NON VALIDA AI FINI DELL’ATTESTAZIONE DI RISPONDENZA EX DM 16 GENNAIO 2017',
  footerOriginale: 'SCHEDA NON VALIDI AI FINI DELL’ATTESTAZIONE DI RISPONDENZA EX DM 16 GENNAIO 2017',
};
const TX = SCHEDA_TEXT;
const BRACKETS = TX.brackets;
const PERTINENZE = TX.pertinenze;
const MAG_ROWS = TX.magg;
const nameCf = (n, cf) => { const a = clip(n, 70), b = clip(cf, 20); return a ? (b ? `${a} — C.F. ${b}` : a) : ''; };
// Il modulo dice "Via ____": il tipo di strada e' gia' stampato.
const stripVia = (a) => clip(a, 60).replace(/^(via|viale|piazza|piazzale|largo|corso|vicolo|lungotevere|circonvallazione)\s+/i, '');

export function schedaFacts({ contract = {}, property = {}, calc, input = {} }) {
  const has = !!(calc && calc.ok);
  const cfg = Object.assign({}, CANONE.DEFAULT_CFG, input.cfg || {});
  const mq = Number(input.mq) || 0;
  const sup = mq > 0 ? CANONE.supConv(input) : null;
  const bracket = mq <= 0 ? -1 : mq < 46 ? 0 : mq <= 70 ? 1 : mq <= 120 ? 2 : 3;
  // Righe pertinenze: stessa aritmetica di supConv (che fa il totale).
  const boxPre = !!input.boxPre;
  const qty = { boxPre: boxPre ? Number(input.mqBox) || 0 : 0, box: boxPre ? 0 : Number(input.mqBox) || 0,
    pc: Number(input.mqPC) || 0, bal: Number(input.mqBal) || 0, sc: Number(input.mqSc) || 0, ve: Number(input.mqVe) || 0 };
  const pertinenze = PERTINENZE.map(([k, label, coef, c]) => ({ key: k, label, coef, mq: qty[k], v: qty[k] * c }));
  // Parametri e maggiorazioni: dal calcolo quando c'e', altrimenti override
  // salvati o derivati dalle dotazioni REALI (mai inventati) — la scheda
  // senza zona resta un foglio di lavoro onesto.
  const parIdx = has ? calc.parIdx
    : (Array.isArray(input.parIdx) && input.parIdx.length ? input.parIdx.slice() : CANONE.deriveParametri(input.features || []).parIdx);
  const mag = has ? calc.mag
    : (Array.isArray(input.mag) && input.mag.length ? input.mag.slice() : CANONE.deriveMaggiorazioni(input, cfg).mag);
  const cat = FIELDS.parseCadastral(property.cadastralData || contract.cadastral || '');
  const zona = has ? calc.zona : (input.zona || null);
  const base = has ? calc.fMax * calc.sc : null;
  const tipo = input.tipo === '32' ? '32' : input.tipo === 'stud' ? 'stud' : 'trans';
  const transPct = tipo === 'trans' ? 10 : 0;
  const pDur = tipo === '32' && Number(cfg.pDur) > 0 ? Number(cfg.pDur) : 0;
  const pattuito = Number(input.canone || contract.rent) || 0;
  return {
    has, tipo,
    locatore: nameCf(contract.landlordName, contract.landlordCF),
    conduttore: nameCf(contract.tenantName, contract.tenantCF),
    citta: clip(property.city || 'Roma', 30).toUpperCase(),
    via: stripVia(property.address),
    zonaCod: zona ? zona.cod : clip((contract.canoneScheda || {}).zonaCod || property.canoneZonaCod, 8),
    cat: { f: clip(property.foglio || cat.foglio, 8), p: clip(property.particella || cat.particella, 8), s: clip(property.sub || cat.sub, 6) },
    mq, bracket, base0: sup ? sup.parts[0].v : null, pertinenze, scTotal: sup ? sup.total : null,
    normale: input.normale !== false,
    parIdx, nP: parIdx.length, mag, magAny: mag.length > 0, pArr: Number(cfg.pArr) || 0,
    zona: zona ? { cod: zona.cod, nome: zona.nome, min: zona.aMin, max: zona.cMax } : null,
    sub: has ? { fascia: calc.fascia, name: SUB_NAME[calc.fascia] || calc.fascia, min: calc.fMin, max: calc.fMax, val: calc.fMax } : null,
    sc: has ? calc.sc : (sup ? sup.total : 0),
    base, pDur, durataVal: base != null && pDur ? base * (1 + pDur / 100) : null,
    transPct, transVal: base != null && transPct ? base * (1 + transPct / 100) : null,
    cMax: has ? calc.cMax : null, capApplied: !!(has && calc.capApplied),
    pattuito, fits: has && pattuito > 0 ? calc.fits !== false : null,
    excess: has && calc.fits === false ? calc.excess : 0,
  };
}

export function drawSchedaArpe(pdf, { font, bold }, f) {
  const W = 595, H = 842, ML = 36, MR = W - ML;      // margini del modulo: 720 twip
  const page = pdf.addPage([W, H]);
  const ink = rgb(0.06, 0.06, 0.07), grey = rgb(0.4, 0.4, 0.42), tint = rgb(0.9, 0.9, 0.9);
  const wd = (t, sz, fnt) => (fnt || font).widthOfTextAtSize(wa(t), sz);
  const T = (t, x, yy, sz, fnt, col) => page.drawText(wa(t), { x, y: yy, size: sz, font: fnt || font, color: col || ink });
  // Testo che DEVE stare nella cella: si stringe il corpo, mai il testo.
  const TF = (t, x, yy, sz, maxW, fnt, col) => { let s = sz; while (s > 5 && wd(t, s, fnt) > maxW) s -= 0.25; T(t, x, yy, s, fnt, col); };
  const TC = (t, cx, yy, sz, fnt, col) => T(t, cx - wd(t, sz, fnt) / 2, yy, sz, fnt, col);
  const TR = (t, rx, yy, sz, fnt, col) => T(t, rx - wd(t, sz, fnt), yy, sz, fnt, col);
  const hline = (x1, x2, yy) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 0.5, color: ink });
  const vline = (x, y1, y2) => page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: 0.5, color: ink });
  const cell = (x, top, w, h, fill) => page.drawRectangle({ x, y: top - h, width: w, height: h, borderColor: ink, borderWidth: 0.5, ...(fill ? { color: fill } : {}) });
  // Una riga di celle col bordo (la griglia del modulo). Ritorna le x.
  const grid = (x, top, widths, h) => {
    const xs = [x]; widths.forEach(w => xs.push(xs[xs.length - 1] + w));
    hline(x, xs[xs.length - 1], top); hline(x, xs[xs.length - 1], top - h);
    xs.forEach(v => vline(v, top, top - h));
    return xs;
  };
  // La casella e' la cella stretta del modulo: la X ci sta dentro.
  const X = (x, w, top, h, on) => { if (on) TC('X', x + w / 2, top - h + h * 0.28, Math.min(h * 0.7, 8), bold); };
  const blank = (n) => '_'.repeat(n);
  const val = (v, n) => (v !== undefined && v !== null && String(v).trim() !== '') ? String(v) : blank(n);
  const N = (v) => fmtN(v);

  // ── Intestazione + titolo ──
  TR(TX.header, MR, H - 35, 9);
  let y = H - 64;
  TC(TX.title1, W / 2, y, 10.5, bold); y -= 13;
  TC(TX.title2, W / 2, y, 10.5, bold); y -= 22;

  // ── Contratto: 3+2 / Studenti universitari / Transitorio (tabella centrata) ──
  {
    const widths = [14, 86, 12.5, 99, 14, 64], h = 14;
    const tw = widths.reduce((a, b) => a + b, 0);
    const xs = grid((W - tw) / 2, y + 10, widths, h);
    X(xs[0], widths[0], y + 10, h, f.tipo === '32'); T(TX.tipi[0], xs[1] + 3, y, 8);
    X(xs[2], widths[2], y + 10, h, f.tipo === 'stud'); T(TX.tipi[1], xs[3] + 3, y, 8);
    X(xs[4], widths[4], y + 10, h, f.tipo === 'trans'); T(TX.tipi[2], xs[5] + 3, y, 8);
    y -= 24;
  }

  // ── LOCATORE / CONDUTTORE (tabella senza bordi: etichetta 1418 twip) ──
  T(TX.parti[0], ML + 2, y, 8.5, bold); TF(val(f.locatore, 56), ML + 73, y, 8.5, MR - ML - 75); y -= 14;
  T(TX.parti[1], ML + 2, y, 8.5, bold); TF(val(f.conduttore, 56), ML + 73, y, 8.5, MR - ML - 75); y -= 18;

  // ── Città · Via · COD. ZONA · Id. catastale (larghezze del modulo) ──
  {
    const x = [0, 35, 106, 156, 261, 318, 368, 425].map(v => ML + v + 2);
    T(TX.riga[0], x[0], y, 7); T(f.citta, x[1], y, 7, bold);
    T(TX.riga[2], x[2], y, 7); TF(val(f.via, 24), x[3], y, 7, 100);
    T(TX.riga[3], x[4], y, 7); T(val(f.zonaCod, 6), x[5], y, 7, bold);
    T(TX.riga[4], x[6], y, 7);
    T(`F ${val(f.cat.f, 4)}   P ${val(f.cat.p, 4)}   S ${val(f.cat.s, 3)}`, x[7], y, 7);
    y -= 20;
  }
  TC(TX.dichiarazione, W / 2, y, 9); y -= 20;

  // ── CALCOLO DELLA SUPERFICIE CONVENZIONALE ──
  T(TX.hSuperficie, ML, y, 10, bold); y -= 6;
  {
    const widths = [222, 49, 188, 64];                  // 4536 · 993 · 3845 · 1362 twip, in scala
    let top = y;
    let xs = grid(ML, top, widths, 44);
    T(TX.calpestabile, xs[0] + 3, top - 10, 7.5);
    for (let i = 0; i < 4; i++) {
      const ly = top - 10 - i * 10, on = i === f.bracket;
      T('= mq ' + (on ? N(f.mq) : ''), xs[1] + 3, ly, 7.5, on ? bold : font);
      TF(BRACKETS[i], xs[2] + 3, ly, 7, widths[2] - 5);
      T('= mq ' + (on && f.base0 != null ? N(f.base0) : ''), xs[3] + 3, ly, 7.5, on ? bold : font);
    }
    top -= 44;
    f.pertinenze.forEach(r => {
      xs = grid(ML, top, widths, 13);
      TF(r.label, xs[0] + 3, top - 9.5, 7.5, widths[0] - 5);
      T('= mq ' + (r.mq > 0 ? N(r.mq) : ''), xs[1] + 3, top - 9.5, 7.5);
      T(r.coef, xs[2] + 3, top - 9.5, 7.5);
      T('= mq ' + (r.mq > 0 ? N(r.v) : ''), xs[3] + 3, top - 9.5, 7.5, r.mq > 0 ? bold : font);
      top -= 13;
    });
    y = top - 15;
  }
  TR(`${TX.totale} ${f.scTotal != null ? N(f.scTotal) : blank(12)}`, MR - 12, y, 9.5, bold); y -= 20;

  // ── CARATTERISTICHE (le quattro caselle) + Appartamento normale SI/NO ──
  {
    const on = f.normale;
    let x = ML + 2;
    T(TX.caratteristiche, x, y, 7.5, bold); x += 90;
    [[TX.caratt[0], 78], [TX.caratt[1], 92], [TX.caratt[2], 113], [TX.caratt[3], 99]].forEach(([lab, w]) => {
      T(lab, x, y, 7); cell(x + w, y + 8.5, 11, 11); X(x + w, 11, y + 8.5, 11, on); x += w + 20;
    });
    y -= 16;
    T(TX.normale, ML + 2, y, 8, bold);
    // La tabellina flottante del modulo, a 2777 twip dal bordo pagina.
    const bx = 139;
    cell(bx, y + 8.5, 15.5, 11); X(bx, 15.5, y + 8.5, 11, on); T(TX.si, bx + 19, y, 8);
    cell(bx + 50.5, y + 8.5, 14, 11); X(bx + 50.5, 14, y + 8.5, 11, !on); T(TX.no, bx + 68, y, 8);
    y -= 20;
  }

  // ── PARAMETRI (1-10 a sinistra, 11-20 a destra) ──
  T(TX.hParametri, ML, y, 10, bold); y -= 6;
  {
    const widths = [21, 14, 204, 21, 14, 249], h = 12.5;   // 425 · 284 · 4186 · 425 · 283 · 5103 twip, in scala
    let top = y;
    for (let i = 0; i < 10; i++) {
      const xs = grid(ML, top, widths, h);
      TC(String(i + 1), xs[0] + widths[0] / 2, top - 9, 7.5);
      X(xs[1], widths[1], top, h, f.parIdx.includes(i));
      TF(CANONE.PARAMETRI[i], xs[2] + 3, top - 9, 7, widths[2] - 5);
      TC(String(i + 11), xs[3] + widths[3] / 2, top - 9, 7.5);
      X(xs[4], widths[4], top, h, f.parIdx.includes(i + 10));
      TF(CANONE.PARAMETRI[i + 10], xs[5] + 3, top - 9, 7, widths[5] - 5);
      top -= h;
    }
    y = top - 14;
  }
  T(`${TX.nParametri}   ${f.nP}`, ML + 2, y, 8); y -= 17;

  // ── Maggiorazioni/Riduzioni applicabili: SI/NO + la griglia A-H ──
  T(TX.hMagg, ML + 2, y, 8, bold);
  {
    const bx = 187;                                        // 3745 twip dal bordo pagina
    cell(bx, y + 8.5, 21, 11, f.magAny ? tint : null); TC(TX.si, bx + 10.5, y, 7.5, f.magAny ? bold : font);
    cell(bx + 21, y + 8.5, 24, 11, f.magAny ? null : tint); TC(TX.no, bx + 33, y, 7.5, f.magAny ? font : bold);
    y -= 17;
    const widths = [135, 35, 142, 43, 135, 33], h = 13;    // 2694 · 708 · 2835 · 851 · 2693 · 779 twip
    let top = y + 10;
    MAG_ROWS.forEach(row => {
      let x = ML;
      row.forEach((m, i) => {
        const lw = widths[i * 2], bw = widths[i * 2 + 1];
        if (m) {
          TF(f.pArr > 0 ? m[1].replace('____', String(f.pArr)) : m[1], x + 2, top - 9.5, 7.5, lw - 4);
          cell(x + lw, top, bw, h); X(x + lw, bw, top, h, f.mag.includes(m[0]));
        }
        x += lw + bw;
      });
      top -= h;
    });
    y = top - 12;
  }

  // ── Il calcolo, riga per riga come sul modulo (corpo 8, interlinea 1,5) ──
  const L = 14;
  T(`${TX.zona} ${f.zona ? f.zona.cod + '  ' + f.zona.nome : blank(9)}`, ML + 2, y, 8);
  T(`${TX.fascia}   ${f.zona ? N(f.zona.min) + ' / ' + N(f.zona.max) : '/'}`, ML + 250, y, 8); y -= L;
  T(`${TX.parN} ${f.nP}`, ML + 2, y, 8);
  T(`${TX.subfascia}   ${f.sub ? f.sub.name.toUpperCase() + '   ' + N(f.sub.min) + ' / ' + N(f.sub.max) : '/'}`, ML + 110, y, 8);
  T(`${TX.valore} ${f.sub ? N(f.sub.val) : ''}`, ML + 400, y, 8); y -= L;
  T(`${TX.calcolo} ${f.sub ? N(f.sub.val) : blank(6)} ${TX.mqMese}  ${TX.xmq} ${f.has ? N(f.sc) : blank(6)} = € ${f.base != null ? N(f.base) : blank(10)}`, ML + 2, y, 8); y -= L;
  T(`${TX.durata} ${f.pDur ? f.pDur : '____'}% = € ${f.durataVal != null ? N(f.durataVal) : blank(12)}`, ML + 2, y, 8); y -= L;
  T(`${TX.transitorio}${f.transVal != null ? '  = € ' + N(f.transVal) : ''}`, ML + 2, y, 8); y -= L;
  T(TX.vincolato, ML + 2, y, 8); y -= L + 2;
  {
    const a = `${TX.importoMax} ${f.cMax != null ? N(f.cMax) : '_'}; `;
    T(a, ML + 2, y, 8);
    T(`${TX.importoPatt} ${f.pattuito > 0 ? N(f.pattuito) : '____'};`, ML + 2 + wd(a, 8), y, 8, bold);
    y -= 12;
    // Due righe che il modulo non ha ma che il calcolo impone di dire: il
    // tetto dell'accordo (gli aumenti non superano il massimo di fascia) e
    // il canone pattuito sopra il massimo — mai nascosto.
    if (f.capApplied) { T('Le maggiorazioni non portano il canone oltre il massimo della fascia di oscillazione (regola dell’accordo).', ML + 2, y, 6.5, font, grey); y -= 10; }
    if (f.fits === false) { T(`Il canone pattuito supera l’importo massimo di € ${N(f.excess)}: l’attestazione di rispondenza va verificata con l’organizzazione.`, ML + 2, y, 6.5, font, grey); y -= 10; }
  }

  // ── Firme ──
  y -= 22;
  T(TX.firme[0], ML + 30, y, 9); T(TX.firme[1], ML + 370, y, 9); y -= 26;
  hline(ML + 10, ML + 175, y); hline(ML + 350, ML + 515, y);

  // ── Pie' di pagina del modulo ──
  TC(TX.footer, W / 2, 48, 8, bold);
  return page;
}

export async function buildSchedaPdf(facts) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  drawSchedaArpe(pdf, { font, bold }, facts);
  return await pdf.save();
}

// ── Il PDF ───────────────────────────────────────────────────────────────
async function buildPdf({ contract, property, calc, input, deadlines, facts }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.08, 0.09), grey = rgb(0.42, 0.42, 0.45), gold = rgb(0.72, 0.55, 0.05);
  const W = 595, H = 842, M = 44;

  let page, y;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - 46; };
  const T = (t, x, yy, sz, f, col) => page.drawText(wa(t), { x, y: yy, size: sz, font: f || font, color: col || ink });
  const line = (yy, x1 = M, x2 = W - M, th = 0.6, col) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: th, color: col || rgb(0.75, 0.73, 0.68) });
  const need = (h) => { if (y - h < 46) newPage(); };
  const head = (title, sub) => {
    page.drawRectangle({ x: 0, y: H - 40, width: W, height: 40, color: rgb(0.04, 0.04, 0.05) });
    T('BOOM', M, H - 27, 15, bold, rgb(1, 1, 1));
    T('ROMA', M + 48, H - 26, 8, font, rgb(0.91, 0.78, 0.41));
    T('Fascicolo Fiscale', W - M - 150, H - 22, 8, font, rgb(0.8, 0.8, 0.8));
    T(dIT(new Date().toISOString()), W - M - 150, H - 33, 8, font, rgb(0.6, 0.6, 0.6));
    y = H - 66;
    T(title, M, y, 12.5, bold, gold); y -= 6; line(y, M, W - M, 1, gold); y -= 16;
    if (sub) { T(sub, M, y, 8.5, font, grey); y -= 16; }
  };
  const row = (k, v, kw = 150) => {
    need(16);
    T(k, M, y, 8, bold, grey);
    T(v, M + kw, y, 9.5, font, ink);
    y -= 15;
  };

  // ═══ PAGINA 1 — LA SCHEDA DI CALCOLO DEL CANONE (Allegato 2/B ARPE, 1:1) ═══
  drawSchedaArpe(pdf, { font, bold }, facts);

  // ═══ PAGINA 2 — DATI REGISTRAZIONE RLI ═══
  newPage();
  head('DATI PER LA REGISTRAZIONE (Mod. RLI)', 'Da ricopiare sul modello RLI (web/desktop) - non sostituisce il modello ufficiale');
  const months = (contract.startDate && contract.endDate)
    ? Math.max(1, Math.round((new Date(contract.endDate) - new Date(contract.startDate)) / (1000 * 60 * 60 * 24 * 30))) : null;
  const annuo = Number(contract.rent || 0) * 12;
  row('Tipologia contratto', contract.type === 'studenti' ? 'L2 - Studenti universitari (art. 5 c.2-3 L.431/98)' : 'Transitorio (art. 5 c.1 L.431/98)');
  row('Durata', `${dIT(contract.startDate)} -> ${dIT(contract.endDate)}${months ? `  (${months} mesi)` : ''}`);
  row('Canone', `${eur(contract.rent)} /mese  -  ${eur(annuo)} /anno${contract.installmentMonths > 1 ? `  -  rata ogni ${contract.installmentMonths} mesi da ${eur(contract.installmentAmount)}` : ''}`);
  row('Cedolare secca', (contract.cedolareSecca || 'si') !== 'no' ? 'SI (10% concordato con attestazione)' : 'NO - regime ordinario (registro 2% min EUR 67 + bollo)');
  row('Deposito', eur(contract.deposit));
  y -= 6;
  need(16); T('LOCATORE', M, y, 9, bold, gold); y -= 14;
  row('Nome / CF', `${contract.landlordName || '-'}  -  ${contract.landlordCF || '-'}`);
  row('Nascita / residenza', `${contract.landlordDob ? dIT(contract.landlordDob) : '-'} ${contract.landlordPob ? 'a ' + contract.landlordPob : ''}  -  ${contract.landlordAddress || '-'}`);
  y -= 6;
  need(16); T('CONDUTTORE', M, y, 9, bold, gold); y -= 14;
  row('Nome / CF', `${contract.tenantName || '-'}  -  ${contract.tenantCF || '-'}`);
  row('Nascita / residenza', `${contract.tenantDob ? dIT(contract.tenantDob) : '-'} ${contract.tenantPob ? 'a ' + contract.tenantPob : ''}  -  ${contract.tenantAddress || '-'}`);
  row('Documento', `${contract.tenantDocType || '-'} n. ${contract.tenantDocNum || '-'}${contract.tenantDocIssuer ? ' rilasciato da ' + contract.tenantDocIssuer : ''}${contract.tenantDocIssueDate ? ' il ' + dIT(contract.tenantDocIssueDate) : ''}`);
  row('Nazionalita\'', contract.tenantNationality || '-');
  y -= 6;
  need(16); T('IMMOBILE', M, y, 9, bold, gold); y -= 14;
  row('Indirizzo', `ROMA - ${property.address || '-'}`);
  row('Catasto', `${property.cadastralData || contract.cadastral || '-'}${contract.renditaCatastale ? '  -  rendita ' + eur(contract.renditaCatastale) : ''}`);
  row('Classe energetica', contract.energyClass || property.energyClass || '-');
  y -= 10;
  need(14); T('Nota: registrazione entro 30 giorni dalla stipula. Con cedolare secca: niente registro ne\' bollo.', M, y, 8, font, grey);

  // ═══ PAGINA 3 — SCADENZARIO ═══
  newPage();
  head('SCADENZARIO DEL CONTRATTO', 'Le scadenze gia\' a sistema per questo contratto (portal -> Scadenze)');
  const rows = (deadlines || [])
    .filter(d => d && d.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 26);
  if (!rows.length) { T('Nessuna scadenza registrata (vengono create automaticamente alla firma completa).', M, y, 9, font, grey); }
  rows.forEach(d => {
    need(15);
    const overdue = String(d.date) < new Date().toISOString().slice(0, 10) && d.status !== 'done';
    T(dIT(d.date), M, y, 8.5, bold, overdue ? rgb(0.7, 0.2, 0.15) : ink);
    T(String(d.title || '').slice(0, 86), M + 70, y, 8.5);
    T(`${d.owner || 'admin'}${d.priority ? ' - ' + d.priority : ''}${d.status === 'done' ? ' - FATTA' : overdue ? ' - SCADUTA' : ''}`, M + 440, y, 7.5, font, grey);
    y -= 13.5;
  });
  y -= 10; need(14);
  T('Generato automaticamente da BOOM - boomrome.com - non costituisce consulenza fiscale.', M, y, 7.5, font, grey);
  y -= 11; need(12);
  T('BOOM® è un marchio dell\'Unione europea registrato (MUE 019317594) di Egidi Immobiliare S.r.l.', M, y, 7, font, grey);
  y -= 10; need(11);
  T('Egidi Immobiliare S.r.l. - Via dei Coronari 181/184, 00186 Roma - Sede legale: Viale Liegi 42, 00198 Roma - P.IVA 17322991005', M, y, 7, font, grey);

  return await pdf.save();
}

// ── Build + persist ──────────────────────────────────────────────────────
export async function buildFascicolo(contractId, { contract, property, overrides } = {}) {
  try {
    let c = contract || await fsGet('contracts/' + contractId);
    if (!c) return { ok: false, error: 'contract_not_found' };
    const p = property || (c.propertyId ? await fsGet('properties/' + c.propertyId).catch(() => null) : null) || {};
    if (!contract) {
      // Rigenerazione dalla console: stessa idratazione del finalize.
      try {
        const tU = c.tenantId ? await fsGet('users/' + c.tenantId).catch(() => null) : null;
        const lU = p.ownerId ? await fsGet('users/' + p.ownerId).catch(() => null) : null;
        const lR = p.ownerId ? await fsGet('landlords/' + p.ownerId).catch(() => null) : null;
        c = FIELDS.hydrateParties(c, tU, { ...(lR || {}), ...(lU || {}) }, p);
      } catch (_) {}
    }
    let listing = null;
    if (c.propertyId) {
      try { listing = (await fsList('listings', { filter: { field: 'propertyId', op: 'EQUAL', value: c.propertyId }, limit: 1 }))[0] || null; } catch (_) {}
    }
    let cfg = null;
    try { cfg = await fsGet('settings/canoneAccordo'); } catch (_) {}

    // override persistiti: la prossima rigenerazione parte da qui
    if (overrides && Object.keys(overrides).length) {
      const saved = { ...(c.canoneScheda || {}) };
      ['zonaCod', 'parIdx', 'mag', 'mq', 'mqBal', 'mqBox', 'boxPre', 'mqPC', 'mqSc', 'mqVe', 'normale'].forEach(k => {
        if (overrides[k] !== undefined) saved[k] = overrides[k];
      });
      c.canoneScheda = saved;
    }

    const input = resolveCanoneInput({ contract: c, property: p, listing, cfg: cfg || undefined });
    let calc = null;
    if (input.zona && input.mq > 0) calc = CANONE.solve(input);
    else calc = { ok: false, error: !input.zona ? 'zona_non_trovata' : 'mq_mancanti' };

    let deadlines = [];
    try { deadlines = await fsList('deadlines', { filter: { field: 'linkedContractId', op: 'EQUAL', value: contractId }, limit: 40 }); } catch (_) {}

    // La scheda ARPE nasce DUE volte dagli stessi fatti: pagina 1 del
    // fascicolo (uso interno: RLI + scadenze dietro) e PDF a se' stante —
    // quello che si manda ad ARPE, senza pagine che non le competono.
    const facts = schedaFacts({ contract: c, property: p, calc, input });
    const bytes = await buildPdf({ contract: c, property: p, calc, input, deadlines, facts });
    const url = await storageUpload(`contracts/${contractId}/fascicolo-fiscale.pdf`, Buffer.from(bytes), 'application/pdf');
    if (!url) return { ok: false, error: 'storage_failed' };
    let schedaUrl = '';
    try {
      const sb = await buildSchedaPdf(facts);
      schedaUrl = (await storageUpload(`contracts/${contractId}/scheda-canone-arpe.pdf`, Buffer.from(sb), 'application/pdf')) || '';
    } catch (e) { console.warn('[fiscal/fascicolo] scheda:', e.message); }

    const snapshot = calc && calc.ok ? {
      ...(c.canoneScheda || {}),
      zonaCod: calc.zona.cod, zonaNome: calc.zona.nome,
      parIdx: calc.parIdx, mag: calc.mag, mq: input.mq,
      sc: Math.round(calc.sc * 100) / 100, fascia: calc.fascia,
      cMax: Math.round(calc.cMax * 100) / 100, fits: calc.fits,
      computedAt: new Date().toISOString(),
    } : { ...(c.canoneScheda || {}), error: calc && calc.error, computedAt: new Date().toISOString() };

    await fsPatch('contracts/' + contractId, {
      fascicoloFiscaleUrl: url, canoneScheda: snapshot,
      ...(schedaUrl ? { schedaCanoneUrl: schedaUrl, schedaCanoneAt: snapshot.computedAt } : {}),
    }).catch(() => {});
    return { ok: true, url, schedaUrl, calc: snapshot };
  } catch (e) {
    console.error('[fiscal/fascicolo]', e.message);
    return { ok: false, error: 'build_failed' };
  }
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  const b = await readJson(req).catch(() => ({}));
  const contractId = clip(b && b.contractId, 80);
  if (!contractId) return res.status(400).json({ ok: false, error: 'contractId_required' });

  const overrides = {};
  ['zonaCod', 'mq', 'mqBal', 'mqBox', 'mqPC', 'mqSc', 'mqVe'].forEach(k => { if (b[k] !== undefined && b[k] !== '') overrides[k] = k === 'zonaCod' ? clip(b[k], 8).toUpperCase() : Number(b[k]) || 0; });
  if (Array.isArray(b.parIdx)) overrides.parIdx = b.parIdx.map(Number).filter(i => i >= 0 && i < 20);
  if (Array.isArray(b.mag)) overrides.mag = b.mag.map(String).slice(0, 8);
  if (b.normale !== undefined) overrides.normale = !!b.normale;
  if (b.boxPre !== undefined) overrides.boxPre = !!b.boxPre;

  const out = await buildFascicolo(contractId, { overrides });
  return res.status(out.ok ? 200 : (out.error === 'contract_not_found' ? 404 : 500)).json(out);
}
