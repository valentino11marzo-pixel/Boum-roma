// tests/invoice/render.mjs — il PDF fattura, guardato davvero.
//
// Un layout PDF non si verifica rileggendo il codice: si guarda. Questo
// script carica jsPDF e pdf.js VERI in Chromium, costruisce la fattura con
// invBuildPdf() e rasterizza ogni pagina in PNG, poi verifica quello che si
// può verificare a macchina (pagine, testo estratto, niente overflow oltre i
// margini). I PNG restano su disco per l'occhio.
//
//   node tests/invoice/render.mjs [--out DIR]
//
// jsPDF e pdf.js vengono da node_modules e sono serviti in locale: nessuna
// CDN, così il test gira anche dove la policy di rete blocca cdnjs (e non
// misura mai la latenza di un CDN al posto del layout). Cercali dove stanno:
//   npm i jspdf@2.5.1 pdfjs-dist@3.11.174
// oppure BOOM_PDFLIBS=/percorso/che/contiene/node_modules
// Senza playwright-core o senza le librerie, la suite si skippa.

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const PORT = 8919;
const BROWSER = process.env.BOOM_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
// Dove trovare jspdf/pdfjs-dist. Il primo percorso che li contiene vince.
const LIB_ROOTS = [
  ...(process.env.BOOM_PDFLIBS ? [process.env.BOOM_PDFLIBS] : []),
  ROOT,
  join(ROOT, '..'),
  process.env.CLAUDE_SCRATCHPAD || '',
  '/tmp/claude-0/-home-user-Boum-roma/788b3112-f1de-5d6a-a2c0-905df66f450f/scratchpad',
].filter(Boolean);
const outIdx = process.argv.indexOf('--out');
const OUT = outIdx > 0 ? process.argv[outIdx + 1] : join(ROOT, 'tests/invoice/__render');

async function loadChromium() {
  const tries = ['playwright-core', 'playwright',
    ...(process.env.BOOM_PLAYWRIGHT ? [process.env.BOOM_PLAYWRIGHT] : []),
    '/opt/node22/lib/node_modules/playwright/index.js',
    '/opt/node22/lib/node_modules/playwright-core/index.js'];
  for (const t of tries) { try { const m = await import(t); return (m.default || m).chromium; } catch {} }
  return null;
}
const chromium = await loadChromium();
if (!chromium) { console.log('SKIP: playwright-core non disponibile'); process.exit(0); }

// I tre file delle librerie, risolti una volta sola.
const LIBS = { jspdf: null, pdfjs: null, worker: null };
for (const root of LIB_ROOTS) {
  const cand = {
    jspdf: join(root, 'node_modules/jspdf/dist/jspdf.umd.min.js'),
    pdfjs: join(root, 'node_modules/pdfjs-dist/build/pdf.min.js'),
    worker: join(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.js'),
  };
  try {
    for (const k of Object.keys(cand)) await readFile(cand[k]);
    Object.assign(LIBS, cand);
    break;
  } catch {}
}
if (!LIBS.jspdf) {
  console.log('SKIP: jspdf/pdfjs-dist non installati (npm i jspdf@2.5.1 pdfjs-dist@3.11.174, o BOOM_PDFLIBS=<dir>)');
  process.exit(0);
}

const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const p = url.startsWith('/__lib/') ? LIBS[url.slice(7).replace('.js', '')] : join(ROOT, url);
    const body = await readFile(p);
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'text/plain' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise((r) => server.listen(PORT, r));

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log('  \x1b[32m✓\x1b[0m ' + name); pass++; }
  catch (e) { console.log('  \x1b[31m✗\x1b[0m ' + name + '\n      ' + e.message); fail++; }
};
const ok = (v, m) => { if (!v) throw new Error(m || 'atteso true'); };
// I titoli del letterhead BOOM sono spaziati (charSpace), quindi pdf.js li
// restituisce come "T O T A L E". Per cercarli si toglie ogni spazio.
const squash = (s) => String(s).replace(/\s+/g, '');
const hasLabel = (page, label) => squash(page.text).includes(squash(label));

