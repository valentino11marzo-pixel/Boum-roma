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
async function buildPdf({ contract, property, calc, input, deadlines }) {
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
  const box = (x, checked) => {
    page.drawRectangle({ x, y: y - 1.5, width: 8, height: 8, borderColor: ink, borderWidth: 0.7 });
    if (checked) T('X', x + 1.6, y - 0.4, 7.5, bold);
  };

  // ═══ PAGINA 1 — SCHEDA ATTESTAZIONE ═══
  newPage();
  head('SCHEDA PER L\'ATTESTAZIONE DI RISPONDENZA',
    'Accordo Territoriale del Comune di Roma del 25 luglio 2023 e DM 16 gennaio 2017 - pre-compilata da BOOM sui dati del contratto');

  // tipo contratto
  need(18);
  const tipo = input.tipo;
  box(M, tipo === '32'); T('Contratto 3+2', M + 13, y, 9);
  box(M + 130, tipo === 'stud'); T('Studenti universitari', M + 143, y, 9);
  box(M + 290, tipo === 'trans'); T('Transitorio', M + 303, y, 9);
  y -= 20;

  row('LOCATORE', `${contract.landlordName || '-'}${contract.landlordCF ? '  -  C.F. ' + contract.landlordCF : ''}`, 90);
  row('CONDUTTORE', `${contract.tenantName || '-'}${contract.tenantCF ? '  -  C.F. ' + contract.tenantCF : ''}`, 90);
  row('IMMOBILE', `ROMA - ${property.address || '-'}${property.floor ? ' - piano ' + property.floor : ''}`, 90);
  row('COD. ZONA', calc && calc.zona ? `${calc.zona.cod} - ${calc.zona.nome}` : 'da confermare con ARPE', 90);
  row('CATASTO', property.cadastralData || contract.cadastral || '-', 90);
  row('DECORRENZA', `${dIT(contract.startDate) || '-'}    Stipulato: ${dIT(contract.fullySignedAt) || 'da firmare'}    ${contract.rliRegisteredAt ? 'Registrato: ' + dIT(contract.rliRegisteredAt) : 'DA REGISTRARE'}`, 90);
  y -= 4;

  // IL MODULO SI STAMPA SEMPRE, FEDELE AL FOGLIO DELL'ASSOCIAZIONE.
  // Fino al 23/08/2026 questa pagina degradava a "SCHEDA NON CALCOLABILE"
  // quando mancavano zona o mq: l'operatore restava senza il foglio proprio
  // nel caso in cui gli serviva stamparlo e completarlo a mano. Ora escono
  // sempre tutte le sezioni del modulo — superficie, i 20 parametri, le
  // maggiorazioni A-H, la fascia, i due importi finali — e cio' che il
  // sistema non sa diventa una riga vuota da compilare, esattamente come
  // sul foglio di carta.
  const HAS = !!(calc && calc.ok);
  const BLANK = '______________';

  // ── CALCOLO DELLA SUPERFICIE CONVENZIONALE ──
  need(20); T('CALCOLO DELLA SUPERFICIE CONVENZIONALE', M, y, 9, bold, gold); y -= 14;
  if (HAS) {
    calc.parts.forEach(p => {
      need(13);
      T(p.n, M, y, 8.5);
      T(`mq ${fmtN(p.mq)}`, M + 250, y, 8.5, font, grey);
      T(p.c, M + 330, y, 8.5, font, grey);
      T(`= mq ${fmtN(p.v)}`, M + 440, y, 8.5, bold);
      y -= 12.5;
    });
  } else {
    [['Superficie utile calpestabile', '< 46 x 1,30 | 46-70 x 1,15 | > 70 x 1,00'],
     ['Box / posto auto esclusivo', 'x 0,80 (zona pregio) | x 0,50'],
     ['Posto auto in autorimessa comune', 'x 0,20'],
     ['Balconi, terrazze, cantine e simili', 'x 0,25'],
     ['Superficie scoperta in godimento esclusivo', 'x 0,15'],
     ['Verde condominiale (sup. tot. / millesimi)', 'x 0,10']].forEach(([n, c]) => {
      need(13);
      T(n, M, y, 8.5); T('mq ______', M + 250, y, 8.5, font, grey);
      T(c, M + 330, y, 7.5, font, grey); T('= mq ________', M + 440, y, 8.5);
      y -= 12.5;
    });
  }
  need(15); line(y + 4);
  T(`TOTALE SUPERFICIE CONVENZIONALE: mq ${HAS ? fmtN(calc.sc) : BLANK}`, M, y - 6, 9.5, bold); y -= 22;

  // ── CARATTERISTICHE + I 20 PARAMETRI ──
  need(16);
  T('Alloggio "normale" (acqua, fognatura, gas/induzione, riscaldamento):', M, y, 8.5);
  box(M + 320, HAS && calc.normale); T(HAS ? (calc.normale ? 'SI' : 'NO') : 'SI / NO', M + 333, y, 8.5, bold); y -= 18;

  need(150);
  T(`PARAMETRI DESCRITTIVI DELL'ALLOGGIO: ${HAS ? calc.nP + ' su 20' : '____ su 20'}`, M, y, 9, bold, gold); y -= 14;
  for (let i = 0; i < 10; i++) {
    need(13);
    box(M, HAS && calc.parIdx.includes(i)); T(`${i + 1}. ${CANONE.PARAMETRI[i]}`, M + 12, y, 7.6);
    box(M + 262, HAS && calc.parIdx.includes(i + 10)); T(`${i + 11}. ${CANONE.PARAMETRI[i + 10]}`, M + 274, y, 7.6);
    y -= 12;
  }
  if (HAS && Object.keys((calc.derived && calc.derived.parametri && calc.derived.parametri.from) || {}).length) {
    need(12);
    T('Parametri derivati dalle dotazioni dichiarate in annuncio/immobile - verificare in sede di attestazione.', M, y, 7, font, grey); y -= 14;
  }
  y -= 4;

  // ── MAGGIORAZIONI / RIDUZIONI A-H (la griglia del modulo) ──
  need(70);
  T('MAGGIORAZIONI / RIDUZIONI APPLICABILI', M, y, 9, bold, gold); y -= 14;
  const magOn = (id) => HAS && Array.isArray(calc.mag) && calc.mag.includes(id);
  const MAGROW = [
    ['arr', 'A - Ammobiliato'], ['sem', 'B - Seminterrato -10%'],
    ['asc', 'C - Senza ascensore -10%'], ['att', 'D - Attico +10%'],
    ['clA', 'E - Classe energetica A/B/C +10%'], ['eco', 'F - Interventi Eco Bonus +5%'],
    ['sis', 'G - Interventi Sisma Bonus +10%'], ['clD', 'H - Classe energetica D/E/F +5%'],
  ];
  for (let i = 0; i < MAGROW.length; i += 2) {
    need(13);
    box(M, magOn(MAGROW[i][0])); T(MAGROW[i][1], M + 12, y, 8);
    if (MAGROW[i + 1]) { box(M + 262, magOn(MAGROW[i + 1][0])); T(MAGROW[i + 1][1], M + 274, y, 8); }
    y -= 12.5;
  }
  need(14);
  T('Transitorio +10%', M + 12, y, 8); box(M, HAS && input.tipo === 'trans');
  T('Immobile vincolato o cat. A1-A8  + ______ %', M + 274, y, 8); box(M + 262, false);
  y -= 18;

  // ── ZONA · FASCIA · SUBFASCIA (il riquadro del modulo) ──
  need(30);
  T(`ZONA ${HAS ? calc.zona.cod + ' - ' + calc.zona.nome : BLANK}`, M, y, 9, bold);
  T(`SUBFASCIA: ${HAS ? calc.fascia : '____'}`, M + 300, y, 9, bold); y -= 14;
  T(`FASCIA DI OSCILLAZIONE: ${HAS ? fmtN(calc.fMin) + ' - ' + fmtN(calc.fMax) : '______ - ______'} EUR/mq/mese`
    + `   x   mq ${HAS ? fmtN(calc.sc) : '______'}`, M, y, 8.5); y -= 13;
  if (HAS && calc.note.length) { T(`Applicate: ${calc.note.join(', ')} (${calc.pct > 0 ? '+' : ''}${calc.pct}%)`, M, y, 8, font, grey); y -= 13; }

  // ── I DUE IMPORTI, come sul modulo ──
  // Il canone PATTUITO e' quello deciso dalle parti e si stampa TALE E
  // QUALE: il massimo di fascia e' un riferimento dell'accordo, non un
  // limite che questo foglio impone. L'attestazione di rispondenza la
  // rilascia l'organizzazione, e questo documento le porta i numeri.
  need(46);
  const fits = HAS ? calc.fits !== false : null;
  page.drawRectangle({ x: M, y: y - 32, width: W - 2 * M, height: 44,
    color: rgb(0.98, 0.97, 0.93), borderColor: gold, borderWidth: 0.8 });
  T(`Importo massimo canone mensile di fascia: ${HAS ? eur(calc.cMax) : BLANK}`, M + 12, y - 6, 9, bold);
  T(`Importo canone mensile PATTUITO: ${calc.canone || contract.rent ? eur(calc.canone || contract.rent) : BLANK}`, M + 12, y - 20, 10, bold);
  if (HAS && fits === false) {
    T(`(+${eur(calc.excess)} sul massimo di fascia)`, M + 330, y - 20, 8, font, grey);
  }
  y -= 50;
  if (HAS && fits === false) {
    need(14);
    T('Nota: il canone pattuito supera il massimo della fascia calcolata con i parametri qui riportati.', M, y, 7.5, font, grey); y -= 11;
    T('Verificare parametri e maggiorazioni con l\'organizzazione, che valuta il rilascio dell\'attestazione.', M, y, 7.5, font, grey); y -= 14;
  } else if (!HAS) {
    need(14);
    T(`Da completare: ${calc && calc.error === 'mq_mancanti' ? 'superficie (mq) dell\'immobile' : 'zona dell\'accordo territoriale'} - impostabile dal portal (bottone Fascicolo) oppure a mano su questo foglio.`, M, y, 7.5, font, grey); y -= 14;
  }

  need(56);
  T('Il locatore ____________________________', M, y, 9);
  T('Il conduttore ____________________________', M + 270, y, 9); y -= 26;
  T('Tutto cio\' premesso, l\'organizzazione ________________________________ ATTESTA che i contenuti', M, y, 8.5); y -= 12;
  T('economici e normativi del contratto corrispondono a quanto previsto dall\'accordo territoriale in epigrafe.', M, y, 8.5); y -= 22;
  T('L\'Organizzazione sindacale  ____________________________________  (timbro e firma)', M, y, 8.5, font, grey);

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

    const bytes = await buildPdf({ contract: c, property: p, calc, input, deadlines });
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
