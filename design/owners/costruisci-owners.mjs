#!/usr/bin/env node
/* design/owners/costruisci-owners.mjs — IL COSTRUTTORE DI /owners.
 *
 * owners.html è scritta a mano (il testo, la struttura, lo stile della
 * pagina); questo script riempie SOLO i marcatori, da sorgenti che esistono
 * già nel repo, così nessuna cifra e nessun disegno si copiano a mano:
 *
 *  - la pianta (design/owners/pianta.mjs + pianta.css)       → OWNERS_PIANTA,
 *    RITAGLIO:<stanza>, OWNERS_ACCESO, OWNERS_PALAZZO, OWNERS_CSS_PIANTA
 *  - lo stile della pagina viva (design/owners/owners-app.css) → OWNERS_CSS_APP
 *  - le 75 zone dell'accordo (js/canone-engine.js ZONES)      → OWNERS_ZONE
 *  - i prezzi (js/owner-offer.js, ASPI_DEFAULTS, api/_catalog.js)
 *                                             → OWNERS_PREZZI, OWNERS_BREVE_PREZZI
 *  - le carte d'esempio (carte/manifest.json, generato da genera-fascicolo.mjs)
 *                                             → CARTA:<id>, OWNERS_ZIP
 *  - i blocchi che dipendono da una decisione (CLAIM:<nome>): escono SOLO
 *    quando il campo di owner-offer che li regge è scritto. Senza, al loro
 *    posto c'è il testo prudente o niente — mai una promessa senza file.
 *  - il cancello P0-canone (html[data-canone]) e l'esito d'esempio
 *  - il JSON-LD (WebPage + FAQPage dalle <summary> VISIBILI di #domande)
 *
 * Idempotente: rilanciarlo senza cambiare le sorgenti non cambia un byte.
 * `--check` non scrive e fallisce se owners.html non è quella che uscirebbe
 * (tests/owners la chiama: una pagina ritoccata a mano dentro un marcatore
 * si vede subito).
 *
 *   node design/owners/costruisci-owners.mjs [--check]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(QUI, '..', '..');
const require = createRequire(import.meta.url);
const SITO = 'https://www.boomrome.com';

// ── attrezzi ────────────────────────────────────────────────────────────
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function sostituisci(html, nome, dentro, css = false) {
  const a = css ? `/* ${nome}:START */` : `<!-- ${nome}:START -->`;
  const b = css ? `/* ${nome}:END */` : `<!-- ${nome}:END -->`;
  const i = html.indexOf(a), j = html.indexOf(b);
  if (i < 0 || j < 0 || j < i) throw new Error('marcatore mancante: ' + nome);
  const corpo = dentro ? '\n' + String(dentro).replace(/\s+$/, '') + '\n' : '\n';
  return html.slice(0, i + a.length) + corpo + html.slice(j);
}

/** Euro all'italiana, deterministico (la lezione small-ICU di /executive). */
export function eur(n, dec) {
  if (n == null || !isFinite(n)) return '—';
  const d = dec == null ? (Math.round(n) === n ? 0 : 2) : dec;
  const [i, f] = Math.abs(n).toFixed(d).split('.');
  return (n < 0 ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (f ? ',' + f : '') + ' €';
}
const kb = (b) => Math.max(1, Math.round(b / 1024)) + ' KB';
const mb = (b) => (b / 1048576).toFixed(1).replace('.', ',') + ' MB';

// ── le zone: «Monteverde Nuovo · C13», in ordine alfabetico ─────────────
const PICCOLE = new Set(['di', 'da', 'del', 'della', 'delle', 'dei', 'degli', 'dello', 'e', 'a', 'al', 'in']);
const SIGLE = new Set(['EUR']);
export function titoloZona(nome) {
  let primo = true;
  return String(nome).split(' ').map((w) => {
    if (/[a-z]/.test(w)) { primo = false; return w; }          // «(Via Nizza)»: già scritto bene
    const out = w.split('-').map((seg) => {
      if (SIGLE.has(seg)) return seg;
      return seg.split(/(['’])/).map((p, k, arr) => {
        if (p === "'" || p === '’') return p;
        const l = p.toLowerCase();
        if (!l) return l;
        // «D'AMPEZZO» → «d'Ampezzo»: la preposizione elisa resta minuscola
        const elisa = k === 0 && arr[1] && l.length <= 2 && !primo;
        if (elisa) return l;
        if (!primo && PICCOLE.has(l)) return l;
        return l.charAt(0).toUpperCase() + l.slice(1);
      }).join('');
    }).join('-');
    primo = false;
    return out;
  }).join(' ');
}
export function opzioniZone(ZONES) {
  return ZONES.map((z) => ({ cod: z.cod, nome: titoloZona(z.nome) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
    .map((z) => `        <option value="${esc(z.cod)}">${esc(z.nome)} · ${esc(z.cod)}</option>`)
    .join('\n');
}

// ── i prezzi, da owner-offer + ASPI_DEFAULTS + catalogo ─────────────────
const CANONE_ESEMPIO = 1200;
export function righePrezzi(O, ASPI) {
  const off = O.OFFER;
  const inq = O.provvigioneInquilino(CANONE_ESEMPIO);
  const mezza = O.provvigione(CANONE_ESEMPIO, 0.5), una = O.provvigione(CANONE_ESEMPIO, 1);
  const pct = off.primaLocazione.provvigioneInquilinoDefaultPct;
  const r = (voce, chi, quanto) =>
    `        <tr><th scope="row">${voce}<span class="chi-paga">${chi}</span></th><td>${quanto}</td></tr>`;
  return [
    '        <tbody>',
    r('Provvigione della prima locazione', "la paga l'inquilino",
      `${pct}% del canone di un anno + IVA: su ${eur(CANONE_ESEMPIO)} al mese sono <b>${eur(inq.totale)}</b>. <b>A te: ${eur(off.primaLocazione.provvigioneProprietario)}.</b>`),
    r('Provvigione dalla seconda locazione', 'la paghi tu',
      `½ o 1 mensilità + IVA, scritta nel mandato prima di iniziare: su ${eur(CANONE_ESEMPIO)} sono <b>${eur(mezza.totale)}</b> o <b>${eur(una.totale)}</b>.`),
    r('Accordo pluriennale', 'lo paghi tu',
      'Una fee annua fissa, su preventivo. Registrazione e attestazione incluse, imposte escluse.'),
    r('Incasso dei canoni e gestione', 'tu, se ce la affidi',
      'Il compenso è scritto nel mandato, prima di firmare: una percentuale del canone o una cifra fissa al mese.'),
    r('Registrazione del contratto', 'tu, fuori dal pluriennale', `<b>${eur(ASPI.prezzoRegistrazione)}</b>`),
    r('Attestazione del canone concordato', 'tu, fuori dal pluriennale', `<b>${eur(ASPI.prezzoAsseverazione)}</b>`),
    r('Imposte: registro e bolli', 'chi dice la legge',
      'Se dovuti: con la cedolare secca non lo sono. Nessuna agenzia le paga al posto tuo.'),
    r('Commissioni di carta e addebito SEPA', "l'inquilino", 'Il bonifico non costa niente a nessuno.'),
    '        </tbody>',
  ].join('\n');
}
export function brevePrezzi(O, ASPI, CATALOG) {
  const off = O.OFFER;
  const pack = CATALOG['concordato-pack'];
  const dove = off.incasso.riversamentoGiorniLavorativi
    ? `entro ${off.incasso.riversamentoGiorniLavorativi} giorni lavorativi dall'incasso`
    : 'nei termini scritti nel mandato';
  return [
    '    <p>Costi per il proprietario:</p>',
    '    <ul>',
    `      <li>prima locazione: ${eur(off.primaLocazione.provvigioneProprietario)} di provvigione, perché la paga l'inquilino (di norma il ${off.primaLocazione.provvigioneInquilinoDefaultPct}% del canone di un anno più IVA);</li>`,
    '      <li>dalla seconda: mezza mensilità o una mensilità più IVA, scritta nel mandato;</li>',
    '      <li>accordo pluriennale: una fee annua fissa su preventivo, con registrazione e attestazione incluse e le imposte escluse;</li>',
    `      <li>fuori dall'accordo pluriennale: registrazione ${eur(ASPI.prezzoRegistrazione)}, attestazione del concordato ${eur(ASPI.prezzoAsseverazione)};</li>`,
    `      <li>Pacchetto Canone Concordato: ${eur(pack.eur)}, rimborsato se la casa non rientra in fascia.</li>`,
    '    </ul>',
    `    <p>I canoni li incassa BOOM, con carta, bonifico o addebito SEPA, e li riversa al proprietario ${dove}.</p>`,
  ].join('\n');
}

