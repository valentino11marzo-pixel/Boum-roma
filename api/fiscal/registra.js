// api/fiscal/registra.js — la porta HTTP dell'iter ASPI (motore: _aspi.js).
//
// POST · Authorization: Bearer <firebase-id-token> (admin)
//   { op:'status', contractId }
//     → { ok, settings, kind, kinds:{registrazione[],completo[],asseverazione[]}, registered, state }
//       Su un contratto GIÀ registrato (rliRegisteredAt / 'registered'):
//       kinds:{asseverazione[]} soltanto, kind 'asseverazione', registered:{at}.
//       La checklist per ENTRAMBE le varianti + le manopole in vigore: il
//       pannello del portal disegna DA QUI, mai da una copia locale (la
//       console non può mostrare una regola diversa da quella applicata).
//   { op:'send', contractId, kind?, note?, bill? }
//     → sendAspiRequest: email strutturata al referente ASPI con gli
//       allegati, stato stampato sul contratto, fattura col markup.
//       409 already_registered se si chiede la registrazione (o il
//       completo) su un contratto già registrato: nessuna email, nessuna fattura.
//
// maxDuration 60 in vercel.json: gli allegati si scaricano da Storage.

import { readJson, fsGet } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import {
  loadAspiSettings, aspiChecklist, sendAspiRequest, kindFor, registeredAt, kindPrice, kindCost,
} from './_aspi.js';

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
      // already_registered = 409: il contratto è registrato, la richiesta di
      // registrazione non parte (nessuna email, nessuna fattura).
      return res.status(out.ok ? 200 : out.error === 'contract_not_found' ? 404 : out.error === 'already_registered' ? 409 : 422).json(out);
    }

    // op:'status' — la fotografia per il pannello.
    const contract = await fsGet('contracts/' + contractId);
    if (!contract) return res.status(404).json({ ok: false, error: 'contract_not_found' });
    contract.id = contractId;
    const property = contract.propertyId
      ? await fsGet('properties/' + contract.propertyId).catch(() => null) : null;

    const settings = await loadAspiSettings();
    // Su un contratto già registrato si offre SOLO l'attestazione.
    const reg = registeredAt(contract);
    const kinds = reg
      ? { asseverazione: aspiChecklist(contract, property, 'asseverazione') }
      : {
        registrazione: aspiChecklist(contract, property, 'registrazione'),
        completo: aspiChecklist(contract, property, 'completo'),
        asseverazione: aspiChecklist(contract, property, 'asseverazione'),
      };
    return res.status(200).json({
      ok: true,
      settings: {
        email: settings.email, referente: settings.referente, organizzazione: settings.organizzazione,
        billTo: settings.billTo, autoInvoice: settings.autoInvoice, auto: settings.auto,
        prezzi: { registrazione: kindPrice('registrazione', settings), completo: kindPrice('completo', settings), asseverazione: kindPrice('asseverazione', settings) },
        costi: { registrazione: kindCost('registrazione', settings), completo: kindCost('completo', settings), asseverazione: kindCost('asseverazione', settings) },
      },
      kind: kindFor(contract),
      kinds,
      registered: reg ? { at: reg === true ? null : reg } : null,
      state: {
        aspiRequestedAt: contract.aspiRequestedAt || null,
        aspiRequestKind: contract.aspiRequestKind || null,
        aspiRequestTo: contract.aspiRequestTo || null,
        aspiRequestCount: contract.aspiRequestCount || 0,
        registrationStatus: contract.registrationStatus || 'pending',
        rliRegisteredAt: contract.rliRegisteredAt || null,
      },
    });
  } catch (e) {
    console.error('[fiscal/registra]', e.message);
    return res.status(500).json({ ok: false, error: 'registra_failed' });
  }
}
