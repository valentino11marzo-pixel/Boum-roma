// tests/recovery/run.mjs — Il Recupero: chi diventa lead e chi no.
//
// La promessa: un checkout abbandonato torna nel pipeline, ma MAI un falso
// positivo — i test dell'operatore non diventano lead, chi ha pagato dopo
// non viene inseguito, un rerun non duplica (l'id È la sessione), e la
// lingua della risposta la decidono le parole DEL CLIENTE, mai il nostro
// riassunto in italiano.
//
// Run: node tests/recovery/run.mjs

import {
  classifySession, leadFromSession, recoveryLeadId, recapLine,
  sessionEmail, operatorEmails,
} from '../../api/payments/recover-checkouts.js';

let fails = 0;
const ok = (name, cond, detail) => {
  console.log(cond ? `PASS ${name}` : `FAIL ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fails++;
};

const S = (over = {}) => ({
  id: 'cs_live_a1IUYOwfUN3bJ9vAhXzjhlyibU18SGauN6nNKjC5PjeNZFRchqLZwVO7Hh',
  status: 'expired', payment_status: 'unpaid',
  amount_total: 35000, currency: 'eur', created: 1785316198,
  customer_details: { email: 'sonia@example.com', name: 'Sonia Azofra' },
  metadata: {
    service: 'PFS', name: 'Sonia Azofra', email: 'sonia@example.com', phone: '+34638068218',
    budget: '€1,500-€2,000', bedrooms: '2', preferred_areas: 'Prati',
    move_in_date: '2026-09-05', must_haves: '2 habitaciones con puerta',
    additional_info: 'Cerca de la universidad y cerca del metro',
  },
  ...over,
});

// ── 1. la classificazione ──────────────────────────────────────────────────
{
  const ops = new Set(['valentino@boom-rome.com']);
  ok('un PFS scaduto è un lead', classifySession(S(), ops) === 'lead');
  ok('un SERVICE scaduto è un lead', classifySession(S({ metadata: { service: 'SERVICE', kind: 'cleaning-premium', email: 'x@y.com' } }), ops) === 'lead');
  ok('una RESERVE scaduta è un lead', classifySession(S({ metadata: { service: 'RESERVE', email: 'x@y.com' } }), ops) === 'lead');
  ok('un PREAGREEMENT scaduto è recap, non lead', classifySession(S({ metadata: { service: 'PREAGREEMENT', email: 'x@y.com', ref: 'BOOM-X' } }), ops) === 'recap');
  ok('un RENT scaduto è recap', classifySession(S({ metadata: { service: 'RENT', email: 'x@y.com' } }), ops) === 'recap');
  ok('un test dell\'operatore non diventa MAI un lead',
    classifySession(S({ customer_details: { email: 'valentino@boom-rome.com' }, metadata: { service: 'PFS', email: 'valentino@boom-rome.com' } }), ops) === null);
  ok('una sessione completata non è un abbandono', classifySession(S({ status: 'complete', payment_status: 'paid' }), ops) === null);
  ok('senza email non c\'è nessuno da recuperare',
    classifySession(S({ customer_details: null, customer_email: null, metadata: { service: 'PFS' } }), ops) === null);
  ok('un service sconosciuto viene ignorato', classifySession(S({ metadata: { service: 'BOH', email: 'x@y.com' } }), ops) === null);

  process.env.GMAIL_USER = 'Boom.Test@Gmail.com';
  ok('GMAIL_USER entra nel filtro operatore (case-insensitive)', operatorEmails().has('boom.test@gmail.com'));
  ok('l\'email vince in ordine: typed > metadata > customer_email',
    sessionEmail({ customer_details: { email: 'Typed@X.com' }, metadata: { email: 'meta@x.com' }, customer_email: 'cust@x.com' }) === 'typed@x.com');
}

// ── 2. il lead ─────────────────────────────────────────────────────────────
{
  const lead = leadFromSession(S(), new Date('2026-07-30T10:00:00Z'));
  ok('status new → notify-pending, Lead Brain e Commerciale lo prendono da soli', lead.status === 'new');
  ok('source dice da dove viene', lead.source === 'stripe-recovery');
  ok('intent pfs', lead.intent === 'pfs');
  ok('contatti completi', lead.name === 'Sonia Azofra' && lead.email === 'sonia@example.com' && lead.phone === '+34638068218');
  ok('il messaggio racconta il fatto e l\'importo', lead.message.includes('Checkout NON completato') && lead.message.includes('€350'));
  ok('…e porta i requisiti verbatim', lead.message.includes('Prati') && lead.message.includes('habitaciones'));
  ok('i campi PFS grezzi viaggiano sul lead', lead.budget === '€1,500-€2,000' && lead.preferred_areas === 'Prati');
  ok('la lingua NON è italiano solo perché il riassunto lo è', lead.language !== 'it', String(lead.language));

  const en = leadFromSession(S({ metadata: { ...S().metadata, must_haves: 'Furniture and air conditioning', additional_info: 'We are two students looking for an apartment' } }));
  ok('parole inglesi del cliente → language en', en.language === 'en');
  const mute = leadFromSession(S({ metadata: { service: 'PFS', email: 'x@y.com' } }));
  ok('senza testo del cliente la lingua resta null', mute.language === null);

  ok('id deterministico: un rerun non duplica', recoveryLeadId(S()) === recoveryLeadId(S()));
  ok('l\'id è corto e pulito', /^strec_[a-zA-Z0-9]{1,24}$/.test(recoveryLeadId(S())), recoveryLeadId(S()));

  const recap = recapLine(S({ metadata: { service: 'PREAGREEMENT', name: 'Ines', ref: 'BOOM-MS3AWEZB', email: 'i@x.com' }, amount_total: 145000 }));
  ok('la riga recap dice chi, cosa, quanto', recap.includes('pre-accordo') && /€1[.,]?450/.test(recap) && recap.includes('Ines') && recap.includes('BOOM-MS3AWEZB'), recap);
}

console.log(fails ? `\n${fails} FAILED` : '\nAll green.');
process.exit(fails ? 1 : 0);
