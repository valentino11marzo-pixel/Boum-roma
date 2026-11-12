// api/owners/incarico.js — L'INCARICO DEL PROPRIETARIO, dal link alla firma
// (12/11/2026 — «un magic sign dei mandati, da replicare per tutti i
// proprietari, con l'accesso all'area proprietario»).
//
// Il caso: l'incarico con cui un proprietario affida a BOOM la ricerca dei
// conduttori nasceva fuori dal sistema (un PDF scritto a mano, firmato su
// carta), scollegato dall'immobile e dall'area proprietario. Qui è un
// documento di Firestore (`ownerMandates/<id>`, admin-only) con UN testo
// (js/incarico-engine.js), un link personale e una firma registrata.
//
// LE PORTE (una funzione, per stare nelle 50 regole di vercel.json):
//  · GET  ?t=<id>.<token>            pubblico — la scheda, le clausole, lo stato
//  · GET  ?t=…&pdf=1                 pubblico — il PDF: firmato se c'è, altrimenti
//                                    la copia «da firmare» generata al volo
//  · POST {op:'sign', t, …}          pubblico — la firma del proprietario
//  · POST {op:'create', terms}       admin — nasce l'incarico, ritorna il link
//  · POST {op:'list'} · {op:'void'} · {op:'docs'}  admin
//
// LE REGOLE:
//  · il token è casuale, per incarico, e vive SOLO nel documento admin-only:
//    la pagina pubblica non legge mai Firestore, passa da qui. Id sconosciuto
//    e token sbagliato rispondono lo stesso 404;
//  · la firma copre le condizioni E il testo: il browser rimanda l'impronta
//    che ha letto, il server la ricalcola (409 `terms_changed`);
//  · mai dedotto: `accept:true` esplicito, le clausole `specific` approvate
//    una per una (artt. 1341-1342 c.c.), il nome scritto dal firmatario;
//  · una firma sola: scrittura sotto precondizione (updateTime). Un secondo
//    tap risponde `already`, non riscrive; un incarico annullato → 410;
//  · best-effort dichiarato: PDF, email, card e area proprietario non
//    perdono MAI la firma (che è il dato). Ciò che manca è scritto sul
//    documento (`pending:[…]`) e detto all'operatore;
//  · l'area proprietario si apre da sola SOLO nel caso senza ambiguità (vedi
//    ensureOwnerAccess); ogni altro caso resta all'operatore, con la ragione.
import crypto from 'node:crypto';
import { fsGet, fsCreate, fsPatch, fsList, fsCommit, fsGetVersioned, readJson, logActivity } from '../homie/_lib.js';
import { requireRole } from '../_auth.js';
import { setCors, rateOk } from '../magic-sign/_shared.js';
import { storageUpload, sendEmail } from '../agent/_lib.js';
import { shell, para, fine, btn, btn2, row } from '../preagreement/_notify.js';
import { buildIncaricoPdf } from './_incarico-pdf.js';
import { signedContractDocs, planArchive } from '../sign/_archive.js';
import { receiptDocs } from '../fiscal/_ricevuta.js';
import INC from '../../js/incarico-engine.js';

export const COLLECTION = 'ownerMandates';
const BASE = 'https://www.boomrome.com';
const OPERATOR = () => process.env.ADMIN_NOTIFY_EMAIL || 'valentino@boom-rome.com';

const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
export const hashOf = (terms) => sha256(INC.canonical(terms));
export const linkOf = (id, token) => `${BASE}/incarico?t=${id}.${token}`;
const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export function parseRef(t) {
  const m = /^(inc_[a-f0-9]{12})\.([a-f0-9]{32})$/.exec(String(t || ''));
  return m ? { id: m[1], token: m[2] } : null;
}
const refOf = (id, createdAt) => `INC-${String(createdAt || '').slice(0, 4) || '0000'}-${id.slice(4, 10).toUpperCase()}`;

// Legge l'incarico SOLO se il token combacia. Un solo esito negativo.
async function loadByRef(t, versioned) {
  const r = parseRef(t);
  if (!r) return null;
  const got = versioned ? await fsGetVersioned(`${COLLECTION}/${r.id}`) : { data: await fsGet(`${COLLECTION}/${r.id}`) };
  const doc = got && got.data;
  if (!doc || !doc.token || !safeEq(doc.token, r.token)) return null;
  return { id: r.id, doc, updateTime: got.updateTime || null };
}

