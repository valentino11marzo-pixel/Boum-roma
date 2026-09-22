// The real Centralino page with synthetic records and Firebase stubs only.
// No provider, customer, model or outbound message is contacted.
// node tests/phone/ui.mjs (BOOM_PLAYWRIGHT/BOOM_CHROME when necessary)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadChromium, launchOptions } from '../_browser.mjs';

const html = readFileSync(new URL('../../chiamate.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
const script = scripts.map(match => match[1]).find(text => text.includes('contactPresentation'));
assert.ok(script, 'real Centralino script found');
const start = script.indexOf('  const ACT_LABEL =');
const end = script.indexOf('  let calls = [];', start);
assert.ok(start >= 0 && end > start);
const presentationSource = script.slice(start, end);
const presentation = source => vm.runInNewContext(source + '\ncontactPresentation;', {});
const contact = presentation(presentationSource);
let checks = 0;
const check = (name, fn) => { fn(); console.log('PASS ' + name); checks++; };

check('richiamo suggerito senza telefono: non inventa una richiesta del chiamante', () => {
  const row = Object.freeze({ from: '', suggestedAction: 'richiama', urgency: 'high', transcript: 'Quali documenti servono per la visita?' });
  const view = contact(row);
  assert.equal(view.phone, null);
  assert.match(view.actionLabel, /Richiamo da valutare.*recapito mancante/);
  assert.doesNotMatch(view.actionLabel, /richiest[oa]/i);
  assert.match(view.notice, /Verifica i dati della conversazione/);
  assert.equal(row.suggestedAction, 'richiama');
  assert.equal(row.urgency, 'high');
});
check('record vecchi: valore vuoto, anonimo o non telefonico non crea un contatto', () => {
  for (const from of [undefined, null, '', '  ', 'anonymous', 'Numero nascosto', 'unknown 12345678', '12', '0000000', '+39<script>3331234567', '+39;3331234567']) {
    const view = contact({ from, suggestedAction: 'richiama' });
    assert.equal(view.phone, null, String(from));
    assert.match(view.actionLabel, /recapito mancante/);
  }
});
check('recapito esistente: formattazione ammessa, nessun prefisso inventato', () => {
  for (const [from, expected] of [['+39 333 1234567', '+393331234567'], ['+44 (20) 7123-4567', '+442071234567'], ['06 1234567', '061234567']]) {
    const view = contact({ from, suggestedAction: 'richiama' });
    assert.equal(view.phone, expected);
    assert.match(view.actionLabel, /Da richiamare/);
    assert.equal(view.notice, '');
  }
});
check('WhatsApp senza recapito dichiara la mancanza; gli altri intenti non cambiano', () => {
  assert.match(contact({ suggestedAction: 'whatsapp' }).actionLabel, /Risposta da valutare.*recapito mancante/);
  for (const [suggestedAction, label] of [['visita', 'Vuole una visita'], ['manutenzione', 'Manutenzione'], ['niente', '—']]) {
    const view = contact({ suggestedAction });
    assert.ok(view.actionLabel.includes(label));
    assert.equal(view.notice, '');
  }
  assert.equal(contact({ suggestedAction: 'legacy-unknown' }).actionLabel, '');
});
check('né nome né testo del test possono creare o revocare un recapito', () => {
  assert.equal(contact({ callerName: '+393331234567', transcript: 'Richiamami al +393331234567', suggestedAction: 'richiama' }).phone, null);
  assert.equal(contact({ from: '+393331234567', transcript: 'Questa è una prova interna', suggestedAction: 'richiama' }).phone, '+393331234567');
});
check('MUTAZIONE: nascondere la mancanza del recapito viene rilevato', () => {
  const mutant = presentationSource.replace('const blocked = needsPhone && !phone;', 'const blocked = false;');
  assert.notEqual(mutant, presentationSource);
  assert.throws(() => assert.match(presentation(mutant)({ suggestedAction: 'richiama' }).actionLabel, /recapito mancante/));
});
check('MUTAZIONE: usare un from truthy non telefonico viene rilevato', () => {
  const mutant = presentationSource.replace("const phone = /^\\+?\\d{7,15}$/.test(candidate) && /[1-9]/.test(candidate) ? candidate : null;", 'const phone = raw || null;');
  assert.notEqual(mutant, presentationSource);
  assert.throws(() => assert.equal(presentation(mutant)({ from: 'anonymous', suggestedAction: 'richiama' }).phone, null));
});

const chromium = await loadChromium();
if (!chromium) {
  console.log(`PASS ${checks} verifiche pure. SKIP browser: playwright non disponibile.`);
  process.exit(0);
}
const now = Date.now();
const base = { status: 'received', createdAt: new Date(now - 60000).toISOString(), handled: false, language: 'it' };
const rows = [
  { ...base, id: 'anonymous', source: 'elevenlabs', from: '', callerName: 'Numero nascosto', urgency: 'high', suggestedAction: 'richiama',
    summary: 'Il chiamante chiede informazioni sui documenti.', transcript: 'Quali documenti servono per la visita?', draftReply: 'Possiamo verificare la richiesta.' },
  { ...base, id: 'phone', from: '+39 333 1234567', callerName: 'Recapito disponibile', suggestedAction: 'richiama', draftReply: 'Buongiorno, ricevuto.',
    callerType: 'lead', leadId: 'synthetic-lead', leadCreated: true },
  { ...base, id: 'legacy', from: 'anonymous', callerName: 'Vecchia importazione', suggestedAction: 'whatsapp' },
  { ...base, id: 'maintenance', callerName: 'Segnalazione manutenzione', callerType: 'tenant', urgency: 'high', suggestedAction: 'manutenzione' },
  { ...base, id: 'viewing', callerName: 'Richiesta visita', suggestedAction: 'visita' },
  { ...base, id: 'done', callerName: 'Chiamata gestita', handled: true, suggestedAction: 'richiama' },
  { ...base, id: 'nomsg', callerName: 'Senza messaggio', status: 'in-progress', createdAt: new Date(now - 3600000).toISOString() },
];
const pageHtml = html.replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/g, '');
const browser = await chromium.launch(launchOptions());
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Rome' });
  await context.addInitScript(({ rows }) => {
    window.__phoneRows = rows;
    window.__writes = [];
    const query = {
      orderBy: () => query, limit: () => query,
      get: async () => ({ docs: window.__phoneRows.map(row => ({ id: row.id, data: () => row })) }),
      doc: id => ({ update: async fields => {
        window.__writes.push({ id, fields });
        window.__phoneRows = window.__phoneRows.map(row => row.id === id ? { ...row, ...fields } : row);
        await window.__emit();
      } }),
    };
    window.firebase = { firestore: () => ({ collection: name => {
      if (name !== 'phoneCalls') throw Error('unexpected collection ' + name);
      return query;
    } }) };
    window.BoomPortal = {
      requireAuth: async roles => { if (roles.join(',') !== 'admin') throw Error('admin gate missing'); },
      listen: (q, receive) => { window.__emit = async () => receive(await q.get()); window.__emit(); },
      toast: () => {},
    };
  }, { rows });
  const page = await context.newPage();
  const errors = [], writeRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    if (route.request().method() !== 'GET') writeRequests.push(route.request().url());
    return route.fulfill(new URL(route.request().url()).pathname === '/fixture'
      ? { contentType: 'text/html', body: pageHtml }
      : { status: 404, body: '' });
  });
  await page.goto('https://fixture.invalid/fixture');
  await page.addScriptTag({ content: script });
  await page.waitForSelector('#list .call');
  const card = name => page.locator('#list .call').filter({ has: page.locator('.cname', { hasText: name }) });
  const anonymous = card('Numero nascosto');
  assert.match(await anonymous.locator('.badges').innerText(), /urgente/);
  assert.match(await anonymous.locator('.badges').innerText(), /Richiamo da valutare.*recapito mancante/);
  assert.doesNotMatch(await anonymous.locator('.badges').innerText(), /richiest[oa]/i);
  assert.doesNotMatch(await anonymous.locator('.badges').innerText(), /Da richiamare/);
  assert.match(await anonymous.locator('[role="note"]').innerText(), /Verifica i dati/);
  assert.equal(await anonymous.locator('a[href^="tel:"], a[href^="https://wa.me/"]').count(), 0);
  assert.equal(await anonymous.locator('[data-h="1"]').count(), 1);
  console.log('PASS browser: richiamo impossibile esplicito, urgenza conservata e verifica interna disponibile'); checks++;

  const transcript = anonymous.locator('details').filter({ has: page.locator('summary', { hasText: 'Trascrizione' }) });
  const draft = anonymous.locator('details').filter({ has: page.locator('summary', { hasText: 'Bozza risposta' }) });
  await transcript.locator('summary').click();
  await draft.locator('summary').click();
  assert.equal(await transcript.locator('blockquote').innerText(), rows[0].transcript);
  assert.equal(await draft.locator('blockquote').innerText(), rows[0].draftReply);
  assert.match(await draft.locator('summary').innerText(), /recapito da verificare/);
  assert.equal(await anonymous.locator('a[href^="tel:"], a[href^="https://wa.me/"]').count(), 0);
  console.log('PASS browser: dettagli e bozza espansi conservano il contenuto senza suggerire invio pronto'); checks++;

  const reachable = card('Recapito disponibile');
  assert.match(await reachable.locator('.badges').innerText(), /Da richiamare/);
  assert.equal(await reachable.locator('a[href^="tel:"]').getAttribute('href'), 'tel:+393331234567');
  assert.equal(await reachable.locator('a[href^="https://wa.me/"]').getAttribute('href'), 'https://wa.me/393331234567?text=' + encodeURIComponent(rows[1].draftReply));
  assert.equal(await card('Vecchia importazione').locator('a[href^="tel:"], a[href^="https://wa.me/"]').count(), 0);
  assert.match(await card('Vecchia importazione').locator('.badges').innerText(), /Risposta da valutare.*recapito mancante/);
  assert.match(await card('Segnalazione manutenzione').locator('.badges').innerText(), /urgente.*Manutenzione/s);
  assert.equal(await card('Segnalazione manutenzione').locator('[role="note"]').count(), 0);
  assert.match(await card('Richiesta visita').locator('.badges').innerText(), /Vuole una visita/);
  assert.equal(await card('Richiesta visita').locator('[role="note"]').count(), 0);
  assert.deepEqual(await page.evaluate(() => window.__phoneRows), rows);
  console.log('PASS browser: recapito valido, record vecchi e azioni diverse dal richiamo mantengono il comportamento pertinente'); checks++;

  for (const [filter, expected] of [['open', 5], ['all', 7], ['lead', 1], ['known', 1], ['nomsg', 1]]) {
    await page.locator(`[data-f="${filter}"]`).click();
    assert.equal(await page.locator('#list .call').count(), expected, filter);
  }
  assert.equal(await page.locator('#stOpen').innerText(), '5');
  await page.locator('[data-f="open"]').click();
  await card('Numero nascosto').locator('[data-h="1"]').click();
  await page.waitForFunction(() => document.getElementById('stOpen').textContent === '4');
  assert.equal(await card('Numero nascosto').count(), 0);
  const writes = await page.evaluate(() => window.__writes);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].id, 'anonymous');
  assert.equal(writes[0].fields.handled, true);
  assert.deepEqual(Object.keys(writes[0].fields).sort(), ['handled', 'handledAt']);
  await page.locator('[data-f="all"]').click();
  assert.equal(await card('Numero nascosto').locator('a[href^="tel:"], a[href^="https://wa.me/"]').count(), 0);
  assert.match(await card('Numero nascosto').locator('.badges').innerText(), /urgente/);
  console.log('PASS browser: filtri, conteggio da gestire e chiusura manuale restano coerenti'); checks++;
  assert.deepEqual(errors, []);
  assert.deepEqual(writeRequests, []);
  console.log('PASS browser: nessun errore JavaScript o richiesta esterna di scrittura'); checks++;
  await context.close();
} finally { await browser.close(); }
console.log(`\nCentralino: ${checks} verifiche passate.`);
