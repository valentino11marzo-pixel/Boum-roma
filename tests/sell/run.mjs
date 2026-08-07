// tests/sell/run.mjs
// IL LINK CHE VENDE — le regole che non possono scivolare.
//
// La più importante: la firma è ciò che separa un link che può vendere QUALSIASI
// servizio da uno pubblico che può vendere solo i due sicuri. Se quella riga si
// rompe, chiunque costruisca un URL a mano compra un pacchetto da €349 al posto
// di uno da €119 — o peggio, la logica smette di riconoscere i link veri e
// l'operatore scopre di non poter più incassare mentre ha il cliente al telefono.

process.env.HOMIE_SECRET = 'test-secret-for-sell';

const { sellToken, verifySell, sellUrl, sellables, matchKind } =
  await import('../../api/services/_sell.js');
const { CATALOG, EMAIL_BUYABLE } = await import('../../api/_catalog.js');

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗ ${name}\x1b[0m`); }
};

console.log('\n\x1b[1m▸ firma\x1b[0m');
{
  const t = sellToken('virtual-viewing');
  ok('token derivato, stabile tra chiamate', t === sellToken('virtual-viewing'));
  ok('token diverso per servizio diverso', t !== sellToken('deal-assistance'));
  ok('non è un valore banale', typeof t === 'string' && t.length === 16 && /^[a-f0-9]+$/.test(t));
  ok('verifica accetta la propria firma', verifySell('virtual-viewing', t));
  ok('rifiuta la firma di un ALTRO servizio', !verifySell('deal-assistance', t));
  ok('rifiuta firma vuota / assente', !verifySell('virtual-viewing', '') && !verifySell('virtual-viewing', null));
  ok('rifiuta firma di lunghezza giusta ma sbagliata', !verifySell('virtual-viewing', 'f'.repeat(16)));
  ok('rifiuta un kind inesistente anche con firma plausibile', !verifySell('non-esiste', t));
}

console.log('\n\x1b[1m▸ il confine di sicurezza\x1b[0m');
{
  // Questa è la regola: senza firma si vendono SOLO i kind email-buyable.
  // Il test la asserisce su tutto il catalogo, così un servizio aggiunto
  // domani non entra per sbaglio nella lista dei vendibili a link nudo.
  const unsigned = Object.keys(CATALOG).filter(k => EMAIL_BUYABLE.includes(k));
  ok('i vendibili a link nudo restano 2', unsigned.length === 2);
  ok('i costosi NON sono vendibili a link nudo',
    !EMAIL_BUYABLE.includes('concordato-pack') &&
    !EMAIL_BUYABLE.includes('remote-move-pack') &&
    !EMAIL_BUYABLE.includes('deal-assistance'));
  ok('ogni servizio del catalogo ha una firma valida',
    Object.keys(CATALOG).every(k => verifySell(k, sellToken(k))));
}

console.log('\n\x1b[1m▸ il link\x1b[0m');
{
  const u = sellUrl('concordato-pack', { email: 'mario@rossi.it', name: 'Mario', ref: 'telegram' });
  ok('è assoluto e punta all\'endpoint di acquisto', u.startsWith('https://www.boomrome.com/api/services/buy?'));
  ok('porta kind e firma', u.includes('kind=concordato-pack') && u.includes('sig='));
  ok('porta il prefill', u.includes('e=mario%40rossi.it') && u.includes('n=Mario'));
  ok('porta il contesto', u.includes('ref=telegram'));
  ok('la firma nel link è quella che il server accetta',
    verifySell('concordato-pack', new URL(u).searchParams.get('sig')));
  ok('senza prefill resta un link valido', /kind=virtual-viewing/.test(sellUrl('virtual-viewing')));
  ok('un kind inventato non produce link', sellUrl('pacchetto-fantasma') === null);
}

console.log('\n\x1b[1m▸ quello che digita l\'operatore\x1b[0m');
{
  ok('id esatto', matchKind('deal-assistance') === 'deal-assistance');
  ok('prefisso unico', matchKind('concordato') === 'concordato-pack');
  ok('parola nell\'etichetta', matchKind('deposit') === 'deposit-recovery');
  ok('maiuscole e spazi non contano', matchKind('  Virtual-Viewing ') === 'virtual-viewing');
  // Non indovinare MAI: mandare al cliente il prezzo sbagliato è peggio che
  // chiedere di nuovo. 'pack' combacia con movein-pack, remote-move-pack e
  // concordato-pack.
  ok('ambiguo si dichiara, non si indovina', matchKind('pack') === 'AMBIGUOUS');
  ok('sconosciuto è null', matchKind('massaggio') === null);
  ok('vuoto è null', matchKind('') === null && matchKind(null) === null);
}

console.log('\n\x1b[1m▸ il catalogo che vede l\'operatore\x1b[0m');
{
  const list = sellables();
  ok('contiene tutto il catalogo', list.length === Object.keys(CATALOG).length);
  ok('ordinato dal più economico', list.every((s, i) => i === 0 || list[i - 1].eur <= s.eur));
  ok('ogni voce ha prezzo ed etichetta', list.every(s => s.eur > 0 && s.label && s.kind));
}

console.log(`\n${fail ? '\x1b[31m' : '\x1b[32m'}Link che vende: ${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail ? 1 : 0);
