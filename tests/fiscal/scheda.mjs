// La Scheda di calcolo del canone — Allegato 2/B, 1:1 col modulo ARPE.
//
// Tre cose che devono restare vere:
//  1. OGNI etichetta che la pagina stampa esiste, parola per parola, nel
//     .docx del modulo (reference/caf/2023_scheda_calcolo_canone_ARPE.docx):
//     e' l'anti-deriva fra il nostro PDF e il foglio che ARPE riconosce.
//     L'unico scostamento ammesso e' il refuso del pie' di pagina ("VALIDI"),
//     dichiarato nel modulo stesso.
//  2. I FATTI stampati escono da schedaFacts(), pura: parametri derivati
//     dalle dotazioni vere, pertinenze coi coefficienti del modulo, la
//     subfascia, il calcolo riga per riga, i due importi — e SENZA zona o
//     mq il foglio resta un modulo vuoto onesto (mai una stima).
//  3. Il PDF a se' stante e' UNA pagina A4 e stampa davvero quelle parole
//     (si gonfia il content stream e si cercano i byte WinAnsi).
import { readFileSync } from 'node:fs';
import { inflateRawSync, inflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import { schedaFacts, buildSchedaPdf, resolveCanoneInput, SCHEDA_TEXT } from '../../api/fiscal/fascicolo.js';
import CANONE from '../../js/canone-engine.js';

let pass = 0, fail = 0;
const check = (name, ok, extra) => { if (ok) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ FAIL ' + name + (extra ? ' — ' + extra : '')); } };
const near = (a, b, eps = 0.01) => Math.abs(Number(a) - Number(b)) < eps;

// ── Il modulo: testo del .docx (zip con deflate) ──
function unzip(buf) {
  const out = {}; let o = 0;
  while (o + 4 <= buf.length && buf.readUInt32LE(o) === 0x04034b50) {
    const method = buf.readUInt16LE(o + 8), nameLen = buf.readUInt16LE(o + 26), extraLen = buf.readUInt16LE(o + 28);
    const csize = buf.readUInt32LE(o + 18);
    const name = buf.slice(o + 30, o + 30 + nameLen).toString('utf8');
    const data = buf.slice(o + 30 + nameLen + extraLen, o + 30 + nameLen + extraLen + csize);
    out[name] = method === 8 ? inflateRawSync(data) : data;
    o = o + 30 + nameLen + extraLen + csize;
  }
  return out;
}
const norm = (s) => String(s).replace(/[’‘']/g, '’').replace(/\s+/g, ' ').trim();
const docx = unzip(readFileSync(new URL('../../reference/caf/2023_scheda_calcolo_canone_ARPE.docx', import.meta.url)));
const xmlText = (name) => (docx[name] ? docx[name].toString('utf8') : '')
  .replace(/<w:tab\/>/g, ' ').replace(/<w:br\/>/g, ' ')
  .replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const MODULO = norm(['word/header1.xml', 'word/header2.xml', 'word/document.xml', 'word/footer1.xml', 'word/footer2.xml', 'word/footer3.xml'].map(xmlText).join('\n'));
// Un paragrafo del modulo puo' spezzare una frase in piu' run: si confronta
// sul testo appiattito, senza spazi doppi.
const inModulo = (t) => MODULO.replace(/ /g, '').includes(norm(t).replace(/ /g, ''));

console.log('\n── 1. Ogni etichetta stampata sta nel modulo ARPE ──');
{
  const T = SCHEDA_TEXT;
  const labels = [
    T.header, T.title1, T.title2, ...T.tipi.map(x => x.replace('3+2', '_+2')), ...T.parti, ...T.riga, T.dichiarazione,
    T.hSuperficie, T.calpestabile, ...T.brackets, ...T.pertinenze.map(r => r[1]), ...T.pertinenze.map(r => r[2]),
    T.totale.replace('Mq.', ''), T.caratteristiche, ...T.caratt, T.normale, T.si, T.no, T.hParametri, T.nParametri,
    T.hMagg, ...T.magg.flat().filter(Boolean).map(m => m[1]),
    T.zona, T.fascia, T.parN, T.subfascia, T.valore, T.calcolo, T.mqMese, T.xmq, T.durata, T.transitorio, T.vincolato,
    T.importoMax, T.importoPatt, ...T.firme, T.footerOriginale, ...CANONE.PARAMETRI,
  ];
  const missing = labels.filter(l => !inModulo(l));
  check(`${labels.length} etichette del PDF trovate parola per parola nel .docx del modulo`, missing.length === 0, missing.join(' | '));
  check('il refuso del modulo ("VALIDI") e\' l\'unico scostamento, dichiarato', inModulo(T.footerOriginale) && !inModulo(T.footer)
    && T.footer.replace('VALIDA', 'VALIDI') === T.footerOriginale);
  check('il modulo e\' quello caricato dall\'operatore (Allegato 2/B, 25/07/2023, "Tutte le informazioni…")',
    inModulo('Allegato 2/B') && inModulo('25/07/2023') && inModulo('sono state fornite dalle parti'));
  // Mutazione: una etichetta inventata NON passa (altrimenti il check 1 non
  // proverebbe niente).
  check('mutazione: una etichetta inventata non e\' nel modulo', !inModulo('Superficie utile calpestabile') && !inModulo('Box / posto auto esclusivo'));
}

console.log('\n── 2. I fatti: dal contratto al foglio ──');
const contract = { type: 'transitorio', rent: 1450, landlordName: 'Mario Bianchi', landlordCF: 'BNCMRA60A01H501Y',
  tenantName: 'Anna Rossi', tenantCF: 'RSSNNA90A41H501X', energyClass: 'E' };
const property = { address: 'Via della Lungaretta 12', city: 'Roma', zone: 'Trastevere', sqm: 80, floor: '3',
  cadastralData: 'Foglio 123 Part. 45 Sub 6', features: ['ascensore', 'aria condizionata', 'balcone', 'doppi vetri', 'porta blindata'], furnished: true };
function facts(c, p, saved) {
  const input = resolveCanoneInput({ contract: { ...c, canoneScheda: saved || null }, property: p, listing: null, cfg: undefined });
  const calc = input.zona && input.mq > 0 ? CANONE.solve(input) : { ok: false, error: !input.zona ? 'zona_non_trovata' : 'mq_mancanti' };
  return schedaFacts({ contract: c, property: p, calc, input });
}
{
  const f = facts(contract, property, { mqBal: 8, mqBox: 14, boxPre: false });
  check('zona dall\'immobile: B14 TRASTEVERE, fascia di oscillazione 12,60 / 26,40', f.has && f.zona && f.zona.cod === 'B14' && near(f.zona.min, 12.6) && near(f.zona.max, 26.4));
  check('tipo: transitorio spuntato', f.tipo === 'trans');
  check('parti: nome + C.F. sulle righe LOCATORE/CONDUTTORE', /Mario Bianchi — C\.F\. BNCMRA60A01H501Y/.test(f.locatore) && /Anna Rossi/.test(f.conduttore));
  check('Via senza il tipo di strada (il modulo lo stampa gia\'), Città ROMA', f.via === 'della Lungaretta 12' && f.citta === 'ROMA');
  check('Id. catastale F/P/S letto dal blob catastale', f.cat.f === '123' && f.cat.p === '45' && f.cat.s === '6');
  check('80 mq → riga 70-120 (x 1,00), base 80,00', f.bracket === 2 && near(f.base0, 80));
  const box = f.pertinenze.find(r => r.key === 'box'), pre = f.pertinenze.find(r => r.key === 'boxPre'), bal = f.pertinenze.find(r => r.key === 'bal');
  check('pertinenze coi coefficienti del modulo: box 14 x 0,50 = 7,00 · balcone 8 x 0,25 = 2,00 · zona pregio vuota',
    near(box.v, 7) && near(bal.v, 2) && pre.mq === 0 && f.pertinenze.length === 6);
  check('TOTALE superficie convenzionale 89,00 = quella del motore', near(f.scTotal, 89) && near(f.sc, 89));
  check('parametri DERIVATI dalle dotazioni vere: 5 (balcone, aria, ascensore, blindata, doppi vetri)', f.nP === 5 && [3, 5, 6, 8, 9].every(i => f.parIdx.includes(i)));
  check('maggiorazione H (classe E) spuntata, SI acceso', f.mag.length === 1 && f.mag[0] === 'clD' && f.magAny === true);
  check('subfascia MEDIA (5 parametri ≥ 3) 15,40 / 22,00, valore applicato 22,00', f.sub && f.sub.name === 'media' && near(f.sub.min, 15.4) && near(f.sub.max, 22) && near(f.sub.val, 22));
  check('CALCOLO DEL CANONE: 22,00 x 89,00 = 1.958,00', near(f.base, 1958));
  check('Transitorio + 10% = 2.153,80 sulla riga, ma il massimo resta al tetto di fascia (regola dell\'accordo, dichiarata)',
    near(f.transVal, 2153.8) && near(f.cMax, 1958) && f.capApplied === true);
  check('Importo pattuito 1.450,00 → rientra', f.pattuito === 1450 && f.fits === true && f.excess === 0);
  check('Durata: niente (non e\' un 3+2)', f.pDur === 0 && f.durataVal === null);

  const fuori = facts({ ...contract, rent: 2500 }, property, null);
  check('canone pattuito sopra il massimo: fits=false con lo sforamento esatto, mai nascosto', fuori.fits === false && near(fuori.excess, 2500 - fuori.cMax));

  const stud = facts({ ...contract, type: 'studenti' }, property, null);
  check('studenti: casella Studenti, NESSUN +10% transitorio', stud.tipo === 'stud' && stud.transPct === 0 && stud.transVal === null);

  const tre2 = facts({ ...contract, type: '32' }, property, null);
  check('3+2: casella 3+2 e Durata solo se pDur e\' calibrato (default 0 → riga vuota)', tre2.tipo === '32' && tre2.pDur === 0);
}

console.log('\n── 3. Senza zona o mq: un modulo vuoto onesto, mai una stima ──');
{
  const f = facts({ ...contract }, { ...property, zone: 'Boh', sqm: 0, cadastralData: '' }, null);
  check('nessuna zona: COD. ZONA vuoto, nessuna fascia, nessun calcolo', !f.has && f.zona === null && f.zonaCod === '' && f.sub === null && f.base === null && f.cMax === null);
  check('"Via della Lungaretta" NON diventa DELLA VITTORIA (stop-word nel match per parola)', CANONE.matchZone('Via della Lungaretta 12') === null);
  check('"Via di Porta Pinciana" NON diventa PORTA PORTESE; "Trastevere Loft" resta B14', CANONE.matchZone('Via di Porta Pinciana 5') === null && CANONE.matchZone('Trastevere Loft').cod === 'B14');
  check('mq mancanti: nessuna riga superficie compilata, totale vuoto', f.bracket === -1 && f.base0 === null && f.scTotal === null);
  check('ma i parametri dalle dotazioni si spuntano comunque (sono fatti, non stime)', f.nP === 5);
  check('catasto vuoto → caselle F/P/S vuote', f.cat.f === '' && f.cat.p === '' && f.cat.s === '');
  const g = facts({ ...contract }, { ...property, zone: 'Boh', cadastralData: '' }, { zonaCod: 'C30' });
  check('zona impostata dalla console (canoneScheda.zonaCod) → C30 PIGNETO', g.has && g.zona.cod === 'C30');
}

console.log('\n── 4. Il PDF a se\' stante: una pagina A4 che stampa quelle parole ──');
{
  const f = facts(contract, property, { mqBal: 8, mqBox: 14, boxPre: false });
  const bytes = await buildSchedaPdf(f);
  const doc = await PDFDocument.load(bytes);
  const pg = doc.getPage(0);
  check('una pagina sola, A4', doc.getPageCount() === 1 && Math.round(pg.getWidth()) === 595 && Math.round(pg.getHeight()) === 842);
  // pdf-lib scrive il testo in esadecimale WinAnsi dentro stream deflate.
  const raw = Buffer.from(bytes);
  let text = '';
  let i = 0;
  while ((i = raw.indexOf('stream\n', i)) !== -1) {
    const start = i + 7; const end = raw.indexOf('endstream', start);
    if (end === -1) break;
    const chunk = raw.slice(start, end);
    try { text += inflateSync(chunk).toString('latin1'); } catch { text += chunk.toString('latin1'); }
    i = end;
  }
  const hexOf = (s) => Buffer.from(s, 'latin1').toString('hex').toUpperCase();
  const printed = (s) => text.toUpperCase().includes(hexOf(s));
  check('stampa: "Allegato 2/B", il titolo del modulo, TRASTEVERE, il canone 1.958,00 e il pie\' di pagina',
    printed('Allegato 2/B') && printed('SCHEDA DI CALCOLO DEL CANONE DELL') && printed('TRASTEVERE') && printed('1.958,00') && printed('SCHEDA NON VALIDA AI FINI'));
  check('NON stampa la testata BOOM ne\' la formula "ATTESTA" dell\'organizzazione (non sono sul modulo)',
    !printed('Fascicolo Fiscale') && !printed('ATTESTA che') && !printed('Organizzazione sindacale'));
}

console.log(`\n${fail ? '\x1b[31m' : '\x1b[32m'}scheda ARPE: ${pass} pass, ${fail} fail\x1b[0m`);
if (fail) process.exit(1);
console.log('\x1b[32mLa scheda che va ad ARPE e\' il modulo di ARPE, compilato — non un documento nostro che gli somiglia.\x1b[0m');
