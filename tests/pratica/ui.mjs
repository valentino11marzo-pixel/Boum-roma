// tests/pratica/ui.mjs — IMPORTA PRATICA in un browser VERO.
//
// La suite `run.mjs` prova il motore e la porta. Questa prova la cosa che
// nessun test di logica può provare: che l'operatore VEDA quello che il
// motore ha deciso. Portale di produzione (portal.html + portal-app.js +
// pratica-engine.js), Firebase finto ai confini, l'endpoint sostituito da
// una risposta SINTETICA — nessun documento reale, nessuna chiamata al
// modello, nessuna scrittura.
//
//   node tests/pratica/ui.mjs           (SKIP senza playwright)
//   BOOM_SHOT=/percorso.png node tests/pratica/ui.mjs   salva la schermata

import { loadChromium, launchOptions } from '../_browser.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 8961;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const chromium = await loadChromium();
if (!chromium) { console.log('SKIP: playwright non disponibile'); process.exit(0); }

let pass = 0, fail = 0;
const ok = (c, n, extra = '') => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('✗ FAIL ' + n + (extra ? '\n      ' + String(extra).slice(0, 300) : '')); } };

const srv = createServer(async (rq, rs) => {
  let p = decodeURIComponent(rq.url.split('?')[0]);
  if (p === '/' || p === '/portal') p = '/portal.html';
  try {
    const b = await readFile(join(ROOT, p.replace(/^\/+/, '')));
    rs.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
    rs.end(b);
  } catch { rs.writeHead(404).end('x'); }
});
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));

// La pratica sintetica: nomi, indirizzi e codici inventati.
const SYNTH = {
  ok: true,
  praticaKey: 'imp_sintetica01',
  exists: null,
  written: false,
  extraction: {
    fields: {
      'landlord.name': { value: 'Bianchi Anna', source: 'src_a', page: 1, quote: 'la sig.ra Bianchi Anna', confirmed: false },
      'tenant.name': { value: 'Rossi Mario', source: 'src_a', page: 1, quote: 'il sig. Rossi Mario', confirmed: false },
      'tenant.codiceFiscale': { value: 'RSSMRA90A01H501Z', source: 'src_a', page: 1, quote: null, confirmed: false },
      'property.address': { value: 'Via Sintetica 10, Roma', source: 'src_a', page: 1, quote: 'sito in Via Sintetica 10', confirmed: false },
      'contract.rent': { value: 900, source: 'src_a', page: 2, quote: 'canone mensile di euro novecento', confirmed: false },
      'contract.startDate': { value: '2026-01-01', source: 'src_a', page: 2, quote: null, confirmed: false },
      'contract.endDate': { value: '2027-06-30', source: 'src_a', page: 2, quote: null, confirmed: false },
    },
    conflicts: [
      { path: 'contract.rent', kept: 900, seen: 1100, source: 'src_b', page: 1, reason: 'due documenti dicono cose diverse' },
    ],
  },
  sections: {},
  links: {
    property: { decision: 'collega', preselected: 'p1', candidates: [{ id: 'p1', label: 'Via Sintetica 10', score: 88, why: 'stesso indirizzo' }], why: 'stesso indirizzo' },
    tenant: { decision: 'da_confermare', preselected: null, candidates: [{ id: 't1', label: 'Rossi Mario', score: 80, why: 'stesso nome' }], why: 'stesso nome — indizio debole, conferma richiesta' },
    landlord: { decision: 'nuovo', candidates: [], why: 'nessuna corrispondenza sopra la soglia' },
  },
  sources: [{ key: 'src_a', name: 'contratto-sintetico.pdf' }, { key: 'src_b', name: 'allegato-sintetico.pdf' }],
  duplicates: [],
  files: [{ key: 'src_a', name: 'contratto-sintetico.pdf', ok: true }, { key: 'src_b', name: 'allegato-sintetico.pdf', ok: true }],
  inconsistencies: [],
  notes: [],
};

