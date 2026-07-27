// api/journey/_run.js
// THE TENANT JOURNEY — the life of a contract, told at the right moments.
// Runs inside reminder-cron (lazy import, same pattern as pa/_remind): each
// step fires ONCE per contract (flag on contracts.journey.<step>), inside a
// tolerant day-window so a missed cron run never skips a moment.
//
// The commercial rules, as set by the operator:
//   T-30  welcome to the countdown + Move-in Pack (concierge intro)
//   T-14  missing documents nudge + utilities handled for you
//   T-7   Cleaning Premium + deposit-balance reminder (if pending)
//   T-1   key handover — INCLUDED, never sold
//   T+3   review ask (REVIEW_URL) + "La tua casa BOOM" intro
//   T-90 before end — renewal CONFIRMATION ONLY, zero upsell
//   end+3 exit: thank you + review + become-a-referrer. Nothing else.
//
// Every email: the platform design system (black masthead, gold BOOM),
// linked to /casa. Upsells give BOTH doors: a gold button that opens Stripe
// in one tap (api/services/buy.js — price from the server catalog) and a
// quiet WhatsApp line for whoever wants to ask a human first.
//
// NOTE: static imports only (Vercel NFT does not trace lazy import of npm
// packages — this file is itself lazy-imported, which is fine: it's local).

import { fsList, fsGet, fsPatch } from '../homie/_lib.js';
import { sendEmail } from '../agent/_lib.js';
// Un solo sistema di design per tutte le email della piattaforma.
import { shell, btn, btn2, para, fine, includes, hero, tiles, timeline, rule } from '../preagreement/_notify.js';

const ADMIN_EMAIL = 'valentino@boom-rome.com';
const WA = 'https://wa.me/393313251961';
const CASA = 'https://www.boomrome.com/casa';
const waMsg = t => WA + '?text=' + encodeURIComponent(t);
// One-tap purchase straight from the email (api/services/buy.js → Stripe).
// Price and copy come from the server catalog, never from this file.
const buyUrl = (kind, tenant) => 'https://www.boomrome.com/api/services/buy?kind=' + kind
  + (tenant && tenant.email ? '&e=' + encodeURIComponent(tenant.email) : '')
  + (tenant && tenant.name ? '&n=' + encodeURIComponent(tenant.name) : '');
