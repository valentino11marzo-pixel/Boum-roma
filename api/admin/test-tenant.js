// api/admin/test-tenant.js
// L'INQUILINO DI PROVA — per guardare /casa con i propri occhi in dieci
// secondi, invece di aspettare uno screenshot.
//
// Crea un utente Firebase Auth reale con ruolo tenant, un immobile col manuale
// pieno, un contratto e quattro rate (una da pagare, tre pagate), più una
// richiesta di manutenzione aperta — cioè tutto ciò che serve perché ogni
// sezione della pagina abbia qualcosa da mostrare. Restituisce email e
// password UNA VOLTA: la password non viene salvata da nessuna parte.
//
// PERCHÉ NON VA IN CONFLITTO (api/_demo.js):
//   · il contratto ha `status:'demo'`, non 'active' → il journey e ogni query
//     su status=='active' lo saltano da soli, senza ricordarsene;
//   · ogni documento porta `demo:true` → Gestore e Contabile lo filtrano, così
//     non nascono solleciti verso un indirizzo finto né incassi inventati nel
//     fatturato;
//   · /casa lo mostra comunque, perché prende il primo contratto attivo
//     OPPURE il primo della lista.
//
// Method:  POST   crea (o ricrea) l'inquilino di prova
//          DELETE cancella tutto quello che aveva creato
// Headers: Authorization: Bearer <firebase-id-token>   (admin)

import crypto from 'node:crypto';
import { fsCreate, fsGet, fsPatch, fsList, fsDelete, readJson, logActivity } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';

const API_KEY = process.env.FIREBASE_API_KEY;
const iso = (d) => d.toISOString().slice(0, 10);
const shift = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const ym = (n) => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };

// Password robusta e leggibile ad alta voce: la si copia una volta e basta.
function makePassword() {
  const w = ['Cavour', 'Monti', 'Trastevere', 'Pigneto', 'Ostiense', 'Parioli'];
  const word = w[crypto.randomBytes(1)[0] % w.length];
  const n = crypto.randomBytes(2).readUInt16BE(0) % 9000 + 1000;
  return `Boom-${word}-${n}`;
}

