// api/documents/demand-letter.js
// LA LETTERA CHE FA TORNARE IL DEPOSITO — gratis, e in italiano legale.
//
// "Landlord won't return deposit Italy" è una delle ricerche più disperate e
// più costanti del nostro mercato, e non ha un buon risultato: l'expat che ha
// lasciato Roma sa cosa vuole dire ma non sa DIRLO in italiano, e una email in
// inglese a un locatore italiano viene ignorata senza sforzo.
//
// Questo genera la messa in mora vera: intestazione, fatti, richiamo all'art.
// 1590 c.c., termine di 15 giorni, riserva di agire. Interfaccia in inglese
// (chi la usa non parla italiano), DOCUMENTO in italiano (chi lo riceve non
// parla inglese). È il gemello inglese di /canone: uno strumento vero,
// gratuito, che vende il servizio dietro — chi non se la cava da solo passa a
// Deposit Recovery.
//
// Non è consulenza legale e il PDF lo dice: BOOM è un'agenzia autorizzata, non
// uno studio legale. Un modello ben fatto non diventa un parere per il fatto
// di essere utile.
//
// Method: POST · body { tenantName, tenantAddress?, landlordName,
//   landlordAddress?, propertyAddress, depositEur, endDate, returnedEur?,
//   reason?, email?, lang?, company(honeypot) }
// → 200 application/pdf

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { fsCreate, logActivity } from '../homie/_lib.js';

const HITS = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 6;
function rateLimited(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter(t => now - t < WINDOW_MS);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 5000) for (const k of [...HITS.keys()].slice(0, 1000)) HITS.delete(k);
  return arr.length > MAX_PER_WINDOW;
}

const clip = (v, n = 200) => (v == null ? '' : String(v).trim().slice(0, n));
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// WinAnsi safety — la lezione del certificato FES: un solo carattere fuori
// tabella uccide TUTTE le generazioni, non solo quella riga.
function wa(s) {
  return String(s == null ? '' : s)
    .replace(/[→➔➡]/g, '->')
    .replace(/[✓✔☑☒]/g, 'X')
    .replace(/−/g, '-')
    .replace(/[^\x20-\xFF–—‘’“”…€]/g, '');
}

