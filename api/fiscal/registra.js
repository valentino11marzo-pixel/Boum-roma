// api/fiscal/registra.js — la porta HTTP dell'iter ASPI (motore: _aspi.js).
//
// POST · Authorization: Bearer <firebase-id-token> (admin)
//   { op:'status', contractId }
//     → { ok, settings, kind, kinds:{registrazione[],completo[]}, state }
//       La checklist per ENTRAMBE le varianti + le manopole in vigore: il
//       pannello del portal disegna DA QUI, mai da una copia locale (la
//       console non può mostrare una regola diversa da quella applicata).
//   { op:'send', contractId, kind?, note?, bill? }
//     → sendAspiRequest: email strutturata al referente ASPI con gli
//       allegati, stato stampato sul contratto, fattura col markup.
//   { op:'registered', contractId, date, code?, base64?, contentType?, name?, notify?, resend? }
//     → recordRegistration (_ricevuta.js): contratto registrato in UN passo,
//       scadenze chiuse, ricevuta archiviata e mandata alle parti.
//
// maxDuration 60 in vercel.json: gli allegati si scaricano da Storage.

import { readJson, fsGet } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { withProfileDocs } from '../sign/_iddocs.js';
import {
  loadAspiSettings, aspiChecklist, sendAspiRequest, defaultKind, kindPrice, kindCost,
} from './_aspi.js';
import { parseReceiptInput, recordRegistration } from './_ricevuta.js';

const clip = (v, n = 120) => String(v == null ? '' : v).trim().slice(0, n);

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  const b = await readJson(req).catch(() => ({}));
  const op = clip(b && b.op, 20) || 'status';
  const contractId = clip(b && b.contractId, 80);
  if (!contractId) return res.status(400).json({ ok: false, error: 'contractId_required' });

  try {
    if (op === 'send') {
      const out = await sendAspiRequest(contractId, {
        kind: clip(b.kind, 20),
        note: b.note,
        bill: b.bill,
      });
      return res.status(out.ok ? 200 : (out.error === 'contract_not_found' ? 404 : 422)).json(out);
    }

    if (op === 'registered') {
      const input = parseReceiptInput(b, { today: new Date().toISOString().slice(0, 10) });
      if (input.error) return res.status(400).json({ ok: false, error: input.error });
      const out = await recordRegistration(contractId, input, { force: b.resend === true });
      return res.status(out.ok ? 200 : (out.error === 'contract_not_found' ? 404 : 502)).json(out);
    }

    // op:'status' — la fotografia per il pannello.
    const contract = await fsGet('contracts/' + contractId);
    if (!contract) return res.status(404).json({ ok: false, error: 'contract_not_found' });
    contract.id = contractId;
    const property = contract.propertyId
      ? await fsGet('properties/' + contract.propertyId).catch(() => null) : null;

    contract.identityDocs = (await withProfileDocs(contract, property)).identityDocs || contract.identityDocs;
    const settings = await loadAspiSettings();
    return res.status(200).json({
      ok: true,
      settings: {
        email: settings.email, referente: settings.referente, organizzazione: settings.organizzazione,
        billTo: settings.billTo, autoInvoice: settings.autoInvoice, auto: settings.auto,
        prezzi: { registrazione: kindPrice('registrazione', settings), completo: kindPrice('completo', settings), asseverazione: kindPrice('asseverazione', settings) },
        costi: { registrazione: kindCost('registrazione', settings), completo: kindCost('completo', settings), asseverazione: kindCost('asseverazione', settings) },
      },
      kind: defaultKind(contract),
      kinds: {
        registrazione: aspiChecklist(contract, property, 'registrazione'),
        completo: aspiChecklist(contract, property, 'completo'),
      },
      state: {
        aspiRequestedAt: contract.aspiRequestedAt || null,
        aspiRequestKind: contract.aspiRequestKind || null,
        aspiRequestTo: contract.aspiRequestTo || null,
        aspiRequestCount: contract.aspiRequestCount || 0,
        registrationStatus: contract.registrationStatus || 'pending',
        rliRegisteredAt: contract.rliRegisteredAt || null,
        registrationCode: contract.registrationCode || null,
        registrationReceiptUrl: contract.registrationReceiptUrl || null,
        registrationReceiptSentAt: contract.registrationReceiptSentAt || null,
        // Gli esiti DUREVOLI: il pacchetto all'operatore e la ricevuta per
        // destinatario. 'uncertain'/'sending' si mostrano, non si rimandano da soli.
        packEmail: contract.registrationPackEmail || null,
        receiptDelivery: Object.values(contract.registrationReceiptDelivery || {})
          .filter(d => d && d.url === contract.registrationReceiptUrl)
          .map(d => ({ who: d.who, status: d.status, at: d.at || null })),
      },
    });
  } catch (e) {
    console.error('[fiscal/registra]', e.message);
    return res.status(500).json({ ok: false, error: 'registra_failed' });
  }
}
