// api/owners/_conto-pdf.js — IL CONTO DELLA SUA CASA, IN PDF.
//
// Il documento che il proprietario si porta via da /canone: due facce.
// La prima dice il numero e cosa gli resta in tasca; la seconda come ci si
// arriva, riga per riga, così il commercialista lo può rifare a mano.
//
// Tre regole:
//  1. Si stampa la FOTO presa alla richiesta (ownerConti/<id>.result), mai un
//     ricalcolo: un link aperto fra sei mesi mostra il conto che il
//     proprietario ha ricevuto, anche se nel frattempo il motore è cambiato.
//  2. Niente dati personali: il PDF viaggia per link (al coniuge, al
//     commercialista). C'è solo la casa, i numeri e un riferimento.
//  3. Ogni pagina dice cos'è e cosa NON è: stima su dati dichiarati e non
//     verificati, non l'attestazione di rispondenza, non una perizia.
//
// Testata, piede legale e wa() da api/_pdfbrand.js (una copia sola).

import { PDFDocument, rgb } from 'pdf-lib';
import {
  brandAssets, masthead, stampFooters, wa,
  INK, GREY, FAINT, GOLD, HAIR,
} from '../_pdfbrand.js';

const W = 595.28, H = 841.89, M = 50;
const PAPER = rgb(0.975, 0.965, 0.94);
const BOTTOM = 84; // sotto: la riga «cosa non è» e il piede legale

// Migliaia e decimali deterministici (mai toLocaleString: con ICU ridotta
// degrada in silenzio — la lezione di /executive).
export function eur(n) {
  return '€' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
export function dec(n, d = 2) {
  const [i, f] = (Number(n) || 0).toFixed(d).split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (f ? ',' + f : '');
}
const mqs = (n) => dec(n, Number(n) % 1 ? 2 : 0);

/** gg/mm/aaaa nel fuso di Roma, da una data ISO. */
export function romeDate(iso) {
  const d = new Date(iso || Date.now());
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)) p[x.type] = x.value;
  return `${p.day}/${p.month}/${p.year}`;
}

const TIPO = { '32': '3+2 canone concordato', trans: 'transitorio', stud: 'studenti universitari' };

/**
 * @param snap  { ref, at, result, market?, prices, parametri }
 *   result   = l'uscita di conto() congelata alla richiesta
 *   market   = la riga del Perito (marketFor) o null
 *   prices   = CONTO.PRICES
 *   parametri= CONTO.PARAMETRI (i nomi delle 20 dotazioni)
 * @returns Uint8Array
 */
