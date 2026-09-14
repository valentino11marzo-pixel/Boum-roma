// api/fiscal/valutazione.js — LA VALUTAZIONE BOOM.
//
// La scheda dell'accordo territoriale (pagina 1 del Fascicolo Fiscale) serve
// all'organizzazione per l'attestazione di rispondenza: li' il numero che
// conta e' il massimo di FASCIA, e chi lo attesta e' ASPI. Ma il canone che
// BOOM propone al proprietario non nasce da quella tabella — nasce dal
// mercato: quanto si chiede oggi in quella zona, in quanti giorni si affitta
// davvero, e soprattutto a quanto si FIRMA (il dato che nessun portale ha e
// noi si').
//
// Questo e' quel documento, e per costruzione e' UN'ALTRA COSA dalla scheda:
//   · dichiara in testa che NON e' l'attestazione di rispondenza;
//   · il canone BOOM si stampa come deciso — nessun tetto, nessun ricalcolo;
//   · la fascia dell'accordo compare come RIFERIMENTO dichiarato, perche' il
//     proprietario ha diritto di sapere dove passa quella linea, non perche'
//     limiti la valutazione;
//   · e vale la disciplina del Perito: SOTTO CAMPIONE NON ESCE UN NUMERO.
//     Una mediana su tre annunci non e' una valutazione, e' un'opinione
//     travestita da dato — qui si scrive "campione insufficiente" e si dice
//     su cosa ci si e' basati davvero.
//
// LA SECONDA PAGINA E' LA SCHEDA DI CALCOLO BRANDIZZATA BOOM (8/09/2026):
// la stessa aritmetica del modulo ARPE (schedaFacts, una copia sola), ma
// scritta per il PROPRIETARIO che chiede "quanto vale?" — superficie
// convenzionale riga per riga, i parametri che l'immobile ha davvero, la
// fascia e la subfascia, le maggiorazioni, il massimo dell'accordo, e il
// canone proposto messo accanto. Il modulo 1:1 va ad ARPE; questa va al
// proprietario. Si genera anche SENZA contratto (dall'immobile, dal
// portal): e' il documento delle valutazioni. Testata e piede dal marchio
// vero (_pdfbrand), come inventario e verbale.
//
// Method:   POST · Authorization: Bearer <firebase-id-token> (admin)
// Body:     { contractId } oppure { propertyId }, + { canone?, mq?, zona?, note? }
// Response: { ok, url, basis, scheda:{gaps,fascia,cMax,fits,nP,sc} } | { ok:false, error }

import { PDFDocument, rgb } from 'pdf-lib';
import { fsGet, fsList, fsPatch, readJson } from '../homie/_lib.js';
import { storageUpload } from '../agent/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import CANONE from '../../js/canone-engine.js';
import { contractTipo, resolveCanoneInput, schedaFacts, schedaGaps } from './fascicolo.js';
import ME from '../../js/market-engine.js';
import { brandAssets, masthead, stampFooters, INK, GREY, GOLD, HAIR } from '../_pdfbrand.js';

const clip = (v, n = 160) => String(v == null ? '' : v).trim().slice(0, n);
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

// WinAnsi-safe, come il Fascicolo (la lezione del certificato FES).
function wa(s) {
  return String(s == null ? '' : s)
    .replace(/[→➔➡]/g, '->').replace(/[✓✔☑☒]/g, 'X')
    .replace(/−/g, '-').replace(/[^\x20-\xFF–—‘’“”…€]/g, '');
}
// Numeri all'italiana deterministici (mai toLocaleString: ICU ridotta = "1250,00").
function itNum(v, dec = 2) {
  const n = Number(v || 0), neg = n < 0;
  const [i, d] = Math.abs(n).toFixed(dec).split('.');
  return (neg ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec ? ',' + d : '');
}
const eur = (n, dec = 2) => 'EUR ' + itNum(n, dec);
const dIT = s => { try { const d = new Date(String(s).slice(0, 10) + 'T00:00'); return isNaN(d) ? '' : d.toLocaleDateString('it-IT'); } catch { return ''; } };

