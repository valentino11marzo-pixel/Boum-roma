// api/fiscal/fascicolo.js
// IL FASCICOLO FISCALE — un PDF, tre pagine, generato dal contratto:
//   1. SCHEDA PER L'ATTESTAZIONE DI RISPONDENZA (accordo Roma 25/07/2023 +
//      DM 16/01/2017) compilata DAL CONTRATTO: parti, catasto, superficie
//      convenzionale, i 20 parametri derivati dalle feature REALI di
//      immobile/annuncio, maggiorazioni provate, e il verdetto — il canone
//      pattuito RIENTRA nella fascia di oscillazione (o sfora di quanto).
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
// Response: { ok, url, calc } | { ok:false, error }

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { fsGet, fsList, fsPatch, readJson } from '../homie/_lib.js';
import { storageUpload } from '../agent/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import CANONE from '../../js/canone-engine.js';

const clip = (v, n = 120) => String(v == null ? '' : v).trim().slice(0, n);

// Chi ATTESTA, in sigla. Sul timbro della scheda vera compilata dall'ufficio
// c'e' ARPE (Associazione Romana Proprieta' Edilizia, via S. Nicola da
// Tolentino) — si cambia da settings/registrazione.sigla, senza deploy.
const ORG_FALLBACK = 'ARPE';

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
    tipo: contract.type === 'studenti' ? 'stud' : 'trans',
    canone: Number(contract.rent) || 0,
    cfg,
  };
}

