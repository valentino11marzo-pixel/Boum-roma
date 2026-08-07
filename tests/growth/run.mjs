// tests/growth/run.mjs
// I DUE CANALI GRATUITI: partner istituzionali e recensioni Google.
//
// Entrambi avevano lo stesso difetto di fondo — la promessa c'era, la macchina
// dietro no. I form di università/aziende/ricerca/proprietari finivano su un
// servizio esterno (quindi il canale numero uno secondo il nostro stesso
// playbook non produceva un lead), e la recensione si chiedeva solo via email
// a T+3, senza sapere a chi era già stata chiesta.
//
// Qui si asserisce ciò che non deve scivolare: chi entra in pipeline, con che
// codice, e — soprattutto — a chi si può chiedere una recensione. Sbagliare
// quella riga significa scrivere a qualcuno che non ha ancora le chiavi.

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗ ${name}\x1b[0m`); }
};

// ── Firestore + Telegram finti ────────────────────────────────────────────
const written = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('identitytoolkit') || u.includes('securetoken')) {
    return { ok: true, status: 200, json: async () => ({ idToken: 'fake', localId: 'admin' }) };
  }
  if (u.includes('api.telegram.org')) return { ok: true, status: 200, json: async () => ({ ok: true, result: {} }) };
  if (u.includes('firestore.googleapis.com')) {
    if ((opts.method || 'GET') === 'POST') {
      written.push({ url: u, body: JSON.parse(opts.body || '{}') });
      return { ok: true, status: 200, json: async () => ({ name: 'p/documents/leads/x1' }) };
    }
    return { ok: true, status: 200, json: async () => ({ documents: [] }) };
  }
  return { ok: true, status: 200, json: async () => ({}) };
};

const partners = await import('../../api/partners/submit.js');
const { partnerCode, KINDS } = partners;
const rv = await import('../../api/reviews/_lib.js');

// Ogni chiamata da un IP diverso: il rate limit è per-IP e con un IP solo il
// settimo invio del test riceverebbe 429 invece del codice che sta verificando.
let ipN = 0;
function callPartner(body, ip) {
  written.length = 0;
  let code = 0, payload = null;
  const res = { setHeader() {}, status(c) { code = c; return this; }, json(j) { payload = j; return this; }, end() { return this; } };
  const headers = { 'x-forwarded-for': ip || `10.0.0.${++ipN}` };
  return partners.default({ method: 'POST', headers, body, socket: {} }, res)
    .then(() => ({ code, payload, leads: written.filter(w => w.url.includes('/leads')) }));
}

console.log('\n\x1b[1m▸ il codice della convenzione\x1b[0m');
{
  ok('sigla da più parole', partnerCode('John Cabot University', 2026) === 'JC-2026');
  ok('parola singola per esteso', partnerCode('Sapienza', 2026) === 'SAPIENZA-2026');
  // "University" e "of" non distinguono nulla: tolte, resta una parola sola,
  // che va per esteso perché un codice leggibile si detta al telefono.
  ok('scarta le parole che non distinguono', partnerCode('University of Bologna', 2026) === 'BOLOGNA-2026');
  // Deterministico: lo stesso ente ricontattato deve dare lo stesso codice,
  // altrimenti i numeri di un canale si sparpagliano su due etichette.
  ok('deterministico', partnerCode('LUISS', 2026) === partnerCode('LUISS', 2026));
  ok('anno diverso, codice diverso', partnerCode('LUISS', 2026) !== partnerCode('LUISS', 2027));
  ok('nome vuoto non produce un codice rotto', partnerCode('', 2026) === 'PARTNER-2026');
  ok('caratteri strani non entrano nel codice', /^[A-Z0-9-]+$/.test(partnerCode('Università "La Sapienza" (Roma)', 2026)));
}

console.log('\n\x1b[1m▸ il partner entra in pipeline\x1b[0m');
{
  const r = await callPartner({
    kind: 'university', name: 'Jane Doe', email: 'housing@jcu.edu',
    org: 'John Cabot University', role: 'Housing Coordinator',
    country: 'USA', volume: '150–500', message: 'Fall intake starts in September',
  });
  ok('risposta ok col codice', r.code === 200 && r.payload.ok && r.payload.code === partnerCode('John Cabot University'));
  ok('scrive UN lead', r.leads.length === 1);
  const d = r.leads[0].body.fields;
  ok('source partner', d.source.stringValue === 'partner');
  ok('status new — lo lavora la macchina esistente', d.status.stringValue === 'new');
  ok('intent dice CHE tipo di partner', d.intent.stringValue === 'partner-university');
  ok('porta ente, ruolo e volume', JSON.stringify(d.partner).includes('John Cabot')
    && JSON.stringify(d.partner).includes('Housing Coordinator'));
  ok('porta il link UTM tracciabile', JSON.stringify(d.partner).includes('utm_campaign'));
  ok('la lingua NON è indovinata', d.language && d.language.nullValue !== undefined);
}

console.log('\n\x1b[1m▸ i quattro tipi, e nient\'altro\x1b[0m');
{
  ok('i tipi previsti sono quattro', Object.keys(KINDS).length === 4);
  for (const k of ['university', 'corporate', 'research', 'owner']) {
    const r = await callPartner({ kind: k, name: 'X', email: 'x@y.it', org: 'Test' });
    if (r.code !== 200 || r.leads.length !== 1) { ok(`${k} entra`, false); continue; }
  }
  ok('tutti e quattro entrano', true);
  const bad = await callPartner({ kind: 'inventato', name: 'X', email: 'x@y.it' });
  ok('un tipo inventato è rifiutato', bad.code === 400 && bad.leads.length === 0);
  const noMail = await callPartner({ kind: 'university', name: 'X', email: 'non-una-email' });
  ok('senza email valida non entra', noMail.code === 400 && noMail.leads.length === 0);
  const hp = await callPartner({ kind: 'university', name: 'X', email: 'x@y.it', company: 'bot' });
  ok('honeypot: nessuna scrittura', hp.code === 200 && hp.leads.length === 0);

  // Il rate limit è per-IP: sette invii di fila dallo stesso indirizzo devono
  // fermarsi, altrimenti un bot riempie la pipeline di finti atenei.
  const flood = [];
  for (let i = 0; i < 8; i++) flood.push(await callPartner({ kind: 'university', name: 'F', email: 'f@y.it' }, '9.9.9.9'));
  ok('lo stesso IP viene fermato', flood.some(r => r.code === 429));
  ok('ma un altro IP passa', (await callPartner({ kind: 'university', name: 'G', email: 'g@y.it' })).code === 200);
}

console.log('\n\x1b[1m▸ il link della recensione\x1b[0m');
{
  ok('accetta g.page/r/<id>/review', rv.reviewUrl('https://g.page/r/AbC123/review') === 'https://g.page/r/AbC123/review');
  ok('accetta writereview?placeid=', !!rv.reviewUrl('https://search.google.com/local/writereview?placeid=Xy9'));
  // Un link "condividi" apre il PROFILO: metà delle persone non trova il
  // bottone per scrivere. Meglio la ricerca che una falsa promessa.
  ok('rifiuta il link condividi', rv.reviewUrl('https://share.google/xikmVxQCRuKOdWcND') === null);
  ok('rifiuta un URL maps', rv.reviewUrl('https://www.google.com/maps/place/BOOM') === null);
  ok('senza configurazione si ripiega sulla ricerca', rv.activeReviewUrl({}).includes('google.com/search'));
  ok('e lo dichiara', rv.hasRealReviewLink({}) === false
    && rv.hasRealReviewLink({ REVIEW_URL: 'https://g.page/r/AbC/review' }) === true);
}

console.log('\n\x1b[1m▸ a chi si chiede (la riga che conta)\x1b[0m');
{
  const today = '2026-08-02';
  const base = { id: 'c1', tenantName: 'Anna', tenantPhone: '+39333', startDate: '2026-07-20' };
  ok('entrato 13 giorni fa: sì', rv.reviewCandidates([base], today).length === 1);
  // Chi entra domani non ha ancora le chiavi: chiedergli una recensione è il
  // modo più veloce per sembrare un robot.
  ok('non ha ancora le chiavi: no', rv.reviewCandidates([{ ...base, startDate: '2026-08-05' }], today).length === 0);
  ok('entrato ieri (troppo presto): no', rv.reviewCandidates([{ ...base, startDate: '2026-08-01' }], today).length === 0);
  ok('entrato 6 mesi fa (fuori tempo): no', rv.reviewCandidates([{ ...base, startDate: '2026-02-01' }], today).length === 0);
  ok('già chiesto: mai due volte', rv.reviewCandidates([{ ...base, reviewAskedAt: '2026-07-30' }], today).length === 0);
  ok('irraggiungibile: no', rv.reviewCandidates([{ ...base, tenantPhone: '', tenantEmail: '' }], today).length === 0);
  ok('contratto annullato: no', rv.reviewCandidates([{ ...base, status: 'cancelled' }], today).length === 0);
  ok('senza data di inizio: no', rv.reviewCandidates([{ ...base, startDate: '' }], today).length === 0);
  const many = rv.reviewCandidates([
    { ...base, id: 'a', startDate: '2026-07-01' },
    { ...base, id: 'b', startDate: '2026-07-28' },
  ], today);
  ok('il più fresco per primo', many[0].id === 'b');
}

console.log('\n\x1b[1m▸ il messaggio\x1b[0m');
{
  const url = 'https://g.page/r/AbC/review';
  const en = rv.reviewAskText('Anna Rossi', 'en', url);
  const it = rv.reviewAskText('Marco Bianchi', 'it', url);
  ok('usa il nome di battesimo', en.includes('Anna') && !en.includes('Rossi'));
  ok('porta il link', en.includes(url) && it.includes(url));
  // Prima si chiede come va: chiedere la recensione a chi ha un problema
  // aperto è il modo più veloce per prendersi una stella.
  ok('chiede prima com\'è andata (EN)', /how'?s the apartment/i.test(en));
  ok('e offre la via d\'uscita se qualcosa non va', /isn't right/i.test(en) && /non va/i.test(it));
  ok('italiano per chi legge italiano', it.includes('Ciao') && it.includes('recensione'));
  const wa = rv.reviewWaUrl('+39 333 444 5555', 'Anna', 'en', url);
  ok('wa.me col numero pulito', wa.startsWith('https://wa.me/393334445555?text='));
  ok('senza numero resta condivisibile', rv.reviewWaUrl('', 'Anna', 'en', url).startsWith('https://wa.me/?text='));
}

console.log(`\n${fail ? '\x1b[31m' : '\x1b[32m'}Growth (partner + recensioni): ${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail ? 1 : 0);