const browser = await chromium.launch({ executablePath: BROWSER, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e) + ' @ ' + String(e.stack || '').split('\n').slice(1,3).join(' | ')));
await page.goto(`http://localhost:${PORT}/tests/invoice/fixture.html`, { waitUntil: 'networkidle' });

// jsPDF e pdf.js VERI al posto degli stub del fixture, serviti in locale.
const LIBS_OK = await page.evaluate(async () => {
  const inject = (src) => new Promise((res) => {
    const s = document.createElement('script'); s.src = src;
    s.onload = () => res(true); s.onerror = () => res(false); document.head.appendChild(s);
  });
  delete window.jspdf;
  const a = await inject('/__lib/jspdf.js');
  const b = await inject('/__lib/pdfjs.js');
  return a && b && !!window.jspdf && !!window.pdfjsLib;
});
if (!LIBS_OK) {
  console.log('SKIP: le librerie PDF non si caricano in pagina');
  await browser.close(); server.close(); process.exit(1);
}

// Fattura realistica: due righe, IVA 22%, bollo assente, causale lunga.
const CASE = {
  docType: 'TD01', number: '12/2026', progressive: 12, year: 2026,
  date: '2026-07-31', dueDate: '2026-08-30', status: 'issued',
  buyer: {
    kind: 'company', name: 'Bellucci Property Holdings S.r.l.', vat: '12345678903',
    address: 'Via Cavour', streetNumber: '128', zip: '00184', city: 'Roma',
    province: 'RM', country: 'IT', sdiCode: 'M5UXCR1',
  },
  lines: [
    { description: 'Provvigione per intermediazione immobiliare — contratto di locazione transitoria, Via dei Coronari 42, Roma', qty: 1, unitPrice: 1383.33, vatRate: 22 },
    { description: 'Servizio Deal Assistance (verifica contrattuale e assistenza alla firma)', qty: 1, unitPrice: 249, vatRate: 22 },
  ],
  payment: { condition: 'TP02', method: 'MP05', iban: 'IT60X0542811101000000123456', bank: 'Intesa Sanpaolo' },
  causale: 'Contratto di locazione transitoria del 15/07/2026 — conduttore Mary Johnson, decorrenza 01/09/2026.',
  withholding: { enabled: false },
  stampDuty: { auto: true, chargedToClient: true },
};

// Emittente forfettario, per la nota "operazione non soggetta a IVA".
const SELLER_RF19 = { name: 'Egidi Immobiliare S.r.l.', vat: '00743110157', regime: 'RF19',
  address: 'Via Nazionale', streetNumber: '12', zip: '00184', city: 'Roma', province: 'RM',
  country: 'IT', iban: 'IT60X0542811101000000123456', reaOffice: 'RM', reaNumber: '1723456' };

await mkdir(OUT, { recursive: true });

