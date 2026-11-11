import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadChromium, launchOptions } from '../_browser.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const studyRoot = path.join(root, 'flight-studies');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'assets/boom-desks-public.json'), 'utf8'));
const studies = ['inhabit', 'your-move'];
const entries = ['', ...studies];
const config = JSON.parse(await fs.readFile(path.join(root, 'vercel.json'), 'utf8'));
assert.equal(config.cleanUrls, true, 'Study delivery relies on existing Vercel clean URLs');
for (const name of entries) {
  const html = await fs.readFile(path.join(studyRoot, (name || 'index') + '.html'), 'utf8');
  assert.match(html, /name="robots" content="noindex,nofollow"/);
  assert.doesNotMatch(html, /localhost|127\.0\.0\.1|shared-data\.json|source-snapshots|evidence\/|<form\b/i);
  for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (url.startsWith('#') || /^[a-z]+:/i.test(url)) continue;
    assert.ok(url.startsWith('/'), 'Packaged URLs must survive direct clean URL entry: ' + url);
    const asset = path.join(root, url.split(/[?#]/)[0]);
    let exists = false;
    for (const candidate of [asset, asset + '.html', path.join(asset, 'index.html')]) {
      try { await fs.access(candidate); exists = true; break; } catch {}
    }
    assert.ok(exists, 'Missing package dependency: ' + url);
  }
}
for (const name of ['public-data.js', ...studies.map(s => s + '.js')]) {
  const js = await fs.readFile(path.join(studyRoot, name), 'utf8');
  assert.doesNotMatch(js, /localhost|127\.0\.0\.1|shared-data\.json|\/cities\/|fetch\([^)]*method\s*:/i);
}
const files = await fs.readdir(studyRoot);
assert.ok(!files.includes('shared-data.json'), 'No duplicate commercial manifest');
const provenance = JSON.parse(await fs.readFile(path.join(studyRoot, 'assets/photo-sources.json'), 'utf8'));
for (const item of Object.values(provenance)) {
  assert.match(item.source, /^https:\/\/firebasestorage\.googleapis\.com\//);
  const bytes = await fs.readFile(path.join(studyRoot, 'assets', item.file));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256, 'Packaged original photo must remain unaltered');
  assert.match(item.usage, /No current availability is claimed/);
}
console.log('✓ studies packaging: direct entry dependencies, noindex and original native handoff');

const chromium = await loadChromium();
if (!chromium) {
  console.log('SKIP study browser checks: Playwright unavailable');
  process.exit(0);
}
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://study.test').pathname);
    const target = path.resolve(root, '.' + pathname);
    if (!target.startsWith(root)) { res.writeHead(403).end(); return; }
    let selected;
    for (const candidate of [target, target + '.html', path.join(target, 'index.html')]) {
      try { if ((await fs.stat(candidate)).isFile()) { selected = candidate; break; } } catch {}
    }
    if (!selected) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(selected)] || 'application/octet-stream' });
    res.end(await fs.readFile(selected));
  } catch { res.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch(launchOptions({ headless: true }));
  for (const name of entries) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    const response = await page.goto(`${origin}/flight-studies${name ? '/' + name : ''}`, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    if (name === 'inhabit') await page.locator('#native-service').waitFor();
    if (name === 'your-move') await page.waitForFunction(() => !document.querySelector('#city').disabled);
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${name || 'board'} overflows at ${width}px`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    if (name) {
      for (const [slug, city] of Object.entries(manifest.cities)) {
        if (name === 'inhabit') await page.locator(`[data-city="${slug}"]`).click();
        else await page.selectOption('#city', slug);
        for (const plan of city.pricing.plans) {
          if (name === 'inhabit') await page.locator(`input[name="need"][value="${plan.id}"]`).check();
          else await page.selectOption('#need', plan.id);
          const href = await page.locator(name === 'inhabit' ? '#native-service' : '#continue').getAttribute('href');
          assert.equal(href, `https://www.boomrome.com/${slug}#fare-${plan.id}`);
          const text = await page.locator(name === 'inhabit' ? '#service' : '#service').innerText();
          const price = new Intl.NumberFormat('en-GB', { style: 'currency', currency: city.currency, maximumFractionDigits: 0 }).format(plan.price);
          assert.ok(text.includes(price), `${name}: canonical price for ${slug}/${plan.id}`);
          for (const item of plan.includes) assert.ok(text.includes(item), `${name}: canonical inclusion for ${slug}/${plan.id}`);
          if (city.chargeAt === 'signing') {
            assert.ok(text.includes(plan.trigger));
            assert.ok(!text.includes(manifest.refund.rule), `${name}: checkout refund leaked into signing city`);
          }
        }
      }
      assert.equal(await page.locator(name === 'inhabit' ? '#motion' : '#pause').isDisabled(), true, 'Reduced motion control');
      if (name === 'your-move') {
        await page.selectOption('#city', 'rome');
        assert.equal(await page.locator('#continue').getAttribute('href'), 'https://www.boomrome.com/apartments');
      }
    }
    assert.deepEqual(errors, [], `${name || 'board'} has asset or runtime errors`);
    if (process.env.BOOM_STUDIES_CAPTURE) {
      await fs.mkdir(process.env.BOOM_STUDIES_CAPTURE, { recursive: true });
      await page.goto(`${origin}/flight-studies${name ? '/' + name : ''}`, { waitUntil: 'networkidle' });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.screenshot({ path: path.join(process.env.BOOM_STUDIES_CAPTURE, (name || 'board') + '.png') });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.screenshot({ path: path.join(process.env.BOOM_STUDIES_CAPTURE, (name || 'board') + '-mobile.png') });
    }
    await page.close();
  }
  for (const name of studies) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await page.route('**/assets/boom-desks-public.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
    await page.goto(`${origin}/flight-studies/${name}`, { waitUntil: 'networkidle' });
    const text = await page.locator('#service').innerText();
    assert.doesNotMatch(text, /€500|£500|refunded in full/);
    const fallback = page.locator(name === 'inhabit' ? '#service a' : '#continue');
    assert.equal(await fallback.getAttribute('href'), 'https://www.boomrome.com/milan');
    if (name === 'inhabit') await page.locator('[data-city="london"]').click();
    else await page.selectOption('#city', 'london');
    assert.equal(await fallback.getAttribute('href'), 'https://www.boomrome.com/london');
    await page.close();
  }
  for (const name of studies) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: 'no-preference' });
    await page.goto(`${origin}/flight-studies/${name}`, { waitUntil: 'networkidle' });
    const pause = page.locator(name === 'inhabit' ? '#motion' : '#pause');
    const stagePause = page.locator(name === 'inhabit' ? '#stage-motion' : '#pauseStage');
    await page.locator('#nextSolariField').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => window.BoomFlightNextMotion.state().running);
    const before = await page.evaluate(() => window.BoomFlightNextMotion.state().elapsedMs);
    await page.waitForFunction(previous => window.BoomFlightNextMotion.state().elapsedMs > previous + 120, before);
    await stagePause.click();
    assert.equal(await pause.getAttribute('aria-pressed'), 'true');
    assert.equal(await stagePause.getAttribute('aria-pressed'), 'true');
    const stopped = await page.evaluate(() => window.BoomFlightNextMotion.state());
    assert.equal(stopped.running, false);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.BoomFlightNextMotion.state().elapsedMs), stopped.elapsedMs, 'Paused native Solari clock must stop');
    await stagePause.click();
    assert.equal(await pause.getAttribute('aria-pressed'), 'false');
    assert.equal(await stagePause.getAttribute('aria-pressed'), 'false');
    await page.waitForFunction(previous => window.BoomFlightNextMotion.state().elapsedMs > previous + 120, stopped.elapsedMs);
    if (name === 'inhabit') await page.locator('[data-city="london"]').click();
    else await page.selectOption('#city', 'london');
    assert.equal((await page.locator('#nextDestinationBoard').getAttribute('aria-label')).toLowerCase(), 'london');
    await page.locator('#nextSolariField').scrollIntoViewIfNeeded();
    const changed = await page.evaluate(() => window.BoomFlightNextMotion.state().elapsedMs);
    await page.waitForFunction(previous => window.BoomFlightNextMotion.state().running && window.BoomFlightNextMotion.state().elapsedMs > previous + 120, changed);
    await page.close();
  }
  console.log('✓ studies browser: clean URL HTTP, all 48 service selections, native links, 4 widths, reduced motion, pause/resume and unavailable source fallback');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