// ── il cancello P0-canone e l'esito d'esempio ───────────────────────────
export function esitoEsempio(O, CAN) {
  const aperto = O.OFFER.canone.verificato === true;
  if (!aperto) {
    return '      <p><b>Casa d\'esempio: Prati (zona C40), 70 m².</b> Il tetto del canone concordato lo calcoliamo sulla scheda ufficiale: la nostra tabella delle zone la sta ricontrollando l\'associazione, e finché non l\'ha confermata un numero qui non te lo scriviamo. Scegli zona e metri nel cartiglio della pianta, o <a href="#uscita">lasciaci il numero</a>: te lo diciamo al telefono.</p>';
  }
  const z = CAN.ZONES.find((x) => x.cod === 'C40');
  const r = CAN.computeCanone({ zona: z, mq: 70, tipo: 'stud', parIdx: [0, 1, 2, 3, 4, 5, 6] });
  const max = Math.round(r.cMax);
  return `      <p><b>Prati (zona C40), 70 m²:</b> a canone concordato fino a ${eur(max)} al mese, se la casa ha almeno 7 delle 20 dotazioni dell'accordo; con meno il tetto scende, e le spunti alla scrivania ↓. Il tetto lo fissa l'accordo di Roma per i contratti che facciamo. Con l'attestazione di rispondenza, la cedolare al 10% ti lascia ${eur(Math.round(max * 0.9))} al mese e l'IMU scende del 25%. Se a libero la tua casa vale di più, un 4+4 rende di più: non lo facciamo, e te lo diciamo adesso. <span class="timbro">STIMA · DA CONFERMARE CON LA SCHEDA</span></p>`;
}

