// api/viewings/_email.js — the viewing emails, in the BOOM design system.
//
// One template family for the whole flight: confirmation (the boarding pass),
// the reminders (T-24h / T-3h / T-30m) and the after-visit question. Same
// masthead, same gold, same one-primary-action discipline as the
// pre-agreement suite — a client who has already received a BOOM email
// recognizes this one instantly.

import { sendEmail } from '../agent/_lib.js';
import { shell, btn, btn2, para, fine } from '../preagreement/_notify.js';
import {
  isVideo, videoRoom, startOf, fmtWhen, googleCalUrl, icsUrl,
  primaryAction, passUrl, waMsg, WA, manageUrl,
} from './_lib.js';

const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const firstName = n => String(n || '').trim().split(/\s+/)[0] || '';

// A compact facts card — the "ticket" block every email shares.
function ticket(v, lang) {
  const s = startOf(v);
  const rows = [
    [lang === 'it' ? 'Immobile' : 'Property', esc(v.listingName || v.propertyName || 'BOOM Rome')],
    [lang === 'it' ? 'Quando' : 'When', esc(fmtWhen(s, lang)) + (lang === 'it' ? ' (ora di Roma)' : ' (Rome time)')],
    isVideo(v)
      ? [lang === 'it' ? 'Dove' : 'Where', lang === 'it' ? 'Videochiamata — link qui sotto' : 'Video call — link below']
      : [lang === 'it' ? 'Dove' : 'Where', esc([v.listingAddress || v.listingName, 'Roma'].filter(Boolean).join(', '))],
    !isVideo(v) ? [lang === 'it' ? 'Punto d\'incontro' : 'Meeting point', esc(v.meetingPoint || (lang === 'it' ? 'Al citofono' : 'At the intercom'))] : null,
    [lang === 'it' ? 'Durata' : 'Duration', `${Number(v.durationMinutes) || 30} ${lang === 'it' ? 'minuti' : 'minutes'}`],
  ].filter(Boolean);
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E6E1D6;border-radius:12px;padding:6px 18px;margin:0 0 24px">
    ${rows.map(([k, val]) => `<tr>
      <td style="font-family:Helvetica,Arial,sans-serif;font-size:10.5px;letter-spacing:1.6px;text-transform:uppercase;color:#9A9384;padding:11px 0 2px">${k}</td>
    </tr><tr>
      <td style="font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#26241F;padding:0 0 11px;border-bottom:1px solid #F0EDE5">${val}</td>
    </tr>`).join('')}
  </table>`;
}

function send(v, subject, inner, preheader) {
  if (!v.clientEmail && !v.email) return Promise.resolve({ skipped: 'no_email' });
  return sendEmail({
    to: v.clientEmail || v.email,
    subject,
    html: shell(inner, preheader),
    text: String(inner).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200),
  });
}

// ── 1. CONFIRMED — the boarding pass ───────────────────────────────────────
export function sendConfirmation(v, lang = 'en') {
  const it = lang === 'it';
  const act = primaryAction(v, lang);
  const cal = googleCalUrl(v, lang);
  const inner =
    para(it
      ? `Ciao <b>${esc(firstName(v.clientName || v.name))}</b>, la tua visita è <b>confermata</b>.`
      : `Hi <b>${esc(firstName(v.clientName || v.name))}</b>, your viewing is <b>confirmed</b>.`) +
    ticket(v, lang) +
    btn(act.href, act.label) +
    (cal ? btn2(cal, it ? '📅 Aggiungi a Google Calendar' : '📅 Add to Google Calendar') : '') +
    btn2(icsUrl(v), it ? '📅 Apple / Outlook (.ics)' : '📅 Apple / Outlook (.ics)') +
    btn2(passUrl(v), it ? '🎟 Aggiungi ad Apple Wallet' : '🎟 Add to Apple Wallet') +
    para(it
      ? `Ti scriveremo <b>il giorno prima</b>, poi <b>3 ore</b> e <b>30 minuti</b> prima: non devi ricordarti nulla.`
      : `We'll write <b>the day before</b>, then <b>3 hours</b> and <b>30 minutes</b> before — you don't have to remember a thing.`) +
    // Plans change — especially for someone still abroad. One link, no login,
    // no waiting for a human to read a message: they pick another free slot
    // themselves and everything (calendar, Wallet, countdown) follows.
    para(it
      ? `Ti serve un altro orario, o passare da videochiamata a visita di persona? <a href="${manageUrl(v)}" style="color:#B8960C"><b>Gestisci la visita qui</b></a> — un tap, senza account.`
      : `Need a different time, or to switch between video and in person? <a href="${manageUrl(v)}" style="color:#B8960C"><b>Manage your viewing here</b></a> — one tap, no account needed.`) +
    (isVideo(v)
      ? fine(it
        ? 'La videochiamata si apre nel browser: nessuna app, nessun account. Se sei da telefono, usa Chrome o Safari.'
        : 'The video call opens in your browser — no app, no account. On a phone, use Chrome or Safari.')
      : fine(it
        ? `Se sei in ritardo o non trovi il posto, scrivici su <a href="${WA}" style="color:#B8960C">WhatsApp</a>: rispondiamo subito.`
        : `Running late or can't find the place? Message us on <a href="${WA}" style="color:#B8960C">WhatsApp</a> — we reply right away.`));
  return send(v, it ? `Visita confermata — ${v.listingName || 'BOOM Rome'}` : `Viewing confirmed — ${v.listingName || 'BOOM Rome'}`, inner,
    it ? 'La tua visita è confermata' : 'Your viewing is confirmed');
}