// ── I canoni FIRMATI di BOOM nella zona: il dato che nessuno ha ──────────
// Si guardano i contratti veri (non gli annunci) sugli immobili della stessa
// zona, con superficie nota. Sotto 3 firme non si pubblica una mediana.
async function firmatiInZona(zoneSlug, exceptContractId) {
  try {
    const [contracts, properties] = await Promise.all([
      fsList('contracts', { limit: 400 }).catch(() => []),
      fsList('properties', { limit: 400 }).catch(() => []),
    ]);
    const byId = new Map((properties || []).map(p => [p.id, p]));
    const vals = [];
    for (const c of contracts || []) {
      if (!c || c.id === exceptContractId) continue;
      const rent = num(c.rent);
      if (!rent) continue;
      const p = byId.get(c.propertyId);
      if (!p) continue;
      const z = ME.normalizeZone(p.zone || p.address || '');
      if (!z || z !== zoneSlug) continue;
      const mq = num(p.sqm);
      if (!mq) continue;
      vals.push(rent / mq);
    }
    vals.sort((a, b) => a - b);
    if (vals.length < 3) return { ok: false, reason: 'small_sample', sample: vals.length };
    const mid = Math.floor(vals.length / 2);
    const median = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
    return { ok: true, sample: vals.length, medianEurSqm: Math.round(median * 10) / 10 };
  } catch { return { ok: false, reason: 'read_failed', sample: 0 }; }
}