// ── i blocchi che dipendono da una decisione ────────────────────────────
export function claims(O) {
  const off = O.OFFER;
  const g = off.prova && off.prova.google;
  const giorni = off.incasso.riversamentoGiorniLavorativi;
  const soldi = `      <p>Li incassiamo noi — con carta, bonifico con la causale della rata o addebito SEPA — e li riversiamo a te ${giorni ? `entro ${giorni} giorni lavorativi dall'incasso` : 'nei termini scritti nel mandato'}. Nei nostri conti sono somme per conto terzi, non ricavi: il rendiconto del mese ti dice cosa è entrato e quando.</p>`
    + (off.incasso.direttoDisponibile ? '\n      <p>Oppure li incassi tu, direttamente: noi teniamo il calendario delle rate e il rendiconto arriva lo stesso.</p>' : '');
  const S = off.pluriennale.struttura;
  return {
    stelle: g && g.url && g.stelle
      ? `    <p class="chi"><a href="${esc(g.url)}" rel="noopener">★ ${esc(String(g.stelle).replace('.', ','))} su Google · ${esc(g.recensioni)} recensioni</a>${g.lettoIl ? ` · lette il ${esc(g.lettoIl)}` : ''}</p>` : '',
    'mandato-link': off.mandato.pdf
      ? `      <p>Il mandato d'esempio, coi prezzi di questa pagina: <a class="carta-apri testo link-carta" data-carta="mandato" href="${esc(off.mandato.pdf)}" target="_blank" rel="noopener">apri il PDF</a>. Se una voce di questa pagina non è nel mandato, non firmarlo.</p>` : '',
    riversamento: soldi,
    'pluriennale-struttura': S
      ? `      <ul class="due">${['base', 'durataMinima', 'recesso', 'istat', 'esempio'].filter((k) => S[k]).map((k) => `<li>${esc(S[k])}</li>`).join('')}</ul>` : '',
    referente: off.referente && off.referente.nome
      ? `              <li>Un referente con nome e cognome: ${esc(off.referente.nome)}${off.referente.sostituto ? `; se manca, ${esc(off.referente.sostituto)}` : ''}.</li>` : '',
    polizza: off.polizzaRC && off.polizzaRC.compagnia && off.polizzaRC.numero
      ? `              <li>Polizza di responsabilità civile del mediatore: ${esc(off.polizzaRC.compagnia)}, n. ${esc(off.polizzaRC.numero)}.</li>` : '',
    'polizza-piede': off.polizzaRC && off.polizzaRC.compagnia && off.polizzaRC.numero
      ? `      <p>Polizza RC del mediatore: ${esc(off.polizzaRC.compagnia)}, n. ${esc(off.polizzaRC.numero)}.</p>` : '',
    'faq-recesso': off.mandato.recessoPreavvisoGiorni && off.mandato.pdf
      ? `    <details>\n      <summary>Posso uscire dal mandato?</summary>\n      <div><p>Sì: con ${esc(off.mandato.recessoPreavvisoGiorni)} giorni di preavviso, come è scritto nel mandato che leggi prima di firmare. I contratti già firmati restano validi e restano tuoi.</p></div>\n    </details>` : '',
    'canone-foglio': off.canone.verificato === true
      ? fs.readFileSync(path.join(QUI, 'foglio-canone.html'), 'utf8')
      : '      <p>Il conto del concordato lo facciamo sulla scheda ufficiale: <a class="link-carta" href="#uscita">lasciaci il numero ↓</a></p>',
  };
}