export async function buildContoPdf(snap) {
  const r = snap.result;
  if (!r || !r.ok) throw new Error('conto_non_valido');
  const pdf = await PDFDocument.create();
  pdf.setTitle(wa(`Il conto della sua casa — ${r.zone.label}`));
  pdf.setAuthor('BOOM — Egidi Immobiliare S.r.l.');
  pdf.setSubject('Stima del canone concordato sulle tabelle dell\'Accordo territoriale di Roma');
  const b = await brandAssets(pdf);
  const { font, bold } = b;
  const day = romeDate(snap.at);
  const P = snap.prices || {};

  let page, y;
  const T = (t, x, yy, size, f = font, color = INK, cs = 0) =>
    page.drawText(wa(t), { x, y: yy, size, font: f, color, characterSpacing: cs });
  const TR = (t, xr, yy, size, f = font, color = INK) => {
    const s = wa(t);
    page.drawText(s, { x: xr - f.widthOfTextAtSize(s, size), y: yy, size, font: f, color });
  };
  const wrap = (text, size, maxW, f = font) => {
    const out = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const w of wa(para).split(/\s+/).filter(Boolean)) {
        const t = line ? line + ' ' + w : w;
        if (f.widthOfTextAtSize(t, size) > maxW && line) { out.push(line); line = w; } else line = t;
      }
      out.push(line);
    }
    return out;
  };
  const para = (text, size = 9.5, color = INK, f = font, lh = 1.42, x = M, maxW = W - 2 * M) => {
    const lines = wrap(text, size, maxW, f);
    ensure(lines.length * size * lh + 2);
    for (const l of lines) { T(l, x, y, size, f, color); y -= size * lh; }
    return lines.length;
  };
  const kicker = (t) => { ensure(40); y -= 6; T(t.toUpperCase(), M, y, 7.5, bold, GOLD, 1.6); y -= 6; page.drawRectangle({ x: M, y, width: W - 2 * M, height: 0.5, color: HAIR }); y -= 15; };
  function newPage(title) {
    page = pdf.addPage([W, H]);
    y = masthead(page, b, { W, H, M, title, date: day });
  }
  function ensure(h) { if (y - h < BOTTOM) newPage('Il conto della sua casa'); }

  // ─── Pagina 1: il conto ────────────────────────────────────────────────
  newPage('Il conto della sua casa');
  T('CANONE CONCORDATO · ROMA', M, y, 7.5, bold, GOLD, 1.8); y -= 26;
  T(`${r.zone.label} (${r.zone.cod})`, M, y, 22, bold); y -= 18;
  T(`${mqs(r.input.mq)} mq calpestabili · superficie convenzionale ${dec(r.sc)} mq · contratto ${TIPO[r.tipo] || r.tipo}`, M, y, 9.5, font, GREY);
  y -= 22;

  // Il numero
  const boxH = r.declared ? 96 : 112;
  page.drawRectangle({ x: M, y: y - boxH, width: W - 2 * M, height: boxH, color: PAPER });
  page.drawRectangle({ x: M, y: y - boxH, width: 3, height: boxH, color: GOLD });
  const bx = M + 18;
  if (r.declared) {
    T('MASSIMO A CANONE CONCORDATO', bx, y - 20, 7.5, bold, GOLD, 1.6);
    const big = eur(r.max);
    T(big, bx, y - 58, 36, bold);
    T('al mese', bx + bold.widthOfTextAtSize(wa(big), 36) + 8, y - 58, 12, font, GREY);
    T(`Fascia ${r.fascia} · ${r.nP} dotazioni su 20 · minimo di fascia ${eur(r.min)} al mese`, bx, y - 78, 9, font, GREY);
  } else {
    T('IL MASSIMO, SECONDO LE DOTAZIONI DELLA CASA', bx, y - 20, 7.5, bold, GOLD, 1.6);
    const colW = (W - 2 * M - 36) / 3;
    [['A', 'meno di 3 dotazioni'], ['B', `da ${r.soglie.B} dotazioni`], ['C', `da ${r.soglie.C} dotazioni`]].forEach(([f, sub], i) => {
      const x = bx + i * colW;
      const v = r.fasce[f];
      T(`FASCIA ${f}`, x, y - 42, 7.5, bold, GREY, 1.2);
      T(v ? eur(v.max) : '—', x, y - 70, v ? 24 : 18, bold, v ? INK : FAINT);
      T(v ? sub : 'non applicabile', x, y - 86, 8.5, font, GREY);
    });
    T('al mese, massimo di ciascuna fascia', bx, y - 102, 8, font, FAINT);
  }
  y -= boxH + 16;

  if (!r.normale) para('Stato di manutenzione dichiarato non normale: per l\'Accordo la casa resta in fascia A, qualunque siano le dotazioni.', 9, GREY);
  if (r.pct > 0) para('Le maggiorazioni (transitorio, classe energetica, attico, arredo…) non superano il massimo di fascia: è la regola dell\'Accordo, e il conto la applica.', 9, GREY);
  if (r.pct < 0) para(`Riduzioni dichiarate: ${(r.note || []).filter((n) => /−|-/.test(n)).join(', ')}. Il massimo le tiene già in conto.`, 9, GREY);
  if (!r.declared) para('Le dotazioni sono le 20 voci dell\'Accordo (posto auto, ascensore, doppi vetri, porta blindata…). Il numero che conta è quante ne ha la casa: dichiarandole sul sito, il conto sceglie la fascia e calcola il netto.', 9, GREY);

  // Cosa resta a lei
  if (r.declared) {
    kicker('Cosa resta a lei, con la cedolare secca al 10%');
    const row = (l, v, strong) => {
      ensure(18);
      T(l, M, y, 10, strong ? bold : font, strong ? INK : GREY);
      TR(v, W - M, y, 10.5, strong ? bold : font, INK);
      y -= 8; page.drawRectangle({ x: M, y, width: W - 2 * M, height: 0.4, color: HAIR }); y -= 12;
    };
    row('Canone annuo al massimo', eur(r.annuo));
    row('Cedolare secca al 10%', '− ' + eur(r.cedolare));
    row('Resta a lei, prima di condominio e spese', eur(r.netto) + ' l\'anno', true);
    if (r.imuRisparmio) row(`IMU: riduzione del 25% (su ${eur(r.input.imu)} l'anno dichiarati)`, '+ ' + eur(r.imuRisparmio) + ' l\'anno');
    y -= 2;
    if (r.pareggioLibero) para(`Il confronto col libero: un 4+4 a cedolare 21% le renderebbe di più solo sopra ${eur(r.pareggioLibero)} al mese, a parità di altri costi.`, 9.5, INK, bold);
    para('La cedolare al 10% vale per il locatore persona fisica, con contratto concordato registrato e attestazione di rispondenza; con la cedolare non si pagano registro e bollo e il canone non si aggiorna con l\'ISTAT. La riduzione IMU chiede il contratto registrato e la dichiarazione IMU entro il 30 giugno dell\'anno dopo.', 8.5, GREY);
  } else {
    kicker('Cosa resta a lei');
    para(`Con la cedolare secca al 10% le resta il 90% del canone, prima di condominio e spese: in fascia A, ${eur(Math.round(r.fasce.A.max * 12 * 0.9))} l'anno. La cedolare al 10% vale per il locatore persona fisica, con contratto concordato registrato e attestazione di rispondenza.`, 9.5, INK);
  }

  // La sua cifra
  if (r.ask) {
    kicker('La cifra che aveva in mente');
    const a = r.ask;
    let t;
    if (r.declared) {
      t = a.fits
        ? `${eur(a.value)} al mese rientra nel massimo (${eur(r.max)}): a canone concordato si può chiedere.`
        : `${eur(a.value)} al mese è ${eur(a.excess)} sopra il massimo (${eur(r.max)}). A canone concordato la parte eccedente è nulla (art. 13 L. 431/98) e l'attestazione non si rilascia: o si scende al massimo, o si valuta il libero.`;
    } else if (a.need === 0) t = `${eur(a.value)} al mese rientra già nel massimo della fascia A.`;
    else if (a.need != null) t = `${eur(a.value)} al mese chiede la fascia ${a.need === r.soglie.B ? 'B' : 'C'}: almeno ${a.need} dotazioni dell'Accordo. Dichiari solo quelle che la casa ha davvero: una dotazione che non c'è fa restituire l'eccedenza all'inquilino.`;
    else t = `${eur(a.value)} al mese è ${eur(a.excess)} sopra anche il massimo più alto della zona: a canone concordato non si può chiedere. Si valuta il libero.`;
    para(t, 9.5);
  }

  // Il mercato
  if (snap.market) {
    const mk = snap.market;
    kicker('Il mercato, per confronto');
    para(`In zona ${mk.name} gli annunci chiedono in mediana ${dec(mk.median)} € al mq al mese` +
      (mk.p25 && mk.p75 ? ` (metà fra ${dec(mk.p25)} e ${dec(mk.p75)})` : '') +
      `, su ${mk.sample} annunci rilevati da BOOM. Sono prezzi CHIESTI su superficie commerciale, non canoni firmati: non si confrontano uno a uno con la superficie convenzionale dell'Accordo.`, 9, GREY);
  }

  // Il passo dopo
  kicker('Il passo dopo');
  para(`Casa libera — la affittiamo noi. Nella prima locazione ${eur(0)} di provvigione per lei: paga solo le pratiche del contratto, ${eur(P.primaLocazione)} IVA inclusa con l'attestazione di rispondenza (${eur(P.registrazione)} senza).`, 9.5);
  y -= 3;
  para(`Inquilino già trovato — Pacchetto canone concordato, ${eur(P.pacchetto)} IVA inclusa: verifica del canone, contratto conforme, pratica di attestazione e registrazione. La tariffa dell'organizzazione che firma l'attestazione è a parte e gliela diciamo prima; se la casa non può rientrare in fascia, i ${eur(P.pacchetto)} le tornano indietro.`, 9.5);
  y -= 6;
  para('Valentino, fondatore di BOOM — +39 331 325 1961 · boomrome.com/owners', 9.5, INK, bold);

  // ─── Pagina 2: la scheda di calcolo ────────────────────────────────────
  newPage('La scheda di calcolo');
  T('COME SI ARRIVA AL NUMERO', M, y, 7.5, bold, GOLD, 1.8); y -= 24;

  kicker('1 · Superficie convenzionale');
  // La regola del coefficiente è TESTO del motore («× 1,15 (max 70,00)»):
  // si stampa così, mai riletta come numero.
  const cMq = M + 255, cCoef = M + 385, cVal = W - M;
  T('Voce', M, y, 8, bold, GREY); TR('mq', cMq, y, 8, bold, GREY);
  TR('coefficiente', cCoef, y, 8, bold, GREY); TR('mq convenzionali', cVal, y, 8, bold, GREY);
  y -= 14;
  for (const p of r.parts || []) {
    ensure(16);
    T(p.n, M, y, 9.5); TR(mqs(p.mq), cMq, y, 9.5);
    TR(String(p.c || ''), cCoef, y, 9.5); TR(dec(p.v), cVal, y, 9.5);
    y -= 7; page.drawRectangle({ x: M, y, width: W - 2 * M, height: 0.4, color: HAIR }); y -= 11;
  }
  T('Superficie convenzionale', M, y, 10, bold); TR(dec(r.sc) + ' mq', cVal, y, 10, bold); y -= 16;
  para('Coefficienti della scheda di calcolo dell\'Accordo: l\'alloggio sotto i 46 mq e fino a 70 mq si maggiora (con un tetto), le pertinenze contano in parte.', 8.5, GREY);

  kicker('2 · Le dotazioni e la fascia');
  if (r.declared) {
    const names = (r.input.p || []).map((i) => (snap.parametri || [])[i]).filter(Boolean);
    para(names.length ? `Dichiarate (${r.nP} su 20): ${names.join(' · ')}.` : 'Nessuna dotazione dichiarata (0 su 20).', 9.5);
    para(`Fascia ${r.fascia}${r.normale ? '' : ' (stato di manutenzione non normale)'}.`, 9.5, INK, bold);
  } else {
    para('Non dichiarate: il conto mostra il massimo di ciascuna fascia.', 9.5);
  }
  para(`Soglie dell'Accordo: fascia A con meno di ${r.soglie.B} dotazioni, B da ${r.soglie.B}, C da ${r.soglie.C}, con stato di manutenzione normale (altrimenti fascia A).`, 8.5, GREY);

  kicker(`3 · I valori della zona ${r.zone.cod}`);
  for (const f of ['A', 'B', 'C']) {
    const v = r.fasce[f];
    ensure(16);
    T(`Fascia ${f}`, M, y, 9.5, r.fascia === f ? bold : font);
    TR(v ? `da ${dec(v.fMin)} a ${dec(v.fMax)} € al mq al mese` : 'non applicabile', W - M, y, 9.5, r.fascia === f ? bold : font);
    y -= 7; page.drawRectangle({ x: M, y, width: W - 2 * M, height: 0.4, color: HAIR }); y -= 11;
  }

  kicker('4 · Il calcolo');
  if (r.declared) {
    para(`${dec(r.sc)} mq convenzionali × ${dec(r.fMax)} € (massimo della fascia ${r.fascia}) = ${eur(Math.floor(r.fMax * r.sc + 1e-9))} al mese.`, 9.5);
    if (r.pct < 0) para(`Con le riduzioni (${Math.abs(r.pct)}% in meno): ${eur(r.max)} al mese.`, 9.5);
    if (r.note && r.note.length) para(`Variazioni dichiarate: ${r.note.join(', ')}.`, 9.5);
    if (r.capApplied || r.pct > 0) para('Gli aumenti si fermano al massimo di fascia: è la regola dell\'Accordo.', 9.5, GREY);
    para(`Massimo: ${eur(r.max)} al mese · minimo di fascia: ${eur(r.min)} al mese.`, 10, INK, bold);
  } else {
    // Con una riduzione dichiarata il massimo NON è sc × fMax: si scrive il
    // passaggio, altrimenti la riga stampa un conto che non torna.
    const red = r.pct < 0 ? ` × (1 − ${Math.abs(r.pct)}%)` : '';
    for (const f of ['A', 'B', 'C']) {
      const v = r.fasce[f];
      if (v) para(`Fascia ${f}: ${dec(r.sc)} mq × ${dec(v.fMax)} €${red} = ${eur(v.max)} al mese.`, 9.5);
    }
    if (r.pct < 0) para(`Variazioni dichiarate: ${(r.note || []).join(', ')}.`, 9, GREY);
    else if (r.pct > 0) para('Le maggiorazioni dichiarate non superano il massimo di fascia: è la regola dell\'Accordo.', 9, GREY);
  }
  if (r.sameAcrossTipi) para('Lo stesso massimo vale per il 3+2, il transitorio e il contratto per studenti: le maggiorazioni non superano il massimo di fascia.', 8.5, GREY);
  else para(`Per tipo di contratto: 3+2 ${eur(r.perTipo['32'])} · transitorio ${eur(r.perTipo.trans)} · studenti ${eur(r.perTipo.stud)} al mese.`, 8.5, GREY);

  kicker('La fonte');
  para('Tabelle dell\'Accordo territoriale per il Comune di Roma depositato il 27/07/2023 (prot. RA/2023/0044852). I valori di fascia possono essere stati aggiornati: il massimo lo conferma l\'organizzazione firmataria che rilascia l\'attestazione di rispondenza, sulla scheda di calcolo e sui documenti dell\'immobile (visura, planimetria, APE).', 8.5, GREY);

  // «Cosa non è», su ogni pagina, sopra il piede legale.
  const disc = `Stima su dati dichiarati dal proprietario il ${day}, non verificati: non è l'attestazione di rispondenza né una perizia.${snap.ref ? ' · Rif. ' + snap.ref : ''}`;
  for (const pg of pdf.getPages()) {
    pg.drawRectangle({ x: M, y: 66, width: W - 2 * M, height: 0.4, color: HAIR });
    pg.drawText(wa(disc), { x: M, y: 56, size: 7.2, font, color: GREY });
  }
  stampFooters(pdf, b, { W, M });
  return pdf.save();
}
