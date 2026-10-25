// tests/pfs/fixtures/idealista-es.mjs — email di alert idealista.com SINTETICHE.
//
// ATTENZIONE: il formato di queste email NON è verificato. Nessuna email vera
// di idealista.com è stata letta (25/10/2026): il sandbox non apre il portale
// e la casella BOOM non è stata consultata. Ciò che È verificato (da risultati
// di ricerca) e che qui si imita parola per parola:
//   - l'URL dell'annuncio  https://www.idealista.com/inmueble/<cifre>/
//   - il testo delle schede "Piso en Calle de Santa Cruz de Marcenado,
//     Malasaña-Universidad, Madrid 1.400€/mes 1 hab. 57 m²" e la versione
//     inglese "Flat / apartment in Calle de San Dimas, 17, Malasaña-Universidad,
//     Madrid 1,400€/month 1 bed. 63 m²" (virgola delle migliaia)
//   - "Ha bajado 60 €" accanto al prezzo (testo di Fotocasa, usato come caso
//     peggiore del ribasso)
// Ciò che è IPOTESI: il mittente (@idealista.com), gli oggetti, i link di
// tracciamento che contengono l'URL dell'annuncio dopo il decode (come per
// idealista.it), la forma HTML. La prima email vera deve sostituire queste.
// Id degli annunci fittizi (100000001…), mai id veri.

const enc = (s) => '=?UTF-8?B?' + Buffer.from(String(s), 'utf8').toString('base64') + '?=';
let seq = 0;

export function rfc822({ from, to, deliveredTo, cc, subject, html, date }) {
  seq++;
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    deliveredTo ? `Delivered-To: ${deliveredTo}` : null,
    `Subject: ${enc(subject)}`,
    `Date: ${new Date(date || Date.now()).toUTCString()}`,
    `Message-ID: <fixture-${seq}-${Date.now()}@fixture.invalid>`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(String(html), 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n'),
    '',
  ];
  return lines.filter((l) => l !== null).join('\r\n');
}

// Un link di tracciamento che, decodificato, contiene l'URL dell'annuncio.
export const trk = (id, lang) => 'https://trk.idealista.com/c?u=' +
  encodeURIComponent(`https://www.idealista.com/${lang ? lang + '/' : ''}inmueble/${id}/?xtor=EPR-1`);

export const FROM_ES = 'idealista <noresponder@idealista.com>';
export const FROM_IT = 'idealista <noresponder@idealista.it>';
export const OPERATOR = 'valentino@boom-rome.com';
export const ALIAS_MADRID = 'valentino+radar-madrid@boom-rome.com';
export const ALIAS_BARCELONA = 'valentino+radar-barcelona@boom-rome.com';

const footer = '<p>¿Eres particular? Publica tu anuncio gratis en idealista.</p><p>Darse de baja de esta alerta</p>';