async function buildPdf({ property, contract, canone, mq, zonaAcc, zoneSlug, mkt, firmati, calc, note, who, facts }) {
  const pdf = await PDFDocument.create();
  const b = await brandAssets(pdf);
  const { font, bold } = b;
  const ink = INK, grey = GREY, gold = GOLD;
  const W = 595, H = 842, M = 44;
  const today = dIT(new Date().toISOString());
  let page = pdf.addPage([W, H]);
  let y;
  const T = (t, x, yy, sz, f, col) => page.drawText(wa(t), { x, y: yy, size: sz, font: f || font, color: col || ink });
  const line = (yy, col) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: 0.6, color: col || HAIR });
  const row = (k, v, kw = 150) => { T(k, M, y, 8, bold, grey); T(v, M + kw, y, 9.5, font, ink); y -= 15; };

  // ── testata: il marchio VERO, una copia sola (_pdfbrand) ──
  y = masthead(page, b, { W, H, M, title: 'Valutazione locativa', date: today });
  T('VALUTAZIONE DEL CANONE - PARERE BOOM', M, y, 12.5, bold, gold); y -= 6; line(y, gold); y -= 16;
  T('Parere di valore locativo redatto da BOOM (Egidi Immobiliare S.r.l.) sui dati di mercato osservati.', M, y, 8.5, font, grey); y -= 11;
  T('NON e\' l\'attestazione di rispondenza all\'accordo territoriale, che e\' rilasciata dall\'organizzazione firmataria.', M, y, 8.5, font, grey); y -= 18;

  // ── l'immobile ──
  T('IMMOBILE', M, y, 9, bold, gold); y -= 14;
  row('Indirizzo', `${(property.city || 'ROMA').toUpperCase()} - ${property.address || '-'}${property.floor ? ', piano ' + property.floor : ''}`);
  row('Zona', zonaAcc ? `${zonaAcc.nome} (cod. accordo ${zonaAcc.cod})` : (property.zone || '-'));
  row('Superficie / vani', `${mq ? 'mq ' + itNum(mq, 0) : '-'}${property.rooms ? '  -  ' + property.rooms + ' vani' : ''}`);
  row('Classe energetica', property.energyClass || (contract && contract.energyClass) || '-');
  if (property.cadastralData) row('Catasto', property.cadastralData);
  y -= 6;

  // ── il canone BOOM ──
  T('IL CANONE PROPOSTO', M, y, 9, bold, gold); y -= 16;
  page.drawRectangle({ x: M, y: y - 26, width: W - 2 * M, height: 40, color: rgb(0.98, 0.97, 0.93), borderColor: gold, borderWidth: 0.9 });
  T(`${eur(canone)} / mese`, M + 12, y - 2, 15, bold);
  if (mq) T(`${eur(canone / mq, 2)} / mq / mese`, M + 200, y - 1, 10, font, grey);
  T(`${eur(canone * 12)} / anno`, M + 350, y - 1, 10, font, grey);
  T('Valore di mercato espresso da BOOM - non vincolato ai massimi di fascia dell\'accordo territoriale.', M + 12, y - 18, 7.5, font, grey);
  y -= 44;

  // ── su cosa si fonda ──
  T('SU COSA SI FONDA', M, y, 9, bold, gold); y -= 15;
  const basis = [];

  if (mkt && mkt.asked && mkt.asked.ok) {
    const a = mkt.asked;
    T(`Mercato di zona (richiesto): mediana ${eur(a.medianEurSqm)}/mq  -  fascia p25-p75 ${eur(a.p25)} - ${eur(a.p75)}/mq`, M, y, 8.5); y -= 12;
    T(`Campione: ${a.sample} annunci attivi osservati${mkt.activeCount ? ' su ' + mkt.activeCount + ' in zona' : ''}.`, M + 10, y, 7.5, font, grey); y -= 14;
    basis.push('mercato_richiesto');
    if (mq && canone) {
      const mine = canone / mq;
      const delta = a.medianEurSqm ? ((mine - a.medianEurSqm) / a.medianEurSqm) * 100 : 0;
      const verso = Math.abs(delta) < 5 ? 'in linea con' : (delta > 0 ? 'sopra' : 'sotto');
      T(`Posizionamento: ${eur(mine)}/mq, ${verso} la mediana di zona${Math.abs(delta) >= 5 ? ' (' + (delta > 0 ? '+' : '') + itNum(delta, 1) + '%)' : ''}.`, M, y, 8.5, bold); y -= 15;
    }
  } else {
    T(`Mercato di zona: campione insufficiente${mkt && mkt.asked ? ' (' + (mkt.asked.sample || 0) + ' annunci con prezzo e superficie)' : ''} - nessuna mediana pubblicata.`, M, y, 8.5, font, grey); y -= 14;
  }

  if (mkt && mkt.absorption && mkt.absorption.ok) {
    T(`Assorbimento: un immobile in questa zona esce dal mercato in ${mkt.absorption.medianDays} giorni (mediana, ${mkt.absorption.sample} casi con uscita provata).`, M, y, 8.5); y -= 14;
    basis.push('assorbimento');
  }
  if (mkt && mkt.priceDrops30d) { T(`Ribassi osservati negli ultimi 30 giorni in zona: ${mkt.priceDrops30d}.`, M, y, 8.5); y -= 14; }

  if (firmati && firmati.ok) {
    T(`Canoni FIRMATI da BOOM in zona: mediana ${eur(firmati.medianEurSqm)}/mq su ${firmati.sample} contratti.`, M, y, 8.5, bold); y -= 12;
    T('Dato proprietario: sono contratti conclusi, non richieste di mercato.', M + 10, y, 7.5, font, grey); y -= 14;
    basis.push('firmati_boom');
  } else {
    T(`Canoni firmati da BOOM in zona: campione insufficiente (${(firmati && firmati.sample) || 0} contratti) - non se ne ricava una mediana.`, M, y, 8.5, font, grey); y -= 14;
  }

  if (calc && calc.ok) {
    T(`Riferimento accordo territoriale: fascia ${calc.fascia} (${calc.nP} parametri dichiarati), massimo asseverabile ${eur(calc.cMax)}/mese su mq convenzionali ${itNum(calc.sc)}.`, M, y, 8.5); y -= 12;
    T('Riportato come riferimento: e\' il limite dell\'attestazione, non della valutazione di mercato.', M + 10, y, 7.5, font, grey); y -= 14;
    basis.push('accordo');
  }

  const feats = [];
  if (property.furnished) feats.push('arredato');
  if (property.elevator) feats.push('ascensore');
  if (property.rooms) feats.push(property.rooms + ' vani');
  if (property.energyClass) feats.push('classe ' + property.energyClass);
  if (feats.length) { y -= 2; T(`Dotazioni considerate: ${feats.join(', ')}.`, M, y, 8.5); y -= 14; }

  if (note) { y -= 4; T('NOTE', M, y, 9, bold, gold); y -= 13; wa(note).match(/.{1,105}/g).slice(0, 6).forEach(l => { T(l, M, y, 8.5); y -= 11; }); }

  // ── chiusura ──
  y = Math.min(y, 150);
  line(y + 10);
  T('Il presente parere e\' redatto sui dati di mercato disponibili alla data indicata e non costituisce', M, y, 7.5, font, grey); y -= 10;
  T('perizia giurata ne\' attestazione di rispondenza ai sensi della L. 431/98. La scheda di calcolo dell\'accordo segue a pagina 2.', M, y, 7.5, font, grey); y -= 22;
  T('BOOM Roma' + (who ? '  -  ' + who : ''), M, y, 9, bold);

  // ── PAGINA 2: la scheda di calcolo, versione BOOM ──
  if (facts) {
    page = pdf.addPage([W, H]);
    drawSchedaBoom(page, b, facts, { W, H, M, today, canone, mq });
  }
  stampFooters(pdf, b, { W, M });
  return { bytes: await pdf.save(), basis };
}