async function render(name, inv, seller, builder) {
  const out = await page.evaluate(async ([inv, seller, builder]) => {
    const doc = builder === 'receipt'
      ? window._buildReceiptDoc(inv.pay, inv.c, inv.p, inv.t)
      : window.invBuildPdf(inv, seller || window.invSeller());
    if (!doc) return { error: 'il costruttore ha restituito null' };
    const bytes = doc.output('arraybuffer');
    const pdfjs = window.pdfjsLib;
    pdfjs.GlobalWorkerOptions.workerSrc = '/__lib/worker.js';
    const pdf = await pdfjs.getDocument({ data: bytes }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i);
      const vp = pg.getViewport({ scale: 2 });
      // ATTENZIONE: getTextContent() dà le coordinate in PUNTI PDF, NON
      // scalate col viewport. Dividendo per vp.width (che invece è scalato)
      // le misure uscivano dimezzate a scale 2 — un margine di 16mm letto
      // come 8mm. La conversione va fatta sulla pagina non scalata.
      const PT_W = pg.getViewport({ scale: 1 }).width;   // 595.28 pt = 210 mm
      const mm = (pt) => pt / PT_W * 210;
      const PT_H = pg.getViewport({ scale: 1 }).height;  // 841,89 pt = 297 mm
      const mmY = (pt) => (PT_H - pt) / PT_H * 297;
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      const txt = await pg.getTextContent();
      // Solo gli item con testo VERO: quelli vuoti portano transform
      // arbitrarie e falserebbero la misura dei margini.
      const real = txt.items.filter((it) => it.str && it.str.trim());
      pages.push({
        png: canvas.toDataURL('image/png').split(',')[1],
        text: txt.items.map((it) => it.str).join(' '),
        // x massimo raggiunto dal testo, in mm: serve a scoprire un overflow
        // oltre il margine destro (194mm) che a occhio si nota tardi.
        maxX: Math.max(...real.map((it) => mm(it.transform[4] + (it.width || 0)))),
        minX: Math.min(...real.map((it) => mm(it.transform[4]))),
        widest: real.slice().sort((a, b) => (b.transform[4] + (b.width || 0)) - (a.transform[4] + (a.width || 0)))[0],
        leftmost: real.slice().sort((a, b) => a.transform[4] - b.transform[4])[0],
        // maxY = quanto in basso arriva il CORPO. Il piè (285/289,5mm) è
        // disegnato apposta laggiù, quindi si esclude.
        maxY: Math.max(...real.map((it) => mmY(it.transform[5])).filter((v) => v < 282), 0),
        lowest: real.map((it) => ({ str: it.str, y: mmY(it.transform[5]) }))
          .filter((v) => v.y < 282).sort((a, b) => b.y - a.y)[0],
      });
    }
    return { pages };
  }, [inv, seller, builder || null]);
  if (out.error) throw new Error(out.error);
  for (let i = 0; i < out.pages.length; i++) {
    await writeFile(join(OUT, `${name}-p${i + 1}.png`), Buffer.from(out.pages[i].png, 'base64'));
  }
  return out.pages;
}

let base;
await t('la fattura si renderizza in una pagina sola', async () => {
  errors.length = 0;
  base = await render('fattura', CASE);
  ok(errors.length === 0, 'errori JS: ' + errors.join(' | '));
  ok(base.length === 1, 'pagine: ' + base.length + ' (una fattura da 2 righe deve starci in una)');
});

await t('il documento porta emittente, cliente e numero', async () => {
  const txt = base[0].text;
  // Il marchio e i titoli sono spaziati (charSpace): pdf.js li restituisce
  // lettera per lettera, quindi si confrontano senza spazi.
  ['BOOM', 'FATTURA'].forEach((s) => ok(hasLabel(base[0], s), 'manca "' + s + '" nel PDF'));
  ['12/2026', 'Egidi Immobiliare', 'Bellucci Property Holdings',
   'P.IVA', 'M5UXCR1', 'Cod. destinatario'].forEach((s) => ok(txt.includes(s), 'manca "' + s + '" nel PDF'));
});

await t('i totali stampati sono quelli del motore', async () => {
  const txt = base[0].text.replace(/\s+/g, ' ');
  // 1383,33 + 249,00 = 1632,33 · IVA 22% = 359,11 · totale 1991,44
  ok(txt.includes('1.632,33'), 'imponibile assente');
  ok(txt.includes('359,11'), 'imposta assente');
  ok(txt.includes('1.991,44'), 'totale documento assente');
  ok(hasLabel(base[0], 'TOTALE DOCUMENTO'), 'manca la banda totale');
});

