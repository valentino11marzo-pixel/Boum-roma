// tests/owners/run.mjs — /owners, «LA PIANTA CHE SI ALZA».
//
// La pagina dei proprietari dice «ti diamo le carte»: questa suite è il
// motivo per cui la frase regge. Asserisce che OGNI cifra in pagina venga da
// una sorgente sola (owner-offer · ASPI_DEFAULTS · catalogo · motore canone),
// che ogni stanza accesa abbia dietro un file vero generato dai builder di
// produzione, e che ciò che dipende da una decisione non ancora presa
// (cancello P0-canone, giorni di riversamento, polizza, referente, recesso)
// NON esca — e che esca, identico, il giorno in cui il campo si scrive.
//
// La vecchia /owners prometteva una «garanzia di solvibilità nel mandato» che
// il mandato non conteneva: il difetto non era la frase, era che niente la
// confrontava con un file. Qui il confronto è la regola.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (t, c, extra) => {
  if (c) { pass++; console.log('  \x1b[32m✓\x1b[0m ' + t); }
  else { fail++; console.log('  \x1b[31m✗ ' + t + '\x1b[0m' + (extra ? '\n      ' + String(extra).slice(0, 400) : '')); }
};
const sez = (t) => console.log('\n\x1b[1m▸ ' + t + '\x1b[0m');

const HTML = fs.readFileSync(path.join(ROOT, 'owners.html'), 'utf8');
const O = require(path.join(ROOT, 'js/owner-offer.js'));
const CAN = require(path.join(ROOT, 'js/canone-engine.js'));
const { ASPI_DEFAULTS } = await import(pathToFileURL(path.join(ROOT, 'api/fiscal/_aspi.js')).href);
const { CATALOG } = await import(pathToFileURL(path.join(ROOT, 'api/_catalog.js')).href);
const K = await import(pathToFileURL(path.join(ROOT, 'design/owners/costruisci-owners.mjs')).href);
const gz = (s) => zlib.gzipSync(Buffer.from(s)).length;
const visibile = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')
  .replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const TESTO = visibile(HTML);

console.log('\n\x1b[1m▸ owners\x1b[0m  la pagina dei proprietari: le cifre da una fonte, le carte vere, le promesse spente spente');

// ── 1 · i prezzi in quattro punti ───────────────────────────────────────
sez('i prezzi: una sorgente, quattro posti');
{
  const off = O.OFFER;
  ok('pratiche di owner-offer = ASPI_DEFAULTS (89 · 189)',
    off.pratiche.registrazioneEur === ASPI_DEFAULTS.prezzoRegistrazione && off.pratiche.attestazioneEur === ASPI_DEFAULTS.prezzoAsseverazione);
  ok('pacchetto concordato di owner-offer = catalogo', off.pacchettoConcordatoEur === CATALOG['concordato-pack'].eur);
  ok('prima locazione: 0 € al proprietario', off.primaLocazione.provvigioneProprietario === 0);
  const inq = O.provvigioneInquilino(1200), mezza = O.provvigione(1200, 0.5), una = O.provvigione(1200, 1);
  ok('aritmetica: 10% di 12 × 1.200 + IVA = 1.756,80', inq.totale === 1756.8);
  ok('aritmetica: ½ e 1 mensilità + IVA = 732 · 1.464', mezza.totale === 732 && una.totale === 1464);
  for (const [cosa, s] of [['1.756,80 €', O.eur(inq.totale)], ['732 €', O.eur(mezza.totale)], ['1.464 €', O.eur(una.totale)],
    ['89 €', O.eur(ASPI_DEFAULTS.prezzoRegistrazione)], ['189 €', O.eur(ASPI_DEFAULTS.prezzoAsseverazione)], ['349 €', O.eur(CATALOG['concordato-pack'].eur)]]) {
    ok(`in pagina compare ${cosa}`, TESTO.includes(s), s);
  }
  // la FAQ e «in breve» dicono gli stessi numeri della tabella
  const faq = K.domandeVisibili(HTML);
  const f1 = faq.find((f) => /provvigione della prima locazione/.test(f.q));
  ok('la FAQ della provvigione ripete i numeri della tabella', f1 && f1.a.includes('1.756,80 €') && f1.a.includes('89 €') && f1.a.includes('189 €'));
  const breve = visibile(HTML.slice(HTML.indexOf('class="itbref"'), HTML.indexOf('class="fonti"')));
  ok('«in breve» ha 89 €, 189 € e 349 €', ['89 €', '189 €', '349 €'].every((x) => breve.includes(x)), breve);
  ok('la tabella dichiara «IVA compresa»', /<caption>[^<]*IVA compresa/.test(HTML));
}