const STUB = () => {
  const noop = () => {};
  const PROF = { role: 'admin', name: 'Operatore Test', email: 'admin@test.invalid' };
  const snap = { docs: [], empty: true, size: 0, forEach: noop, docChanges: () => [] };
  const q = { where() { return q; }, orderBy() { return q; }, limit() { return q; }, get: async () => snap, onSnapshot: (a) => { try { a(snap); } catch (e) {} return noop; }, doc() { return d; }, add: async () => ({ id: 'x' }) };
  const d = { get: async () => ({ exists: true, id: 'u1', data: () => PROF }), set: async () => {}, update: async () => {}, onSnapshot: (a) => { try { a({ exists: true, id: 'u1', data: () => PROF }); } catch (e) {} return noop; }, collection: () => q };
  const U = { uid: 'u1', email: 'admin@test.invalid', getIdToken: async () => 't', displayName: 'Operatore Test' };
  window.firebase = {
    apps: [], initializeApp: () => ({}),
    auth: Object.assign(() => ({ currentUser: U, onAuthStateChanged: (cb) => { setTimeout(() => cb(U), 10); return noop; }, signOut: async () => {}, signInAnonymously: async () => ({ user: U }), setPersistence: async () => {} }), { Auth: { Persistence: { LOCAL: 'l', SESSION: 's' } } }),
    firestore: Object.assign(() => ({ collection: () => q, doc: () => d, enablePersistence: async () => {}, batch: () => ({ set: noop, update: noop, delete: noop, commit: async () => {} }) }),
      { FieldValue: { serverTimestamp: () => new Date(), increment: (n) => n, arrayUnion: (...a) => a, arrayRemove: (...a) => a, delete: () => null },
        Timestamp: { now: () => ({ toMillis: () => Date.now(), toDate: () => new Date() }), fromDate: (x) => ({ toDate: () => x, toMillis: () => +x }) } }),
    storage: () => ({ ref: () => ({ put: async () => ({}), getDownloadURL: async () => 'https://firebasestorage.googleapis.com/x', delete: async () => {}, child() { return this; } }) }),
  };
};

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.addInitScript(STUB);
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 140)));

let apiCalls = [];
await page.route('**/*', (r) => {
  const u = r.request().url();
  if (u.includes('/api/contracts/import')) {
    apiCalls.push(JSON.parse(r.request().postData() || '{}'));
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SYNTH) });
  }
  if (u.startsWith('http://127.0.0.1:' + PORT)) return r.continue();
  if (/gstatic\.com\/firebasejs|cdnjs|jsdelivr/.test(u)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stub */' });
  return r.abort();
});

await page.goto(`http://127.0.0.1:${PORT}/portal.html`, { waitUntil: 'domcontentloaded' }).catch(() => {});
const booted = await page.waitForFunction(() => document.getElementById('app')?.classList.contains('active'), null, { timeout: 15000 }).then(() => true).catch(() => false);
ok(booted, 'il portale entra nella shell', errs.join(' | '));