// ── Il PDF ───────────────────────────────────────────────────────────────
async function buildPdf({ contract, property, calc, input, deadlines, org }) {
  const ORG_NAME = String(org || ORG_FALLBACK);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.08, 0.09), grey = rgb(0.42, 0.42, 0.45), gold = rgb(0.72, 0.55, 0.05);
  const W = 595, H = 842, M = 44;

  let page, y;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - 46; };
  // align: undefined|'l' = x e' il bordo sinistro; 'c' = x e' il centro; 'r' = x e' il bordo destro.
  // Serve alla scheda dell'associazione, che ha titolo e dichiarazioni centrati.
  const T = (t, x, yy, sz, f, col, align) => {
    const fnt = f || font, txt = wa(t);
    let px = x;
    if (align === 'c' || align === 'r') {
      const w = fnt.widthOfTextAtSize(txt, sz);
      px = align === 'c' ? x - w / 2 : x - w;
    }
    page.drawText(txt, { x: px, y: yy, size: sz, font: fnt, color: col || ink });
  };
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
  const box = (x, checked) => {
    page.drawRectangle({ x, y: y - 1.5, width: 8, height: 8, borderColor: ink, borderWidth: 0.7 });
    if (checked) T('X', x + 1.6, y - 0.4, 7.5, bold);
  };

  // ═══ PAGINA 1 — LA SCHEDA, COM'E' DAVVERO ═══
  // Ricalcata sulla scheda FIRMATA che l'organizzazione compila e timbra
  // (foto del 23/08/2026), non sul solo modello vuoto: i due differiscono in
  // punti che contano — la tabella della superficie a quattro colonne, le
  // caratteristiche spuntate una per una, e soprattutto la riga finale, che
  // sul foglio vero porta SOLO "Importo canone mensile pattuito". Nessun
  // massimo stampato accanto: il tetto di fascia e' un dato di lavoro NOSTRO
  // e sta a pagina 2, non su un foglio che va all'organizzazione e all'AdE.
  //
  // La scheda esce SEMPRE, anche senza zona o mq: cio' che il sistema non sa
  // diventa una riga vuota da compilare a penna, mai un foglio che manca.
  newPage();
  page.drawRectangle({ x: 0, y: H - 40, width: W, height: 40, color: rgb(0.04, 0.04, 0.05) });
  T('BOOM', M, H - 27, 15, bold, rgb(1, 1, 1));
  T('ROMA', M + 48, H - 26, 8, font, rgb(0.91, 0.78, 0.41));
  T(dIT(new Date().toISOString()), W - M - 60, H - 27, 8, font, rgb(0.6, 0.6, 0.6));
  y = H - 62;
  T('SCHEDA PER LA ATTESTAZIONE DI RISPONDENZA ALL\'ACCORDO TERRITORIALE', W / 2, y, 9.5, bold, ink, 'c'); y -= 12;
  T('DEL COMUNE DI ROMA DEL 25 LUGLIO 2023 E DM 16 GENNAIO 2017', W / 2, y, 9.5, bold, ink, 'c'); y -= 20;

  const HAS = !!(calc && calc.ok);
  const tipo = input.tipo;

  // ── tipo di contratto ──
  T('Contratto:', M, y, 8.5, bold);
  box(M + 58, tipo === '32'); T('3 + 2', M + 70, y, 8.5);
  box(M + 118, tipo === 'stud'); T('Studenti universitari', M + 130, y, 8.5);
  box(M + 240, tipo === 'trans'); T('Transitorio', M + 252, y, 8.5);
  y -= 18;

  // ── le parti ──
  const fld = (label, val, x, lw, tot) => {
    T(label, x, y, 8, font, grey);
    T(val || '', x + lw, y, 8.5);
    page.drawLine({ start: { x: x + lw, y: y - 2.5 }, end: { x: x + tot, y: y - 2.5 }, thickness: 0.4, color: rgb(0.62, 0.62, 0.62) });
  };
  fld('Locatore:', `${contract.landlordName || ''}${contract.landlordCF ? '   C.F. ' + contract.landlordCF : ''}`, M, 52, W - 2 * M); y -= 15;
  fld('Conduttore:', `${contract.tenantName || ''}${contract.tenantCF ? '   C.F. ' + contract.tenantCF : ''}`, M, 52, W - 2 * M); y -= 17;

  fld('Citta\':', (property.city || 'ROMA').toUpperCase(), M, 30, 96);
  fld('Via', `${property.address || ''}${property.floor ? ' - piano ' + property.floor : ''}`, M + 106, 20, 214);
  fld('COD. ZONA', HAS ? calc.zona.cod : ((input.zona && input.zona.cod) || ''), M + 330, 50, W - 2 * M - 330);
  y -= 16;

  // Catasto come sul foglio: Foglio / Particella / Subalterno / Categoria.
  const cat = String(property.cadastralData || contract.cadastral || '');
  const grab = (re) => { const m = re.exec(cat); return m ? m[1] : ''; };
  fld('Id. catastale   Foglio', grab(/foglio\s*:?\s*([\w\/]+)/i), M, 84, 150);
  fld('Part.', grab(/part(?:icella|\.)?\s*:?\s*([\w\/]+)/i), M + 160, 26, 90);
  fld('Sub.', grab(/sub\.?\s*:?\s*([\w\/]+)/i), M + 260, 24, 90);
  fld('Cat.', grab(/cat\.?\s*(?:catastale)?\s*:?\s*([\w\/]+)/i), M + 360, 22, W - 2 * M - 360);
  y -= 17;

  fld('Decorrenza:', dIT(contract.startDate), M, 56, 128);
  fld('Stipulato il:', dIT(contract.fullySignedAt), M + 138, 56, 128);
  fld('Registrato il:', dIT(contract.rliRegisteredAt), M + 276, 58, 128);
  y -= 18;

  T('Tutte le informazioni necessarie per determinare il calcolo del canone sono state fornite dalle parti.', W / 2, y, 8, font, ink, 'c');
  y -= 18;

  // ── CALCOLO DELLA SUPERFICIE CONVENZIONALE (tabella a 4 colonne) ──
  // I coefficienti NON si riscrivono qui: si chiedono al motore, che e' la
  // stessa copia usata da scheda-canone.html e dal calcolo di questa pagina.
  // Riscriverli a mano voleva dire due verita' possibili sullo stesso foglio.
  const supPart = (key) => {
    const v = Number(input[key]) || 0;
    if (!v) return { netta: 0, c: '', conv: 0 };
    const parts = CANONE.supConv({ mq: 0, boxPre: input.boxPre, [key]: v }).parts;
    const p = key === 'mq' ? parts[0] : parts[1];
    return { netta: v, c: p ? p.c : '', conv: p ? p.v : 0 };
  };
  const SUP = [
    ['Superficie calpestabile appartamento', 'mq'],
    ['Box o autorimessa in godimento esclusivo', 'mqBox'],
    ['Posto auto o autorimessa comune', 'mqPC'],
    ['Balconi, terrazze, cantine e simili', 'mqBal'],
    ['Superficie scoperta in godimento esclusivo', 'mqSc'],
    ['Verde condominiale (sup. tot. cond. x mm. Tab. A)', 'mqVe'],
  ].map(([label, key]) => Object.assign({ label }, supPart(key)));

  T('CALCOLO DELLA SUPERFICIE CONVENZIONALE', M, y, 8.5, bold); y -= 13;
  const C0 = M, C1 = M + 232, C2 = M + 316, C3 = M + 400, C4 = W - M;
  const HR = 12, RH = 13, tTop = y + 4;
  page.drawRectangle({ x: C0, y: tTop - HR, width: C4 - C0, height: HR, color: rgb(0.93, 0.92, 0.89) });
  const hy = tTop - HR + 3.6;
  T('SUPERFICIE', C0 + 4, hy, 7, bold);
  T('SUPERFICIE NETTA', C1 + 4, hy, 7, bold);
  T('COEFFICIENTE', C2 + 4, hy, 7, bold);
  T('SUP. CONVENZIONALE', C3 + 4, hy, 7, bold);
  y = tTop - HR;
  SUP.forEach((r) => {
    const ty = y - RH + 3.8;
    T(r.label, C0 + 4, ty, 7.2);
    T('mq ' + (r.netta ? fmtN(r.netta) : ''), C1 + 4, ty, 7.2);
    T(r.c, C2 + 4, ty, 7.2);
    T('mq ' + (r.conv ? fmtN(r.conv) : ''), C3 + 4, ty, 7.2);
    y -= RH;
  });
  const tBot = y;
  const gLine = (x1, y1, x2, y2) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.5, color: rgb(0.55, 0.55, 0.55) });
  [C0, C1, C2, C3, C4].forEach(x => gLine(x, tTop, x, tBot));
  gLine(C0, tTop, C4, tTop);
  gLine(C0, tTop - HR, C4, tTop - HR);
  SUP.forEach((_, i) => gLine(C0, tTop - HR - (i + 1) * RH, C4, tTop - HR - (i + 1) * RH));
  y -= 14;
  const scTot = CANONE.supConv(input).total;
  T(`TOTALE SUPERFICIE CONVENZIONALE   Mq. ${scTot > 0 ? fmtN(scTot) : '______________'}`, C1 - 60, y, 8.5, bold);
  y -= 20;

  // ── CARATTERISTICHE: i requisiti che fanno l'alloggio "normale" ──
  const norm = input.normale !== false;
  T('CARATTERISTICHE:', M, y, 8, bold);
  const CAR = ['Allaccio rete idrica', 'Allaccio rete fognante', 'Erogazione GAS o induzione', 'Impianto di riscaldamento'];
  CAR.slice(0, 2).forEach((lab, i) => { const x = M + 110 + i * 170; box(x, norm); T(lab, x + 12, y, 7.5); });
  y -= 13;
  CAR.slice(2).forEach((lab, i) => { const x = M + 110 + i * 170; box(x, norm); T(lab, x + 12, y, 7.5); });
  y -= 15;
  T('Appartamento normale:', M, y, 8, bold);
  box(M + 110, norm); T('SI', M + 122, y, 8);
  box(M + 150, !norm); T('NO', M + 162, y, 8);
  y -= 18;

  // ── I 20 PARAMETRI ──
  T('PARAMETRI', M, y, 8, bold); y -= 12;
  for (let i = 0; i < 10; i++) {
    T(String(i + 1), M, y, 6.8, font, grey);
    box(M + 13, HAS && calc.parIdx.includes(i)); T(CANONE.PARAMETRI[i], M + 25, y, 6.9);
    T(String(i + 11), M + 258, y, 6.8, font, grey);
    box(M + 273, HAS && calc.parIdx.includes(i + 10)); T(CANONE.PARAMETRI[i + 10], M + 285, y, 6.9);
    y -= 11;
  }
  y -= 4;
  T(`NUMERO PARAMETRI DESCRITTIVI DELL'ALLOGGIO: ${HAS ? calc.nP : '______'}`, M, y, 8.5, bold); y -= 18;

  // ── MAGGIORAZIONI / RIDUZIONI (griglia A-H come sul foglio) ──
  T('Maggiorazioni / riduzioni applicabili:', M, y, 8.5, bold); y -= 13;
  const magOn = (id) => HAS && Array.isArray(calc.mag) && calc.mag.includes(id);
  const pArr = (input.cfg && input.cfg.pArr) || 0;
  const MAGROW = [
    [['arr', `A - Ammobiliato + ${pArr ? pArr : '____'}%`], ['sem', 'B - Seminterrato - 10%'], ['asc', 'C - Senza ascensore - 10%']],
    [['att', 'D - Attico + 10%'], ['clA', 'E - Classe energetica A/B/C + 10%'], ['eco', 'F - Interventi Eco Bonus + 5%']],
    [['sis', 'G - Interventi Sisma Bonus + 10%'], ['clD', 'H - Classe energetica D/E/F + 5%'], null],
  ];
  MAGROW.forEach(r => {
    r.forEach((cell, ci) => {
      if (!cell) return;
      const x = M + ci * 170;
      box(x, magOn(cell[0])); T(cell[1], x + 12, y, 7.2);
    });
    y -= 13;
  });
  y -= 8;

  // ── LA RIGA CHE CONTA: il canone PATTUITO, e basta ──
  // Sul foglio firmato non c'e' nessun "importo massimo" accanto. Il massimo
  // di fascia e' un riferimento dell'accordo, non un tetto che questo foglio
  // impone al prezzo deciso dalle parti: sta a pagina 2, per noi. Se il
  // pattuito lo supera il documento lo dice in nota, senza riscriverlo.
  const durPct = (input.cfg && input.cfg.pDur && tipo === '32') ? input.cfg.pDur : 0;
  T(`Durata ${durPct || '_____'}%;`, M, y, 8.5, bold);
  T(`Transitorio ${tipo === 'trans' ? '10' : '_____'}%;`, M + 96, y, 8.5, bold);
  const pattuito = Number(contract.rent) || 0;
  T(`Importo canone mensile pattuito: ${pattuito ? eur(pattuito) : 'EUR ____________'};`, M + 210, y, 9, bold);
  y -= 12;
  if (HAS && pattuito > calc.cMax) {
    T(`Nota: il canone pattuito supera di ${eur(pattuito - calc.cMax)} il massimo di fascia ${calc.fascia} dell'accordo (${eur(calc.cMax)}).`, M, y, 7, font, rgb(0.6, 0.3, 0.05));
    y -= 12;
  }
  y -= 8;

  T('Il locatore', M + 55, y, 8.5); T('Il conduttore', W - M - 145, y, 8.5); y -= 16;
  page.drawLine({ start: { x: M, y }, end: { x: M + 190, y }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });
  page.drawLine({ start: { x: W - M - 190, y }, end: { x: W - M, y }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });
  y -= 20;

  T(`Roma, ${dIT(new Date().toISOString())}`, M, y, 8.5); y -= 15;
  T(`Tutto cio' premesso l'organizzazione ${ORG_NAME}, sotto la propria responsabilita' e sulla base degli`, M, y, 7.6); y -= 10;
  T('elementi oggettivi sopra forniti a cura ed assunzione di responsabilita\' dalle parti, anche ai fini', M, y, 7.6); y -= 10;
  T('dell\'ottenimento di eventuali agevolazioni fiscali,', M, y, 7.6); y -= 14;
  T('ATTESTA', W / 2, y, 9.5, bold, ink, 'c'); y -= 13;
  T('che i contenuti economici e normativi del contratto corrispondono a quanto previsto dall\'accordo', M, y, 7.6); y -= 10;
  T('territoriale in epigrafe.', M, y, 7.6); y -= 20;
  T('L\'Organizzazione sindacale', W / 2 + 120, y, 8, font, grey, 'c'); y -= 20;
  page.drawLine({ start: { x: W / 2 + 30, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });

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
  y -= 12;

  // ── VERIFICA CANONE CONCORDATO — il riferimento, dalla parte giusta ──
  // Questo blocco e' il tetto di fascia dell'accordo: NON sta a pagina 1,
  // perche' quella e' la scheda che va all'organizzazione e all'Agenzia
  // delle Entrate e li' si stampa il canone PATTUITO, non un massimo che il
  // foglio sembrerebbe imporre alle parti. Qui serve a noi: prima di
  // mandare la pratica si sa se l'attestazione regge o se va negoziata.
  need(120);
  const vy0 = y + 12;
  T('VERIFICA CANONE CONCORDATO', M + 10, y, 9, bold, gold); y -= 12;
  T('Riferimento di lavoro BOOM - non fa parte della scheda inviata all\'organizzazione.', M + 10, y, 7.5, font, grey); y -= 15;
  const vrow = (k, v, col) => { T(k, M + 10, y, 8, bold, grey); T(v, M + 170, y, 8.5, font, col || ink); y -= 14; };
  if (calc && calc.ok) {
    vrow('Zona accordo', `${calc.zona.cod} - ${calc.zona.nome}`);
    vrow('Superficie convenzionale', `${fmtN(calc.sc)} mq`);
    vrow('Parametri / fascia', `${calc.nP} su 20  ->  fascia ${calc.fascia}${calc.normale === false ? '  (alloggio non "normale": fascia A)' : ''}`);
    vrow('Valori di fascia', `${eur(calc.fMin)} - ${eur(calc.fMax)} per mq/mese`);
    vrow('Maggiorazioni', calc.note && calc.note.length ? calc.note.join(', ') : 'nessuna');
    vrow('Canone di fascia', `${eur(calc.cMin)} - ${eur(calc.cMax)} al mese${calc.capApplied ? '  (cap: gli aumenti non superano il massimo di fascia)' : ''}`);
    const pat = Number(contract.rent) || 0;
    const fits = pat > 0 && pat <= calc.cMax + 0.5;
    vrow('Canone pattuito', eur(pat), fits ? rgb(0.05, 0.45, 0.15) : rgb(0.7, 0.15, 0.05));
    T(fits
      ? 'ESITO: il canone pattuito rientra nella fascia di oscillazione dell\'accordo.'
      : `ESITO: il canone pattuito supera il massimo di fascia di ${eur(pat - calc.cMax)}. L'organizzazione non puo' attestare la rispondenza a questo prezzo.`,
      M + 10, y, 8, bold, fits ? rgb(0.05, 0.45, 0.15) : rgb(0.7, 0.15, 0.05));
    y -= 14;
  } else {
    const why = (calc && calc.error) === 'mq_mancanti'
      ? 'mancano i metri quadri dell\'immobile'
      : 'la zona dell\'accordo non e\' stata riconosciuta dall\'indirizzo';
    vrow('Esito', 'calcolo non eseguito', rgb(0.7, 0.35, 0.05));
    T(`Motivo: ${why}. La scheda a pagina 1 esce comunque, da completare a mano.`, M + 10, y, 8, font, grey); y -= 12;
    T('Per il calcolo automatico: portal -> riga contratto -> Fascicolo, e indica zona e mq.', M + 10, y, 8, font, grey); y -= 12;
  }
  page.drawRectangle({ x: M, y: y + 4, width: W - 2 * M, height: vy0 - y - 4, borderColor: rgb(0.82, 0.74, 0.5), borderWidth: 0.8 });
  y -= 14;

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
    const c = contract || await fsGet('contracts/' + contractId);
    if (!c) return { ok: false, error: 'contract_not_found' };
    const p = property || (c.propertyId ? await fsGet('properties/' + c.propertyId).catch(() => null) : null) || {};
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

    let org = ORG_FALLBACK;
    try { const rs = await fsGet('settings/registrazione'); const v = clip((rs || {}).sigla, 40); if (v) org = v; } catch (_) {}

    const bytes = await buildPdf({ contract: c, property: p, calc, input, deadlines, org });
    const url = await storageUpload(`contracts/${contractId}/fascicolo-fiscale.pdf`, Buffer.from(bytes), 'application/pdf');
    if (!url) return { ok: false, error: 'storage_failed' };

    const snapshot = calc && calc.ok ? {
      ...(c.canoneScheda || {}),
      zonaCod: calc.zona.cod, zonaNome: calc.zona.nome,
      parIdx: calc.parIdx, mag: calc.mag, mq: input.mq,
      sc: Math.round(calc.sc * 100) / 100, fascia: calc.fascia,
      cMax: Math.round(calc.cMax * 100) / 100, fits: calc.fits,
      computedAt: new Date().toISOString(),
    } : { ...(c.canoneScheda || {}), error: calc && calc.error, computedAt: new Date().toISOString() };

    await fsPatch('contracts/' + contractId, { fascicoloFiscaleUrl: url, canoneScheda: snapshot }).catch(() => {});
    return { ok: true, url, calc: snapshot };
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