// ── 1b · il mandato dice i prezzi della pagina ──────────────────────────
sez('il mandato del portale stampa le righe di owner-offer (P0 n. 3)');
{
  const prima = O.mandatoRighe({ modello: 'prima', successive: 0.5 }).join('\n');
  const una = O.mandatoRighe({ modello: 'prima', successive: 1 }).join('\n');
  const plur = O.mandatoRighe({ modello: 'pluriennale', feeAnnua: 2400 }).join('\n');
  ok('prima locazione: 0 € al mandante, provvigione a carico del conduttore (10% annuo + IVA)',
    /pari a 0 €/.test(prima) && /a carico del conduttore \(di norma il 10% del canone annuo più IVA\)/.test(prima));
  ok('dalla seconda: mezza o una mensilità + IVA, come la tabella', /mezza mensilità del canone più IVA/.test(prima) && /una mensilità del canone più IVA/.test(una));
  ok('le pratiche nel mandato sono quelle della pagina (89 € · 189 €)', prima.includes(O.eur(ASPI_DEFAULTS.prezzoRegistrazione)) && prima.includes(O.eur(ASPI_DEFAULTS.prezzoAsseverazione)));
  ok('pluriennale: fee annua, registrazione e attestazione dentro, imposte fuori', /compenso annuo fisso di 2\.400 € più IVA/.test(plur) && /registrazione/.test(plur) && /imposte \(registro e bolli\)/.test(plur));
  ok('riversamento e recesso escono SOLO se scritti', !/riversati|recedere/.test(prima)
    && /entro 5 giorni lavorativi/.test(O.mandatoRighe({ riversamentoGiorni: 5 }).join(' ')) && /preavviso di 30 giorni/.test(O.mandatoRighe({ recessoGiorni: 30 }).join(' ')));
  ok('finché la garanzia non è attiva, il mandato lo dice', O.OFFER.garanzia.stato === 'attiva' || /non contiene garanzie sul pagamento dei canoni/.test(prima));
  const portal = fs.readFileSync(path.join(ROOT, 'js/portal-app.js'), 'utf8');
  const phtml = fs.readFileSync(path.join(ROOT, 'portal.html'), 'utf8');
  ok('il PDF del mandato usa BOOM_OWNER_OFFER.mandatoRighe (una copia sola)', /BOOM_OWNER_OFFER\.mandatoRighe\(/.test(portal));
  ok('portal.html carica owner-offer.js prima di portal-app.js',
    phtml.indexOf('<script src="/js/owner-offer.js">') > 0 && phtml.indexOf('<script src="/js/owner-offer.js">') < phtml.indexOf('<script src="/js/portal-app.js">'));
  ok('il modulo del mandato offre ½ e 1 mensilità, come OFFER.successive',
    JSON.stringify(O.OFFER.successive.mensilita) === '[0.5,1]' && /name="feeNext"><option value="0\.5">Mezza mensilità \+ IVA<\/option><option value="1">Una mensilità \+ IVA/.test(portal));
}

// ── 2 · il motore del canone, ricalcolato qui ───────────────────────────
sez('il canone d\'esempio (C40 Prati, 70 m²) ricalcolato col motore');
{
  const z = CAN.ZONES.find((x) => x.cod === 'C40');
  const r = (n, tipo = 'stud') => Math.round(CAN.computeCanone({ zona: z, mq: 70, tipo, parIdx: [...Array(n).keys()] }).cMax);
  ok('fascia A (0 dotazioni) = 896', r(0) === 896);
  ok('fascia B (3 dotazioni) = 1.288', r(3) === 1288);
  ok('fascia C (7 dotazioni) = 1.540', r(7) === 1540);
  ok('netto con cedolare 10% su 1.540 = 1.386', Math.round(1540 * 0.9) === 1386);
  ok('provvigione inquilino 10% annuo su 1.288 = 1.545,60 (imponibile)', O.eur(Math.round(1288 * 12 * 0.10 * 100) / 100) === '1.545,60 €');
  ok('il transitorio non supera il tetto di fascia (+10% con cap)', r(7, 'trans') === 1540);
}

// ── 3 · le 75 zone ──────────────────────────────────────────────────────
sez('il menu delle zone: le 75 del motore, in ordine alfabetico');
{
  const blocco = HTML.slice(HTML.indexOf('<!-- OWNERS_ZONE:START -->'), HTML.indexOf('<!-- OWNERS_ZONE:END -->'));
  const opt = [...blocco.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map((m) => ({ cod: m[1], txt: m[2] }));
  ok('75 opzioni', opt.length === 75, opt.length);
  ok('gli stessi codici del motore', JSON.stringify(opt.map((o) => o.cod).sort()) === JSON.stringify(CAN.ZONES.map((z) => z.cod).sort()));
  const nomi = opt.map((o) => o.txt.split(' · ')[0]);
  ok('in ordine alfabetico', nomi.every((n, i) => i === 0 || nomi[i - 1].localeCompare(n, 'it') <= 0));
  ok('ogni voce è «Nome · CODICE»', opt.every((o) => o.txt.endsWith(' · ' + o.cod)));
  ok('Monteverde Vecchio (C12) e Monteverde Nuovo (C13) ci sono',
    opt.some((o) => o.cod === 'C12' && /Monteverde Vecchio/.test(o.txt)) && opt.some((o) => o.cod === 'C13' && /Monteverde Nuovo/.test(o.txt)));
  ok('prima voce vuota, ultima «Non la trovo → WhatsApp»',
    /<select id="zona"[^>]*>\s*<option value="">/.test(HTML) && /<option value="__wa">Non la trovo/.test(HTML));
  ok('niente optgroup', !/<optgroup/.test(HTML));
}

// ── 4 · le carte ────────────────────────────────────────────────────────
sez('le carte: file veri, timbrati ESEMPIO, la riga identica in pagina');
const MAN_P = path.join(ROOT, 'carte/manifest.json');
const MAN = fs.existsSync(MAN_P) ? JSON.parse(fs.readFileSync(MAN_P, 'utf8')) : null;
ok('carte/manifest.json esiste (node design/owners/genera-fascicolo.mjs)', !!MAN);
if (MAN) {
  let PDFDocument = null, PDFName = null;
  try { ({ PDFDocument, PDFName } = createRequire(path.join(ROOT, 'api/'))('pdf-lib')); } catch { /* sotto: skip dichiarato */ }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const gated = (it) => it.gate === 'canone.verificato' && O.OFFER.canone.verificato !== true;
  for (const it of MAN.items) {
    if (it.pdf) {
      const f = path.join(ROOT, it.pdf);
      ok(`${it.id}: il PDF esiste e sta sotto 250 KB`, fs.existsSync(f) && fs.statSync(f).size <= 250 * 1024, it.pdf);
      if (PDFDocument && fs.existsSync(f)) {
        const doc = await PDFDocument.load(fs.readFileSync(f), { updateMetadata: false });
        const meta = (doc.getSubject() || '') + ' ' + (doc.getTitle() || '');
        ok(`${it.id}: metadati «ESEMPIO — dati inventati»`, meta.includes('ESEMPIO — dati inventati'), meta);
        const timbrate = doc.getPages().filter((p) => {
          const res = p.node.Resources();
          const xo = res && res.lookup(PDFName.of('XObject'));
          return xo && xo.keys().some((k) => /BoomEsempio/.test(k.asString()));
        }).length;
        ok(`${it.id}: il timbro su ogni pagina (${timbrate}/${doc.getPageCount()})`, timbrate === doc.getPageCount());
      }
    }
    if (it.thumb) {
      const f = path.join(ROOT, it.thumb.src);
      ok(`${it.id}: la miniatura esiste, WebP, ≤ ${it.id === 'casa-guasti' ? 80 : 60} KB`,
        fs.existsSync(f) && /\.webp$/.test(f) && fs.statSync(f).size <= (it.id === 'casa-guasti' ? 80 : 60) * 1024, it.thumb.src);
    }
    if (it.riquadro) {
      const q = it.riquadro;
      ok(`${it.id}: il riquadro sta dentro 595×842`, q.x >= 0 && q.y >= 0 && q.x + q.w <= 595 && q.y + q.h <= 842, JSON.stringify(q));
    }
    if (gated(it)) {
      ok(`${it.id}: dietro il cancello canone, NON in pagina`, !HTML.includes(it.pdf || '§'));
    } else if (it.riga) {
      ok(`${it.id}: la riga del PDF è trascritta identica in pagina`, HTML.includes(`<p class="riga">${esc(it.riga)}</p>`), it.riga);
    }
  }
  ok('lo ZIP esiste e sta sotto 2,5 MB', MAN.zip && fs.existsSync(path.join(ROOT, MAN.zip.file)) && fs.statSync(path.join(ROOT, MAN.zip.file)).size <= 2.5 * 1048576);
  ok('lo ZIP ha il LEGGIMI', MAN.zip && MAN.zip.entries.includes('LEGGIMI.txt'));
  ok('lo ZIP non porta la scheda finché il cancello è chiuso',
    O.OFFER.canone.verificato === true || !MAN.zip.entries.some((e) => /scheda/i.test(e)));
}

// ── 5 · la pianta: ogni stanza un'ancora, ogni luce accesa un file ──────
sez('la pianta: stanze, ancore, file');
{
  const et = [...HTML.matchAll(/<a class="et"[^>]*href="#([a-z]+)"[^>]*data-stanza="([a-z]+)"|<a class="et"[^>]*data-stanza="([a-z]+)"[^>]*href="#([a-z]+)"/g)]
    .map((m) => m[1] || m[4]);
  ok('sei etichette sulla pianta', new Set(et).size === 6, et.join(','));
  for (const s of K.STANZE) ok(`#${s}: la sezione esiste`, HTML.includes(`<section class="stanza" id="${s}"`));
  const CARTA_DI = { porta: 'verbale', cassaforte: 'proposta', soggiorno: 'inventario-ingresso', cucina: 'casa-guasti', scrivania: 'contratto-studenti', cassetta: 'rendiconto' };
  for (const [s, id] of Object.entries(CARTA_DI)) {
    const i = HTML.indexOf(`id="${s}"`), j = HTML.indexOf('</section>', i);
    const it = MAN && MAN.items.find((x) => x.id === id);
    const file = it && (it.pdf || (it.thumb && it.thumb.src));
    ok(`la luce di «${s}» ha il suo file (${id})`, !!file && HTML.slice(i, j).includes(file) && fs.existsSync(path.join(ROOT, file)));
  }
  ok('le due luci spente dette a parole, non col solo colore', (TESTO.match(/spent[ae]/g) || []).length >= 4);
}

// ── 6 · il costruttore: a secco, nessuna differenza ─────────────────────
sez('il costruttore è idempotente e la pagina è quella che produce');
{
  const src = await K.sorgenti();
  const out = K.costruisci(HTML, src);
  ok('build a secco senza differenze', out === HTML, 'rilancia: node design/owners/costruisci-owners.mjs');
  ok('rilanciarla non cambia un byte', K.costruisci(out, src) === out);
}

// ── 7 · i blocchi che dipendono da una decisione ────────────────────────
sez('le promesse spente restano spente — e si accendono quando il campo c\'è');
{
  const src = await K.sorgenti();
  const chiusa = O.OFFER.canone.verificato !== true;
  if (chiusa) {
    ok('cancello chiuso: html[data-canone="chiuso"]', /<html lang="it" data-canone="chiuso">/.test(HTML));
    ok('cancello chiuso: nessun tetto del motore in pagina (niente «fino a … € al mese»)', !/fino a [\d.]+ € al mese/.test(TESTO));
    ok('cancello chiuso: niente foglio vivo, niente scheda, niente timbro STIMA',
      !HTML.includes('id="foglio"') && !HTML.includes('scheda-canone') && !HTML.includes('STIMA · DA CONFERMARE'));
  }
  if (!O.OFFER.incasso.riversamentoGiorniLavorativi) ok('senza giorni di riversamento, nessun numero di giorni', !/giorni lavorativi dall'incasso/.test(TESTO));
  if (!O.OFFER.incasso.direttoDisponibile) ok('senza corsia diretta, nessun «li incassi tu»', !/li incassi tu/i.test(TESTO));
  if (!O.OFFER.polizzaRC) ok('senza polizza, nessuna polizza in pagina', !/Polizza/.test(TESTO));
  if (!O.OFFER.referente) ok('senza referente, nessun nome di referente', !/Un referente con nome e cognome:/.test(TESTO));
  if (!O.OFFER.mandato.pdf) ok('senza il PDF del mandato, niente link al mandato né FAQ sul recesso', !/Posso uscire dal mandato/.test(TESTO) && !/data-carta="mandato"/.test(HTML));
  if (!(O.OFFER.prova.google && O.OFFER.prova.google.url)) ok('senza il link al profilo, nessuna ★', !/★/.test(HTML));
  ok('la garanzia non esiste e la pagina lo dice', O.OFFER.garanzia.stato !== 'attiva' && /garanzia sui canoni oggi non c/.test(TESTO));
  // e il giorno che i campi si scrivono, escono (la macchina funziona)
  const acceso = JSON.parse(JSON.stringify(O.OFFER));
  acceso.canone.verificato = true; acceso.incasso.riversamentoGiorniLavorativi = 5;
  acceso.polizzaRC = { compagnia: 'Compagnia Esempio', numero: 'X-1' }; acceso.referente = { nome: 'Nome Esempio', sostituto: 'Altro Esempio' };
  acceso.mandato = { pdf: '/carte/mandato-esempio.pdf', recessoPreavvisoGiorni: 30 };
  acceso.prova.google = { url: 'https://g.page/r/esempio/review', stelle: 4.9, recensioni: 47, lettoIl: '23/09/2026' };
  const h2 = K.costruisci(HTML, { ...src, O: { ...O, OFFER: acceso } });
  const t2 = visibile(h2);
  ok('cancello aperto: data-canone="aperto", foglio e tetto 1.540 €', h2.includes('data-canone="aperto"') && h2.includes('id="foglio"') && /fino a 1\.540 € al mese/.test(t2));
  ok('giorni di riversamento: escono', /entro 5 giorni lavorativi dall'incasso/.test(t2));
  ok('polizza e referente: escono', /Compagnia Esempio, n\. X-1/.test(t2) && /Nome Esempio/.test(t2));
  ok('mandato: link e FAQ del recesso, e la FAQ entra nel JSON-LD', /Posso uscire dal mandato/.test(t2) && /"name":"Posso uscire dal mandato\?"/.test(h2));
  ok('★ solo con il link al profilo', /<a href="https:\/\/g\.page\/r\/esempio\/review"[^>]*>★ 4,9/.test(h2));
  ok('rimettere i campi a null spegne tutto di nuovo', K.costruisci(h2, src) === HTML);
}

// ── 8 · le parole ───────────────────────────────────────────────────────
sez('le parole: niente promesse senza file, niente capitoli numerati');
{
  const VIETATE = [/canoni? garantit/i, /solvibilit/i, /24\s*\/\s*7/, /in tempo reale/i, /zero rischi|senza rischi|nessun rischio/i,
    /numero uno|n\.\s*1 a roma/i, /i migliori inquilini/i, /\bverbatim\b/i, /garanzia di/i];
  for (const re of VIETATE) ok(`nessun «${re.source}»`, !re.test(TESTO), (TESTO.match(re) || [])[0]);
  const scriv = visibile(HTML.slice(HTML.indexOf('id="scrivania"'), HTML.indexOf('id="cassetta"')));
  ok('il transitorio non è mai «parola per parola»', !/parola per parola/.test(scriv));
  const luoghi = [...HTML.matchAll(/<p class="luogo">([\s\S]*?)<\/p>/g)].map((m) => visibile(m[1]).trim());
  ok('nessun occhiello numerato (01 ·, I., Capitolo, Tappa)', luoghi.every((l) => !/^(\d|[IVX]+\.|capitolo|tappa|step)/i.test(l)), luoghi.join(' | '));
  ok('nessun link a /canone', !/href="\/canone"/.test(HTML));
  ok('nessuna ★ fuori da un link', [...HTML.matchAll(/★/g)].every((m) => /<a [^>]*href=[^>]*>[^<]*$/.test(HTML.slice(Math.max(0, m.index - 200), m.index))));
  ok('un solo H1', (HTML.match(/<h1[\s>]/g) || []).length === 1);
  ok('mai il #D4AF37 del portal su una pagina pubblica', !/#D4AF37/i.test(HTML));
}

// ── 9 · FAQ = FAQPage ───────────────────────────────────────────────────
sez('le domande visibili sono le domande dichiarate');
{
  const faq = K.domandeVisibili(HTML);
  ok('da 6 a 8 domande', faq.length >= 6 && faq.length <= 8, faq.length);
  const m = /<!-- OWNERS_JSONLD:START -->\s*<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/.exec(HTML);
  const ld = m && JSON.parse(m[1]);
  const fp = ld && ld['@graph'].find((n) => n['@type'] === 'FAQPage');
  ok('il FAQPage ha le stesse domande, nello stesso ordine', fp && JSON.stringify(fp.mainEntity.map((q) => q.name)) === JSON.stringify(faq.map((f) => f.q)));
  const wp = ld && ld['@graph'].find((n) => n['@type'] === 'WebPage');
  ok('speakable punta a nodi veri (.soglia .sub, .itbref)', wp && HTML.includes('class="sub"') && HTML.includes('class="itbref"'));
}

// ── 10 · la card social ─────────────────────────────────────────────────
sez('og-owners.png');
{
  const f = path.join(ROOT, 'og-owners.png');
  const b = fs.existsSync(f) ? fs.readFileSync(f) : null;
  ok('esiste, ≤ 120 KB', b && b.length <= 120 * 1024, b && b.length);
  ok('IHDR 1200×630', b && b.readUInt32BE(16) === 1200 && b.readUInt32BE(20) === 630);
  ok('dichiarata in og:image e twitter:image', /og:image" content="https:\/\/www\.boomrome\.com\/og-owners\.png"/.test(HTML) && /twitter:image" content="https:\/\/www\.boomrome\.com\/og-owners\.png"/.test(HTML));
}

// ── 11 · i pesi ─────────────────────────────────────────────────────────
sez('i pesi: la pagina si legge senza aspettare niente');
{
  ok(`owners.html ≤ 42 KB gzip (${(gz(HTML) / 1024).toFixed(1)})`, gz(HTML) <= 42 * 1024);
  const css = [...HTML.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('');
  ok(`CSS inline ≤ 16 KB gzip (${(gz(css) / 1024).toFixed(1)})`, gz(css) <= 16 * 1024);
  for (const [f, max] of [['js/owners-app.js', 8], ['js/owners-pianta.js', 3]]) {
    const p = path.join(ROOT, f);
    const g = fs.existsSync(p) ? gz(fs.readFileSync(p, 'utf8')) : Infinity;
    ok(`${f} ≤ ${max} KB gzip (${(g / 1024).toFixed(1)})`, g <= max * 1024);
  }
  const src = [...HTML.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  ok('nessuno script esterno oltre al tag di misura sotto consenso', src.every((s) => s.startsWith('/') || s.startsWith('https://www.googletagmanager.com/gtag/js')), src.join(' '));
  ok('nessun foglio di stile esterno', [...HTML.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].every((m) => m[1].startsWith('/')));
  ok('nessuna immagine esterna', ![...HTML.matchAll(/<img[^>]+src="([^"]+)"/g)].some((m) => /^https?:/.test(m[1])));
  ok('niente boom-ambient, niente reveal .rv', !/boom-ambient|class="rv"| rv"/.test(HTML));
}

// ── 12 · il modulo contro il handler vero ───────────────────────────────
sez('il modulo: ownersPayload() contro api/partners/submit.js');
{
  let app = null;
  try { app = require(path.join(ROOT, 'js/owners-app.js')); } catch (e) { ok('js/owners-app.js si carica in Node', false, e.message); }
  if (app && typeof app.ownersPayload === 'function') {
    const written = [];
    globalThis.fetch = async (url, opts = {}) => {
      const u = String(url);
      if (u.includes('identitytoolkit') || u.includes('securetoken')) return { ok: true, status: 200, json: async () => ({ idToken: 'fake', localId: 'admin' }) };
      if (u.includes('api.telegram.org')) return { ok: true, status: 200, json: async () => ({ ok: true, result: {} }) };
      if (u.includes('firestore.googleapis.com')) {
        if ((opts.method || 'GET') === 'POST') { written.push({ url: u, body: JSON.parse(opts.body || '{}') }); return { ok: true, status: 200, json: async () => ({ name: 'p/documents/leads/x1' }) }; }
        return { ok: true, status: 200, json: async () => ({ documents: [] }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };
    const partners = await import(pathToFileURL(path.join(ROOT, 'api/partners/submit.js')).href);
    let ip = 0;
    const call = async (body) => {
      written.length = 0; let code = 0, payload = null;
      const res = { setHeader() {}, status(c) { code = c; return this; }, json(j) { payload = j; return this; }, end() { return this; } };
      await partners.default({ method: 'POST', headers: { 'x-forwarded-for': `10.9.0.${++ip}` }, body, socket: {} }, res);
      return { code, payload, leads: written.filter((w) => w.url.includes('/leads')) };
    };
    const base = { name: 'Anna Esempio', phone: '+39 333 123 4567', email: '', where: '', casa: null, vol: '', co: false, orgName: '', msg: '', gar: false, company: '' };
    const p1 = app.ownersPayload({ ...base, casa: { cod: 'C40', nome: 'Prati', mq: 70 } });
    ok('il payload è kind owner, lang it, org «C40 PRATI»', p1.kind === 'owner' && p1.lang === 'it' && p1.org === 'C40 PRATI', JSON.stringify(p1));
    ok('nessuna traccia delle domande tolte (soldi, inquilino già presente)', !/Soldi:|Inquilino già presente/.test(p1.message || ''));
    const r1 = await call(p1);
    const d1 = r1.leads[0] && r1.leads[0].body.fields;
    ok('solo telefono → 200, un lead', r1.code === 200 && r1.leads.length === 1, JSON.stringify(r1.payload));
    ok('il lead è landlord, in italiano, con la zona', d1 && d1.leadType.stringValue === 'landlord' && d1.language.stringValue === 'it' && d1.zone.stringValue === 'C40 PRATI');
    const r2 = await call(app.ownersPayload({ ...base, email: 'anna@esempio' }));
    ok('email sbagliata → 400', r2.code === 400 && r2.leads.length === 0);
    const r3 = await call(app.ownersPayload({ ...base, phone: '123' }));
    ok('telefono corto → 400', r3.code === 400 && r3.leads.length === 0);
    const r4 = await call(app.ownersPayload({ ...base, company: 'bot' }));
    ok('honeypot → 200 senza scrittura', r4.code === 200 && r4.leads.length === 0);
    const r5 = await call(app.ownersPayload({ ...base, vol: '6-20', co: true, orgName: 'Esempio Immobiliare S.r.l.', gar: true }));
    const d5 = r5.leads[0] && r5.leads[0].body.fields;
    const txt5 = d5 ? JSON.stringify(d5) : '';
    ok('portafoglio: «PORTAFOGLIO — 6-20 unità», la società e l\'interesse per la garanzia', r5.code === 200 && /PORTAFOGLIO — 6-20 unità/.test(txt5) && /Esempio Immobiliare/.test(txt5) && /Garanzia: interessato/.test(txt5));
  } else if (app) ok('js/owners-app.js esporta ownersPayload()', false);
}

console.log(fail ? `\n  \x1b[31m${fail} guasti\x1b[0m — ${pass} passed, ${fail} failed` : `\n  \x1b[32m/owners regge\x1b[0m — ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
