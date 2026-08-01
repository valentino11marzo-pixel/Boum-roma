// api/invoices/notify.js
// Manda al cliente la fattura con il pulsante di pagamento, nel design system
// delle email BOOM (masthead nero, marchio oro, una sola azione primaria —
// api/preagreement/_notify.js). Admin-only: l'invio al cliente resta una
// decisione umana, mai automatica.
//
// Method: POST   Headers: Authorization: Bearer <firebase-id-token>
// Body:   { invoiceId, to? }

import { fsGet, fsPatch, readJson } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { sendEmail } from '../agent/_lib.js';
import { shell, para, btn, btn2, fine } from '../preagreement/_notify.js';
import { payUrl, isPayable } from './_link.js';

const eur = (n) => '€ ' + Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (iso) => {
  const p = String(iso || '').slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '';
};

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  const b = await readJson(req).catch(() => ({}));
  const invoiceId = String((b && b.invoiceId) || '').trim().slice(0, 80);
  if (!invoiceId) return res.status(400).json({ ok: false, error: 'invoiceId_required' });

  let inv;
  try { inv = await fsGet('invoices/' + invoiceId); }
  catch (_) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  if (!inv) return res.status(404).json({ ok: false, error: 'not_found' });
  if (inv.kind === 'receipt') return res.status(400).json({ ok: false, error: 'not_an_invoice' });
  if (!inv.number || inv.status === 'draft') return res.status(409).json({ ok: false, error: 'not_issued' });

  const bu = inv.buyer || {};
  const to = String((b && b.to) || bu.email || inv.recipientEmail || '').trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ ok: false, error: 'no_recipient_email' });
  }

  const isCredit = inv.docType === 'TD04';
  const label = `${isCredit ? 'Nota di credito' : 'Fattura'} n. ${inv.number}`;
  const t = inv.totals || {};
  const due = Number(t.netToPay) || Number(inv.amount) || 0;
  const name = (bu.name || [bu.firstName, bu.lastName].filter(Boolean).join(' ') || '').split(' ')[0];
  const url = payUrl(invoiceId);
  const payable = isPayable(inv);

  const rows = (inv.lines || []).slice(0, 8).map((l) =>
    `<tr><td style="padding:7px 0;border-bottom:1px solid #EEE;font-size:14px;color:#111">${escape_(l.description)}</td>`
    + `<td style="padding:7px 0;border-bottom:1px solid #EEE;font-size:14px;color:#111;text-align:right;white-space:nowrap">`
    + `${eur(Math.round((Number(l.unitPrice) || 0) * (Number(l.qty) || 1) * 100) / 100)}</td></tr>`
  ).join('');

  const html = shell(
    para(`${name ? 'Ciao ' + escape_(name) + ',' : 'Buongiorno,'} in allegato al link qui sotto trovi la <b>${label}</b>.`)
    + `<table style="width:100%;border-collapse:collapse;margin:18px 0">${rows}`
    + `<tr><td style="padding:12px 0 0;font-size:15px;color:#111"><b>${payable ? 'Da pagare' : 'Totale'}</b></td>`
    + `<td style="padding:12px 0 0;font-size:19px;color:#B8960C;text-align:right;white-space:nowrap"><b>${eur(due)}</b></td></tr></table>`
    + (payable && inv.dueDate ? para(`Scadenza: <b>${dmy(inv.dueDate)}</b>.`) : '')
    + (payable
        ? btn(url, 'Vedi e paga con carta') + para('Pagamento sicuro su Stripe. In alternativa trovi l\'IBAN per il bonifico nella stessa pagina.')
        : btn2(url, 'Vedi il documento'))
    + fine('Egidi Immobiliare S.r.l. · P.IVA 17322991005')
  );

  try {
    await sendEmail({ to, subject: `${label} — BOOM Rome`, html });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'send_failed', detail: e.message });
  }

  try {
    await fsPatch('invoices/' + invoiceId, {
      sentAt: new Date().toISOString(),
      sentTo: to,
      sentCount: (Number(inv.sentCount) || 0) + 1,
      payLink: url,
    });
  } catch (_) {}

  return res.status(200).json({ ok: true, to, url });
}

function escape_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
