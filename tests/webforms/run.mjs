// tests/webforms/run.mjs
// L'ULTIMO PEZZO DI SITO CHE NON PARLAVA CON LA MACCHINA.
//
// Dodici moduli pubblici spedivano ancora a un servizio esterno: contatti,
// contract check gratuito (il lead magnet), pre-arrivo, precheck e i sette
// articoli. Chi li compilava spariva. Qui si asserisce che ora entrano, e
// soprattutto le due trappole trovate ricablandoli:
//   1. `company` sull'endpoint è l'HONEYPOT, ma su precheck è il datore di
//      lavoro del candidato — mandarlo tale e quale avrebbe scartato come
//      spam ogni singola candidatura;
//   2. un lead senza modo di essere ricontattato non deve entrare, o occupa
//      la coda del Commerciale senza poter diventare niente.

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
    if ((opts.method || 'GET') === 'POST') {
      written.push({ url: u, body: JSON.parse(opts.body || '{}') });
      return { ok: true, status: 200, json: async () => ({ name: 'p/documents/leads/l1' }) };
    }
    return { ok: true, status: 200, json: async () => ({ documents: [] }) };
  }
  return { ok: true, status: 200, json: async () => ({}) };
};

const mod = await import('../../api/leads/web.js');
const { buildMessage, FORMS } = mod;

let ipN = 0;
function call(body) {
  written.length = 0;
  let code = 0, payload = null;
  const res = { setHeader() {}, status(c) { code = c; return this; }, json(j) { payload = j; return this; }, end() { return this; } };
  return mod.default({ method: 'POST', headers: { 'x-forwarded-for': `10.1.0.${++ipN}` }, body, socket: {} }, res)
    .then(() => ({ code, payload, leads: written.filter(w => w.url.includes('/leads')) }));
}

console.log('\n\x1b[1m▸ ogni modulo dice da dove viene\x1b[0m');
{
  for (const key of ['contact', 'contract-check', 'pre-arrival', 'precheck', 'property-finding']) {
    const r = await call({ form: key, name: 'Anna', email: 'a@b.it' });
    const d = r.leads[0] && r.leads[0].body.fields;
    if (!d) { ok(`${key} entra`, false); continue; }
    ok(`${key} → intent ${FORMS[key].intent}`, d.intent.stringValue === FORMS[key].intent && d.sourceRef.stringValue === key);
  }
  const blog = await call({ form: 'blog-scam-bible', name: 'Anna', email: 'a@b.it' });
  ok('un articolo del blog entra come contatto', blog.leads[0].body.fields.intent.stringValue === 'contact');
  // Un modulo nuovo domani non deve rompersi il giorno del deploy.
  const unknown = await call({ form: 'modulo-che-non-esiste-ancora', name: 'Anna', email: 'a@b.it' });
  ok('un modulo sconosciuto entra come contatto, non viene perso', unknown.code === 200 && unknown.leads.length === 1);
}

console.log('\n\x1b[1m▸ la trappola del campo "company"\x1b[0m');
{
  // precheck manda il datore di lavoro: se finisse su `company` l'endpoint lo
  // leggerebbe come honeypot e scarterebbe SILENZIOSAMENTE il candidato.
  const real = await call({
    form: 'precheck', name: 'Marco Bianchi', email: 'marco@mail.com',
    additional_info: 'impiegato · presso Acme S.p.A. · reddito 2500',
  });
  ok('il datore di lavoro NON fa scartare la candidatura', real.code === 200 && real.leads.length === 1);
  ok('e finisce nel messaggio, leggibile dall\'operatore',
    real.leads[0].body.fields.message.stringValue.includes('Acme'));

  const bot = await call({ form: 'contact', name: 'X', email: 'x@y.it', company: 'qualcosa' });
  ok('il vero honeypot invece scarta, in silenzio e con 200', bot.code === 200 && bot.leads.length === 0);
}

console.log('\n\x1b[1m▸ chi non entra\x1b[0m');
{
  const noName = await call({ form: 'contact', email: 'a@b.it' });
  ok('senza nome: no', noName.code === 400 && noName.leads.length === 0);
  const noReach = await call({ form: 'contact', name: 'Anna' });
  ok('senza email né telefono: no (sarebbe un lead morto)', noReach.code === 400);
  const phoneOnly = await call({ form: 'contact', name: 'Anna', phone: '+39 333 4444444' });
  ok('solo telefono: entra', phoneOnly.code === 200 && phoneOnly.leads.length === 1);
  const badMail = await call({ form: 'contact', name: 'Anna', email: 'non-valida', phone: '+393334444444' });
  ok('email storta ma telefono buono: entra, email scartata',
    badMail.code === 200 && badMail.leads[0].body.fields.email.nullValue !== undefined);
}