await t('c\'e\' il riepilogo IVA per aliquota — quello che legge il commercialista', async () => {
  const txt = base[0].text;
  ok(hasLabel(base[0], 'RIEPILOGO IVA'), 'manca la sezione riepilogo IVA');
  ok(hasLabel(base[0], 'IMPONIBILE') && hasLabel(base[0], 'IMPOSTA'), 'mancano le colonne del riepilogo');
  ok(txt.includes('22.00%') || txt.includes('22,00%'), 'manca la riga di aliquota');
});

await t('il PDF dichiara di essere una copia di cortesia', async () => {
  ok(/copia di cortesia/i.test(base[0].text), 'manca la nota "copia di cortesia"');
  // Il piè riporta la P.IVA dell'EMITTENTE del documento, non una costante.
  ok(base[0].text.includes('00743110157'), 'manca la P.IVA dell\'emittente nel pie\' di pagina');
});

await t('niente testo fuori dai margini (18mm / 192mm)', async () => {
  base.forEach((p, i) => {
    ok(p.minX >= 17.5, `pagina ${i + 1}: testo a ${p.minX.toFixed(1)}mm, oltre il margine sinistro (18mm) — "${(p.leftmost || {}).str}"`);
    ok(p.maxX <= 192.6, `pagina ${i + 1}: testo fino a ${p.maxX.toFixed(1)}mm, oltre il margine destro (192mm) — "${(p.widest || {}).str}"`);
  });
});

await t('IBAN e causale finiscono sul documento', async () => {
  const txt = base[0].text.replace(/\s+/g, ' ');
  ok(txt.includes('IT60X0542811101000000123456'), 'IBAN assente o spezzato');
  ok(txt.includes('locazione transitoria del 15/07/2026'), 'causale assente');
});

await t('forfettario: bollo, natura e riferimento normativo sul foglio', async () => {
  const pages = await render('forfettario', {
    ...CASE, number: '13/2026', progressive: 13,
    lines: [{ description: 'Consulenza immobiliare', qty: 1, unitPrice: 500, vatRate: 0, nature: 'N2.2' }],
  }, null);
  const txt = pages[0].text.replace(/\s+/g, ' ');
  ok(txt.includes('N2.2'), 'manca il codice Natura');
  ok(/bollo/i.test(txt), 'manca il bollo');
  ok(txt.includes('502,00'), 'il totale deve includere il bollo riaddebitato');
});

await t('ritenuta: compare il netto a pagare, distinto dal totale', async () => {
  const pages = await render('ritenuta', {
    ...CASE, number: '14/2026', progressive: 14,
    withholding: { enabled: true, type: 'RT02', rate: 23, basePct: 50, causale: 'R' },
  }, null);
  const txt = pages[0].text.replace(/\s+/g, ' ');
  ok(squash(txt).includes(squash('NETTO A PAGARE')), 'manca il netto a pagare');
  ok(txt.includes('187,72'), 'ritenuta attesa 11,5% di 1632,33 = 187,72 — ' + txt.slice(-300));
  ok(txt.includes('1.803,72'), 'netto atteso 1991,44 - 187,72');
});

await t('nota di credito: titolo, riferimento all\'originale', async () => {
  const pages = await render('nota-credito', {
    ...CASE, docType: 'TD04', number: '15/2026', progressive: 15,
    relatedDoc: { number: '12/2026', date: '2026-07-31' },
    causale: 'Storno totale per risoluzione consensuale.',
  }, null);
  const txt = pages[0].text.replace(/\s+/g, ' ');
  ok(squash(txt).includes(squash('NOTA DI CREDITO')), 'titolo sbagliato');
  ok(txt.includes('Storna la fattura n. 12/2026'), 'manca il richiamo all\'originale');
});

