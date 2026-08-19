// IL PONTE DISCOVERY ⇄ SKYLINE + I TUOI POSTI.
//   1. La discovery apre la finestra SOLO alla vista mappa, col src giusto,
//      e le manda i suoi filtri (boomTieni).
//   2. Lo skyline VERO (repo), con un maplibre finto iniettato: i pin
//      nascono, boomTieni ne spegne una parte, i posti salvati (boom:pois)
//      salgono come ancore e il chip ≤25′ filtra per distanza.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const SCRATCH = '/tmp/claude-0/-home-user-Boum-roma/23da0292-7660-5078-842d-6e153c49b7f8/scratchpad';
const SKY = fs.readFileSync('/home/user/Boum-roma/skyline.html', 'utf8');

// un maplibre finto: quel che basta perché boot() arrivi in fondo
const FINTO = `<script>
window.maplibregl = {
  Map: function (o) {
    this._h = {};
    this.on = (ev, cb) => { (this._h[ev] = this._h[ev] || []).push(cb);
      if (ev === 'load') setTimeout(cb, 0); };
    this.addControl = () => {}; this.addSource = () => {};
    this.addLayer = () => {};
    this.getSource = () => ({ setData: () => {} });
    this.getStyle = () => ({ layers: [], sources: {} });
    this.getLayer = () => null; this.setTerrain = () => {};
    this.setSky = () => {}; this.fitBounds = () => {};
    this.setLayoutProperty = () => {}; this.setPaintProperty = () => {};
  },
  NavigationControl: function () {}, FullscreenControl: function () {},
  LngLatBounds: function () { this.extend = () => {}; },
  Marker: function (o) {
    this._el = (o && o.element) || document.createElement('div');
    this.setLngLat = () => this; this.setPopup = () => this;
    this.addTo = () => { document.body.appendChild(this._el); return this; };
    this.remove = () => { this._el.remove(); };
    this.getElement = () => this._el;
  },
  Popup: function () { this.setHTML = () => this; },
};
</script>`;

const CASE = [
  { id: 'vic', name: 'Casa Vicina', zone: 'Prati', price: 1200,
    status: 'available', lat: 41.9100, lng: 12.4632 },
  { id: 'lon', name: 'Casa Lontana', zone: 'Pigneto', price: 1500,
    status: 'available', lat: 41.8880, lng: 12.5380 },
];