console.log('\n\x1b[1m▸ il contesto arriva all\'operatore\x1b[0m');
{
  const m = buildMessage('contract-check', { listing_url: 'https://immobiliare.it/x', message: 'Firmo domani' });
  ok('il messaggio dice quale modulo', m.startsWith('Contract check gratuito'));
  ok('e porta i campi utili', m.includes('immobiliare.it') && m.includes('Firmo domani'));
  const r = await call({
    form: 'pre-arrival', name: 'Anna', email: 'a@b.it',
    arrival_date: '2026-09-10', nationality: 'USA', package: 'Full landing',
  });
  const d = r.leads[0].body.fields;
  ok('i campi extra restano nel documento', JSON.stringify(d.raw).includes('2026-09-10'));
  ok('la lingua NON è indovinata', d.language && d.language.nullValue !== undefined);
  ok('status new: lo lavora la macchina esistente', d.status.stringValue === 'new');
}

console.log('\n\x1b[1m▸ il rate limit\x1b[0m');
{
  const flood = [];
  for (let i = 0; i < 10; i++) {
    written.length = 0;
    let code = 0;
    const res = { setHeader() {}, status(c) { code = c; return this; }, json() { return this; }, end() { return this; } };
    await mod.default({ method: 'POST', headers: { 'x-forwarded-for': '7.7.7.7' }, body: { form: 'contact', name: 'F', email: 'f@y.it' }, socket: {} }, res);
    flood.push(code);
  }
  ok('lo stesso IP viene fermato', flood.includes(429));
  ok('un altro IP passa', (await call({ form: 'contact', name: 'G', email: 'g@y.it' })).code === 200);
}

console.log('\n\x1b[1m▸ le pagine-zona: "trova casa in Trastevere" entra con la zona in chiaro\x1b[0m');
{
  // Audit SEO P1 #8: le 11 landing di quartiere avevano solo WhatsApp. Ora
  // il modulo manda `zone-<slug>` — la famiglia decide l'intento, il suffisso
  // resta in sourceRef per sapere QUALE pagina converte.
  const r = await call({
    form: 'zone-trastevere', name: 'Lena', email: 'lena@mail.de',
    zone: 'Trastevere', budget: '€1,500 – €2,000', move_in_date: '2026-10',
    message: 'Two of us, 9 months, need a real kitchen',
  });
  const d = r.leads[0] && r.leads[0].body.fields;
  ok('entra come contatto della famiglia zone', r.code === 200 && d && d.intent.stringValue === 'contact');
  ok('sourceRef dice QUALE pagina', d && d.sourceRef.stringValue === 'zone-trastevere');
  ok('la zona è nel campo dedicato (il Commerciale la legge senza aprire il doc)', d && d.zone.stringValue === 'Trastevere');
  const m = d ? d.message.stringValue : '';
  ok('il messaggio apre con l\'etichetta di famiglia e porta budget + move-in',
    m.startsWith('Trova casa in zona') && m.includes('€1,500') && m.includes('2026-10') && m.includes('real kitchen'));
  ok('il modulo di zona compilato dal bot viene scartato in silenzio',
    (await call({ form: 'zone-monti', name: 'Bot', email: 'b@b.b', company: 'x' })).leads.length === 0);
  // Le pagine generate portano davvero il modulo cablato sull'endpoint.
  const { readFileSync, readdirSync } = await import('node:fs');
  const zonePages = readdirSync('apartments-in').filter((f) => f.endsWith('.html') && f !== 'index.html');
  let wired = 0;
  for (const f of zonePages) {
    const html = readFileSync('apartments-in/' + f, 'utf8');
    const slug = f.replace(/\.html$/, '');
    if (html.includes(`data-boomform="zone-${slug}"`) && html.includes('name="botcheck"') && html.includes('name="zone"') && html.includes('fetch("/api/leads/web"')) wired++;
  }
  ok(`tutte le ${zonePages.length} pagine-zona portano il modulo cablato su /api/leads/web (honeypot + zona)`, wired === zonePages.length);
}

console.log(`\n${fail ? '\x1b[31m' : '\x1b[32m'}Moduli web: ${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail ? 1 : 0);
