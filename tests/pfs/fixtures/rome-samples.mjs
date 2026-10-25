// tests/pfs/fixtures/rome-samples.mjs — campioni ROMANI per pinnare il
// comportamento di oggi (radar per mercato, 25/10/2026). SINTETICI: le forme
// imitano gli alert italiani già gestiti dal parser, con id fittizi
// (31000001…). Servono a dimostrare che Roma resta byte-identica dopo
// l'aggiunta di Madrid e Barcellona — non sono email vere.

export const ROME_EMAILS = [
  {
    name: 'idealista.it, singolo, privato',
    from: 'idealista <noresponder@idealista.it>',
    subject: 'Nuovo appartamento di un privato della tua ricerca: Pigneto',
    html: '<html><body><p>Ciao, c\'è un nuovo annuncio della tua ricerca</p>' +
      '<a href="https://clk.idealista.it/r?u=https%3A%2F%2Fwww.idealista.it%2Fimmobile%2F31000001%2F%3Fxts%3D1">' +
      'Bilocale in via del Pigneto 12, Pigneto, Roma</a>' +
      '<p>1.200 €/mese · 2 camere · 65 m²</p><p>Disdici gli avvisi</p></body></html>',
  },
  {
    name: 'immobiliare.it, digest di due',
    from: 'Immobiliare.it <noreply@notifiche.immobiliare.it>',
    subject: '2 nuovi annunci per la tua ricerca salvata',
    html: '<html><body>' +
      '<a href="https://www.immobiliare.it/annunci/31000002/">Trilocale via Ostiense, Ostiense</a>' +
      '<div>€ 1.450/mese</div><div>3 locali</div><div>90 m²</div>' +
      '<a href="https://www.immobiliare.it/annunci/31000003/">Monolocale Testaccio</a>' +
      '<div>850 € al mese</div><div>1 locale</div><div>32 m2</div>' +
      '<p>Gestisci le tue ricerche</p></body></html>',
  },
  {
    name: 'casafari, con un annuncio idealista.it dentro',
    from: 'Casafari <alerts@casafari.com>',
    subject: 'New matches for your search',
    html: '<html><body><a href="https://www.idealista.it/immobile/31000004/">Appartamento Prati</a>' +
      '<p>€ 1.800 · 2 camere · 80 m²</p></body></html>',
  },
  {
    name: 'idealista.it, non un alert (messaggio)',
    from: 'idealista <noresponder@idealista.it>',
    subject: 'Hai un nuovo messaggio sul tuo annuncio',
    html: '<p>Un utente ti ha scritto</p>',
  },
  {
    name: 'immobiliare.it, telefonata (agenzia)',
    from: 'ImmobiliarePro <noreply@immobiliare.it>',
    subject: 'Telefonata ricevuta per il tuo annuncio',
    html: '<p>Hai ricevuto una telefonata</p>',
  },
];

export const ROME_TITLES = [
  'Bilocale luminoso al Pigneto',
  'Appartamento viale dei Monti Tiburtini 44',
  'Trilocale tra Trastevere e Testaccio',
  'Monolocale a Monteverde',
  'Bilocale in via Merulana 140',
  'Bilocale zona Cinecittà',
  'Attico in Prati, piazza Mazzini',
  'Quadrilocale Parioli',
  'Stanza a San Lorenzo vicino Verano',
  'Appartamento Centro Storico, Campo de\' Fiori',
  'Bilocale Garbatella via Passino',
  'Trilocale EUR Torrino',
  'Bilocale Trieste, viale Libia',
  'Monolocale Esquilino, piazza Vittorio',
  'Appartamento in via di Trieste, Madrid',
  'Piso en Calle de Atocha, Centro, Madrid',
];

export const ROME_CLIENTS = [
  { budget: 1500, zone: 'Prati' },
  { budget: 1500, zone: 'Trastevere, Monti' },
  { budget: '€800-€1,200', preferred_areas: 'Testaccio' },
  { budget: 2000, minBudget: 900, zone: 'Centro' },
  { budget: 1200, zone: 'Pigneto' },
];

export const ROME_SCORES = [
  [{ price: 1200, bedrooms: 2, title: 'Bilocale in via del Pigneto 12', zone: 'Pigneto' }, { budget: 1300, bedrooms: '2', zone: 'Pigneto' }],
  [{ price: 1600, bedrooms: 1, title: 'Monolocale Prati' }, { budget: 1500, bedrooms: '1', zone: 'Prati' }],
  [{ price: 2500, bedrooms: 3, title: 'Attico Parioli' }, { budget: 1500, zone: 'Parioli' }],
  [{ price: 900, bedrooms: 1, title: 'Bilocale Garbatella' }, { budget: '€800-€1,200' }],
  [{ price: 1000, title: 'Monolocale' }, { budget: 1500, bedrooms: '3', zone: 'Monti' }],
];