await t('molte righe: va a pagina 2 e RIPETE l\'intestazione di tabella', async () => {
  const many = { ...CASE, number: '16/2026', progressive: 16, lines: [] };
  for (let i = 1; i <= 26; i++) {
    many.lines.push({ description: `Riga ${i} — prestazione di servizi con una descrizione abbastanza lunga da mandare a capo il testo nella colonna`, qty: 1, unitPrice: 100, vatRate: 22 });
  }
  const pages = await render('multipagina', many, null);
  ok(pages.length >= 2, 'doveva andare a capo pagina, pagine: ' + pages.length);
  ok(squash(pages[1].text).includes('SEGUE'), 'la pagina 2 non dichiara di essere una continuazione');
  ok(squash(pages[1].text).includes('DESCRIZIONE'), 'la pagina 2 non ripete l\'intestazione delle colonne');
  ok(/1 \/ \d|\/ 2/.test(pages[0].text), 'manca la numerazione di pagina');
});

// ── La ricevuta di canone: stessa testata, corpo suo ──
// ── Il link di pagamento sul documento ──
await t('fattura pagabile: il riquadro "PAGA CON CARTA" col link vero', async () => {
  const pages = await render('paga', { ...CASE, number: '20/2026', progressive: 20,
    payLink: 'https://www.boomrome.com/fattura?t=inv20.9f2c1ab7d4e6', }, null);
  ok(pages.length === 1, 'il riquadro non deve far crescere il documento');
  const txt = pages[0].text.replace(/\s+/g, ' ');
  ok(squash(txt).includes(squash('PAGA CON CARTA')), 'manca il riquadro');
  ok(txt.includes('boomrome.com/fattura'), 'manca l\'indirizzo in chiaro per chi stampa');
  ok(/Stripe/i.test(txt), 'manca la rassicurazione sul circuito');
  ok(pages[0].maxX <= 192.6, `sfora: ${pages[0].maxX.toFixed(1)}mm`);
  ok(pages[0].minX >= 17.5, `sfora a sinistra: ${pages[0].minX.toFixed(1)}mm`);
});

await t('il riquadro è un link cliccabile, non solo testo blu', async () => {
  const annots = await page.evaluate(async ([inv]) => {
    const doc = window.invBuildPdf(inv, window.invSeller());
    const pdfjs = window.pdfjsLib;
    pdfjs.GlobalWorkerOptions.workerSrc = '/__lib/worker.js';
    const pdf = await pdfjs.getDocument({ data: doc.output('arraybuffer') }).promise;
    const a = await (await pdf.getPage(1)).getAnnotations();
    return a.filter((x) => x.url).map((x) => ({ url: x.url, rect: x.rect }));
  }, [{ ...CASE, number: '21/2026', progressive: 21, payLink: 'https://www.boomrome.com/fattura?t=inv21.aaaa' }]);
  ok(annots.length >= 2, 'attesi almeno due link (il testo e tutto il riquadro), trovati ' + annots.length);
  ok(annots.every((a) => a.url.includes('/fattura?t=inv21')), 'un link punta altrove: ' + JSON.stringify(annots));
  // Il riquadro deve essere abbastanza grande da beccarlo col dito.
  const big = annots.find((a) => (a.rect[2] - a.rect[0]) > 200);
  ok(big, 'nessuna area cliccabile larga: ' + JSON.stringify(annots.map((a) => a.rect)));
});