// ── 1b. REQUESTED — l'orario è tenuto, la conferma arriva ─────────────────
// Quando l'operatore conferma ogni visita a mano, il cliente NON deve
// ricevere il kit di volo (pass, calendario, "ci vediamo lì"): riceverebbe
// un biglietto per un aereo che potrebbe non partire. Riceve invece la sola
// cosa che gli serve — abbiamo la tua richiesta, quell'orario è tenuto per
// te, ti diciamo entro poco — e nessun pulsante che finga una certezza.
export function sendRequested(v, lang = 'en') {
  const it = lang === 'it';
  const inner =
    para(it
      ? `Ciao <b>${esc(firstName(v.clientName || v.name))}</b>, abbiamo ricevuto la tua richiesta di visita. <b>L'orario che hai scelto è tenuto per te</b> mentre la confermiamo.`
      : `Hi <b>${esc(firstName(v.clientName || v.name))}</b>, we've got your viewing request. <b>The time you picked is held for you</b> while we confirm it.`) +
    ticket(v, lang) +
    para(it
      ? `Ti scriviamo appena è confermata — di solito <b>entro poche ore</b>. In quella email troverai le indicazioni, il pass e il calendario.`
      : `We'll write the moment it's confirmed — usually <b>within a few hours</b>. That email will carry the directions, your pass and the calendar file.`) +
    btn(waMsg(it
      ? `Ciao BOOM, ho appena richiesto una visita per ${v.listingName || ''}`
      : `Hi BOOM, I've just requested a viewing for ${v.listingName || ''}`),
      it ? '💬 Scrivici su WhatsApp' : '💬 Message us on WhatsApp') +
    fine(it
      ? `Ti serve un altro orario? <a href="${manageUrl(v)}" style="color:#B8960C">Cambialo qui</a> — un tap, senza account.`
      : `Need a different time? <a href="${manageUrl(v)}" style="color:#B8960C">Change it here</a> — one tap, no account needed.`);
  return send(v,
    it ? `Richiesta ricevuta — ${v.listingName || 'BOOM Rome'}` : `Request received — ${v.listingName || 'BOOM Rome'}`,
    inner, it ? 'Richiesta ricevuta, orario tenuto' : 'Request received, time held');
}

// ── 2. REMINDERS — the flight countdown ────────────────────────────────────
export function sendReminder(v, when, lang = 'en') {
  const it = lang === 'it';
  const act = primaryAction(v, lang);
  const s = startOf(v);
  const head = {
    '24h': it ? 'Domani la tua visita' : 'Your viewing is tomorrow',
    '3h': it ? 'Tra 3 ore' : 'In 3 hours',
    '30m': it ? 'Tra 30 minuti' : 'In 30 minutes',
  }[when];
  const body = {
    '24h': it
      ? `Domani <b>${esc(fmtWhen(s, lang))}</b>. Se ti serve spostarla, <a href="${manageUrl(v)}" style="color:#B8960C">scegli un altro orario qui</a> — ci pensa tutto il sistema.`
      : `Tomorrow, <b>${esc(fmtWhen(s, lang))}</b>. Need to move it? <a href="${manageUrl(v)}" style="color:#B8960C">Pick another time here</a> — everything updates itself.`,
    '3h': isVideo(v)
      ? (it ? 'Tra poco ci vediamo in video. Ti consigliamo cuffie e una connessione stabile.' : 'We\'ll see you on video shortly. Headphones and a stable connection help.')
      : (it ? 'Tra poco ci vediamo. Tocca il pulsante per le indicazioni: ti portiamo esattamente al portone.' : 'See you shortly. Tap the button for directions — it takes you right to the door.'),
    '30m': isVideo(v)
      ? (it ? 'Ci siamo: puoi entrare nella stanza già da ora.' : 'Almost time — you can join the room already.')
      : (it ? 'Ci siamo. Se sei in ritardo di qualche minuto nessun problema, scrivici pure.' : 'Almost time. A few minutes late is no problem — just let us know.'),
  }[when];
  const inner =
    para(`<b style="font-size:17px">${head}</b>`) +
    para(body) +
    ticket(v, lang) +
    btn(act.href, act.label) +
    (when === '24h' ? btn2(passUrl(v), it ? '🎟 Apple Wallet' : '🎟 Apple Wallet') : '') +
    fine(it ? `Serve aiuto? <a href="${WA}" style="color:#B8960C">WhatsApp BOOM</a>` : `Need help? <a href="${WA}" style="color:#B8960C">WhatsApp BOOM</a>`);
  const subj = {
    '24h': it ? `Domani: visita ${v.listingName || ''}`.trim() : `Tomorrow: viewing at ${v.listingName || 'BOOM Rome'}`,
    '3h': it ? `Tra 3 ore: ${v.listingName || 'la tua visita'}` : `In 3 hours: ${v.listingName || 'your viewing'}`,
    '30m': it ? `Tra 30 minuti: ${v.listingName || 'la tua visita'}` : `In 30 minutes: ${v.listingName || 'your viewing'}`,
  }[when];
  return send(v, subj, inner, head);
}

