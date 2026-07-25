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
// linked to /casa and WhatsApp. Upsells are WhatsApp-first (one tap opens
// the chat with the request pre-written) — selling stays human.
//
// NOTE: static imports only (Vercel NFT does not trace lazy import of npm
// packages — this file is itself lazy-imported, which is fine: it's local).

import { fsList, fsGet, fsPatch } from '../homie/_lib.js';
import { sendEmail } from '../agent/_lib.js';
import { shell, btn, btn2, para, fine } from '../preagreement/_notify.js';

const ADMIN_EMAIL = 'valentino@boom-rome.com';
const WA = 'https://wa.me/393313251961';
const CASA = 'https://www.boomrome.com/casa';
const waMsg = t => WA + '?text=' + encodeURIComponent(t);
const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const eur = n => '€' + Number(n || 0).toLocaleString('en-US');
const fmtD = s => { try { return new Date(String(s).slice(0, 10) + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return s; } };

// The review link: set REVIEW_URL in Vercel to the real Google review URL
// (g.page/r/…) — falls back to a search that lands on the profile.
const REVIEW_URL = process.env.REVIEW_URL
  || 'https://www.google.com/search?q=BOOM+Rome+boomrome.com+reviews';

const dayDiff = (iso) => {
  // whole days from today (UTC date math on YYYY-MM-DD) to iso; negative = past
  const today = new Date().toISOString().slice(0, 10);
  return Math.round((new Date(iso + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
};

// step key → { when(c) -> true if inside the window, subject, html }
function steps({ c, tenant, addrShort, addr, first }) {
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
        + para(`One thing worth handling early: <b>utilities</b>. Our Move-in Pack takes care of electricity &amp; gas transfers, internet activation and the residency guide — you arrive, everything works.`, 'margin-top:24px')
        + btn2(waMsg(`Ciao BOOM! Vorrei il Move-in Pack per ${addr} (volture luce/gas, internet, guida residenza).`), '🔌 Move-in Pack €149 — su WhatsApp')
        + fine(`Questions anytime — just reply or <a href="${WA}" style="color:#141414">WhatsApp us</a>.`, 'text-align:center'),
    },
    {
      key: 't14',
      due: dStart != null && dStart <= 14 && dStart >= 10,
      subject: `Two weeks to ${addrShort} — a quick check`,
      html: para(`Ciao ${esc(first)} — two weeks out, quick check-in. If any document is still missing on your side (ID, proof for the transitional lease), you can upload it in one tap from your pre-agreement link or send it on WhatsApp — takes a minute now, saves days at registration.`)
        + casaBtns
        + para(`And if you'd rather not think about utilities at all, the <b>Move-in Pack</b> is still the shortcut.`, 'margin-top:22px')
        + btn2(waMsg(`Ciao BOOM! Info sul Move-in Pack per ${addr}.`), 'Chiedi su WhatsApp')
        ,
    },
    {
      key: 't7',
      due: dStart != null && dStart <= 7 && dStart >= 4,
      subject: `One week to ${addrShort} ✨`,
      html: para(`Ciao ${esc(first)} — one week! Two things make move-in day perfect:`)
        + para(`<b>1 · A spotless home.</b> Our <b>Cleaning Premium</b> is a professional deep clean the day before you arrive — beds, kitchen, bathrooms, windows. You open the door to a hotel-fresh apartment.`, 'margin-bottom:8px')
        + btn2(waMsg(`Ciao BOOM! Vorrei il Cleaning Premium prima del mio arrivo a ${addr}.`), '✨ Cleaning Premium €119 — prenota')
        + para(`<b>2 · The numbers, settled.</b> Any remaining balance (deposit or first payment) is one tap in your portal — card or transfer, receipt automatic.`, 'margin-top:22px')
        + casaBtns,
    },
    {
      key: 't1',
      due: dStart != null && dStart <= 1 && dStart >= 0,
      subject: `Tomorrow: keys to ${addrShort} 🔑`,
      html: para(`Ciao ${esc(first)} — tomorrow is the day. <b>Key handover is on us</b> — included, as always. Bring your ID; we bring the keys, the meter readings and a small welcome. Your advisor will confirm the exact time on WhatsApp.`)
        + btn(waMsg(`Ciao! Confermiamo l'orario per la consegna chiavi di domani a ${addr}?`), 'Conferma l’orario su WhatsApp')
        + fine(`Anything last-minute — we're one message away.`, 'text-align:center'),
    },
    {
      key: 'p3',
      due: dStart != null && dStart <= -3 && dStart >= -6,
      subject: `Settling in at ${addrShort}?`,
      html: para(`Ciao ${esc(first)} — three days in. We hope ${esc(addrShort)} already feels like yours. Everything about your home now lives in <b>La tua casa BOOM</b>: payments with automatic receipts, documents, one-tap maintenance.`)
        + casaBtns
        + para(`One small favour: if the journey so far deserved it, <b>a review means the world</b> to a small team like ours — it's how the next tenant finds us. Two minutes, honestly appreciated:`, 'margin-top:24px')
        + btn2(REVIEW_URL, '★ Leave a review')
        + fine(`Something not perfect? Tell US first — <a href="${WA}" style="color:#141414">WhatsApp</a> — and we fix it fast.`, 'text-align:center'),
    },
    {
      key: 'r90',
      due: dEnd != null && dEnd <= 90 && dEnd >= 84,
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
      html: para(`Ciao ${esc(first)} — the keys are back and your time at <b>${esc(addr)}</b> is complete. Thank you, sincerely, for being a BOOM tenant. Deposit return follows the timeline in your agreement — track it from your portal.`)
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

    for (const st of steps({ c, tenant, addr, addrShort, first })) {
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
              : `Percorso chiuso per <b>${esc(tenant.name || email)}</b> · ${esc(addr)}. Inviati ringraziamento, richiesta recensione e invito referral. Prossimo: restituzione deposito nei termini.`)
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
