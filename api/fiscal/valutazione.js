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
// Method:   POST · Authorization: Bearer <firebase-id-token> (admin)
// Body:     { contractId } oppure { propertyId }, + { canone?, mq?, zona?, note? }
// Response: { ok, url, basis } | { ok:false, error }

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { fsGet, fsList, readJson } from '../homie/_lib.js';
import { storageUpload } from '../agent/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import CANONE from '../../js/canone-engine.js';
import ME from '../../js/market-engine.js';

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

async function buildPdf({ property, contract, canone, mq, zonaAcc, zoneSlug, mkt, firmati, calc, note, who }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.08, 0.09), grey = rgb(0.42, 0.42, 0.45), gold = rgb(0.72, 0.55, 0.05);
  const W = 595, H = 842, M = 44;
  const page = pdf.addPage([W, H]);
  let y = H - 46;
  const T = (t, x, yy, sz, f, col) => page.drawText(wa(t), { x, y: yy, size: sz, font: f || font, color: col || ink });
  const line = (yy, col) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: 0.6, color: col || rgb(0.75, 0.73, 0.68) });
  const row = (k, v, kw = 150) => { T(k, M, y, 8, bold, grey); T(v, M + kw, y, 9.5, font, ink); y -= 15; };

  // ── testata ──
  page.drawRectangle({ x: 0, y: H - 40, width: W, height: 40, color: rgb(0.04, 0.04, 0.05) });
  T('BOOM', M, H - 27, 15, bold, rgb(1, 1, 1));
  T('ROMA', M + 48, H - 26, 8, font, rgb(0.91, 0.78, 0.41));
  T('Valutazione locativa', W - M - 150, H - 22, 8, font, rgb(0.8, 0.8, 0.8));
  T(dIT(new Date().toISOString()), W - M - 150, H - 33, 8, font, rgb(0.6, 0.6, 0.6));
  y = H - 66;
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
  y = Math.min(y, 190);
  line(y + 10);
  T('Il presente parere e\' redatto sui dati di mercato disponibili alla data indicata e non costituisce', M, y, 7.5, font, grey); y -= 10;
  T('perizia giurata ne\' attestazione di rispondenza ai sensi della L. 431/98.', M, y, 7.5, font, grey); y -= 22;
  T('BOOM Roma' + (who ? '  -  ' + who : ''), M, y, 9, bold); y -= 12;
  T('Egidi Immobiliare S.r.l. - Via dei Coronari 181/184, 00186 Roma - P.IVA 17322991005', M, y, 7.5, font, grey); y -= 10;
  T('BOOM(R) e\' un marchio dell\'Unione europea registrato (MUE 019317594) di Egidi Immobiliare S.r.l.', M, y, 7, font, grey);

  return { bytes: await pdf.save(), basis };
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
    let calc = null;
    if (zonaAcc && mq > 0) {
      calc = CANONE.solve({
        zona: zonaAcc, mq, canone,
        tipo: contract && contract.type === 'studenti' ? 'stud' : 'trans',
        features: [], furnished: !!property.furnished,
        energyClass: property.energyClass || '',
        floorText: String(property.floor || ''),
        ...(contract && contract.canoneScheda ? {
          parIdx: contract.canoneScheda.parIdx, mag: contract.canoneScheda.mag,
          mqBal: contract.canoneScheda.mqBal, mqBox: contract.canoneScheda.mqBox,
        } : {}),
      });
    }

    const { bytes, basis } = await buildPdf({
      property, contract, canone, mq, zonaAcc, zoneSlug, mkt, firmati, calc,
      note: clip(b && b.note, 600), who: auth.email || '',
    });

    const path = contractId
      ? `contracts/${contractId}/valutazione-boom.pdf`
      : `property-docs/${propertyId}/valutazione-boom.pdf`;
    const url = await storageUpload(path, Buffer.from(bytes), 'application/pdf');
    if (!url) return res.status(500).json({ ok: false, error: 'storage_failed' });

    return res.status(200).json({
      ok: true, url, canone, basis,
      market: mkt && mkt.asked && mkt.asked.ok ? { medianEurSqm: mkt.asked.medianEurSqm, sample: mkt.asked.sample } : null,
      firmati: firmati && firmati.ok ? firmati : null,
    });
  } catch (e) {
    console.error('[fiscal/valutazione]', e.message);
    return res.status(500).json({ ok: false, error: 'build_failed' });
  }
}
