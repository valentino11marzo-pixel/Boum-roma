// api/fiscal/registra.js — la porta HTTP dell'iter ASPI (motore: _aspi.js).
//
// POST · Authorization: Bearer <firebase-id-token> (admin)
//   { op:'status', contractId }
//     → { ok, settings, kind, kinds:{registrazione[],completo[]}, state }
//     + bank: conto addebito RLI dichiarato dall'operatore, pronto o incompleto.
//       La checklist per ENTRAMBE le varianti + le manopole in vigore: il
//       pannello del portal disegna DA QUI, mai da una copia locale (la
//       console non può mostrare una regola diversa da quella applicata).
//     + billing: { relet, reletBy, previousId, invoices[] } — il riaffitto
//       dedotto dai fatti (reletOf) e le fatture ASPI già emesse: il pannello
//       preseleziona cosa fatturare e mostra cosa esiste già.
//   { op:'save-bank', contractId, rliDebitIban, rliDebitHolder }
//     → { ok, bank }; salva SOLO questi due campi, anche vuoti espliciti.
//       Non rigenera il contratto, non invia email, non cambia l'IBAN canone.
//   { op:'send', contractId, kind?, billKind?, note?, bill? }
//   { op:'bill', contractId, kind?, billKind? }
//     → SOLO la fattura (billAspi), senza rimandare l'email ad ASPI: il
//       recupero quando all'invio le fatture esistenti non si leggevano.
//     → sendAspiRequest: email strutturata al referente ASPI con gli
//       allegati, stato stampato sul contratto, fattura col markup.
//   { op:'registered', contractId, date, code?, base64?, contentType?, name?, notify?, resend? }
//     → recordRegistration (_ricevuta.js): contratto registrato in UN passo,
//       scadenze chiuse, ricevuta archiviata e mandata alle parti.
//
// maxDuration 60 in vercel.json: gli allegati si scaricano da Storage.

import { readJson, fsGet, fsPatch } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import ContractFields from '../../js/contract-fields.js';
import { withProfileDocs } from '../sign/_iddocs.js';
import {
  loadAspiSettings, aspiChecklist, sendAspiRequest, defaultKind, kindPrice, kindCost,
  reletOf, aspiInvoicesOf, billAspi, billPlansFor, billKindFor, ASPI_KINDS,
} from './_aspi.js';
import { parseReceiptInput, recordRegistration } from './_ricevuta.js';

const clip = (v, n = 120) => String(v == null ? '' : v).trim().slice(0, n);
const BANK_FIELDS = ['rliDebitIban', 'rliDebitHolder'];
const ibanValid = (iban) => /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban) && ContractFields.ibanOk(iban);
const ibanNorm = (value) => typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : '';
const holderNorm = (value) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

