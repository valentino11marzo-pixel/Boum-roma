// api/fiscal/allega.js — IL DOCUMENTO SI ATTACCA DOVE MANCA.
//
// Il pannello 🏛 ASPI dice, voce per voce, cosa manca al fascicolo e DOVE si
// carica: "console pre-agreement → Fascicolo ARPE", "manda al conduttore il
// suo link /scheda". È onesto, ma è un rimando: per completare un fascicolo
// l'operatore doveva uscire dal pannello, aprire un'altra console, tornare
// indietro e ricontrollare. Con dieci fascicoli al mese quel rimbalzo È il
// lavoro.
//
// Qui la voce della checklist diventa una PORTA: si sceglie il file dalla
// riga che lo reclama e il documento va esattamente dove serve, con la
// stessa disciplina di chi lo caricava prima —
//   · ape · planimetria · visura · delega  -> Storage property-docs/<propId>/
//     + properties.dossier.<slot>  (identico a api/properties/dossier.js:
//     si carica UNA volta per immobile e lo ereditano tutti i suoi contratti)
//   · id_conduttore · id_locatore · esigenza -> Storage contracts/<id>/identity/
//     + contract.identityDocs[]   (la stessa lista che riempiono /scheda,
//     il pre-agreement e /sign — kind 'extra' per l'attestazione)
// e la risposta riporta la CHECKLIST FRESCA, così il pannello si ridisegna
// da solo: la voce passa da ✗ a ✓ senza cambiare pagina e senza ricaricare.
//
// La chiave È quella della checklist (aspiChecklist): una sola parola, la
// stessa che l'operatore vede scritta nella riga — se un domani la checklist
// cambia una voce, il test se ne accorge (le chiavi sono pinnate).
//
// Method:   POST · Authorization: Bearer <firebase-id-token> (admin)
// Body:     { contractId, key, base64, name?, contentType? }
// Response: { ok, key, url, kinds:{registrazione[],completo[]} } | { ok:false, error }

import { getAdminToken, fsGet, fsPatch, readJson, logActivity } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { aspiChecklist } from './_aspi.js';

const BUCKET = process.env.FIREBASE_BUCKET || 'boom-property-dashboards.firebasestorage.app';
const MAX_BYTES = 15 * 1024 * 1024;

// Dove va ogni voce della checklist. Le chiavi NON uploadabili (il contratto
// si genera, la scheda canone si calcola, i codici fiscali sono dati) non
// sono qui: la porta rifiuta invece di inventarsi una destinazione.
const DEST = {
  ape:           { where: 'property', slot: 'ape' },
  planimetria:   { where: 'property', slot: 'planimetria' },
  visura:        { where: 'property', slot: 'visura' },
  delega:        { where: 'property', slot: 'delega' },
  id_conduttore: { where: 'contract', role: 'tenant' },
  id_locatore:   { where: 'contract', role: 'landlord' },
  esigenza:      { where: 'contract', role: 'tenant', kind: 'extra' },
};

const safeName = (s, fb) => String(s || fb).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);

async function storagePut(path, buf, contentType) {
  const admin = await getAdminToken();
  const up = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?name=${encodeURIComponent(path)}`,
    { method: 'POST', headers: { Authorization: `Bearer ${admin}`, 'Content-Type': contentType }, body: buf }
  );
  if (!up.ok) throw new Error('storage_' + up.status + ': ' + (await up.text()).slice(0, 160));
  const meta = await up.json().catch(() => ({}));
  const tok = String(meta.downloadTokens || '').split(',')[0];
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media${tok ? '&token=' + tok : ''}`;
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;

  let body;
  try { body = await readJson(req); } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const contractId = String((body || {}).contractId || '').trim().slice(0, 80);
  const key = String((body || {}).key || '').trim();
  if (!contractId) return res.status(400).json({ ok: false, error: 'contractId_required' });
  const dest = DEST[key];
  if (!dest) return res.status(400).json({ ok: false, error: 'key_non_allegabile' });

  let buf;
  try { buf = Buffer.from(String(body.base64 || '').replace(/^data:[^;]+;base64,/, ''), 'base64'); }
  catch { return res.status(400).json({ ok: false, error: 'bad_base64' }); }
  if (!buf.length) return res.status(400).json({ ok: false, error: 'empty' });
  if (buf.length > MAX_BYTES) return res.status(413).json({ ok: false, error: 'too_large' });
  const contentType = /^(image\/(jpeg|png|webp|heic)|application\/pdf)$/.test(String(body.contentType || ''))
    ? body.contentType : 'application/pdf';

  try {
    const contract = await fsGet('contracts/' + contractId);
    if (!contract) return res.status(404).json({ ok: false, error: 'contract_not_found' });
    contract.id = contractId;
    let property = contract.propertyId ? await fsGet('properties/' + contract.propertyId).catch(() => null) : null;

    const name = safeName(body.name, key);
    let url;

    if (dest.where === 'property') {
      if (!property) return res.status(409).json({ ok: false, error: 'contratto_senza_immobile' });
      url = await storagePut(`property-docs/${contract.propertyId}/${dest.slot}_${Date.now()}_${name}`, buf, contentType);
      const dossier = { ...(property.dossier || {}) };
      dossier[dest.slot] = { url, name, contentType, bytes: buf.length, at: new Date().toISOString(), by: auth.email || auth.uid };
      await fsPatch('properties/' + contract.propertyId, { dossier });
      property = { ...property, dossier };   // la checklist di ritorno vede già il file
    } else {
      url = await storagePut(`contracts/${contractId}/identity/${Date.now()}_${name}`, buf, contentType);
      const docs = Array.isArray(contract.identityDocs) ? contract.identityDocs.slice() : [];
      docs.push({
        url, name, contentType, role: dest.role,
        ...(dest.kind ? { kind: dest.kind } : {}),
        at: new Date().toISOString(), by: auth.email || auth.uid, source: 'aspi-panel',
      });
      await fsPatch('contracts/' + contractId, { identityDocs: docs });
      contract.identityDocs = docs;
    }

    logActivity('aspi_doc_uploaded', 'contract', { contractId, key, name }, auth.email || 'admin').catch(() => {});

    // La checklist FRESCA, calcolata sui dati appena scritti: il pannello si
    // ridisegna con la voce già spuntata, senza una seconda lettura.
    // Entrambe le varianti: l'operatore puo' cambiare radio subito dopo
    // aver caricato, e una checklist stantia gli farebbe ricaricare un file
    // che c'e' gia'.
    return res.status(200).json({
      ok: true, key, url,
      kinds: {
        registrazione: aspiChecklist(contract, property, 'registrazione'),
        completo: aspiChecklist(contract, property, 'completo'),
      },
    });
  } catch (e) {
    console.error('[fiscal/allega]', e.message);
    return res.status(500).json({ ok: false, error: 'upload_failed' });
  }
}
