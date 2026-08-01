// api/invoices/lookup.js
// Pubblico, senza login: il link È la credenziale (token derivato).
// Restituisce solo quello che la pagina deve mostrare — publicView() decide.

import { fsGet } from '../homie/_lib.js';
import { setCors } from '../_auth.js';
import { parsePayRef, publicView, payUrl } from './_link.js';

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const t = (req.body && req.body.t) || (req.query && req.query.t) || '';
  const id = parsePayRef(t);
  // Token invalido e documento inesistente danno la STESSA risposta: un
  // link sbagliato non deve poter dire "questa fattura esiste".
  if (!id) return res.status(404).json({ error: 'not_found' });

  let inv = null;
  try { inv = await fsGet(`invoices/${id}`); } catch (_) {}
  if (!inv) return res.status(404).json({ error: 'not_found' });

  // Le ricevute di canone non sono documenti fiscali e non si pagano da qui.
  if (inv.kind === 'receipt') return res.status(404).json({ error: 'not_found' });

  return res.status(200).json({ ok: true, invoice: publicView(inv, id), url: payUrl(id) });
}