// ── le carte d'esempio ─────────────────────────────────────────────────
const SOLO_LINK = new Set(['proposta']);
export function figura(it) {
  if (!it) return '';
  const didasc = it.pdf
    ? `${esc(it.titolo)} · ESEMPIO — dati inventati · PDF, ${it.pages} pagin${it.pages === 1 ? 'a' : 'e'}, ${kb(it.bytes)}`
    : `${esc(it.titolo)} · ESEMPIO — dati inventati`;
  const riga = it.riga ? `<p class="riga">${esc(it.riga)}</p>` : '';
  // La proposta resta un LINK: sul percorso del telefono le miniature sono
  // cinque (verbale, inventario, /casa, contratto, rendiconto), non sei.
  if (!it.thumb || SOLO_LINK.has(it.id)) {
    // la carta senza miniatura (la proposta): un link, e la riga che conta
    return `        <figcaption>${riga}<p class="didasc"><a class="carta-apri testo link-carta" data-carta="${esc(it.id)}" href="${esc(it.pdf)}" target="_blank" rel="noopener">Apri il PDF: ${esc(it.titolo)}, ${kb(it.bytes)}</a> · ESEMPIO — dati inventati</p></figcaption>`;
  }
  const q = it.riquadro;
  const lente = q && q.page === 1
    ? `<span class="lente" aria-hidden="true" style="--lx:${(q.x / 595).toFixed(4)};--ly:${(q.y / 842).toFixed(4)};--lw:${(q.w / 595).toFixed(4)};--lh:${(q.h / 842).toFixed(4)}"></span>` : '';
  const img = `<img src="${esc(it.thumb.src)}" width="${it.thumb.w}" height="${it.thumb.h}" loading="lazy" decoding="async" alt="${esc(it.alt)}">`;
  const box = it.pdf
    ? `<a class="carta-apri" data-carta="${esc(it.id)}" href="${esc(it.pdf)}" target="_blank" rel="noopener">${img}${lente}</a>`
    : `<div class="carta-apri">${img}</div>`;
  return `        ${box}\n        <figcaption>${riga}<p class="didasc">${didasc}${it.pdf ? ' — si apre nel visore del telefono' : ''}</p></figcaption>`;
}
export function linkZip(man) {
  if (!man || !man.zip) return '';
  return `        <p><a class="link-carta" href="${esc(man.zip.file)}" download>Il pacchetto per chi valuta (ZIP, ${mb(man.zip.bytes)})</a>: i documenti d'esempio di questa pagina e un LEGGIMI che dice cosa non c'è dentro, e perché.</p>`;
}

// ── JSON-LD: WebPage + FAQPage dalle <summary> visibili ─────────────────
const testo = (h) => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
export function domandeVisibili(html) {
  const i = html.indexOf('<section id="domande"'), j = html.indexOf('</section>', i);
  const sez = html.slice(i, j);
  const out = [];
  for (const m of sez.matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>\s*<div>([\s\S]*?)<\/div>\s*<\/details>/g)) {
    out.push({ q: testo(m[1]), a: testo(m[2]) });
  }
  return out;
}
export function jsonLd(html) {
  const faq = domandeVisibili(html);
  const titolo = (/<title>([^<]*)<\/title>/.exec(html) || [])[1] || '';
  const g = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': SITO + '/owners#page', url: SITO + '/owners', name: titolo, inLanguage: 'it',
        isPartOf: { '@id': SITO + '/#website' }, about: { '@id': SITO + '/#organization' },
        speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.soglia .sub', '.itbref'] },
        significantLink: [SITO + '/corporate', SITO + '/executive', SITO + '/pacchetto-concordato'] },
      { '@type': 'FAQPage', '@id': SITO + '/owners#faq', inLanguage: 'it',
        mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
    ],
  };
  return '  <script type="application/ld+json">\n' + JSON.stringify(g) + '\n  </script>';
}