function publicView(id, d) {
  const t = d.terms;
  return {
    ref: d.ref, status: d.status, hash: d.hash,
    owner: { name: t.owner.name, kind: t.owner.kind },
    parties: INC.parties(t), summary: INC.summary(t), clauses: INC.clauses(t),
    specific: INC.specificIds(t), withdrawal: INC.hasWithdrawal(t),
    signedAt: d.signedAt || null, signedName: (d.signature && d.signature.name) || null,
    docUrl: d.docUrl || null, area: d.area || null,
  };
}

// ── L'area proprietario ────────────────────────────────────────────────
// Si apre da sola in UN caso: c'è un'email, nessun profilo la usa già con un
// altro ruolo, e l'immobile (se collegato) non ha già un proprietario
// diverso. Il profilo nasce su un uid VERO di Firebase Auth (signUp con
// password casuale: il proprietario sceglie la sua da «Password dimenticata»
// su /login — la stessa strada dell'inquilino in preagreement/convert).
// Ogni altro caso torna `manual` con la ragione: decide l'operatore.
export async function ensureOwnerAccess(terms) {
  const o = terms.owner, propId = terms.property.id || '';
  if (!o.email) return { state: 'manual', reason: 'no_email' };
  let uid = null, state = 'existing';
  const hits = await fsList('users', { filter: { field: 'email', op: 'EQUAL', value: o.email }, limit: 2 });
  if (hits && hits.length > 1) return { state: 'manual', reason: 'email_ambiguous' };
  if (hits && hits[0]) {
    if (!['landlord', 'owner'].includes(hits[0].role)) return { state: 'manual', reason: 'email_has_other_role' };
    uid = hits[0].id;
  } else {
    if (!process.env.FIREBASE_API_KEY) return { state: 'manual', reason: 'auth_unconfigured' };
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${process.env.FIREBASE_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: o.email, password: crypto.randomBytes(18).toString('base64url'), returnSecureToken: false }),
    });
    const d = await r.json().catch(() => ({}));
    if (!d || !d.localId) return { state: 'manual', reason: 'auth_account_not_created' };
    uid = d.localId;
    try {
      await fsCreate('users', {
        role: 'landlord', name: o.name, email: o.email, phone: o.phone || '', cf: o.cf || '', address: o.address || '',
        createdBy: 'incarico', createdAt: new Date().toISOString(),
      }, uid);
    } catch (e) { if (!(e && e.exists)) throw e; }
    state = 'created';
  }
  if (propId) {
    const prop = await fsGetVersioned('properties/' + propId);
    if (!prop) return { state: 'manual', reason: 'property_not_found', uid };
    const cur = prop.data.ownerId || null;
    if (cur && cur !== uid) return { state: 'manual', reason: 'property_has_other_owner', uid };
    if (!cur) {
      try { await fsCommit([{ docPath: 'properties/' + propId, fields: { ownerId: uid }, precondition: { updateTime: prop.updateTime } }]); }
      catch (e) { return { state: 'manual', reason: 'property_changed', uid }; }
    }
    return { state, uid, linked: true };
  }
  return { state, uid, linked: false };
}

