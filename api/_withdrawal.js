// api/_withdrawal.js — THE 14-DAY WITHDRAWAL WINDOW and the model form, in
// ONE copy, pure (no I/O, no npm: the desk calendar only).
//
// Moved here verbatim from api/stripe-webhook.js (v1.8, spec §5.2 step 4):
// the order of a desk that charges at signing (api/_cityorder.js, reached
// from api/service-checkout.js) counts the same window and prints the same
// form as the six desks' paid-order emails, and importing the webhook for
// that would load its whole graph (a Stripe client at module load, the
// pre-agreement, agent and pfs modules) into the till. The webhook
// re-exports every name below, so its callers and its tests are unchanged;
// it keeps its own `import DESK_CAL`, HOLIDAY_KEYS and isDeskHoliday
// (tests/cities/calendar.mjs reads them there).

import DESK_CAL from '../js/desk-calendar.js';

// The 14-day withdrawal period of a service contract (Directive 2011/83/EU
// art. 9), on the Rome calendar. The day the contract is concluded does not
// count (Reg. 1182/71 art. 3(1), recital 41 of the Directive): paid on
// Tuesday 20 October, the period runs to the END of 3 November and the first
// day work may begin without a request is 4 November. Calendar days, never
// 14×24h — that slips a day across the October and March clock changes.
// A last day that falls on a Saturday, a Sunday or a public holiday moves to
// the end of the next working day (Reg. 1182/71 art. 3(4)): paid on Saturday
// 17 October, the period ends on Monday 2 November, not on Saturday 31.
// Which holidays: the union of Italy's (the trader, in Rome) and the desk's
// country — a day too many only lengthens the payer's right and delays our
// start, a day too few would shorten a right the law gives them. The day
// work begins is the next desk working day after the period. `concludedEpoch`
// is the moment of payment (the Stripe event's time, stable across retries),
// not the moment the Checkout page was opened.
// The model withdrawal form (Annex I(B)), filled with the trader's details.
// The page is the fillable copy; the TEXT travels inside the confirmation
// email too, because the email is the durable medium (art. 8(7)) and the
// form is part of the information it must carry (art. 6(1)(h)). One line,
// the dashes of the Annex kept: the email template does not keep newlines.
export const WITHDRAWAL_FORM_URL = 'https://www.boomrome.com/withdrawal';
export const WITHDRAWAL_FORM_TEXT = 'MODEL WITHDRAWAL FORM (complete and return this form only if you wish to withdraw from the contract): '
  + '— To Egidi Immobiliare S.r.l. (BOOM), Via dei Coronari 181/184, 00186 Roma, Italy, e-mail hello@boom-rome.com: '
  + '— I/We (*) hereby give notice that I/We (*) withdraw from my/our (*) contract for the provision of the following service (*), '
  + '— Ordered on (*)/received on (*), — Name of consumer(s), — Address of consumer(s), '
  + '— Signature of consumer(s) (only if this form is notified on paper), — Date. (*) Delete as appropriate.';
// the same form for the Rome Pacchetto, in Italian (Codice del consumo
// art. 49(1)(h), Allegato I parte B)
export const WITHDRAWAL_FORM_TEXT_IT = 'MODULO DI RECESSO TIPO (compilare e restituire il presente modulo solo se si desidera recedere dal contratto): '
  + '— Destinatario: Egidi Immobiliare S.r.l. (BOOM), Via dei Coronari 181/184, 00186 Roma, e-mail hello@boom-rome.com: '
  + '— Con la presente io/noi (*) notifichiamo il recesso dal mio/nostro (*) contratto di prestazione del seguente servizio (*), '
  + '— Ordinato il (*)/ricevuto il (*), — Nome del/dei consumatore(i), — Indirizzo del/dei consumatore(i), '
  + '— Firma del/dei consumatore(i) (solo se il presente modulo è notificato in versione cartacea), — Data. (*) Cancellare la dicitura inutile.';

const workingDay = (d, country) => DESK_CAL.workingDay(d, country);

export function withdrawalWindow(concludedEpoch, country = null) {
  const at = new Date((Number(concludedEpoch) || 0) * 1000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(at).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
  const day = (n) => new Date(Date.UTC(parts.year, parts.month - 1, parts.day + n));
  const iso = (d) => d.toISOString().slice(0, 10);
  const label = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  let n = 14;
  while (!workingDay(day(n), country)) n++;
  const last = day(n);
  let s = n + 1;
  while (!workingDay(day(s), country)) s++;
  const start = day(s);
  return { lastDay: iso(last), lastLabel: label(last), startDay: iso(start), startLabel: label(start) };
}
// kept for callers that only want the last day of the period
export const withdrawalEnds = (concludedEpoch) => withdrawalWindow(concludedEpoch).lastLabel;