// ── 3. AFTER — one question, three answers ─────────────────────────────────
export function sendAfter(v, lang = 'en') {
  const it = lang === 'it';
  const ask = t => waMsg(t);
  const inner =
    para(it
      ? `Ciao <b>${esc(firstName(v.clientName || v.name))}</b>, com'è andata la visita di <b>${esc(v.listingName || 'oggi')}</b>?`
      : `Hi <b>${esc(firstName(v.clientName || v.name))}</b>, how was the viewing at <b>${esc(v.listingName || 'today')}</b>?`) +
    para(it
      ? 'Un tap è sufficiente — ci aiuta a non farti perdere tempo.'
      : 'One tap is enough — it helps us not waste your time.') +
    btn(ask(it ? `Mi piace ${v.listingName || ''} — come procediamo?` : `I like ${v.listingName || 'the apartment'} — what are the next steps?`),
      it ? '💛 Mi piace, andiamo avanti' : '💛 I like it — next steps') +
    btn2(ask(it ? `Ci sto pensando su ${v.listingName || ''}` : `I'm still thinking about ${v.listingName || 'the apartment'}`),
      it ? '🤔 Ci sto pensando' : '🤔 Still thinking') +
    btn2(ask(it ? `Non fa per me ${v.listingName || ''} — cerco altro` : `Not the one for me — I'm looking for something else`),
      it ? '🙏 Non fa per me' : '🙏 Not the one') +
    fine(it
      ? 'Se non fa per te dicci cosa cambieresti: la prossima proposta sarà più precisa.'
      : 'If it\'s not the one, tell us what you\'d change — the next match will be sharper.');
  return send(v, it ? `Com\'è andata? — ${v.listingName || 'BOOM Rome'}` : `How did it go? — ${v.listingName || 'BOOM Rome'}`, inner,
    it ? 'Un tap e ci dici com\'è andata' : 'One tap tells us how it went');
}

// ── 4. RESCHEDULED / CANCELLED ─────────────────────────────────────────────
export function sendChanged(v, kind, lang = 'en') {
  const it = lang === 'it';
  const cancelled = kind === 'cancelled';
  const act = primaryAction(v, lang);
  const cal = googleCalUrl(v, lang);
  const inner = cancelled
    ? para(it
        ? `Ciao ${esc(firstName(v.clientName || v.name))}, la visita di <b>${esc(v.listingName || '')}</b> è stata <b>annullata</b>. Scrivici su WhatsApp e ne fissiamo un'altra quando vuoi.`
        : `Hi ${esc(firstName(v.clientName || v.name))}, the viewing at <b>${esc(v.listingName || '')}</b> has been <b>cancelled</b>. Message us on WhatsApp and we'll set a new one whenever suits you.`)
      + btn(WA, it ? '💬 Scrivici su WhatsApp' : '💬 Message us on WhatsApp')
    : para(it
        ? `Ciao ${esc(firstName(v.clientName || v.name))}, la tua visita è stata <b>spostata</b>. Il nuovo appuntamento:`
        : `Hi ${esc(firstName(v.clientName || v.name))}, your viewing has been <b>moved</b>. The new time:`)
      + ticket(v, lang)
      + btn(act.href, act.label)
      + (cal ? btn2(cal, it ? '📅 Aggiorna il calendario' : '📅 Update your calendar') : '')
      + fine(it
        ? `Il pass nel Wallet si aggiorna da solo. Non va bene neanche questo? <a href="${manageUrl(v)}" style="color:#B8960C">Scegli tu l'orario</a>.`
        : `Your Wallet pass updates itself. Still not right? <a href="${manageUrl(v)}" style="color:#B8960C">Pick a time yourself</a>.`);
  return send(v,
    cancelled
      ? (it ? `Visita annullata — ${v.listingName || 'BOOM Rome'}` : `Viewing cancelled — ${v.listingName || 'BOOM Rome'}`)
      : (it ? `Nuovo orario — ${v.listingName || 'BOOM Rome'}` : `New time — ${v.listingName || 'BOOM Rome'}`),
    inner, cancelled ? (it ? 'Visita annullata' : 'Viewing cancelled') : (it ? 'Visita spostata' : 'Viewing moved'));
}
