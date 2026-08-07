// tests/referral/run.mjs
// IL REFERRAL CHE VALE — le regole del codice e di chi entra in pipeline.
//
// Il difetto che questo endpoint ripara: la pagina prometteva €50 e il modulo
// finiva su un servizio esterno, quindi la segnalazione non diventava MAI un
// lead. Qui si asserisce il contrario: chi viene presentato entra nello stesso
// schema che leggono portale, Lead Brain e Commerciale, con dentro chi l'ha
// mandato — altrimenti il credito non si può riconoscere e la promessa torna
// a essere finta.

process.env.HOMIE_SECRET = 'test-secret-referral';

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗ ${name}\x1b[0m`); }
};

// Firestore finto: si intercetta la fetch REST come le altre suite del repo.
const written = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('identitytoolkit') || u.includes('securetoken')) {
    return { ok: true, status: 200, json: async () => ({ idToken: 'fake', localId: 'admin' }) };
  }
  if (u.includes('firestore.googleapis.com')) {
    if ((opts.method || 'GET') === 'POST') {
      written.push({ url: u, body: JSON.parse(opts.body || '{}') });
      return { ok: true, status: 200, json: async () => ({ name: 'projects/p/databases/(default)/documents/leads/lead123' }) };
    }
    return { ok: true, status: 200, json: async () => ({ documents: [] }) };
  }
  return { ok: true, status: 200, json: async () => ({}) };
};

const mod = await import('../../api/referral/submit.js');
const handler = mod.default;
const { normalizeCode, REFERRAL_EUR } = mod;

function call(body) {
  written.length = 0;
  let code = 0, payload = null;
  const res = {
    setHeader() {}, status(c) { code = c; return this; },
    json(j) { payload = j; return this; }, end() { return this; },
  };
  return handler({ method: 'POST', headers: {}, body, socket: {} }, res)
    .then(() => ({ code, payload, written: [...written] }));
}

console.log('\n\x1b[1m▸ il codice, ricopiato a mano\x1b[0m');
{
  ok('forma canonica', normalizeCode('BOOM-A1B2C3') === 'BOOM-A1B2C3');
  ok('minuscolo accettato', normalizeCode('boom-a1b2c3') === 'BOOM-A1B2C3');
  ok('senza prefisso lo aggiunge', normalizeCode('A1B2C3') === 'BOOM-A1B2C3');
  ok('spazi ignorati', normalizeCode('  BOOM-A1B2C3  ') === 'BOOM-A1B2C3');
  ok('vuoto → null', normalizeCode('') === null && normalizeCode(null) === null);
  ok('spazzatura → null, non un codice inventato', normalizeCode('!!!') === null);
  ok('il premio è dichiarato in un posto solo', REFERRAL_EUR === 50);
}

console.log('\n\x1b[1m▸ la segnalazione diventa un lead vero\x1b[0m');
{
  const r = await call({
    referrerName: 'Anna Rossi', referrerEmail: 'anna@mail.com', referrerCode: 'boom-a1b2c3',
    friendName: 'Marco Bianchi', friendEmail: 'marco@mail.com', note: 'arriva a settembre',
  });
  // Le scritture sono due: il lead + l'activityLog (la traccia per il portale,
  // come in ogni altro endpoint). Quello che conta è che il LEAD sia uno solo.
  const leadWrites = r.written.filter(w => w.url.includes('/leads'));
  ok('risposta ok', r.code === 200 && r.payload.ok === true);
  ok('scrive UN solo lead', leadWrites.length === 1);
  ok('e lascia la traccia in activityLog', r.written.some(w => w.url.includes('/activityLog')));
  const doc = leadWrites[0] && leadWrites[0].body && leadWrites[0].body.fields;
  ok('finisce nella collection leads', leadWrites[0].url.includes('/leads'));
  ok('il lead è l\'AMICO, non chi presenta', doc.name.stringValue === 'Marco Bianchi');
  ok('status new — lo lavora la macchina esistente', doc.status.stringValue === 'new');
  ok('source referral', doc.source.stringValue === 'referral');
  ok('porta chi ha presentato', JSON.stringify(doc.referral).includes('Anna Rossi'));
  ok('porta il codice normalizzato', JSON.stringify(doc.referral).includes('BOOM-A1B2C3'));
  ok('porta il premio da riconoscere', JSON.stringify(doc.referral).includes('50'));
  // La lingua la decide replyLang dalle parole della persona: fissarla qui
  // farebbe scrivere in italiano a un expat, il bug già corretto in scan-inbox.
  ok('la lingua NON è indovinata', doc.language && doc.language.nullValue !== undefined);
}

console.log('\n\x1b[1m▸ quello che NON deve entrare\x1b[0m');
{
  const noReferrer = await call({ friendName: 'Marco', friendEmail: 'm@m.com' });
  ok('senza chi presenta si rifiuta (il credito va a qualcuno)', noReferrer.code === 400 && noReferrer.written.length === 0);

  const badEmail = await call({ referrerName: 'Anna', referrerEmail: 'non-una-email', friendName: 'Marco', friendEmail: 'm@m.com' });
  ok('email di chi presenta non valida → rifiutato', badEmail.code === 400);

  const noContact = await call({ referrerName: 'Anna', referrerEmail: 'anna@mail.com', friendName: 'Marco' });
  ok('amico irraggiungibile → rifiutato, niente lead morto', noContact.code === 400 && noContact.written.length === 0);

  const honeypot = await call({ company: 'bot', referrerName: 'x', referrerEmail: 'x@x.it', friendName: 'y', friendEmail: 'y@y.it' });
  ok('honeypot: risposta serena, nessuna scrittura', honeypot.code === 200 && honeypot.written.length === 0);
}

console.log('\n\x1b[1m▸ solo il telefono basta\x1b[0m');
{
  const r = await call({
    referrerName: 'Anna', referrerEmail: 'anna@mail.com',
    friendName: 'Marco', friendPhone: '+39 333 4444444',
  });
  const leadWrites = r.written.filter(w => w.url.includes('/leads'));
  ok('amico con solo WhatsApp entra comunque', r.code === 200 && leadWrites.length === 1);
  const doc = leadWrites[0].body.fields;
  ok('il telefono è sul lead', doc.phone.stringValue.includes('333'));
  ok('senza codice il lead resta valido', r.payload.ok === true);
}

console.log(`\n${fail ? '\x1b[31m' : '\x1b[32m'}Referral: ${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail ? 1 : 0);
