// api/invoices/link.js
// Il token di pagamento è DERIVATO da HOMIE_SECRET: il browser non può
// calcolarlo. Il portale chiede qui il link della fattura — stesso ruolo che
// api/profile/link.js ha per /scheda.
//
// Method:   POST   Headers: Authorization: Bearer <firebase-id-token>
// Body:     { invoiceId }
// Response: { ok, url, payable, whatsapp }

import { fsGet, fsPatch, readJson } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { payUrl, isPayable } from './_link.js';

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
  catch (e) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  if (!inv) return res.status(404).json({ ok: false, error: 'not_found' });
  if (inv.kind === 'receipt') return res.status(400).json({ ok: false, error: 'not_an_invoice' });

  const url = payUrl(invoiceId);

  // Persistito così il PDF e la riga in elenco lo hanno senza richiederlo
  // ogni volta. Resta comunque derivato: se HOMIE_SECRET ruota, questo campo
  // è solo una copia stantia e il link smette di funzionare — che è
  // esattamente il comportamento voluto.
  if (inv.payLink !== url) {
    try { await fsPatch('invoices/' + invoiceId, { payLink: url }); } catch (_) {}
  }

  const bu = inv.buyer || {};
  const name = (bu.name || [bu.firstName, bu.lastName].filter(Boolean).join(' ') || '').trim();
  const amount = Number((inv.totals || {}).netToPay) || Number(inv.amount) || 0;
  const msg = `Ciao${name ? ' ' + name.split(' ')[0] : ''}, ecco la fattura n. ${inv.number || ''} `
    + `di € ${amount.toLocaleString('it-IT', { minimumFractionDigits: 2 })}. `
    + `Puoi vederla e pagarla con carta qui: ${url}`;

  return res.status(200).json({
    ok: true,
    url,
    payable: isPayable(inv),
    whatsapp: (bu.phone ? 'https://wa.me/' + String(bu.phone).replace(/[^0-9]/g, '') + '?text=' : 'https://wa.me/?text=')
      + encodeURIComponent(msg),
    message: msg,
  });
}