// ── LA SCHEDA DI CALCOLO BRANDIZZATA — per il proprietario ───────────────
// Gli STESSI fatti del modulo ARPE (schedaFacts: nessuna seconda aritmetica),
// impaginati per essere LETTI: ogni riga dice da dove viene il numero. Cio'
// che manca e' dichiarato ("da completare"), mai riempito. Esportata per i
// test (si disegna su una pagina data, senza I/O).
export function drawSchedaBoom(page, b, f, o) {
  const { W, H, M, today } = o;
  const { font, bold } = b;
  let y = masthead(page, b, { W, H, M, title: 'Scheda di calcolo del canone', date: today });
  const T = (t, x, yy, sz, fnt, col) => page.drawText(wa(t), { x, y: yy, size: sz, font: fnt || font, color: col || INK });
  const TR = (t, xr, yy, sz, fnt, col) => { const s = wa(t); page.drawText(s, { x: xr - (fnt || font).widthOfTextAtSize(s, sz), y: yy, size: sz, font: fnt || font, color: col || INK }); };
  const line = (yy, col) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: 0.6, color: col || HAIR });
  const sec = (t) => { T(t, M, y, 9, bold, GOLD); y -= 13; };
  const kv = (k, v, sub) => { T(k, M, y, 8.5, font, GREY); T(v, M + 190, y, 9, bold); if (sub) T(sub, M + 190 + bold.widthOfTextAtSize(wa(v), 9) + 8, y, 7.5, font, GREY); y -= 13; };
  const mqs = (n) => itNum(n, 2) + ' mq';
  const gaps = schedaGaps(f);
  const tipoLabel = f.tipo === 'stud' ? 'studenti (Allegato C)' : f.tipo === '32' ? '3+2 canone concordato (Allegato A)' : 'transitorio (Allegato B)';

  T('SCHEDA DI CALCOLO DEL CANONE - ACCORDO TERRITORIALE DI ROMA', M, y, 12.5, bold, GOLD); y -= 6; line(y, GOLD); y -= 14;
  T('Come si arriva al massimo dell\'accordo territoriale (Roma, 25/07/2023 - DM 16/01/2017) per questo immobile: e\' la lettura', M, y, 8, font, GREY); y -= 10;
  T('BOOM della scheda Allegato 2/B che accompagna il contratto. Il modulo ufficiale, firmato dalle parti, e\' quello che va all\'organizzazione.', M, y, 8, font, GREY); y -= 18;

  // ── immobile ──
  sec('IMMOBILE');
  kv('Indirizzo', `${f.citta || 'ROMA'} - ${f.via || '-'}`);
  kv('Zona dell\'accordo', f.zona ? `${f.zona.cod} - ${f.zona.nome}` : (f.zonaCod || 'da completare'), f.zona ? `fascia ${itNum(f.zona.min)} - ${itNum(f.zona.max)} EUR/mq/mese` : '');
  kv('Catasto', (f.cat && f.cat.f && f.cat.p) ? `foglio ${f.cat.f} - part. ${f.cat.p}${f.cat.s ? ' - sub ' + f.cat.s : ''}` : 'da completare');
  kv('Contratto', tipoLabel);
  y -= 4;

  // ── superficie convenzionale ──
  sec('SUPERFICIE CONVENZIONALE');
  const BR = ['fino a 45 mq: x 1,00 (minimo 45)', 'da 46 a 70 mq: x 1,00', 'da 71 a 120 mq: x 1,00', 'oltre 120 mq: x 0,90 sull\'eccedenza'];
  if (f.mq > 0) {
    T('Superficie utile', M, y, 8.5, font, GREY); T(mqs(f.mq), M + 190, y, 9, bold); T(BR[f.bracket] || '', M + 300, y, 7.5, font, GREY); TR(mqs(f.base0 != null ? f.base0 : f.mq), W - M, y, 9, bold); y -= 13;
    for (const pz of (f.pertinenze || [])) {
      if (!(pz.mq > 0)) continue;
      T(pz.label, M, y, 8, font, GREY); T(mqs(pz.mq), M + 190, y, 8.5); T(pz.coef, M + 300, y, 7.5, font, GREY); TR(mqs(pz.v), W - M, y, 8.5); y -= 12;
    }
    line(y + 4); y -= 8;
    T('Totale superficie convenzionale', M, y, 8.5, bold); TR(mqs(f.scTotal != null ? f.scTotal : f.sc), W - M, y, 10, bold, GOLD); y -= 16;
  } else { kv('Superficie utile', 'da completare'); y -= 4; }

  // ── parametri ──
  sec(`PARAMETRI DESCRITTIVI: ${f.nP} su 20`);
  const have = new Set(f.parIdx || []);
  const colW = (W - 2 * M - 10) / 2;
  const top = y;
  for (let i = 0; i < 20; i++) {
    const col = i < 10 ? 0 : 1, rowI = i % 10;
    const x = M + col * (colW + 10), yy = top - rowI * 10.5;
    const on = have.has(i);
    T(on ? 'X' : '-', x, yy, 7.5, bold, on ? GOLD : HAIR);
    T(CANONE.PARAMETRI[i], x + 10, yy, 7, font, on ? INK : GREY);
  }
  y = top - 10 * 10.5 - 2;
  T(`Subfascia: fino a 2 parametri = inferiore - da 3 = media - da 7 = massima.${f.normale === false ? ' Stato non normale: subfascia inferiore.' : ''}`, M, y, 7.5, font, GREY); y -= 14;

  // ── fascia e calcolo ──
  sec('IL CALCOLO');
  if (f.has && f.sub) {
    kv('Subfascia applicata', `${f.sub.fascia} - ${f.sub.name}`, `${itNum(f.sub.min)} - ${itNum(f.sub.max)} EUR/mq/mese, valore applicato ${itNum(f.sub.val)}`);
    kv('Canone base mensile', `EUR ${itNum(f.base)}`, `${itNum(f.sub.val)} x ${itNum(f.sc)} mq`);
    const magOn = (f.mag || []);
    const magLabels = CANONE.MAGG.filter(m => magOn.includes(m.id)).map(m => m.label + (m.pct === 'cfg' ? (f.pArr ? ` +${f.pArr}%` : ' (non calibrato)') : ` ${m.pct > 0 ? '+' : ''}${m.pct}%`));
    kv('Maggiorazioni / riduzioni', magLabels.length ? magLabels.join(' - ') : 'nessuna');
    if (f.transPct) kv('Contratto transitorio', `+${f.transPct}%`, `EUR ${itNum(f.transVal)}`);
    if (f.pDur) kv('Durata (3+2)', `+${f.pDur}%`, `EUR ${itNum(f.durataVal)}`);
    if (f.capApplied) { T('Regola dell\'accordo: gli aumenti non superano il massimo di fascia - il tetto resta il canone base.', M, y, 7.5, font, GREY); y -= 12; }
    y -= 4;
    page.drawRectangle({ x: M, y: y - 30, width: W - 2 * M, height: 44, color: rgb(0.98, 0.97, 0.93), borderColor: GOLD, borderWidth: 0.9 });
    T('MASSIMO ATTESTABILE (accordo)', M + 12, y - 2, 8, bold, GREY);
    T(`EUR ${itNum(f.cMax)} / mese`, M + 12, y - 20, 14, bold);
    T('CANONE PROPOSTO', M + 300, y - 2, 8, bold, GREY);
    T(`EUR ${itNum(f.pattuito)} / mese`, M + 300, y - 20, 14, bold, f.fits === false ? rgb(0.66, 0.16, 0.13) : GOLD);
    y -= 44;
    if (f.fits === false) { T(`Il canone proposto supera il massimo dell'accordo di EUR ${itNum(f.excess)}/mese: e' un canone di MERCATO (pagina 1), non attestabile come concordato.`, M, y, 8, bold, rgb(0.66, 0.16, 0.13)); y -= 12; }
    else if (f.fits === true) { T('Il canone proposto rientra nel massimo dell\'accordo: puo\' essere attestato come canone concordato (cedolare secca al 10%).', M, y, 8, bold, GOLD); y -= 12; }
  } else {
    kv('Massimo dell\'accordo', 'non calcolabile', 'manca: ' + gaps.filter(g => g !== 'catasto').join(', '));
    kv('Canone proposto', f.pattuito > 0 ? `EUR ${itNum(f.pattuito)} / mese` : 'da definire');
  }
  y -= 6;
  if (gaps.length) { T('Da completare sulla scheda ufficiale: ' + gaps.join(', ') + '.', M, y, 7.5, font, GREY); y -= 10; }
  T('Parametri e maggiorazioni sono dichiarati SOLO sulle dotazioni reali in archivio; le informazioni sull\'immobile sono fornite dalle parti.', M, y, 7.5, font, GREY);
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  const b = await readJson(req).catch(() => ({}));
  const contractId = clip(b && b.contractId, 80);
  let propertyId = clip(b && b.propertyId, 80);

  try {
    let contract = null;
    if (contractId) {
      contract = await fsGet('contracts/' + contractId);
      if (!contract) return res.status(404).json({ ok: false, error: 'contract_not_found' });
      contract.id = contractId;
      propertyId = propertyId || contract.propertyId || '';
    }
    if (!propertyId) return res.status(400).json({ ok: false, error: 'immobile_richiesto' });
    const property = await fsGet('properties/' + propertyId);
    if (!property) return res.status(404).json({ ok: false, error: 'property_not_found' });

    // Il canone: quello passato, altrimenti quello del contratto. NESSUN cap.
    const canone = num(b && b.canone) || num(contract && contract.rent);
    if (!canone) return res.status(400).json({ ok: false, error: 'canone_richiesto' });
    const mq = num(b && b.mq) || num(property.sqm) || num(contract && contract.canoneScheda && contract.canoneScheda.mq);

    const zonaAcc = CANONE.matchZone(clip(b && b.zona, 40) || (contract && contract.canoneScheda && contract.canoneScheda.zonaCod) || property.canoneZonaCod || property.zone || property.address || '');
    const zoneSlug = ME.normalizeZone(property.zone || property.address || '');

    const [mkt, firmati] = await Promise.all([
      zoneSlug ? fsGet('marketStats/' + zoneSlug).catch(() => null) : Promise.resolve(null),
      zoneSlug ? firmatiInZona(zoneSlug, contractId) : Promise.resolve({ ok: false, sample: 0 }),
    ]);

    // La fascia dell'accordo entra come RIFERIMENTO (mai come limite).
    // L'input e' quello del Fascicolo (resolveCanoneInput: dotazioni REALI
    // dell'immobile e dell'annuncio, override persistiti) — una copia sola:
    // la scheda del proprietario e il modulo ARPE non possono divergere.
    let listing = null;
    try { listing = (await fsList('listings', { filter: { field: 'propertyId', op: 'EQUAL', value: propertyId }, limit: 1 }))[0] || null; } catch (_) {}
    let cfg = null;
    try { cfg = await fsGet('settings/canoneAccordo'); } catch (_) {}
    const input = {
      ...resolveCanoneInput({ contract: contract || {}, property, listing, cfg: cfg || undefined }),
      zona: zonaAcc, mq, canone, tipo: contractTipo(contract || {}),
    };
    let calc = null;
    if (zonaAcc && mq > 0) calc = CANONE.solve(input);
    const facts = schedaFacts({ contract: contract || {}, property, calc, input });

    const { bytes, basis } = await buildPdf({
      property, contract, canone, mq, zonaAcc, zoneSlug, mkt, firmati, calc, facts,
      note: clip(b && b.note, 600), who: auth.email || '',
    });

    const path = contractId
      ? `contracts/${contractId}/valutazione-boom.pdf`
      : `property-docs/${propertyId}/valutazione-boom.pdf`;
    const url = await storageUpload(path, Buffer.from(bytes), 'application/pdf');
    if (!url) return res.status(500).json({ ok: false, error: 'storage_failed' });
    // Il documento resta trovabile: sul contratto quando c'e', sempre
    // sull'immobile (e' il documento delle valutazioni ai proprietari).
    const stamp = { valutazioneBoomUrl: url, valutazioneBoomAt: new Date().toISOString(), valutazioneBoomCanone: canone };
    await Promise.all([
      fsPatch('properties/' + propertyId, stamp).catch(() => {}),
      contractId ? fsPatch('contracts/' + contractId, stamp).catch(() => {}) : null,
    ]);

    return res.status(200).json({
      ok: true, url, canone, basis,
      market: mkt && mkt.asked && mkt.asked.ok ? { medianEurSqm: mkt.asked.medianEurSqm, sample: mkt.asked.sample } : null,
      firmati: firmati && firmati.ok ? firmati : null,
      scheda: { gaps: schedaGaps(facts), fascia: facts.sub ? facts.sub.fascia : null, cMax: facts.cMax, fits: facts.fits, nP: facts.nP, sc: facts.sc },
    });
  } catch (e) {
    console.error('[fiscal/valutazione]', e.message);
    return res.status(500).json({ ok: false, error: 'build_failed' });
  }
}