// ── I documenti nell'area ──────────────────────────────────────────────
// Il proprietario che entra DOPO una locazione già fatta trovava l'area
// vuota: contratto firmato e ricevuta di registrazione si archiviano per le
// parti che hanno un profilo IN QUEL MOMENTO (sign/_archive, fiscal/_ricevuta)
// e lui non l'aveva. Qui, appena l'area esiste ed è collegata all'immobile:
// l'incarico firmato, e per ogni contratto dell'immobile la copia firmata e
// la ricevuta — la SOLA copia del locatore, con gli stessi id deterministici
// di quei due moduli (un rerun non aggiunge righe, e ciò che l'operatore
// carica dopo dal portal scrive sulle stesse). Mai un PDF senza firme.
export async function backfillOwnerDocs({ uid, propertyId, incarico }) {
  const out = { incarico: 0, contracts: 0, receipts: 0, failed: 0 };
  if (!uid) return out;
  const now = new Date();
  const put = async (id, data, kind) => {
    try { await fsPatch('documents/' + id, { ...data, updatedAt: now }); out[kind]++; }
    catch (e) { out.failed++; console.warn('[incarico] doc', kind, e.message); }
  };
  if (incarico && incarico.docUrl) {
    const day = String(incarico.signedAt || now.toISOString()).slice(0, 10);
    await put('incarico_' + incarico.id, {
      type: 'mandate', category: 'incarico', tags: ['01_Incarico', 'incarico', 'firmato'],
      userId: uid, party: 'landlord', lang: 'it', propertyId: propertyId || '',
      name: 'Incarico a BOOM firmato — ' + (incarico.label || incarico.ref || ''),
      fileUrl: incarico.docUrl, fileName: 'incarico-firmato.pdf', mimeType: 'application/pdf',
      docDate: day, fiscalYear: Number(day.slice(0, 4)) || null, createdAt: now,
      shared: false, uploadedBy: 'boom', source: 'incarico', needsFiling: false, mandateId: incarico.id,
    }, 'incarico');
  }
  if (!propertyId) return out;
  const property = await fsGet('properties/' + propertyId);
  if (!property || property.ownerId !== uid) return out;   // mai sull'immobile di un altro
  const contracts = await fsList('contracts', { filter: { field: 'propertyId', op: 'EQUAL', value: propertyId }, limit: 40 });
  for (const c of contracts || []) {
    if (c.signedPdfUrl) {
      const mine = signedContractDocs(c, property, { signedPdfUrl: c.signedPdfUrl, certUrl: c.signingCertificateUrl || '', now })
        .filter((x) => x.who === 'landlord' && x.userId === uid);
      if (mine.length) {
        let existing = [];
        try { existing = await fsList('documents', { filter: { field: 'contractId', op: 'EQUAL', value: c.id }, limit: 60 }); } catch { existing = []; }
        for (const w of planArchive(mine, existing, c.id)) await put(w.id, w.data, 'contracts');
      }
    }
    if (c.registrationReceiptUrl) {
      const rec = receiptDocs(c, property, {
        url: c.registrationReceiptUrl, fileName: c.registrationReceiptName, mimeType: c.registrationReceiptType,
        code: c.registrationCode || '', date: c.rliRegisteredAt || String(c.registrationReceiptAt || '').slice(0, 10),
      }).filter((x) => x.data.party === 'landlord' && x.userId === uid);
      for (const r of rec) await put(r.id, { ...r.data, createdAt: now }, 'receipts');
    }
  }
  return out;
}

const AREA_REASON = {
  no_email: 'manca l’email del proprietario',
  email_ambiguous: 'più profili usano quell’email',
  email_has_other_role: 'quell’email è già di un profilo con un altro ruolo',
  auth_unconfigured: 'FIREBASE_API_KEY assente',
  auth_account_not_created: 'l’account non è nato (email già registrata senza profilo?)',
  property_not_found: 'l’immobile collegato non esiste più',
  property_has_other_owner: 'l’immobile ha già un altro proprietario',
  property_changed: 'l’immobile è cambiato durante il collegamento',
  failed: 'errore durante l’apertura',
};

// Solo ciò che è stato archiviato davvero: mai una promessa.
export function areaDocsLine(docs) {
  if (!docs) return '';
  const parts = [];
  if (docs.incarico) parts.push('questo incarico');
  if (docs.contracts) parts.push(docs.contracts === 1 ? 'il contratto di locazione firmato' : `${docs.contracts} contratti di locazione firmati`);
  if (docs.receipts) parts.push(docs.receipts === 1 ? 'la ricevuta di registrazione' : `${docs.receipts} ricevute di registrazione`);
  if (!parts.length) return '';
  const list = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' e ' + parts[parts.length - 1] : parts[0];
  return ` Nei documenti trova già ${list}.`;
}