await t('col blocco totali corto il riquadro non si scrive addosso alla sezione 4', async () => {
  // Forfettario: nessuna IVA, nessuna ritenuta → la colonna destra dei totali
  // è alta la metà e il riquadro a sinistra la supera. Le due colonne sono
  // indipendenti: il flusso deve riprendere sotto la PIÙ BASSA.
  const CORTO = { ...CASE, number: '25/2026', progressive: 25,
    lines: [{ description: 'Consulenza', qty: 1, unitPrice: 300, vatRate: 0, nature: 'N2.2' }],
    causale: '', payment: { condition: 'TP02', method: 'MP05', iban: 'IT60X0542811101000000123456' },
    payLink: 'https://www.boomrome.com/fattura?t=inv25.dddd' };
  await render('paga-corto', CORTO, null);

  const items = await page.evaluate(async ([inv]) => {
    const doc = window.invBuildPdf(inv, window.invSeller());
    const pdfjs = window.pdfjsLib;
    pdfjs.GlobalWorkerOptions.workerSrc = '/__lib/worker.js';
    const pdf = await pdfjs.getDocument({ data: doc.output('arraybuffer') }).promise;
    const pg = await pdf.getPage(1);
    const vp = pg.getViewport({ scale: 1 });
    const tc = await pg.getTextContent();
    return tc.items.filter((i) => i.str && i.str.trim()).map((i) => ({
      s: i.str,
      x: i.transform[4] / vp.width * 210,
      y: (vp.height - i.transform[5]) / vp.height * 297,   // mm dall'alto
    }));
  }, [CORTO]);

  // L'ancora è l'ULTIMA riga DENTRO il riquadro (i circuiti), non il link:
  // sotto il link c'è ancora contenuto del badge.
  const trust = items.filter((i) => /Mastercard|Stripe/.test(i.s)).sort((a, b) => b.y - a.y)[0];
  ok(trust, 'il riquadro non è nel documento');
  // SOLO la colonna sinistra: a destra c'è il blocco totali, che sta
  // legittimamente alla stessa altezza del riquadro.
  const below = items.filter((i) => i.x < 100 && i.y > trust.y + 1).sort((a, b) => a.y - b.y)[0];
  ok(below, 'sotto il riquadro non c\'è più nulla, atteso il titolo "04 Pagamento"');
  ok(below.y > trust.y + 6,
     `la colonna sinistra riprende a ${below.y.toFixed(1)}mm ("${below.s}") mentre il riquadro finisce a ${trust.y.toFixed(1)}mm: si sovrappongono`);
});

await t('nota di credito e bozza NON mostrano il pulsante di pagamento', async () => {
  const nc = await render('paga-nc', { ...CASE, docType: 'TD04', number: '22/2026', progressive: 22,
    relatedDoc: { number: '12/2026', date: '2026-07-31' },
    payLink: 'https://www.boomrome.com/fattura?t=inv22.bbbb' }, null);
  ok(!squash(nc[0].text).includes(squash('PAGA CON CARTA')), 'una nota di credito restituisce soldi, non li chiede');

  const paid = await render('paga-saldata', { ...CASE, number: '23/2026', progressive: 23, status: 'paid',
    payLink: 'https://www.boomrome.com/fattura?t=inv23.cccc' }, null);
  ok(!squash(paid[0].text).includes(squash('PAGA CON CARTA')), 'una fattura saldata non si ripaga');
});

await t('senza payLink il documento resta identico a prima', async () => {
  const pages = await render('paga-assente', { ...CASE, number: '24/2026', progressive: 24 }, null);
  ok(!squash(pages[0].text).includes(squash('PAGA CON CARTA')));
  ok(pages.length === 1);
});

await t('le note di legge non finiscono mai sotto il piè di pagina', async () => {
  // Il piè comincia col filetto a 280mm. Le note (bollo, regime, ritenuta)
  // sono l'ultimo blocco del documento: se il salto pagina le ignora, su una
  // fattura abbastanza carica scivolano sotto la linea e spariscono.
  const casi = [
    ['note-ritenuta', { ...CASE, number: '30/2026', progressive: 30,
      withholding: { enabled: true, type: 'RT02', rate: 23, basePct: 50, causale: 'R' } }],
    ['note-forfettario', { ...CASE, number: '31/2026', progressive: 31,
      lines: [{ description: 'Consulenza', qty: 1, unitPrice: 900, vatRate: 0, nature: 'N2.2' }] }],
    ['note-tutte', { ...CASE, number: '32/2026', progressive: 32,
      lines: Array.from({ length: 14 }, (_, i) => ({ description: 'Prestazione ' + (i + 1) + ' con descrizione lunga che manda a capo il testo nella colonna descrizione', qty: 1, unitPrice: 120, vatRate: 22 })),
      withholding: { enabled: true, type: 'RT02', rate: 23, basePct: 50, causale: 'R' } }],
  ];
  for (const [name, inv] of casi) {
    const pages = await render(name, inv, name === 'note-forfettario' ? { ...SELLER_RF19 } : null);
    pages.forEach((p, i) => {
      ok(p.maxY <= 277, `${name} pagina ${i + 1}: testo del corpo a ${p.maxY.toFixed(1)}mm, sotto il filetto del piè (280mm) — "${(p.lowest || {}).str}"`);
    });
  }
});

