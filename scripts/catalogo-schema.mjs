// scripts/catalogo-schema.mjs
// IL PREZZO DEL CATALOGO DEVE ESSERE UN DATO, non solo un disegno.
//
// IL REPERTO: su /apartments le 19 case portano il canone come tabellone a
// palette — bello, e leggibile da un umano — ma nel LIVELLO DI TESTO della
// pagina i prezzi sono cinque in tutto: le cifre stanno dentro le palette,
// non in un nodo di testo. C'e' l'`aria-label` (quindi i lettori di schermo
// sono a posto) e c'e' `data-p`, ma i dati strutturati della pagina
// contenevano `CollectionPage` e BASTA: zero `Offer`, zero prezzi.
// Le SCHEDE singole li emettono da sempre (api/listing.js, Offer completa
// con priceCurrency e unitText MONTH); la vetrina — la pagina che un
// motore mostra per «apartments for rent in Rome» — no.
//
// Qui l'ItemList si DERIVA dalle card che ci sono gia': href, data-prezzo,
// data-zona, data-letti, data-mq e il nome. Nessun dato inventato, nessuna
// seconda fonte da tenere allineata: se la vetrina cambia, si rilancia.
//
// La disponibilita' segue la stessa disciplina di js/dispo-engine.js: si
// dichiara `InStock` SOLO su «Available now», `PreOrder` su «Free from
// <data>» — che e' la corsia del pre-blocco — e sul resto NIENTE, perche'
// una casa che non sappiamo quando si libera non si promette a un motore.
//
//   node scripts/catalogo-schema.mjs [--dry]

import fs from 'node:fs';
import path from 'node:path';

const R = path.resolve(new URL('..', import.meta.url).pathname);
const F = path.join(R, 'apartments.html');
const DRY = process.argv.includes('--dry');
const ORIGIN = 'https://www.boomrome.com';
const APRI = '<!-- BOOM_CATALOGO:START -->';
const CHIUDI = '<!-- BOOM_CATALOGO:END -->';

let s = fs.readFileSync(F, 'utf8');

const attr = (bl, nome) => {
  const m = bl.match(new RegExp(nome + '="([^"]*)"'));
  return m ? m[1] : '';
};
const num = (v) => { const n = parseFloat(String(v).replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : null; };

const voci = [];
// ogni card e' un <a class="casa-p" …> fino al successivo, o a fine muro
const carte = s.split(/<a class="casa-p"/).slice(1);
for (const grezzo of carte) {
  const bl = grezzo.slice(0, 2600);
  const href = attr(bl, 'href');
  const prezzo = num(attr(bl, 'data-prezzo'));
  const nome = (bl.match(/<span class="nome">([^<]+)<\/span>/) || [])[1];
  if (!href || !prezzo || !nome) continue;
  const zona = attr(bl, 'data-zona');
  const letti = num(attr(bl, 'data-letti'));
  const bagni = num(attr(bl, 'data-bagni'));
  const mq = num(attr(bl, 'data-mq'));
  const stato = (bl.match(/class="casa-stato ([a-z]*)">([^<]+)</) || []);

  const offerta = {
    '@type': 'Offer', price: prezzo, priceCurrency: 'EUR',
    url: ORIGIN + href,
    priceSpecification: { '@type': 'UnitPriceSpecification',
      price: prezzo, priceCurrency: 'EUR', unitText: 'MONTH' },
  };
  // Solo cio' che la card DICHIARA. «Waitlist open» e «Rented» non
  // diventano una promessa di disponibilita'.
  if (stato[1] === 'si') offerta.availability = 'https://schema.org/InStock';
  else if (stato[1] === 'poi') {
    offerta.availability = 'https://schema.org/PreOrder';
    // «Free from 1 Mar 2027» → 2027-03-01, letto per COMPONENTI: Date.parse
    // lavora nel fuso della macchina e toISOString in UTC, quindi a Roma
    // scriveva il giorno prima. Senza anno scritto (la card lo omette
    // nell'anno della build) non si indovina: niente availabilityStarts.
    const d = (stato[2] || '').replace(/^Free from\s*/i, '').trim();
    const m = d.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/);
    const MESI = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug',
      'sep', 'oct', 'nov', 'dec'];
    const mese = m ? MESI.indexOf(m[2].toLowerCase()) + 1 : 0;
    if (m && mese && +m[1] >= 1 && +m[1] <= 31) {
      offerta.availabilityStarts = m[3] + '-' + String(mese).padStart(2, '0')
        + '-' + m[1].padStart(2, '0');
    }
  }

  // L'indirizzo e' quello amministrativo VERO: la regione e' il Lazio,
  // non il quartiere. Prima la zona finiva in addressRegion («Centro»,
  // «Parioli», «Africano» come regioni d'Italia): un dato sbagliato che un
  // motore ripete. Il quartiere e' un luogo CONTENUTO nella citta'.
  const casa = { '@type': 'Apartment', name: nome, url: ORIGIN + href,
    address: { '@type': 'PostalAddress', addressLocality: 'Roma',
      addressRegion: 'Lazio', addressCountry: 'IT' } };
  if (zona) casa.containedInPlace = { '@type': 'Place', name: zona + ', Roma' };
  if (letti) casa.numberOfBedrooms = letti;
  if (bagni) casa.numberOfBathroomsTotal = bagni;
  if (mq) casa.floorSize = { '@type': 'QuantitativeValue', value: mq, unitCode: 'MTK' };
  casa.offers = offerta;
  voci.push({ '@type': 'ListItem', position: voci.length + 1, item: casa });
}

if (voci.length < 5) {
  console.error(`Solo ${voci.length} case estratte: non scrivo nulla.`);
  process.exit(1);
}

const blocco = APRI + '\n<script type="application/ld+json">\n'
  + JSON.stringify({ '@context': 'https://schema.org', '@type': 'ItemList',
      '@id': ORIGIN + '/apartments#catalogo',
      name: 'Apartments for rent in Rome — BOOM',
      numberOfItems: voci.length, itemListElement: voci })
  + '\n</script>\n' + CHIUDI + '\n';

const vecchio = s.indexOf(APRI);
if (vecchio >= 0) {
  const fine = s.indexOf(CHIUDI, vecchio) + CHIUDI.length + 1;
  s = s.slice(0, vecchio) + blocco + s.slice(fine);
} else {
  s = s.replace('</head>', blocco + '</head>');
}

const conPrezzo = voci.filter((v) => v.item.offers.availability).length;
console.log(`${voci.length} case nell'ItemList · ${conPrezzo} con disponibilita dichiarata`);
if (DRY) { console.log('(anteprima — niente scritto)'); process.exit(0); }
fs.writeFileSync(F, s);