if (booted) {
  ok(await page.evaluate(() => typeof window.BOOM_PRATICA === 'object' && !!window.BOOM_PRATICA.praticaKey),
     'il motore è caricato dalla pagina di produzione');

  // 1 · il bottone sta nella GESTIONE CONTRATTI, non in una dashboard nuova
  await page.evaluate(() => { location.hash = '#contracts'; });
  await page.waitForTimeout(500);
  const btn = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#main .page-actions button')].find((x) => /Importa pratica/.test(x.textContent || ''));
    return b ? { text: b.textContent.trim(), title: b.getAttribute('title') } : null;
  });
  ok(!!btn, 'nella pagina Contratti c\'è il bottone «Importa pratica»');
  ok(btn && /firmato fuori/i.test(btn.title || ''), 'e dice a cosa serve');

  // 2 · la schermata di caricamento dichiara i formati
  await page.evaluate(() => { const b = [...document.querySelectorAll('#main .page-actions button')].find((x) => /Importa pratica/.test(x.textContent || '')); b.click(); });
  await page.waitForTimeout(400);
  const carica = await page.evaluate(() => document.getElementById('main').textContent);
  ok(/Formati letti/.test(carica) && /PDF/.test(carica), 'i formati accettati sono dichiarati, non scoperti con un errore');
  ok(/Word/.test(carica), 'e si dice esplicitamente cosa NON si carica');
  ok(/Nulla viene salvato finché non confermi/.test(carica), 'la promessa "niente resta salvato" è scritta in pagina');

  // 3 · revisione su dati SINTETICI (l'endpoint è sostituito, nessuna rete)
  await page.evaluate(() => {
    // un File VERO: importaPrepare legge i byte, quindi un oggetto finto
    // fallirebbe nel FileReader e il test misurerebbe il proprio difetto
    _imp.files = [new File([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])], 'contratto-sintetico.pdf', { type: 'application/pdf' })];
    importaAnalyze();
  });
  await page.waitForFunction(() => /Dati letti/.test(document.getElementById('main').textContent), null, { timeout: 8000 }).catch(() => {});
  const rev = await page.evaluate(() => {
    const main = document.getElementById('main');
    const rows = [...main.querySelectorAll('table tr')].map((tr) => tr.textContent.replace(/\s+/g, ' ').trim());
    const sel = [...main.querySelectorAll('select')].map((s) => ({ value: s.value, opts: [...s.options].map((o) => o.text) }));
    return { text: main.textContent, rows, sel,
             rentInput: (main.querySelector('input.form-input[value="900"]') || {}).value || null };
  });
  ok(/Dati letti/.test(rev.text), 'si arriva alla revisione');
  ok(rev.rows.some((r) => /contratto-sintetico\.pdf/.test(r) && /p\.2/.test(r)),
     'ogni valore mostra FONTE e PAGINA accanto', rev.rows.filter((r) => /p\./.test(r)).join(' || ').slice(0, 200));
  ok(rev.rows.some((r) => /novecento/.test(r)), 'e la citazione copiata dal documento');
  ok(rev.rentInput === '900', 'il valore è correggibile a mano');

  // 4 · il conflitto è visibile e NON risolto da solo
  ok(/disaccordo/i.test(rev.text) && /900/.test(rev.text) && /1100/.test(rev.text),
     'i due valori in disaccordo sono ENTRAMBI mostrati, nessuno scelto in automatico');

  // 5 · l'aggancio sul solo nome non è pre-selezionato
  const tenantSel = rev.sel.find((s) => s.opts.some((o) => /Rossi Mario/.test(o)));
  ok(tenantSel && tenantSel.value === '__new__',
     'il conduttore agganciato SOLO per nome non è pre-selezionato: resta «Crea nuovo»', JSON.stringify(tenantSel));
  const propSel = rev.sel.find((s) => s.opts.some((o) => /Via Sintetica/.test(o)));
  ok(propSel && propSel.value === 'p1', 'l\'immobile con lo stesso indirizzo invece è proposto già collegato');
  ok(/conferma richiesta/.test(rev.text), 'e la conferma richiesta è etichettata');

  // 6 · presa in gestione e firma esterna sono in pagina, con la loro regola
  ok(/presa in gestione/i.test(rev.text), 'la data di presa in gestione si chiede');
  ok(/nessuna rata, nessun sollecito, nessuna fattura/i.test(rev.text),
     'e la pagina dichiara che il passato non viene fabbricato');
  ok(/BOOM non lo firma e non simula Magic Sign/.test(rev.text),
     'la firma esterna è dichiarata per quello che è');

  // 7 · i documenti mancanti sono elencati per nome
  ok(/Ricevuta di registrazione/.test(rev.text) && /Verbale di consegna/.test(rev.text),
     'i documenti mancanti sono elencati per nome');

  // 8 · nessuna scrittura: la conferma non è ancora stata premuta
  ok(apiCalls.length >= 1 && apiCalls.every((c) => c.op === 'extract'),
     'finora solo letture: nessuna conferma partita da sola', JSON.stringify(apiCalls.map((c) => c.op)));
  ok(errs.length === 0, 'nessun errore JS nel giro', errs.join(' | '));

  if (process.env.BOOM_SHOT) {
    await page.screenshot({ path: process.env.BOOM_SHOT, fullPage: true });
    console.log('schermata salvata: ' + process.env.BOOM_SHOT);
  }
}

await browser.close();
srv.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