await t('la ricevuta di canone usa la STESSA testata della fattura', async () => {
  errors.length = 0;
  const pages = await render('ricevuta', {
    pay: { id: 'pay_abc123def456', amount: 1450, month: 'Settembre 2026', paidDate: '2026-09-03', status: 'paid', paidVia: 'bank' },
    c: { id: 'c1' },
    p: { name: 'Trastevere Loft', address: 'Via dei Coronari 42, Roma' },
    t: { name: 'Mary Johnson', email: 'mary@example.com', codiceFiscale: 'JHNMRY85M41Z404Z' },
  }, null, 'receipt');
  ok(errors.length === 0, 'errori JS: ' + errors.join(' | '));
  ok(pages.length === 1, 'la ricevuta deve stare in una pagina');
  const txt = pages[0].text;
  ok(hasLabel(pages[0], 'BOOM'), 'manca il marchio');
  ok(hasLabel(pages[0], 'RICEVUTA DI PAGAMENTO'), 'titolo sbagliato');
  ok(txt.includes('Mary Johnson') && txt.includes('Trastevere Loft'), 'mancano inquilino/immobile');
  ok(txt.includes('1.450,00'), 'importo assente o senza centesimi');
  ok(hasLabel(pages[0], 'IMPORTO RICEVUTO'), 'manca la banda importo');
});

await t('la ricevuta DICE di non essere una fattura', async () => {
  const pages = await render('ricevuta2', {
    pay: { id: 'pay_x', amount: 900, month: 'Ottobre 2026', paidDate: '2026-10-02', status: 'paid' },
    c: {}, p: { name: 'Pigneto Studio', address: 'Via Roma 1' }, t: { name: 'Tom Reed' },
  }, null, 'receipt');
  const txt = pages[0].text.replace(/\s+/g, ' ');
  ok(/non costituisce fattura/i.test(txt), 'manca la dicitura che la distingue da una fattura');
  ok(/documento non fiscale/i.test(txt), 'il pie\' non la qualifica');
  ok(!/RIEPILOGO/i.test(txt.replace(/\s/g, '')), 'una ricevuta non deve avere il riepilogo IVA');
});

await t('ricevuta: niente fuori dai margini', async () => {
  const pages = await render('ricevuta3', {
    pay: { id: 'pay_y', amount: 12345.67, month: 'Novembre 2026', paidDate: '2026-11-02', status: 'paid' },
    c: {}, p: { name: 'Attico Aventino con nome molto lungo per il riquadro', address: 'Viale Giotto 128, 00153 Roma' },
    t: { name: 'Alessandra Del Monte Buonarroti', email: 'alessandra.delmonte@example.com' },
  }, null, 'receipt');
  ok(pages[0].minX >= 17.5, `testo a ${pages[0].minX.toFixed(1)}mm — "${(pages[0].leftmost || {}).str}"`);
  ok(pages[0].maxX <= 192.6, `testo fino a ${pages[0].maxX.toFixed(1)}mm — "${(pages[0].widest || {}).str}"`);
});

await browser.close();
server.close();
console.log('\n  PNG in ' + OUT);
console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' passati, ' + fail + ' falliti\x1b[0m\n');
process.exit(fail ? 1 : 0);