export const ES = {
  // (a) Istantaneo, spagnolo, all'alias di Madrid. L'oggetto porta il nome
  //     della ricerca salvata ("Chamberí"): la zona deve venire dal TITOLO
  //     dell'annuncio (Malasaña → Centro), mai dall'oggetto.
  a: () => rfc822({
    from: FROM_ES, to: ALIAS_MADRID, deliveredTo: ALIAS_MADRID,
    subject: 'Nuevo piso en tu búsqueda: BM7Q2K Chamberí',
    html: '<html><body><p>Hola, hay un piso nuevo en tu búsqueda «BM7Q2K Chamberí»</p>' +
      `<a href="${trk(100000001)}">Piso en Calle de Santa Cruz de Marcenado, Malasaña-Universidad, Madrid</a>` +
      '<p>1.400€/mes</p><p>1 hab. · 57 m² · 1ª planta exterior con ascensor</p>' + footer + '</body></html>',
  }),
  // (a2) All'alias, ma il corpo non ha un titolo leggibile: la zona resta
  //      vuota (l'oggetto "Chamberí" NON deve diventare la zona).
  a2: () => rfc822({
    from: FROM_ES, to: ALIAS_MADRID, deliveredTo: ALIAS_MADRID,
    subject: 'Nuevo piso en tu búsqueda: BM7Q2K Chamberí',
    html: `<html><body><a href="${trk(100000007)}">Ver piso</a><p>1.250 €/mes</p>${footer}</body></html>`,
  }),
  // (b) Riepilogo in inglese, due annunci, uno col ribasso prima del canone.
  b: () => rfc822({
    from: FROM_ES, to: ALIAS_MADRID, deliveredTo: ALIAS_MADRID,
    subject: '2 new homes in your search BM7Q2K Chamberí',
    html: '<html><body><p>2 new homes in your search "BM7Q2K Chamberí"</p><table>' +
      `<tr><td><a href="${trk(100000002, 'en')}"><img src="https://img.example.invalid/1.jpg"></a>` +
      `<a href="${trk(100000002, 'en')}">Flat / apartment in Calle de San Dimas, 17, Malasaña-Universidad, Madrid</a>` +
      '<div>1,400€/month</div><div>1 bed. 63 m²</div></td></tr>' +
      `<tr><td><a href="${trk(100000003, 'en')}">Penthouse in Calle de Fernández de los Ríos, Chamberí, Madrid</a>` +
      '<div>Price drop 60 €</div><div>1,690€/month</div><div>2 bed. 80 m²</div></td></tr></table>' +
      '<p>Are you a private owner? Advertise for free.</p><p>Unsubscribe</p></body></html>',
  }),
  // (c) Senza alias: la città la dice il testo dell'annuncio.
  c: () => rfc822({
    from: FROM_ES, to: OPERATOR,
    subject: 'Nuevo estudio en tu búsqueda',
    html: `<html><body><a href="${trk(100000004)}">Estudio en Calle de Lavapiés, Lavapiés-Embajadores, Madrid</a>` +
      `<p>900 €/mes</p><p>30 m²</p>${footer}</body></html>`,
  }),
  // (d) Senza alias, il testo nomina DUE città (una via di Barcellona che si
  //     chiama Madrid): città sconosciuta → mai ingerito, "da verificare".
  d: () => rfc822({
    from: FROM_ES, to: OPERATOR,
    subject: 'Nuevo piso en tu búsqueda',
    html: `<html><body><a href="${trk(100000005)}">Piso en Avinguda de Madrid, Sants, Barcelona</a>` +
      `<p>1.100 €/mes</p><p>2 hab.</p>${footer}</body></html>`,
  }),
  // (d2) Alias di Madrid ma annuncio di Barcellona: due prove in conflitto.
  d2: () => rfc822({
    from: FROM_ES, to: ALIAS_MADRID, deliveredTo: ALIAS_MADRID,
    subject: 'Nuevo piso en tu búsqueda',
    html: `<html><body><a href="${trk(100000008)}">Piso en Carrer de Còrsega, Eixample, Barcelona</a>` +
      `<p>1.300 €/mes</p><p>2 hab.</p>${footer}</body></html>`,
  }),
  // (g) Alias di Barcellona.
  g: () => rfc822({
    from: FROM_ES, to: ALIAS_BARCELONA, deliveredTo: ALIAS_BARCELONA,
    subject: 'Nuevo piso en tu búsqueda: BM9X4T Gràcia',
    html: `<html><body><a href="${trk(100000006)}">Piso en Carrer de Verdi, Vila de Gràcia, Barcelona</a>` +
      `<p>1.500 €/mes</p><p>2 hab. · 70 m²</p>${footer}</body></html>`,
  }),
  // (h) Oggetto neutro: è l'ALIAS la prova che è un alert (le parole vere
  //     dell'oggetto non le conosciamo). E l'alias sta SOLO in Delivered-To:
  //     il To è l'indirizzo principale, come succede con un inoltro.
  h: (o = {}) => rfc822({
    from: FROM_ES, to: OPERATOR, deliveredTo: ALIAS_BARCELONA, date: o.date,
    subject: 'Novedades para ti',
    html: `<html><body><a href="${trk(100000009)}">Piso en Carrer del Clot, El Clot, Barcelona</a>` +
      `<p>1.200 €/mes</p><p>1 hab.</p>${footer}</body></html>`,
  }),
  // (i) Un messaggio sull'annuncio, all'alias: MAI un alert, neanche con
  //     l'alias e un link a un annuncio dentro.
  i: () => rfc822({
    from: FROM_ES, to: ALIAS_MADRID, deliveredTo: ALIAS_MADRID,
    subject: 'Te ha escrito un interesado sobre tu anuncio',
    html: `<html><body><p>Un usuario te ha escrito.</p><a href="${trk(100000099)}">Piso en Calle de Prueba, Chamberí, Madrid</a>` +
      '<p>1.200 €/mes</p></body></html>',
  }),
};

// (e) L'alert romano di sempre (idealista.it).
export const IT_ROME = () => rfc822({
  from: FROM_IT, to: OPERATOR,
  subject: 'Nuovo appartamento di un privato della tua ricerca: Centro',
  html: '<html><body><p>Nuovo annuncio della tua ricerca</p>' +
    '<a href="https://clk.idealista.it/r?u=https%3A%2F%2Fwww.idealista.it%2Fimmobile%2F31000011%2F">' +
    'Bilocale in via dei Coronari, Centro Storico, Roma</a>' +
    '<p>1.300 €/mese · 1 camera · 50 m²</p></body></html>',
});

// (f) Per la prova della fame: un alert di Madrid con un annuncio unico.
export const madridBulk = (n) => rfc822({
  from: FROM_ES, to: ALIAS_MADRID, deliveredTo: ALIAS_MADRID,
  subject: 'Nuevo piso en tu búsqueda',
  html: `<html><body><a href="${trk(100000100 + n)}">Piso en Calle de Ponzano, Chamberí, Madrid</a>` +
    `<p>${1200 + n}€/mes</p><p>1 hab. · 50 m²</p></body></html>`,
});
export const romeBulk = (n) => rfc822({
  from: FROM_IT, to: OPERATOR,
  subject: 'Nuovo appartamento della tua ricerca',
  html: `<html><body><a href="https://www.idealista.it/immobile/3100010${n}/">Bilocale in via Giulia, Centro Storico, Roma</a>` +
    `<p>${1200 + n} €/mese · 1 camera · 45 m²</p></body></html>`,
});