function ownerEmail({ d, id, docUrl, area, docs }) {
  const t = d.terms, first = esc(t.owner.name.split(' ')[0]);
  const rows = INC.summary(t).map(([k, v]) => row(esc(k), esc(v))).join('');
  const areaOk = area && area.state !== 'manual';
  const inner =
    para(`Gentile ${first},<br>il Suo incarico a BOOM è firmato. Qui sotto trova le condizioni in sintesi e la copia del documento.`) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>` +
    btn(docUrl || `${linkOf(id, d.token)}&pdf=1`, 'Scarica l’incarico firmato') +
    (areaOk
      ? para(`La Sua area proprietario è attiva con questa email. Al primo accesso scelga la password da «Password dimenticata».` + areaDocsLine(docs), 'margin-top:26px') + btn2(`${BASE}/login`, 'Entra nell’area proprietario')
      : '') +
    fine(`Riferimento ${esc(d.ref)}. Per qualsiasi domanda risponda a questa email.`);
  return { subject: `Il Suo incarico a BOOM è firmato · ${d.ref}`, html: shell(inner, 'La copia firmata e l’accesso alla Sua area proprietario.', { tag: 'Proprietari · Roma' }) };
}

async function withCap(p, ms) {
  let timer;
  try { return await Promise.race([p, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), ms); })]); }
  finally { clearTimeout(timer); }
}

// ── la firma ───────────────────────────────────────────────────────────
async function sign(req, res, body) {
  if (!rateOk(req, 10)) { res.setHeader('Retry-After', '60'); return res.status(429).json({ ok: false, error: 'rate_limited' }); }
  let cur;
  try { cur = await loadByRef(body.t, true); }
  catch (e) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  if (!cur) return res.status(404).json({ ok: false, error: 'invalid_link' });
  const { id, doc: d } = cur;
  if (d.status === 'signed') return res.status(200).json({ ok: true, already: true, at: d.signedAt || null, docUrl: d.docUrl || null, area: d.area || null });
  if (d.status !== 'sent') return res.status(410).json({ ok: false, error: 'not_open' });

  const t = d.terms;
  if (body.accept !== true) return res.status(400).json({ ok: false, error: 'accept_required' });
  const approved = Array.isArray(body.specific) ? body.specific.map(String) : [];
  const missing = INC.specificIds(t).filter((x) => !approved.includes(x));
  if (missing.length) return res.status(400).json({ ok: false, error: 'specific_required', missing });
  const name = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (name.length < 3) return res.status(400).json({ ok: false, error: 'name_required' });
  if (t.owner.kind === 'persona' && fold(name) !== fold(t.owner.name)) return res.status(400).json({ ok: false, error: 'name_mismatch' });
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.signature || ''));
  const png = m ? Buffer.from(m[1], 'base64') : null;
  if (!png || png.length < 400 || png.length > 400_000 || png.readUInt32BE(0) !== 0x89504e47) return res.status(400).json({ ok: false, error: 'signature_required' });
  const hash = hashOf(t);
  if (String(body.hash || '') !== hash || d.hash !== hash) return res.status(409).json({ ok: false, error: 'terms_changed' });

  const now = new Date().toISOString();
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || '';
  const ua = String(req.headers['user-agent'] || '').slice(0, 160);
  const signature = { at: now, ip, ua, name, specific: INC.specificIds(t), hash, via: 'incarico' };
  if (INC.hasWithdrawal(t)) signature.immediateStart = body.immediateStart === true;

  // IL DATO: la firma, una volta sola.
  try {
    await fsCommit([{ docPath: `${COLLECTION}/${id}`, fields: { status: 'signed', signedAt: now, signature }, precondition: { updateTime: cur.updateTime } }]);
  } catch (e) {
    if (e && e.conflict) {
      const again = await fsGet(`${COLLECTION}/${id}`).catch(() => null);
      if (again && again.status === 'signed') return res.status(200).json({ ok: true, already: true, at: again.signedAt || null, docUrl: again.docUrl || null, area: again.area || null });
      return res.status(409).json({ ok: false, error: 'changed_retry' });
    }
    return res.status(500).json({ ok: false, error: 'sign_failed' });
  }

  // Da qui in poi: best-effort, e ciò che manca si scrive.
  const pending = [], patch = {};
  try {
    const u = await storageUpload(`${COLLECTION}/${id}/firma.png`, png, 'image/png');
    if (u) patch.signatureUrl = u;
  } catch (e) { pending.push('firma_png'); console.warn('[incarico] firma png:', e.message); }
  let docUrl = null;
  try {
    const buf = await buildIncaricoPdf({ terms: t, ref: d.ref, hash, signature: { ...signature, png } });
    docUrl = await storageUpload(`${COLLECTION}/${id}/incarico-firmato.pdf`, buf, 'application/pdf');
    if (docUrl) patch.docUrl = docUrl; else pending.push('pdf');
  } catch (e) { pending.push('pdf'); console.warn('[incarico] pdf:', e.message); }

  let area;
  try { area = await ensureOwnerAccess(t); }
  catch (e) { area = { state: 'manual', reason: 'failed' }; console.warn('[incarico] area:', e.message); }
  patch.area = area;
  let docs = null;
  if (area.state !== 'manual' && area.uid) {
    try {
      docs = await backfillOwnerDocs({ uid: area.uid, propertyId: area.linked ? t.property.id : '', incarico: { id, ref: d.ref, docUrl, signedAt: now, label: t.property.address } });
      if (docs.failed) pending.push('area_docs');
    } catch (e) { pending.push('area_docs'); console.warn('[incarico] area docs:', e.message); }
    if (docs) patch.areaDocs = docs;
  }

  const mails = [];
  if (t.owner.email) {
    const om = ownerEmail({ d, id, docUrl, area, docs });
    mails.push(withCap(sendEmail({ to: t.owner.email, subject: om.subject, html: om.html, replyTo: OPERATOR() }), 8000)
      .then(() => { patch.ownerEmailAt = new Date().toISOString(); }, (e) => { pending.push('owner_email'); console.warn('[incarico] owner mail:', e.message); }));
  } else pending.push('owner_email');
  const areaLine = area.state === 'manual'
    ? `Area proprietario: DA APRIRE A MANO (${AREA_REASON[area.reason] || area.reason}).`
    : `Area proprietario: ${area.state === 'created' ? 'creata' : 'già esistente'}${area.linked ? ', immobile collegato' : ''}.`;
  mails.push(withCap(sendEmail({
    to: OPERATOR(), replyTo: t.owner.email || undefined,
    subject: `Incarico firmato · ${t.owner.name} · ${t.property.address}`,
    html: shell(
      para(`${esc(t.owner.name)} ha firmato l’incarico <b>${esc(d.ref)}</b> per ${esc(t.property.address)}.`) +
      para(esc(areaLine)) + (docUrl ? btn(docUrl, 'Apri il firmato') : para('Il PDF non è nato: si rigenera dalla console.')),
      'Incarico firmato dal proprietario.', { tag: 'Proprietari · Roma' }),
  }), 8000).then(() => {}, (e) => { pending.push('operator_email'); console.warn('[incarico] op mail:', e.message); }));
  await Promise.all(mails);

  try {
    await fsCreate('agentNotifications', {
      type: 'owner.incarico_signed',
      summary: `🖊 Incarico FIRMATO dal proprietario · ${t.owner.name} · ${t.property.address} · ${INC.feeText(t)} — ${areaLine}`,
      priority: 'high', ref: { collection: COLLECTION, id },
      payload: { id, ref: d.ref, docUrl, area: area.state, areaReason: area.reason || null },
      dedupKey: 'incarico-signed-' + id, status: 'pending', actor: 'incarico', createdAt: now, attempts: 0,
    }, 'incarico_signed_' + id);
  } catch (e) { if (!(e && e.exists)) { pending.push('telegram'); console.warn('[incarico] notify:', e.message); } }

  patch.pending = pending;
  try { await fsPatch(`${COLLECTION}/${id}`, patch); } catch (e) { console.warn('[incarico] patch:', e.message); }
  await logActivity('owner_incarico_signed', 'owner', { id, ref: d.ref, docUrl, area: area.state, pending }, 'client');
  return res.status(200).json({ ok: true, at: now, docUrl, area: { state: area.state }, pending });
}

// ── le porte dell'operatore ────────────────────────────────────────────
async function adminOps(req, res, body) {
  const who = await requireRole(req, res, ['admin']);
  if (!who) return;
  if (body.op === 'create') {
    const n = INC.normalize(body.terms);
    if (!n.ok) return res.status(400).json({ ok: false, error: 'invalid_terms', fields: n.errors });
    const id = 'inc_' + crypto.randomBytes(6).toString('hex');
    const token = crypto.randomBytes(16).toString('hex');
    const now = new Date().toISOString();
    const doc = { ref: refOf(id, now), status: 'sent', token, terms: n.terms, hash: hashOf(n.terms), engineVersion: INC.VERSION, createdAt: now, createdBy: who.email || who.uid };
    await fsCreate(COLLECTION, doc, id);
    await logActivity('owner_incarico_created', 'owner', { id, ref: doc.ref }, who.email || 'admin');
    return res.status(200).json({ ok: true, id, ref: doc.ref, url: linkOf(id, token), summary: INC.summary(n.terms) });
  }
  if (body.op === 'list') {
    const rows = await fsList(COLLECTION, { orderBy: { field: 'createdAt', direction: 'DESCENDING' }, limit: 100 });
    return res.status(200).json({ ok: true, items: (rows || []).map((d) => ({
      id: d.id, ref: d.ref, status: d.status, createdAt: d.createdAt, signedAt: d.signedAt || null,
      owner: d.terms && d.terms.owner ? { name: d.terms.owner.name, phone: d.terms.owner.phone || '', email: d.terms.owner.email || '' } : null,
      property: d.terms && d.terms.property ? d.terms.property.address : '', fee: d.terms ? INC.feeText(d.terms) : '',
      url: d.token ? linkOf(d.id, d.token) : null, docUrl: d.docUrl || null, area: d.area || null, areaDocs: d.areaDocs || null, pending: d.pending || [],
    })) });
  }
  // Riallinea i documenti dell'area (es. contratto o ricevuta caricati dopo,
  // o un'area aperta a mano): stessi id, nessuna riga in più.
  if (body.op === 'docs') {
    const id = String(body.id || '');
    const cur = /^inc_[a-f0-9]{12}$/.test(id) ? await fsGet(`${COLLECTION}/${id}`) : null;
    if (!cur) return res.status(404).json({ ok: false, error: 'not_found' });
    if (cur.status !== 'signed') return res.status(409).json({ ok: false, error: 'not_signed' });
    let area;
    try { area = await ensureOwnerAccess(cur.terms); } catch { area = { state: 'manual', reason: 'failed' }; }
    if (area.state === 'manual' || !area.uid) {
      await fsPatch(`${COLLECTION}/${id}`, { area });
      return res.status(409).json({ ok: false, error: 'area_manual', reason: area.reason, detail: AREA_REASON[area.reason] || area.reason });
    }
    const docs = await backfillOwnerDocs({ uid: area.uid, propertyId: area.linked ? cur.terms.property.id : '', incarico: { id, ref: cur.ref, docUrl: cur.docUrl, signedAt: cur.signedAt, label: cur.terms.property.address } });
    await fsPatch(`${COLLECTION}/${id}`, { area, areaDocs: docs, pending: (cur.pending || []).filter((x) => x !== 'area_docs').concat(docs.failed ? ['area_docs'] : []) });
    return res.status(200).json({ ok: true, area: { state: area.state, linked: !!area.linked }, docs });
  }

  if (body.op === 'void') {
    const id = String(body.id || '');
    const cur = /^inc_[a-f0-9]{12}$/.test(id) ? await fsGetVersioned(`${COLLECTION}/${id}`) : null;
    if (!cur) return res.status(404).json({ ok: false, error: 'not_found' });
    if (cur.data.status === 'signed') return res.status(409).json({ ok: false, error: 'already_signed' });
    try { await fsCommit([{ docPath: `${COLLECTION}/${id}`, fields: { status: 'void', voidAt: new Date().toISOString(), voidBy: who.email || who.uid }, precondition: { updateTime: cur.updateTime } }]); }
    catch (e) { return res.status(409).json({ ok: false, error: 'changed_retry' }); }
    return res.status(200).json({ ok: true });
  }
  return res.status(400).json({ ok: false, error: 'unknown_op' });
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    if (!rateOk(req, 40)) { res.setHeader('Retry-After', '60'); return res.status(429).json({ ok: false, error: 'rate_limited' }); }
    let cur;
    try { cur = await loadByRef(req.query && req.query.t, false); }
    catch (e) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
    if (!cur) return res.status(404).json({ ok: false, error: 'invalid_link' });
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.query.pdf) {
      if (cur.doc.status === 'void') return res.status(410).json({ ok: false, error: 'not_open' });
      if (cur.doc.docUrl) { res.statusCode = 302; res.setHeader('Location', cur.doc.docUrl); return res.end(); }
      try {
        const sig = cur.doc.status === 'signed' ? { ...cur.doc.signature, png: null } : null;
        const buf = await buildIncaricoPdf({ terms: cur.doc.terms, ref: cur.doc.ref, hash: cur.doc.hash, signature: sig });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="incarico-${cur.doc.ref}.pdf"`);
        return res.status(200).send(buf);
      } catch (e) { return res.status(500).json({ ok: false, error: 'pdf_failed' }); }
    }
    return res.status(200).json({ ok: true, ...publicView(cur.id, cur.doc) });
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  body = body || {};
  if (body.op === 'sign') return sign(req, res, body);
  return adminOps(req, res, body);
}