const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const eur = n => '€' + Number(n || 0).toLocaleString('en-US');
const fmtD = s => { try { return new Date(String(s).slice(0, 10) + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return s; } };

// The review link: set REVIEW_URL in Vercel to the real Google review URL —
// the one that opens the STAR BOX directly, not the profile:
//   https://g.page/r/<id>/review
//   https://search.google.com/local/writereview?placeid=<id>
// A share link (maps.app.goo.gl/…) or a /maps/place/… URL lands on the card
// instead, and roughly half the people never find the "write a review"
// button from there. So we validate: anything that is not a real write-review
// URL is refused and we fall back to the search, loudly — a wrong value must
// never ship silently inside a client email.
export function reviewUrl(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  const ok = /^https:\/\/g\.page\/r\/[A-Za-z0-9_-]+\/review\/?$/.test(v)
    || /^https:\/\/search\.google\.com\/local\/writereview\?placeid=[A-Za-z0-9_-]+$/.test(v);
  if (!ok) {
    console.warn('[journey] REVIEW_URL ignorato — non è un link "scrivi recensione" '
      + '(atteso g.page/r/<id>/review o search.google.com/local/writereview?placeid=<id>):', v);
    return null;
  }
  return v;
}
const REVIEW_URL = reviewUrl(process.env.REVIEW_URL)
  || 'https://www.google.com/search?q=BOOM+Rome+boomrome.com+reviews';

const dayDiff = (iso) => {
  // whole days from today (UTC date math on YYYY-MM-DD) to iso; negative = past
  const today = new Date().toISOString().slice(0, 10);
  return Math.round((new Date(iso + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
};

// step key → { when(c) -> true if inside the window, subject, html }
export function steps({ c, tenant, addrShort, addr, first, has = () => false }) {
  const start = c.startDate, end = c.endDate;
  const dStart = start ? dayDiff(start) : null;
  const dEnd = end ? dayDiff(end) : null;
  const casaBtns = btn(CASA, 'Apri La tua casa BOOM');

  return [
    {
      key: 't30',
      due: dStart != null && dStart <= 30 && dStart >= 24,
      subject: `${dStart} days to ${addrShort} — the countdown is on`,
      html: para(`Ciao ${esc(first)} — <b>${dStart} days</b> to your move-in at <b>${esc(addr)}</b> (${fmtD(start)}). Everything on our side is on track. From today, your home base is <b>La tua casa BOOM</b>: payments, documents, requests — one place, always.`)
        + casaBtns
        + (has('movein-pack') ? '' :
            para(`One thing worth handling early: <b>utilities</b>. Our <b>Move-in Pack</b> takes care of it end to end — you arrive, everything works.`, 'margin-top:26px')
            + includes(['Electricity &amp; gas transferred into your name',
                        'Internet activated at your address',
                        'Step-by-step residency guide, in English'])
            + btn(buyUrl('movein-pack', tenant), 'Add the Move-in Pack — €149')
            + fine(`Rather talk first? <a href="${waMsg(`Ciao BOOM! Info sul Move-in Pack per ${addr}.`)}" style="color:#141414">Ask on WhatsApp</a> — same team, no bots.`, 'text-align:center'))
        + fine(`Questions anytime — just reply or <a href="${WA}" style="color:#141414">WhatsApp us</a>.`, 'text-align:center'),
    },
    {
      key: 't14',
      due: dStart != null && dStart <= 14 && dStart >= 10,
      subject: `Two weeks to ${addrShort} — a quick check`,
      html: para(`Ciao ${esc(first)} — two weeks out, quick check-in. If any document is still missing on your side (ID, proof for the transitional lease), you can upload it in one tap from your pre-agreement link or send it on WhatsApp — takes a minute now, saves days at registration.`)
        + casaBtns
        + (has('movein-pack')
            ? para(`Your <b>Move-in Pack</b> is already in motion — utilities and internet are on us from here.`, 'margin-top:24px')
            : para(`And if you'd rather not think about utilities at all, the <b>Move-in Pack</b> is still the shortcut — we start the transfers the same day.`, 'margin-top:24px')
              + btn2(buyUrl('movein-pack', tenant), 'Move-in Pack — €149')
              + fine(`Questions? <a href="${waMsg(`Ciao BOOM! Info sul Move-in Pack per ${addr}.`)}" style="color:#141414">WhatsApp us</a>.`, 'text-align:center')),
    },
    {
      key: 't7',
      due: dStart != null && dStart <= 7 && dStart >= 4,
      subject: `One week to ${addrShort} ✨`,
      html: para(`Ciao ${esc(first)} — one week! Two things make move-in day perfect:`)
        + (has('cleaning-premium')
            ? para(`<b>1 · A spotless home.</b> Your <b>Cleaning Premium</b> is booked — the team goes in the day before you arrive, and you'll get the photo report.`, 'margin-bottom:4px')
            : para(`<b>1 · A spotless home.</b> Our <b>Cleaning Premium</b> is a professional deep clean the day before you arrive. You open the door to a hotel-fresh apartment.`, 'margin-bottom:4px')
              + includes(['Kitchen, bathrooms, floors and windows',
                          'Done the day before your move-in',
                          'Photo report before you arrive'])
              + btn(buyUrl('cleaning-premium', tenant), 'Book Cleaning Premium — €119')
              + fine(`Prefer to ask first? <a href="${waMsg(`Ciao BOOM! Vorrei il Cleaning Premium prima del mio arrivo a ${addr}.`)}" style="color:#141414">WhatsApp us</a>.`, 'text-align:center'))
        + para(`<b>2 · The numbers, settled.</b> Any remaining balance (deposit or first payment) is one tap in your portal — card or transfer, receipt automatic.`, 'margin-top:22px')
        + casaBtns,
    },
    {
      key: 't1',
      due: dStart != null && dStart <= 1 && dStart >= 0,
      subject: `${dStart === 0 ? 'Today' : 'Tomorrow'}: keys to ${addrShort} 🔑`,
      html: para(`Ciao ${esc(first)} — ${dStart === 0 ? 'today is the day' : 'tomorrow is the day'}. <b>Key handover is on us</b> — included, as always. Bring your ID; we bring the keys, the meter readings and a small welcome. Your advisor will confirm the exact time on WhatsApp.`)
        + btn(waMsg(`Ciao! Confermiamo l'orario per la consegna chiavi a ${addr}?`), 'Conferma l’orario su WhatsApp')
        + fine(`Anything last-minute — we're one message away.`, 'text-align:center'),
    },
    {
      key: 'p3',
      due: dStart != null && dStart <= -3 && dStart >= -6,
      subject: `Settling in at ${addrShort}?`,
      html: para(`Ciao ${esc(first)} — ${-dStart} days in. We hope ${esc(addrShort)} already feels like yours. Everything about your home now lives in <b>La tua casa BOOM</b>: payments with automatic receipts, documents, one-tap maintenance.`)
        + casaBtns
        + para(`One small favour: if the journey so far deserved it, <b>a review means the world</b> to a small team like ours — it's how the next tenant finds us. Two minutes, honestly appreciated:`, 'margin-top:24px')
        + btn2(REVIEW_URL, '★ Leave a review')
        + fine(`Something not perfect? Tell US first — <a href="${WA}" style="color:#141414">WhatsApp</a> — and we fix it fast.`, 'text-align:center'),
    },
    {
      key: 'r90',
      // Only once the tenancy has STARTED (short leases would otherwise get
      // the renewal ask before move-in). Second window catches leases
      // shorter than ~3 months, whose end is already <84 days at move-in.
      due: dStart != null && dStart < 0 && dEnd != null
        && ((dEnd <= 90 && dEnd >= 84) || (dEnd <= 28 && dEnd >= 22)),
      subject: `${addrShort} — your lease ends ${fmtD(end)}. Stay on?`,
      html: para(`Ciao ${esc(first)} — a simple question, well in advance: your lease at <b>${esc(addr)}</b> ends on <b>${fmtD(end)}</b>. Would you like to stay on?`)
        + para(`One tap either way — no forms, no pressure:`)
        + btn(waMsg(`Ciao BOOM! Sì — vorrei rinnovare il contratto di ${addr}.`), '✓ Yes, I’d like to renew')
        + btn2(waMsg(`Ciao BOOM! Il ${fmtD(end)} lascerò ${addr} — organizziamo l'uscita.`), 'I’ll be moving out')
        + fine(`Whatever you choose, we make it smooth.`, 'text-align:center'),
    },
    {
      key: 'exit',
      due: dEnd != null && dEnd <= -3 && dEnd >= -8,
      subject: `Thank you for calling ${addrShort} home 🤍`,
      html: para(`Ciao ${esc(first)} — your lease at <b>${esc(addr)}</b> reached its end date on ${fmtD(end)}. If the keys are back with us: thank you, sincerely, for being a BOOM tenant — deposit return follows the timeline in your agreement. If plans changed and you're staying on, ignore this note and <a href="${WA}" style="color:#141414">ping us on WhatsApp</a> — we'll sort the renewal.`)
        + para(`Two small things before we part:`)
        + btn(REVIEW_URL, '★ Leave a review — 2 minutes')
        + para(`And if someone you know is looking for a home in Rome, introduce us — our referral thank-you is real.`, 'margin-top:20px')
        + btn2('https://www.boomrome.com/refer', 'Refer a friend')
        + fine(`Wherever you land next — welcome back anytime.`, 'text-align:center'),
    },
  ];
}

export async function runJourney() {
  const out = { checked: 0, sent: [], errors: 0 };
  // Already-bought products are never pitched again: one query per run,
  // keyed email|kind. (The webhook writes a paid `leads` doc per purchase.)
  const owned = new Set();
  try {
    const svc = await fsList('leads', { filter: { field: 'type', op: 'EQUAL', value: 'service' }, limit: 300 });
    (svc || []).forEach(l => { if (l && l.paid && l.email && l.kind) owned.add(String(l.email).toLowerCase() + '|' + l.kind); });
  } catch (e) { console.warn('[journey] owned lookup:', e.message); }
  let contracts = [];
  try {
    contracts = await fsList('contracts', { filter: { field: 'status', op: 'EQUAL', value: 'active' }, limit: 300 });
  } catch (e) { console.error('[journey] contracts list:', e.message); return out; }

  for (const row of contracts || []) {
    const { id, ...c } = row;
    if (!c.startDate) continue;
    out.checked++;
    const j = c.journey || {};

    // tenant email: users doc (bootstrap'd at convert) — skip silently if none
    let tenant = null;
    try { if (c.tenantId) tenant = await fsGet('users/' + c.tenantId); } catch (_) {}
    const email = tenant && tenant.email;
    if (!email) continue;
    const first = String((tenant && tenant.name) || '').split(' ')[0] || 'there';

    let addr = '';
    try { const p = c.propertyId ? await fsGet('properties/' + c.propertyId) : null; addr = (p && (p.address || p.name)) || ''; } catch (_) {}
    if (!addr) addr = 'your home in Rome';
    const addrShort = addr.split(',')[0];

    const has = kind => owned.has(String(email).toLowerCase() + '|' + kind);
    for (const st of steps({ c, tenant, addr, addrShort, first, has })) {
      if (!st.due || j[st.key]) continue;
      try {
        await sendEmail({ to: email, subject: st.subject, html: shell(st.html, st.subject) });
        j[st.key] = new Date().toISOString();
        await fsPatch('contracts/' + id, { journey: j });
        out.sent.push(id + ':' + st.key);
        // the renewal-confirmation moment also warns the operator (decision time)
        if (st.key === 'r90' || st.key === 'exit') {
          sendEmail({
            to: ADMIN_EMAIL,
            subject: (st.key === 'r90' ? '⏳ T-90 rinnovo chiesto — ' : '👋 Uscita completata — ') + (tenant.name || '') + ' · ' + addrShort,
            html: shell(para(st.key === 'r90'
              ? `Ho chiesto a <b>${esc(tenant.name || email)}</b> se rinnova <b>${esc(addr)}</b> (fine: ${fmtD(c.endDate)}). La risposta ti arriva su WhatsApp — segna l'esito sul contratto.`
              : `Contratto oltre la endDate per <b>${esc(tenant.name || email)}</b> · ${esc(addr)}. Inviati ringraziamento, richiesta recensione e invito referral. <b>Verifica</b>: uscita reale (→ restituzione deposito nei termini) o rinnovo (→ aggiorna endDate/nuovo contratto così il journey riparte pulito).`)
              + btn2('https://www.boomrome.com/portal', 'Apri il portale')),
          }).catch(() => {});
        }
      } catch (e) {
        out.errors++;
        console.error('[journey]', id, st.key, e.message);
      }
    }
  }
  return out;
}