async function createAuthUser(email, password) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: false }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.localId) {
    throw new Error('auth signUp: ' + (data.error?.message || r.status));
  }
  return data.localId;
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;
  if (!API_KEY) return res.status(500).json({ ok: false, error: 'firebase_api_key_missing' });

  if (req.method === 'DELETE') return wipe(res, auth);
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const b = (await readJson(req)) || {};
  const rent = Math.max(300, Math.min(9000, Number(b.rent) || 1200));

  // Email unica per ogni prova: Firebase rifiuta un indirizzo già registrato,
  // e volere due inquilini di prova in parallelo è legittimo.
  const tag = crypto.randomBytes(3).toString('hex');
  const email = `demo.tenant.${tag}@boomrome.com`;
  const password = makePassword();

  try {
    const uid = await createAuthUser(email, password);
    const propId = 'demo_prop_' + tag;
    const ctrId = 'demo_ctr_' + tag;

    await fsCreate('users', {
      demo: true,
      name: 'Anna Rossi (prova)',
      email, phone: '+39 333 000 0000',
      role: 'tenant',
      propertyId: propId,
      createdAt: new Date().toISOString(),
      createdBy: auth.email || 'admin',
    }, uid);

    // Immobile col manuale PIENO: serve perché le sezioni Manuale e Quartiere
    // abbiano davvero qualcosa da mostrare, altrimenti la prova non dice nulla.
    await fsCreate('properties', {
      demo: true,
      name: 'Trilocale Via Cavour (prova)',
      address: 'Via Cavour 12, Roma',
      zone: 'Monti', rent, status: 'rented',
      currentContractId: ctrId,
      manual: {
        wifiName: 'BOOM-Cavour12', wifiPass: 'RomaCaput2026',
        heating: 'Termoautonomo — termostato in ingresso, 20°C consigliati.',
        trash: 'Umido lun/mer/ven · Carta martedì · Plastica giovedì · Vetro sabato',
        appliances: 'Lavatrice Bosch (manuale nel cassetto), forno ventilato, lavastoviglie.',
        access: 'Portone: chiave grande. Ascensore a destra, quarto piano.',
        emergency: 'Guasti urgenti: +39 331 325 1961, 24/7.',
        rules: 'Silenzio 22–8. Niente fumo negli interni.',
      },
      neighborhood: [
        { emoji: '☕', name: 'Bar Sardegna', note: 'colazione, 40 metri' },
        { emoji: '🥖', name: 'Panificio Roscioli', note: 'il pane, 5 min' },
        { emoji: '🚇', name: 'Metro Cavour (B)', note: '3 min a piedi' },
        { emoji: '🛒', name: 'Conad Via Urbana', note: 'aperto fino alle 21' },
      ],
      createdAt: new Date().toISOString(),
    }, propId);

    await fsCreate('contracts', {
      demo: true,
      status: 'demo',                 // ← non 'active': l'automazione lo salta
      tenantId: uid, tenantName: 'Anna Rossi (prova)', tenantEmail: email,
      propertyId: propId, propertyAddress: 'Via Cavour 12, Roma',
      landlordName: 'Sig. Bianchi (prova)',
      startDate: shift(-95), endDate: shift(270),
      rent, deposit: rent * 2, depositPaid: true,
      installmentMonths: 1, installmentAmount: rent,
      canone: { monthly: rent, installments: 12, total: rent * 12 },
      createdAt: new Date().toISOString(),
    }, ctrId);

    // Una rata da pagare (così si vedono bottone carta e bonifico) e tre
    // pagate con vie diverse, per popolare storico e ricevute.
    const pays = [
      { m: 0,  due: shift(4),   status: 'pending' },
      { m: -1, due: shift(-26), status: 'paid', paidVia: 'bank' },
      { m: -2, due: shift(-56), status: 'paid', paidVia: 'stripe' },
      { m: -3, due: shift(-86), status: 'paid', paidVia: 'stripe' },
    ];
    for (const p of pays) {
      await fsCreate('payments', {
        demo: true,
        contractId: ctrId, tenantId: uid, tenantName: 'Anna Rossi (prova)',
        propertyId: propId,
        type: 'rent', amount: rent, month: ym(p.m), dueDate: p.due,
        status: p.status,
        ...(p.status === 'paid' ? { paidVia: p.paidVia, paidDate: p.due } : {}),
        installmentMonths: 1,
        createdAt: new Date().toISOString(),
      }, `demo_pay_${tag}_${ym(p.m)}`);
    }

    await fsCreate('maintenance', {
      demo: true,
      userId: uid, propertyId: propId,
      category: 'Plumbing', title: 'Caldaia — acqua tiepida al mattino',
      urgency: 'whenever', status: 'in-progress',
      notes: 'Tecnico previsto giovedì.',
      createdAt: new Date().toISOString(),
    }, 'demo_mnt_' + tag);

    logActivity('test_tenant_created', 'admin', { email, uid }, auth.email || 'admin').catch(() => {});

    return res.status(200).json({
      ok: true,
      email, password,                      // ← mostrata UNA volta, non salvata
      url: 'https://www.boomrome.com/casa',
      uid, tag,
      note: 'Contratto con status:demo e ogni documento demo:true — journey, '
          + 'Gestore e Contabile lo ignorano. DELETE su questo endpoint per '
          + 'cancellare tutto.',
    });
  } catch (e) {
    console.error('[admin/test-tenant]', e.message);
    return res.status(500).json({ ok: false, error: 'create_failed', detail: e.message });
  }
}

// Pulizia: via tutto ciò che porta il marchio demo. L'utente Auth resta (per
// cancellarlo serve l'Admin SDK), ma senza profilo non può più entrare in
// nessuna pagina protetta — il guard si ferma su "profilo non trovato".
async function wipe(res, auth) {
  const out = { users: 0, properties: 0, contracts: 0, payments: 0, maintenance: 0 };
  for (const coll of ['payments', 'maintenance', 'contracts', 'properties', 'users']) {
    let rows = [];
    try { rows = await fsList(coll, { limit: 500 }); } catch (_) { continue; }
    for (const r of rows || []) {
      if (r && r.demo === true) {
        try { await fsDelete(`${coll}/${r.id}`); out[coll]++; } catch (_) {}
      }
    }
  }
  logActivity('test_tenant_wiped', 'admin', out, auth.email || 'admin').catch(() => {});
  return res.status(200).json({ ok: true, deleted: out });
}