(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ok = 0, ko = 0;
  const assai = (n, c) => { c ? ok++ : (ko++, console.log('  ✗', n)); };

  // ── 1 · lo skyline da solo, col maplibre finto ─────────────────────────
  {
    const pg = await br.newPage();
    await pg.route('**/api/listings', r => r.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ ok: true, listings: CASE }) }));
    await pg.route(/jsdelivr|openfreemap|googletagmanager|fonts\./, r => r.abort());
    await pg.route('**/skyline*', r => r.fulfill({ contentType: 'text/html',
      body: SKY.replace('</head>', FINTO + '</head>') }));
    await pg.addInitScript(() => {
      localStorage.setItem('boom:pois',
        JSON.stringify([{ name: 'Ufficio Prati', lat: 41.9095, lng: 12.4640 }]));
    });
    await pg.goto('http://localhost:8123/skyline?x=1', { waitUntil: 'load' });
    await pg.waitForTimeout(800);
    const st = await pg.evaluate(() => ({
      pins: document.querySelectorAll('.sky-pin').length,
      miei: [...document.querySelectorAll('.sky-mine')].map(e => e.textContent),
      chipVicino: !document.getElementById('vicinoChip').hidden,
    }));
    assai('i pin nascono (2 case)', st.pins === 2);
    assai('il posto salvato sale come ancora', st.miei.length === 1 && /Ufficio Prati/.test(st.miei[0]));
    assai('il chip ≤25′ compare (c\'è un posto)', st.chipVicino);

    // boomTieni spegne la casa esclusa dai filtri della discovery
    await pg.evaluate(() => window.postMessage({ t: 'boomTieni', ids: ['vic'] }, location.origin));
    await pg.waitForTimeout(150);
    const dim1 = await pg.evaluate(() => ({
      vic: [...document.querySelectorAll('.sky-pin')].find(p => p.__id === 'vic').classList.contains('dim'),
      lon: [...document.querySelectorAll('.sky-pin')].find(p => p.__id === 'lon').classList.contains('dim'),
    }));
    assai('boomTieni: la casa filtrata resta, l\'altra si spegne', !dim1.vic && dim1.lon);

    // ≤25′: solo la casa vicina all'ufficio resta accesa
    await pg.evaluate(() => window.postMessage({ t: 'boomTieni', ids: ['vic', 'lon'] }, location.origin));
    await pg.click('#vicinoChip');
    await pg.waitForTimeout(120);
    const dim2 = await pg.evaluate(() => ({
      vic: [...document.querySelectorAll('.sky-pin')].find(p => p.__id === 'vic').classList.contains('dim'),
      lon: [...document.querySelectorAll('.sky-pin')].find(p => p.__id === 'lon').classList.contains('dim'),
    }));
    assai('≤25′ dal mio posto: vicina accesa, lontana spenta', !dim2.vic && dim2.lon);

    // il pannello: la lista mostra il posto, la ✕ lo toglie
    await pg.click('#mieiChip');
    const inLista = await pg.evaluate(() =>
      document.querySelectorAll('#mieiRighe .r').length);
    assai('il pannello elenca il posto', inLista === 1);
    await pg.click('#mieiRighe .r button');
    await pg.waitForTimeout(100);
    const dopo = await pg.evaluate(() => ({
      righe: document.querySelectorAll('#mieiRighe .r').length,
      ancore: document.querySelectorAll('.sky-mine').length,
      salvati: JSON.parse(localStorage.getItem('boom:pois') || '[]').length,
      chip: document.getElementById('vicinoChip').hidden,
    }));
    assai('la ✕ toglie ovunque (lista, mappa, memoria, chip)',
      dopo.righe === 0 && dopo.ancore === 0 && dopo.salvati === 0 && dopo.chip);
    await pg.close();
  }

  // ── 2 · la discovery apre la finestra e le parla ───────────────────────
  {
    const pg = await br.newPage();
    await pg.route(/googletagmanager|fonts\.|firestore|jsdelivr|openfreemap/, r => r.abort());
    await pg.route('**/skyline?embed=1', r => r.fulfill({ contentType: 'text/html',
      body: '<script>window.__msg=[];addEventListener("message",e=>window.__msg.push(e.data));</script>ok' }));
    await pg.goto('http://localhost:8123/boom-discovery-sito.html', { waitUntil: 'load' });
    await pg.waitForTimeout(1200);
    assai('griglia: nessuna finestra prima della vista mappa',
      await pg.evaluate(() => !document.querySelector('#cieloMappa iframe')));
    await pg.click('#vCielo');
    await pg.waitForTimeout(900);
    const fin = await pg.evaluate(() => {
      const f = document.querySelector('#cieloMappa iframe');
      return { c: !!f, src: f ? f.getAttribute('src') : '',
        velo: document.getElementById('cieloVelo').classList.contains('via'),
        msg: f && f.contentWindow.__msg ? f.contentWindow.__msg : [] };
    });
    assai('la finestra si apre su /skyline?embed=1', fin.c && fin.src === '/skyline?embed=1');
    assai('il velo si alza al load', fin.velo);
    assai('boomTieni arriva nella finestra con gli id delle case',
      fin.msg.some(m => m && m.t === 'boomTieni' && Array.isArray(m.ids) && m.ids.length > 0));
    await pg.close();
  }

  await br.close();
  console.log(ko ? `KO: ${ko} (${ok} ok)` : `CIELO PONTE + POSTI: ${ok} ok`);
  process.exit(ko ? 1 : 0);
})();