// Formattazione ESPLICITA, non toLocaleString: i build di Node con ICU
// ridotto accettano 'it-IT' ma non raggruppano le migliaia, quindi lo stesso
// documento uscirebbe "EUR 3360,00" in un ambiente e "EUR 3.360,00" in un
// altro. In un atto che qualcuno manda per raccomandata l'importo si scrive
// in un modo solo, sempre.
export function eur(n) {
  const v = Math.max(0, Number(n) || 0);
  const [int, dec] = v.toFixed(2).split('.');
  return 'EUR ' + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
}
const dIT = (s) => {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

/**
 * Il corpo della lettera. Esportato e testato perché è la parte che deve
 * essere GIUSTA: un termine sbagliato o un articolo citato male trasforma una
 * messa in mora in una email lunga.
 */
export function letterBody(d) {
  const trattenuto = Math.max(0, (Number(d.depositEur) || 0) - (Number(d.returnedEur) || 0));
  const p = [];
  p.push(`Il/La sottoscritto/a ${d.tenantName}${d.tenantAddress ? `, domiciliato/a in ${d.tenantAddress}` : ''}, in qualita' di conduttore dell'immobile sito in ${d.propertyAddress},`);
  p.push('PREMESSO CHE');
  p.push(`- il rapporto di locazione relativo al suddetto immobile e' cessato in data ${dIT(d.endDate)}, con riconsegna dell'immobile al locatore;`);
  p.push(`- all'atto della stipula il conduttore ha versato a titolo di deposito cauzionale la somma di ${eur(d.depositEur)};`);
  if (Number(d.returnedEur) > 0) {
    p.push(`- alla data odierna il locatore ha restituito unicamente ${eur(d.returnedEur)}, trattenendo pertanto ${eur(trattenuto)};`);
  } else {
    p.push('- alla data odierna il locatore non ha provveduto ad alcuna restituzione del deposito cauzionale;');
  }
  p.push('- non e\' stata fornita alcuna documentazione idonea a giustificare la ritenuta, ne\' un dettaglio analitico di eventuali danni eccedenti il normale deterioramento d\'uso;');
  p.push('CONSIDERATO CHE');
  p.push('- ai sensi dell\'art. 1590 del Codice Civile il conduttore deve restituire la cosa locata nello stato medesimo in cui l\'ha ricevuta, salvo il deterioramento o il consumo risultante dall\'uso della cosa in conformita\' del contratto;');
  p.push('- il deposito cauzionale ha natura di garanzia e, cessato il rapporto e in assenza di danni provati e quantificati, deve essere integralmente restituito, oltre agli interessi legali maturati;');
  p.push('- e\' onere del locatore provare l\'esistenza e l\'entita\' di eventuali danni eccedenti il normale uso, non essendo sufficienti contestazioni generiche;');
  p.push('TUTTO CIO\' PREMESSO, IL SOTTOSCRITTO');
  p.push(`INTIMA E DIFFIDA formalmente ${d.landlordName} a provvedere, entro e non oltre 15 (quindici) giorni dal ricevimento della presente, alla restituzione della somma di ${eur(trattenuto)}, oltre interessi legali dalla data di cessazione del rapporto al saldo effettivo.`);
  p.push('In difetto, il sottoscritto si vedra\' costretto ad adire le competenti sedi giudiziarie per la tutela dei propri diritti, con ogni conseguenza in ordine a spese, competenze e onorari, nonche\' al risarcimento degli ulteriori danni subiti.');
  p.push('La presente vale altresi\' quale atto interruttivo della prescrizione e costituzione in mora ai sensi e per gli effetti degli artt. 1219 e 2943 del Codice Civile.');
  if (d.reason) p.push(`Si precisa inoltre quanto segue: ${d.reason}`);
  p.push('Si resta in attesa di un cortese quanto sollecito riscontro.');
  p.push('Distinti saluti.');
  return p;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'no_body' });
  if (body.company) return res.status(400).json({ ok: false, error: 'no_body' }); // honeypot

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ ok: false, error: 'rate_limited' });

  const d = {
    tenantName: clip(body.tenantName, 120),
    tenantAddress: clip(body.tenantAddress, 200),
    landlordName: clip(body.landlordName, 120),
    landlordAddress: clip(body.landlordAddress, 200),
    propertyAddress: clip(body.propertyAddress, 200),
    depositEur: Math.max(0, Math.min(100000, Number(body.depositEur) || 0)),
    returnedEur: Math.max(0, Math.min(100000, Number(body.returnedEur) || 0)),
    endDate: clip(body.endDate, 10),
    reason: clip(body.reason, 500),
  };
  if (!d.tenantName || !d.landlordName || !d.propertyAddress || !d.depositEur || !/^\d{4}-\d{2}-\d{2}$/.test(d.endDate)) {
    return res.status(400).json({ ok: false, error: 'missing_fields' });
  }
  if (d.returnedEur >= d.depositEur) {
    return res.status(400).json({ ok: false, error: 'nothing_withheld' });
  }

  // Il lead: chi genera la lettera ha un problema vivo e un importo in ballo.
  // Best-effort — un errore di scrittura non deve MAI impedire a una persona
  // di ottenere la lettera che le serve.
  if (EMAIL_RE.test(clip(body.email, 160))) {
    const now = new Date();
    const withheld = d.depositEur - d.returnedEur;
    fsCreate('leads', {
      source: 'web', service: null,
      name: d.tenantName, email: clip(body.email, 160), phone: null,
      message: `Demand letter generated - deposito ${eur(d.depositEur)}, trattenuto ${eur(withheld)}, fine locazione ${dIT(d.endDate)}, immobile ${d.propertyAddress}`,
      notes: null, language: null, budget: null, zone: null, situation: null,
      propertyId: null, propertyTitle: null, propertyPrice: null, propertyAddress: d.propertyAddress,
      intakeForm: false, status: 'new', grade: null, intent: 'deposit-recovery',
      confidence: null, tier: null, ingestedBy: 'demand-letter', sourceRef: '1590-letter',
      raw: { withheldEur: withheld, ip, ua: clip(req.headers['user-agent'], 300) },
      createdAt: now, ingestedAt: now,
    }).then(({ id }) => {
      logActivity(`1590 letter: ${d.tenantName} (${eur(withheld)})`, 'lead', { leadId: id }, 'web').catch(() => {});
    }).catch(e => console.error('[demand-letter] lead write:', e.message));
  }

  try {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const ink = rgb(0.06, 0.06, 0.07);
    const grey = rgb(0.42, 0.42, 0.44);

    let page = pdf.addPage([595, 842]); // A4
    const M = 62, W = 595 - M * 2;
    let y = 842 - M;

    const T = (t, x, yy, sz, f, col) => page.drawText(wa(t), { x, y: yy, size: sz, font: f || font, color: col || ink });
    const newPage = () => { page = pdf.addPage([595, 842]); y = 842 - M; };
    // testo giustificato a capo automatico
    const para = (t, sz = 10.5, f = font, gap = 7) => {
      const words = wa(t).split(/\s+/);
      let line = '';
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (f.widthOfTextAtSize(test, sz) > W) {
          if (y < M + 40) newPage();
          T(line, M, y, sz, f); y -= sz + 3.2;
          line = w;
        } else line = test;
      }
      if (line) { if (y < M + 40) newPage(); T(line, M, y, sz, f); y -= sz + 3.2; }
      y -= gap;
    };

    // ── intestazione
    T('RACCOMANDATA A.R. / PEC', M, y, 9, bold, grey); y -= 26;
    T('Mittente:', M, y, 9, bold, grey); y -= 13;
    T(d.tenantName, M, y, 10.5, bold); y -= 13;
    if (d.tenantAddress) { T(d.tenantAddress, M, y, 10); y -= 13; }
    y -= 12;
    T('Destinatario:', M, y, 9, bold, grey); y -= 13;
    T('Egr. Sig./Sig.ra ' + d.landlordName, M, y, 10.5, bold); y -= 13;
    if (d.landlordAddress) { T(d.landlordAddress, M, y, 10); y -= 13; }
    y -= 20;

    const oggetto = `OGGETTO: diffida e messa in mora - restituzione deposito cauzionale - immobile sito in ${d.propertyAddress}`;
    para(oggetto, 10.5, bold, 16);

    for (const p of letterBody(d)) {
      const isHeading = /^[A-Z' ,]+$/.test(p.replace(/[0-9]/g, '')) && p.length < 60;
      para(p, isHeading ? 10.5 : 10.5, isHeading ? bold : font, isHeading ? 10 : 7);
    }

    y -= 14;
    if (y < M + 70) newPage();
    T('Luogo e data: ______________________', M, y, 10); y -= 30;
    T('Firma', M, y, 10, bold); y -= 30;
    T('_______________________________', M, y, 10);

    // ── piè di pagina su ogni pagina: il disclaimer che tiene onesto il tutto
    const pages = pdf.getPages();
    for (const pg of pages) {
      pg.drawText(wa('Modello fornito gratuitamente da BOOM Rome (Egidi Immobiliare S.r.l.) - www.boomrome.com'),
        { x: M, y: 40, size: 7.5, font, color: grey });
      pg.drawText(wa('Non costituisce parere legale. BOOM e\' un\'agenzia immobiliare autorizzata, non uno studio legale.'),
        { x: M, y: 30, size: 7.5, font, color: grey });
    }

    const buf = Buffer.from(await pdf.save());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="diffida-deposito-cauzionale.pdf"');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(buf);
  } catch (e) {
    console.error('[demand-letter] pdf failed:', e.message);
    return res.status(500).json({ ok: false, error: 'pdf_failed' });
  }
}
