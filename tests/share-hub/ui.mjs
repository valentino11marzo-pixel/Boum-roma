// Il vero openShareHub: DOM/Firebase/trasporti sostituiti, nessun invio reale.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
const start = source.indexOf('    async function openShareHub(');
const end = source.indexOf('    window.openShareHub = openShareHub;', start);
assert(start > 0 && end > start, 'funzione Share Hub presente');
const fn = source.slice(start, end) + '\nwindow.openShareHub = openShareHub;';
const PDF = 'https://files.example.invalid/contracts/ctr1/contratto-firmato.pdf?alt=media&token=synthetic';
const base = {
  id: 'ctr1', propertyId: 'p1', tenantId: 't1',
  tenantName: 'Persona Inquilina', tenantEmail: 'tenant@example.invalid', tenantPhone: '+390000000001',
  landlordName: 'Persona Proprietaria', landlordEmail: 'owner@example.invalid', landlordPhone: '+390000000002',
};
const ready = { ...base, tenantSignature: 'synthetic-tenant', landlordSignature: 'synthetic-owner', signatureStatus: 'complete', signedPdfUrl: PDF };
const esc = value => String(value || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const unesc = value => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const hrefs = html => [...html.matchAll(/href="([^"]*)"/g)].map(m => unesc(m[1]));
let checks = 0;
async function check(label, work) { await work(); checks++; console.log('PASS ' + label); }

async function fixture({ live = ready, cache = base, fail = false, text = fn, holdRead, onStart } = {}) {
  const box = { innerHTML: '' }, io = { reads: [], writes: [], requests: [], opens: [], clipboard: [], toasts: [], signLinks: 0 };
  const state = { contracts: [structuredClone(cache)], properties: [{ id: 'p1', name: 'Casa di prova', ownerId: 'l1' }], users: [
    { id: 't1', role: 'tenant', name: 'Persona Inquilina', phone: '+390000000001', email: 'tenant@example.invalid' },
    { id: 'l1', role: 'landlord', name: 'Persona Proprietaria', phone: '+390000000002', email: 'owner@example.invalid' }
  ] };
  const before = JSON.stringify(state);
  const boundary = {
    S: state, URL, setTimeout, clearTimeout, esc, encodeURIComponent,
    console: { warn() {} }, isAdmin: () => true,
    document: { getElementById: id => { assert.equal(id, 'modals'); return box; } },
    toast: (...args) => io.toasts.push(args), closeModal: () => { box.innerHTML = ''; },
    auth: { currentUser: { uid: 'admin-A', getIdToken: async () => 'synthetic-token' } },
    db: { collection: collection => ({ doc: id => ({
      get: async options => { io.reads.push({ collection, id, source: options?.source }); if (holdRead) await holdRead; if (fail) throw Error('offline'); return { exists: live !== null, data: () => structuredClone(live) }; },
      update: async data => { io.writes.push(data); throw Error('unexpected write'); },
      set: async data => { io.writes.push(data); throw Error('unexpected write'); }
    }) }) },
    fetchSignLinks: async () => { io.signLinks++; return { tenant: 'https://portal.example.invalid/sign?sign=TENANT', landlord: 'https://portal.example.invalid/sign?sign=OWNER' }; },
    fetch: async (url, options) => {
      io.requests.push({ url, body: JSON.parse(options.body) });
      assert.equal(url, '/api/profile/link', 'nessun endpoint di invio o mutazione');
      return { json: async () => ({ ok: true,
        tenantUrl: 'https://portal.example.invalid/scheda?t=TENANT', landlordUrl: 'https://portal.example.invalid/scheda?t=OWNER',
        missing: { tenant: [{ key: 'tenantCF', label: 'codice fiscale' }], landlord: [] },
        cosign: (live?.coTenants || []).map(co => ({ name: co.name, signed: !!co.signature,
          url: 'https://portal.example.invalid/sign?sign=CO', schedaUrl: 'https://portal.example.invalid/scheda?t=CO', missing: [] }))
      }) };
    },
    window: { location: { origin: 'https://portal.example.invalid' }, open: (...args) => io.opens.push(args),
      BOOM_TENANT_ACCESS: { inviteUrl: () => 'https://portal.example.invalid/login?next=%2Fcasa' } },
    navigator: { clipboard: { writeText: async value => io.clipboard.push(value) } }
  };
  vm.createContext(boundary);
  vm.runInContext(text, boundary);
  const pending = boundary.window.openShareHub('ctr1');
  if (onStart) onStart(boundary, box);
  await pending;
  assert.deepEqual(io.writes, [], 'nessuna scrittura Firestore');
  assert.deepEqual(io.opens, [], 'nessuna apertura o invio automatico');
  assert.deepEqual(io.clipboard, [], 'gli appunti cambiano solo al click');
  assert.equal(JSON.stringify(state), before, 'nessuna mutazione della cache locale');
  assert.deepEqual(io.reads, [{ collection: 'contracts', id: 'ctr1', source: 'server' }]);
  return { html: box.innerHTML, io };
}
const countSigned = html => (html.match(/>Contratto firmato<\/div>/g) || []).length;
const columns = html => [html.slice(html.indexOf('👤 INQUILINO'), html.indexOf('🏠 LOCATORE')), html.slice(html.indexOf('🏠 LOCATORE'))];

await check('server attuale vince sulla cache: PDF firmato primo accesso per entrambe le parti', async () => {
  const { html, io } = await fixture({ cache: { ...base, signedPdfUrl: 'https://files.example.invalid/stale.pdf' } });
  assert.equal(countSigned(html), 2);
  for (const col of columns(html)) {
    const titles = [...col.matchAll(/font-weight:600;font-size:13px">([^<]*)<\/div>/g)].map(m => m[1]);
    assert.equal(titles[0], 'Contratto firmato');
  }
  const urls = hrefs(html);
  assert.equal(urls.filter(url => url === PDF).length, 2);
  assert(!html.includes('stale.pdf'));
  assert.equal(io.requests.length, 1);
  assert.equal(io.signLinks, 1, 'i percorsi esistenti delle firme restano invariati');
  for (const phone of ['390000000001', '390000000002']) {
    const url = urls.find(url => url.startsWith('https://wa.me/' + phone) && new URL(url).searchParams.get('text')?.includes(PDF));
    assert(url, 'messaggio WhatsApp pronto per il destinatario');
  }
  for (const email of ['tenant@example.invalid', 'owner@example.invalid']) {
    const url = urls.find(url => url.startsWith('mailto:' + email) && new URL(url).searchParams.get('body')?.includes(PDF));
    assert(url, 'email pronta per il destinatario');
  }
  // Solo su richiesta locale: la CI non deve produrre artefatti fuori workspace.
  if (process.env.BOOM_SHARE_HUB_FIXTURE) writeFileSync(process.env.BOOM_SHARE_HUB_FIXTURE, html);
});

await check('record legacy: signedPdfUrl canonico condivisibile anche senza timbri firma moderni', async () => {
  const { html } = await fixture({ live: { ...base, signedPdfUrl: PDF } });
  assert.equal(countSigned(html), 2);
});
await check('firme complete senza PDF: avviso per entrambe le parti, mai il generatedPDF', async () => {
  const { html } = await fixture({ live: { ...ready, signedPdfUrl: '', generatedPDF: 'https://files.example.invalid/unsigned.pdf' } });
  assert.equal(countSigned(html), 0);
  assert.equal((html.match(/PDF firmato non è ancora disponibile/g) || []).length, 2);
  assert(!html.includes('unsigned.pdf'));
});
await check('contratto non firmato: nessuna copia finale inventata, firma inquilino prima del proprietario', async () => {
  const { html } = await fixture({ live: { ...base, generatedPDF: 'data:application/pdf;base64,UNSIGNED' } });
  assert.equal(countSigned(html), 0);
  const [tenant, landlord] = columns(html);
  assert(tenant.includes('Firma il contratto'));
  assert(!landlord.includes('Firma il contratto'));
  assert(tenant.includes('chiede SOLO: codice fiscale'), 'mancanti della Scheda preservati');
  assert(!html.includes('UNSIGNED'));
});
await check('inquilino firmato e co-conduttore mancante conservano i rispettivi percorsi', async () => {
  const { html } = await fixture({ live: { ...base, tenantSignature: 'signed', coTenants: [{ name: 'Co Persona' }] } });
  const [tenant, landlord] = columns(html);
  assert(tenant.includes('Firma il contratto — Co Persona'));
  assert(tenant.includes('Compila i tuoi dati — Co Persona'));
  assert(landlord.includes('Firma il contratto'));
  assert.equal(countSigned(html), 0);
});
await check('URL non HTTPS, data URL, credenziali o host invalidi non diventano condivisibili', async () => {
  for (const url of ['http://files.example.invalid/signed.pdf', 'data:application/pdf;base64,SIGNED', 'javascript:alert(1)', 'https://', 'https://user:password@files.example.invalid/signed.pdf', 'https://files.example.invalid/\nsigned.pdf']) {
    const { html } = await fixture({ live: { ...ready, signedPdfUrl: url } });
    assert.equal(countSigned(html), 0, url.split(':')[0]);
    assert.match(html, /PDF firmato non è ancora disponibile/);
  }
});
await check('lettura server fallita non condivide il PDF rimasto in cache', async () => {
  const { html } = await fixture({ cache: ready, fail: true });
  assert.equal(countSigned(html), 0);
  assert(!html.includes('contratto-firmato.pdf'));
  assert.match(html, /PDF firmato non è verificabile adesso/);
});
await check('contratto eliminato sul server chiude il pannello senza link dalla cache', async () => {
  const { html, io } = await fixture({ cache: ready, live: null });
  assert.equal(html, ''); assert.equal(io.requests.length, 0); assert.equal(io.signLinks, 0);
  assert.match(io.toasts[0][1], /Contratto non disponibile/);
});
await check('logout o cambio account durante la lettura server non ridisegnano PDF e contatti della sessione precedente', async () => {
  for (const nextUid of [null, 'admin-B']) {
    let release;
    const holdRead = new Promise(resolve => { release = resolve; });
    const pending = fixture({ cache: ready, holdRead, onStart: (ctx, box) => {
      ctx.auth.currentUser = nextUid ? { uid: nextUid, getIdToken: async () => 'other-token' } : null;
      box.innerHTML = 'Sessione nuova';
    } });
    release();
    const { html, io } = await pending;
    assert.equal(html, 'Sessione nuova');
    assert.equal(io.signLinks, 0);
    assert.equal(io.requests.length, 0);
    assert.equal(countSigned(html), 0);
  }
});
await check('URL con apostrofi resta un href, mai codice JavaScript o attributo iniettato', async () => {
  const url = "https://files.example.invalid/signed.pdf?x=');window.injected=true;//&text=%22%3E";
  const { html } = await fixture({ live: { ...ready, signedPdfUrl: url } });
  assert.equal(countSigned(html), 2);
  const actual = new URL(url).href;
  assert.equal(hrefs(html).filter(value => value === actual).length, 2);
  const handlers = [...html.matchAll(/onclick="([^"]*)"/g)].map(m => m[1]);
  assert(handlers.every(value => !value.includes('injected') && !value.includes('window.open')));
  assert(!html.includes('<script>'));
});
await check('mutazione rilevata: rimuovere la verifica server espone il PDF dalla cache', async () => {
  const mutant = fn.replace("if (contractVerified && typeof c.signedPdfUrl === 'string')", "if (typeof c.signedPdfUrl === 'string')");
  assert.notEqual(mutant, fn);
  const { html } = await fixture({ cache: ready, fail: true, text: mutant });
  assert.equal(countSigned(html), 2, 'la regressione produce la copia obsoleta che il test precedente vieta');
});
assert.match(source, /title="Conto addebito tributi, foglio di registrazione, ricevuta e invio al referente[^\n]*>🏛 Registrazione/);
console.log(`Share Hub UI: ${checks} scenari PASS (funzione reale, nessun invio)`);
