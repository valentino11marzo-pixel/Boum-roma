// Real sign.html + PDF.js + create/get/submit + PDF embedding. Reuses run.mjs's network-only fixture.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadChromium, launchOptions } from '../_browser.mjs';
import { reset, prepared, call, get, submit, signBody, currentDoc, emailCount, uploadFailure } from './run.mjs';
const root = new URL('../../', import.meta.url);
const html = readFileSync(new URL('sign.html', root));
const cached = process.env.BOOM_PDFJS_CACHE || join(tmpdir(), 'boom-pdfjs-3.11.174');
// Deliberately no CDN fallback: this integration suite never contacts an external service.
const assets = Object.fromEntries(['pdf.min.js', 'pdf.worker.min.js'].map(name => [name, readFileSync(join(cached, name))]));
let submissions = [], corruptPreview = false;
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/sign') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
    if (pathname.startsWith('/api/sign/custom/')) {
      let raw = ''; for await (const part of req) raw += part;
      const body = JSON.parse(raw); if (pathname.endsWith('/submit')) submissions.push(body);
      const r = await call(pathname.endsWith('/get') ? get : submit, body);
      res.writeHead(r.code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(r.body)); return;
    }
    res.writeHead(404); res.end();
  } catch (e) { res.writeHead(500); res.end(String(e.message)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const chromium = await loadChromium(); assert(chromium, 'Browser required');
let browser;
async function draw(page) {
  const pad = await page.locator('#pad').boundingBox(); assert(pad);
  await page.mouse.move(pad.x + 30, pad.y + 40); await page.mouse.down();
  await page.mouse.move(pad.x + 90, pad.y + 75, { steps: 8 }); await page.mouse.move(pad.x + 140, pad.y + 35, { steps: 8 }); await page.mouse.up();
}
try {
  browser = await chromium.launch(launchOptions({ headless: true }));
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); page.setDefaultTimeout(6000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(base)) return route.continue();
    const name = url.split('/').at(-1);
    if (url.startsWith('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/') && assets[name]) return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: assets[name] });
    if (url.startsWith('https://firebasestorage.googleapis.com/')) {
      const r = await globalThis.fetch(url); let bytes = Buffer.from(await r.arrayBuffer()); if (corruptPreview) bytes = Buffer.concat([bytes, Buffer.from('changed')]);
      return route.fulfill({ status: r.status, contentType: 'application/pdf', headers: { 'Access-Control-Allow-Origin': '*' }, body: bytes });
    }
    return route.abort();
  });
  reset(); await prepared('browser-sign'); const body = signBody('browser-sign');
  const link = `${base}/sign?csign=${body.req}&role=tenant&t=${body.token}`;
  corruptPreview = true; await page.goto(link); await page.waitForSelector('#pad'); await draw(page); await page.locator('#consent').check();
  await page.getByText('Preview could not be verified.', { exact: false }).waitFor(); assert(await page.locator('#c-sign').isDisabled()); assert.equal(submissions.length, 0);
  console.log('PASS signer refuses a PDF whose bytes differ from the viewed-version hash');
  corruptPreview = false; uploadFailure(true); await page.reload(); await page.waitForSelector('#pdfview canvas'); await draw(page);
  assert(await page.locator('#c-sign').isDisabled()); await page.locator('#consent').check(); await page.waitForFunction(() => !document.querySelector('#c-sign').disabled);
  await page.locator('#c-sign').click(); await page.locator('#c-retry-pdf').waitFor();
  assert.equal(submissions.length, 1); assert.equal(submissions[0].documentVersion, 1); assert.equal(submissions[0].documentHash, body.documentHash); assert(submissions[0].consent.hash);
  const saved = currentDoc('browser-sign').signers.tenant; assert(saved.signedAt); assert.equal(emailCount(), 0);
  console.log('PASS real consent click records bound evidence and shows truthful PDF retry');
  uploadFailure(false); await page.locator('#c-retry-pdf').click(); await page.getByRole('link', { name: 'Download signed PDF' }).waitFor();
  assert.equal(submissions[1].op, 'retryFinalization'); assert(!submissions[1].signature); assert.deepEqual(currentDoc('browser-sign').signers.tenant, saved); assert.equal(emailCount(), 1);
  await page.reload(); await page.getByRole('link', { name: 'Download signed PDF' }).waitFor(); assert.equal(submissions.length, 2); assert.equal(emailCount(), 1); assert.deepEqual(errors, []);
  console.log('PASS recovery and reload do not re-sign, rebuild or resend the completed document');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