function bankStatus(contract) {
  const rliDebitIban = ibanNorm(contract.rliDebitIban);
  const rliDebitHolder = holderNorm(contract.rliDebitHolder);
  const missing = BANK_FIELDS.filter(key => !(key === 'rliDebitIban' ? rliDebitIban : rliDebitHolder));
  const invalid = rliDebitIban && !ibanValid(rliDebitIban) ? ['rliDebitIban'] : [];
  const ready = !missing.length && !invalid.length;
  return {
    rliDebitIban, rliDebitHolder, ready, missing, invalid,
    warning: ready ? null : invalid.length ? 'IBAN addebito tributi RLI da verificare.'
      : 'Conto addebito tributi RLI incompleto: ' + missing.map(key => key === 'rliDebitIban' ? 'IBAN non dichiarato' : 'intestatario non dichiarato').join('; ') + '.',
  };
}

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

  if (op === 'save-bank') {
    // Nessun campo estraneo entra nella patch, neppure se valido altrove.
    if (Object.keys(b).some(key => !['op', 'contractId', ...BANK_FIELDS].includes(key))) {
      return res.status(400).json({ ok: false, error: 'unexpected_fields' });
    }
    if (BANK_FIELDS.some(key => !Object.prototype.hasOwnProperty.call(b, key))) {
      return res.status(400).json({ ok: false, error: 'bank_fields_required' });
    }
    if (BANK_FIELDS.some(key => typeof b[key] !== 'string') || holderNorm(b.rliDebitHolder).length > 200) {
      return res.status(400).json({ ok: false, error: 'invalid_bank_fields' });
    }
    const patch = { rliDebitIban: ibanNorm(b.rliDebitIban), rliDebitHolder: holderNorm(b.rliDebitHolder) };
    if (patch.rliDebitIban && !ibanValid(patch.rliDebitIban)) {
      return res.status(400).json({ ok: false, error: 'iban_invalid' });
    }
    try {
      const contract = await fsGet('contracts/' + contractId);
      if (!contract) return res.status(404).json({ ok: false, error: 'contract_not_found' });
      await fsPatch('contracts/' + contractId, patch);
      return res.status(200).json({ ok: true, bank: bankStatus(patch) });
    } catch {
      // Firestore può includere i dati nella risposta d'errore: mai nei log.
      console.error('[fiscal/registra] bank_save_failed');
      return res.status(500).json({ ok: false, error: 'bank_save_failed' });
    }
  }

  try {
    if (op === 'send') {
      const out = await sendAspiRequest(contractId, {
        kind: clip(b.kind, 20),
        // cosa si fattura: sul riaffitto solo l'attestazione (vedi billKindFor)
        billKind: clip(b.billKind, 20),
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

    if (op === 'bill') {
      const contract = await fsGet('contracts/' + contractId);
      if (!contract) return res.status(404).json({ ok: false, error: 'contract_not_found' });
      contract.id = contractId;
      const property = (contract.propertyId ? await fsGet('properties/' + contract.propertyId).catch(() => null) : null) || {};
      if (!contract.tenantName && contract.tenantId) {
        const t = await fsGet('users/' + contract.tenantId).catch(() => null); if (t && t.name) contract.tenantName = t.name;
      }
      if (!contract.landlordName && property.ownerId) {
        const l = await fsGet('users/' + property.ownerId).catch(() => null); if (l && l.name) contract.landlordName = l.name;
      }
      const k = clip(b.kind, 20);
      const kind = ASPI_KINDS.includes(k) ? k : (ASPI_KINDS.includes(contract.aspiRequestKind) ? contract.aspiRequestKind : defaultKind(contract));
      const billKind = billKindFor(kind, clip(b.billKind, 20));
      const settings = await loadAspiSettings();
      const invoice = await billAspi({ contractId, contract, property, settings, billKind });
      return res.status(200).json({ ok: true, kind, billKind, invoice });
    }

    // op:'status' — la fotografia per il pannello.
    const contract = await fsGet('contracts/' + contractId);
    if (!contract) return res.status(404).json({ ok: false, error: 'contract_not_found' });
    contract.id = contractId;
    const property = contract.propertyId
      ? await fsGet('properties/' + contract.propertyId).catch(() => null) : null;

    contract.identityDocs = (await withProfileDocs(contract, property)).identityDocs || contract.identityDocs;
    const settings = await loadAspiSettings();
    const [relet, invoices] = await Promise.all([
      reletOf(contract),
      aspiInvoicesOf(contractId).catch(() => null),   // null = non lo so (lo dice il pannello)
    ]);
    return res.status(200).json({
      ok: true,
      bank: bankStatus(contract),
      settings: {
        email: settings.email, referente: settings.referente, organizzazione: settings.organizzazione,
        billTo: settings.billTo, autoInvoice: settings.autoInvoice, auto: settings.auto,
        prezzi: { registrazione: kindPrice('registrazione', settings), completo: kindPrice('completo', settings), asseverazione: kindPrice('asseverazione', settings) },
        costi: { registrazione: kindCost('registrazione', settings), completo: kindCost('completo', settings), asseverazione: kindCost('asseverazione', settings) },
      },
      kind: defaultKind(contract),
      billing: {
        relet: relet ? relet.relet : null,
        reletBy: relet ? relet.by : null,
        previousId: relet && relet.previousId ? relet.previousId : null,
        invoices,
        plans: billPlansFor(invoices),   // cosa fatturerebbe ogni variante, adesso
      },
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
          .filter(d => d && (contract.registrationReceiptHash
            ? d.fileKey === 'sha256:' + contract.registrationReceiptHash
            : d.url === contract.registrationReceiptUrl))
          .map(d => ({ who: d.who, status: d.status, at: d.at || null })),
      },
    });
  } catch (e) {
    console.error('[fiscal/registra]', e.message);
    return res.status(500).json({ ok: false, error: 'registra_failed' });
  }
}