// ── le sorgenti ─────────────────────────────────────────────────────────
export async function sorgenti(over = {}) {
  const O = require(path.join(ROOT, 'js/owner-offer.js'));
  const CAN = require(path.join(ROOT, 'js/canone-engine.js'));
  const { ASPI_DEFAULTS } = await import(pathToFileURL(path.join(ROOT, 'api/fiscal/_aspi.js')).href);
  const { CATALOG } = await import(pathToFileURL(path.join(ROOT, 'api/_catalog.js')).href);
  const leggi = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
  let pianta = null;
  const pm = path.join(QUI, 'pianta.mjs');
  if (fs.existsSync(pm)) pianta = await import(pathToFileURL(pm).href);
  const man = leggi(path.join(ROOT, 'carte/manifest.json'));
  return {
    O: over.O || O, CAN, ASPI: ASPI_DEFAULTS, CATALOG,
    pianta: over.pianta === undefined ? pianta : over.pianta,
    manifest: over.manifest === undefined ? (man ? JSON.parse(man) : null) : over.manifest,
    cssPianta: leggi(path.join(QUI, 'pianta.css')),
    cssApp: leggi(path.join(QUI, 'owners-app.css')),
  };
}

export const STANZE = ['porta', 'cassaforte', 'soggiorno', 'cucina', 'scrivania', 'cassetta'];
export const CARTE = ['verbale', 'proposta', 'inventario-ingresso', 'inventario-uscita', 'casa-guasti',
  'contratto-studenti', 'rendiconto', 'rendiconto-tre-case'];

export function costruisci(html, src) {
  const { O, CAN, ASPI, CATALOG, pianta, manifest } = src;
  let h = html;
  h = h.replace(/<html lang="it"[^>]*>/, `<html lang="it" data-canone="${O.OFFER.canone.verificato === true ? 'aperto' : 'chiuso'}">`);
  h = sostituisci(h, 'OWNERS_CSS_PIANTA', src.cssPianta ? src.cssPianta.trim() : '', true);
  h = sostituisci(h, 'OWNERS_CSS_APP', src.cssApp ? src.cssApp.trim() : '', true);
  if (pianta) {
    h = sostituisci(h, 'OWNERS_PIANTA', pianta.riquadro());
    for (const s of STANZE) h = sostituisci(h, `RITAGLIO:${s}`, '      ' + pianta.ritaglio(s));
    h = sostituisci(h, 'OWNERS_ACCESO', pianta.accesa());
    h = sostituisci(h, 'OWNERS_PALAZZO', pianta.palazzo());
  }
  h = sostituisci(h, 'OWNERS_ZONE', opzioniZone(CAN.ZONES));
  h = sostituisci(h, 'OWNERS_PREZZI', righePrezzi(O, ASPI));
  h = sostituisci(h, 'OWNERS_BREVE_PREZZI', brevePrezzi(O, ASPI, CATALOG));
  h = sostituisci(h, 'OWNERS_ESITO', esitoEsempio(O, CAN));
  const cl = claims(O);
  for (const [k, v] of Object.entries(cl)) h = sostituisci(h, `CLAIM:${k}`, v);
  const items = new Map(((manifest && manifest.items) || []).map((it) => [it.id, it]));
  for (const id of CARTE) h = sostituisci(h, `CARTA:${id}`, figura(items.get(id)));
  h = sostituisci(h, 'OWNERS_ZIP', linkZip(manifest));
  h = sostituisci(h, 'OWNERS_JSONLD', jsonLd(h));
  return h;
}

// ── CLI ─────────────────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.join(ROOT, 'owners.html');
  const prima = fs.readFileSync(file, 'utf8');
  const src = await sorgenti();
  const dopo = costruisci(prima, src);
  const mancano = [];
  if (!src.pianta) mancano.push('pianta.mjs');
  if (!src.manifest) mancano.push('carte/manifest.json');
  if (!src.cssApp) mancano.push('owners-app.css');
  if (process.argv.includes('--check')) {
    if (dopo !== prima) { console.error('owners.html NON è quella che il costruttore produce: rilancia node design/owners/costruisci-owners.mjs'); process.exit(1); }
    console.log('owners.html è allineata alle sorgenti' + (mancano.length ? ' (mancano: ' + mancano.join(', ') + ')' : ''));
  } else {
    fs.writeFileSync(file, dopo);
    console.log(`owners.html ${dopo === prima ? 'invariata' : 'aggiornata'} (${Buffer.byteLength(dopo)} byte)` + (mancano.length ? ' — mancano: ' + mancano.join(', ') : ''));
  }
}
