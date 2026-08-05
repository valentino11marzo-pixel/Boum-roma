// tests/letter/run.mjs
// LA LETTERA CHE FA TORNARE IL DEPOSITO.
//
// Qui non si testa un'interfaccia: si testa un DOCUMENTO che una persona
// stamperà, firmerà e manderà per raccomandata a un locatore italiano. Se il
// termine è sbagliato, se l'articolo è citato male, se l'importo intimato non
// è quello trattenuto, quella persona ha in mano una lettera che non funziona
// e non ha modo di accorgersene.
//
// Perciò: il PDF si genera DAVVERO con pdf-lib (non un finto), e il corpo
// della lettera è asserito frase per frase.

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗ ${name}\x1b[0m`); }
};

const written = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('identitytoolkit')) return { ok: true, status: 200, json: async () => ({ idToken: 'f', localId: 'a' }) };
  if (u.includes('firestore.googleapis.com')) {
    if ((opts.method || 'GET') === 'POST') { written.push({ url: u, body: JSON.parse(opts.body || '{}') }); }
    return { ok: true, status: 200, json: async () => ({ name: 'p/documents/leads/l1', documents: [] }) };
  }
  return { ok: true, status: 200, json: async () => ({}) };
};

const mod = await import('../../api/documents/demand-letter.js');
const { letterBody } = mod;

const BASE = {
  tenantName: 'Anna Schmidt', tenantAddress: 'Musterstr. 4, Berlin',
  landlordName: 'Mario Rossi', landlordAddress: 'Via Cavour 1, Roma',
  propertyAddress: 'Via del Pigneto 42, Roma',
  depositEur: 3600, returnedEur: 240, endDate: '2026-06-30',
};

let ipN = 0;
function call(body) {
  written.length = 0;
  let code = 0, out = null, hdr = {};
  const res = {
    setHeader(k, v) { hdr[k] = v; }, status(c) { code = c; return this; },
    send(b) { out = b; return this; }, json(j) { out = j; return this; }, end() { return this; },
  };
  return mod.default({ method: 'POST', headers: { 'x-forwarded-for': `10.2.0.${++ipN}` }, body, socket: {} }, res)
    .then(() => ({ code, out, hdr, leads: written.filter(w => w.url.includes('/leads')) }));
}

console.log('\n\x1b[1m▸ il PDF esiste davvero\x1b[0m');
{
  const r = await call({ ...BASE, email: 'anna@mail.com' });
  ok('risposta 200', r.code === 200);
  ok('è un PDF vero, non un errore travestito',
    Buffer.isBuffer(r.out) && r.out.slice(0, 5).toString() === '%PDF-');
  ok('si scarica col nome giusto', String(r.hdr['Content-Disposition']).includes('diffida-deposito-cauzionale.pdf'));
  ok('non finisce in cache condivise', String(r.hdr['Cache-Control']).includes('no-store'));
}

console.log('\n\x1b[1m▸ il contenuto legale — la parte che deve essere GIUSTA\x1b[0m');
{
  const body = letterBody(BASE).join('\n');
  ok('cita l\'articolo che protegge il conduttore', body.includes('art. 1590'));
  ok('richiama la costituzione in mora (1219 e 2943)', body.includes('1219') && body.includes('2943'));
  ok('dà un termine esplicito di 15 giorni', /15 \(quindici\) giorni/.test(body));
  // L'importo intimato è il TRATTENUTO, non il deposito: intimare 3.600 quando
  // ne hanno resi 240 rende la lettera contestabile in un secondo.
  ok('intima il trattenuto (3.360), non il deposito intero', body.includes('3.360,00') && !/restituzione della somma di EUR 3.600/.test(body));
  ok('dice che l\'onere della prova è del locatore', /onere del locatore provare/.test(body));
  ok('nomina le parti e l\'immobile', body.includes('Anna Schmidt') && body.includes('Mario Rossi') && body.includes('Via del Pigneto 42'));
  ok('la data è in formato italiano', body.includes('30/06/2026'));
  ok('riserva l\'azione giudiziaria', /adire le competenti sedi giudiziarie/.test(body));
}

console.log('\n\x1b[1m▸ quando non è stato restituito nulla\x1b[0m');
{
  const body = letterBody({ ...BASE, returnedEur: 0 }).join('\n');
  ok('lo dice esplicitamente', /non ha provveduto ad alcuna restituzione/.test(body));
  ok('e intima l\'intero deposito', body.includes('3.600,00'));
  ok('non parla di restituzioni parziali inesistenti', !/ha restituito unicamente/.test(body));
}

console.log('\n\x1b[1m▸ le note del cliente entrano, ma solo le sue\x1b[0m');
{
  const body = letterBody({ ...BASE, reason: 'Le pareti erano gia\' segnate al mio ingresso.' }).join('\n');
  ok('la precisazione arriva nel documento', body.includes('Le pareti erano'));
  const noReason = letterBody(BASE).join('\n');
  ok('senza note non compare una sezione vuota', !/Si precisa inoltre/.test(noReason));
}

console.log('\n\x1b[1m▸ cosa non genera una lettera\x1b[0m');
{
  const noName = await call({ ...BASE, tenantName: '' });
  ok('senza il nome del conduttore: no', noName.code === 400);
  const noLandlord = await call({ ...BASE, landlordName: '' });
  ok('senza il locatore: no (a chi la mandi?)', noLandlord.code === 400);
  const badDate = await call({ ...BASE, endDate: 'giugno' });
  ok('con una data non valida: no', badDate.code === 400);
  // Se il deposito è tornato tutto non c'è niente da intimare: mandare una
  // diffida in quel caso è un autogol.
  const allBack = await call({ ...BASE, returnedEur: 3600 });
  ok('se è tornato tutto: no, e lo dice', allBack.code === 400 && allBack.out.error === 'nothing_withheld');
  const hp = await call({ ...BASE, company: 'bot' });
  ok('honeypot: nessun PDF', hp.code === 400);
}

console.log('\n\x1b[1m▸ il lead (senza mai bloccare la lettera)\x1b[0m');
{
  const withMail = await call({ ...BASE, email: 'anna@mail.com' });
  await new Promise(r => setTimeout(r, 60));
  ok('con email: entra in pipeline', withMail.leads.length >= 1);
  if (withMail.leads.length) {
    const d = withMail.leads[0].body.fields;
    ok('intent deposit-recovery — è il servizio che gli serve dopo', d.intent.stringValue === 'deposit-recovery');
    ok('porta l\'importo in ballo', JSON.stringify(d.raw).includes('3360'));
    ok('la lingua NON è indovinata', d.language && d.language.nullValue !== undefined);
  }
  const noMail = await call(BASE);
  ok('senza email: la lettera si genera lo stesso', noMail.code === 200 && Buffer.isBuffer(noMail.out));
  ok('e non si inventa un lead', noMail.leads.length === 0);
}

console.log(`\n${fail ? '\x1b[31m' : '\x1b[32m'}1590 letter: ${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail ? 1 : 0);
