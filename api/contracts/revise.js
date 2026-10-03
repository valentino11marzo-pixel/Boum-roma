// api/contracts/revise.js — «Ok, mettiamolo a posto»: la versione corretta
// del contratto entra NEL giro, invece di uscire su WhatsApp.
//
// LA LEZIONE DEL 3 OTTOBRE 2026. Proposta accettata e pagata, contratto
// convertito, Magic Sign partito — poi l'operatore si accorge che il PDF
// ha difetti (formattazione, dati messi nel posto sbagliato, piano e
// interno errati). Fino a oggi l'unica uscita era fuori dal sistema:
// correggere il PDF a mano e rimandarlo su WhatsApp. Da lì la journey si
// spezzava: niente firma FES sul documento giusto, niente certificato,
// niente fascicolo, niente registrazione, niente casa in /casa — e se una
// parte aveva già firmato la versione sbagliata, la sua firma restava
// attaccata a un documento che non valeva più.
//
// Questo endpoint rimette il documento GIUSTO al centro del giro:
//   op:'status'   cosa è firmato, che versione gira, la storia.
//   op:'upload'   l'operatore carica il PDF corretto (base64, oppure
//                 fileUrl di Storage sotto contracts/<id>/ per i file
//                 grandi) → diventa la versione N+1: è QUELLO che /sign
//                 mostra, che le parti firmano, a cui _finalize appende la
//                 pagina delle firme. Nessuna rigenerazione automatica lo
//                 sovrascrive (pdfSource:'upload' — guardia in
//                 ensureContractPdf).
//   op:'template' torna al modello BOOM rigenerato dai dati (dopo aver
//                 corretto i dati con ✎ Completa/Correggi): nuova versione,
//                 stesse regole sulle firme.
//
// LE REGOLE DURE (testate per mutazione):
// - Contratto firmato da TUTTI (o già finalizzato) → 409 fully_signed:
//   certificato, fascicolo, email e scadenze sono partiti su quei byte;
//   una correzione lì è un nuovo contratto (rinnovo/duplica), non una
//   versione.
// - Una firma già apposta su una versione NON si sposta sulla nuova: è
//   attaccata ai byte che la persona ha visto. Con una firma viva serve
//   `voidSignatures:true` DICHIARATO (la console lo chiede con i nomi):
//   la firma viene ARCHIVIATA in `contractVersions[]` (chi, quando, IP,
//   dispositivo, hash del consenso, hash della firma — e l'immagine finché
//   il documento resta leggero) e la parte firma di nuovo. Mai cancellata
//   in silenzio, mai riusata.
// - La scrittura è condizionata all'updateTime letto (una firma arrivata
//   nel mezzo → 409 conflict, nulla toccato).
// - Ogni versione ha il SUO path su Storage (contract-v<N>.pdf): i byte
//   che una firma archiviata ha visto non vengono mai sovrascritti.
// - notify (default true): l'invito «contratto aggiornato — firma la nuova
//   versione» parte a chi deve firmare (titolare + co-conduttori col loro
//   link); il proprietario riceve il suo «tocca a Lei» dopo, come sempre.
//
// Method:   POST   Authorization: Bearer <firebase-id-token> (admin)
// Body:     { op, contractId, pdfBase64?, fileUrl?, fileName?, note?,
//             voidSignatures?, notify? }

import crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { fsGet, fsPatch, readJson, logActivity } from '../homie/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { storageUpload } from '../agent/_lib.js';
import { commitWrites, fsGetWithTime, tenantSideComplete } from '../magic-sign/_shared.js';
import { renderContractPdf, CLAUSE_VERSION } from '../sign/_contractpdf.js';
import { sendSignInvite } from '../sign/_notify.js';
import { inviteCoTenants, coSignUrlsForPa } from '../sign/_cosign.js';
import { ensureSignTokens, signUrl } from '../sign/_tokens.js';

const BASE = 'https://www.boomrome.com';
export const MAX_PDF_BYTES = 15 * 1024 * 1024;
// L'archivio delle firme vive DENTRO il contratto (nessuna collection o
// regola nuova da deployare): sopra questa soglia le immagini delle firme
// annullate si riducono al loro hash — la prova (chi, quando, dove, su
// cosa) resta, il documento non si avvicina al tetto di 1 MB di Firestore.
const ARCHIVE_IMG_BUDGET = 300 * 1024;

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const iso = (v) => (!v ? null : typeof v === 'string' ? v : (v && typeof v.toDate === 'function') ? v.toDate().toISOString()
  : (v && v.seconds) ? new Date(v.seconds * 1000).toISOString() : String(v));

// Chi ha firmato QUESTA versione — dai fatti (le firme presenti).
export function signedParties(c) {
  const out = [];
  if (!c) return out;
  if (c.tenantSignature) out.push({ role: 'tenant', name: c.tenantName || '', signedAt: iso(c.tenantSignedAt) });
  (Array.isArray(c.coTenants) ? c.coTenants : []).forEach((x, i) => {
    if (x && x.signature) out.push({ role: 'cotenant', coIndex: i, name: x.name || '', signedAt: iso(x.signedAt) });
  });
  if (c.landlordSignature) out.push({ role: 'landlord', name: c.landlordName || '', signedAt: iso(c.landlordSignedAt) });
  return out;
}

export function isFullySigned(c) {
  if (!c) return false;
  if (c.finalizedAt || c.signatureStatus === 'complete' || c.fullySignedAt) return true;
  return tenantSideComplete(c) && !!c.landlordSignature;
}

const SIDE_FIELDS = ['Signature', 'SignedAt', 'SignedIP', 'SignedUA', 'ConsentText', 'ConsentHash', 'ConsentAt', 'SignTokenUsedAt', 'SignedByDelegate'];
const CO_FIELDS = ['signature', 'signedAt', 'signedIP', 'signedUA', 'consentText', 'consentHash', 'consentAt'];

// Pura: le firme di QUESTA versione → la voce d'archivio, e la patch che
// riapre la firma. `withImages`: l'immagine della firma resta in archivio
// (default sì; il chiamante la toglie se il documento cresce troppo).
export function voidSignatures(c, { withImages = true } = {}) {
  const archive = [];
  const patch = {};
  const sigRec = (img) => (img ? { signatureSha256: sha256(String(img)), ...(withImages ? { signature: String(img) } : {}) } : {});
  for (const side of ['tenant', 'landlord']) {
    if (!c[side + 'Signature']) continue;
    archive.push({
      role: side, name: c[side + 'Name'] || '',
      signedAt: iso(c[side + 'SignedAt']), ip: c[side + 'SignedIP'] || '', ua: c[side + 'SignedUA'] || '',
      consentHash: c[side + 'ConsentHash'] || '',
      byDelegate: c[side + 'SignedByDelegate'] && c[side + 'SignedByDelegate'].name ? { name: c[side + 'SignedByDelegate'].name, onBehalfOf: c[side + 'SignedByDelegate'].onBehalfOf || '' } : null,
      ...sigRec(c[side + 'Signature']),
    });
    for (const f of SIDE_FIELDS) patch[side + f] = null;
  }
  const co = Array.isArray(c.coTenants) ? c.coTenants : [];
  if (co.some(x => x && x.signature)) {
    patch.coTenants = co.map((x, i) => {
      if (!x || !x.signature) return x;
      archive.push({
        role: 'cotenant', coIndex: i, name: x.name || '', signedAt: iso(x.signedAt), ip: x.signedIP || '', ua: x.signedUA || '',
        consentHash: x.consentHash || '', ...sigRec(x.signature),
      });
      const y = { ...x };
      for (const f of CO_FIELDS) delete y[f];
      return y;
    });
  }
  if (archive.length) {
    Object.assign(patch, {
      signatureStatus: 'none', fullySignedAt: null,
      signedTermsHash: null, signedTermsAt: null, signedTerms: null,
      lastReminderAt: null, autoNudgeCount: 0,
    });
  }
  return { archive, patch };
}

// Pura: ciò che una NUOVA versione azzera sempre (anche senza firme da
// annullare). «Ha aperto il link» e i solleciti si riferivano al documento
// di prima: la console diceva «visto» su una versione mai aperta, e il
// guardiano degli inviti freddi aveva già speso i suoi due re-inviti.
// `coSignInviteAt` resta: i co-conduttori il link l'hanno avuto (è lo
// stesso), e la revisione li riavvisa con «contratto aggiornato».
export function revisionResets(c) {
  const out = {
    signViewedTenantAt: null, signViewedLandlordAt: null,
    viewNudgedTenantAt: null, viewNudgedLandlordAt: null,
    inviteNudgeCount: 0, autoNudgeCount: 0, lastReminderAt: null,
  };
  (Array.isArray(c && c.coTenants) ? c.coTenants : []).forEach((_, i) => {
    out['signViewedCo' + i + 'At'] = null;
    out['viewNudgedCo' + i + 'At'] = null;
  });
  return out;
}

// Il PDF caricato: firma %PDF, leggibile da pdf-lib (è con pdf-lib che
// _finalize gli appenderà la pagina delle firme — un PDF che pdf-lib non
// apre farebbe morire la firma completa, quindi si rifiuta ADESSO).
export async function inspectPdf(buf) {
  if (!buf || !buf.length) return { ok: false, error: 'empty' };
  if (buf.length > MAX_PDF_BYTES) return { ok: false, error: 'too_large', bytes: buf.length };
  if (buf.subarray(0, 1024).toString('latin1').indexOf('%PDF-') < 0) return { ok: false, error: 'not_pdf' };
  try {
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
    const pages = doc.getPageCount();
    if (!pages) return { ok: false, error: 'no_pages' };
    // la prova vera: aggiungere una pagina e salvare, come farà _finalize
    doc.addPage([595, 842]);
    await doc.save();
    return { ok: true, pages };
  } catch (e) {
    return { ok: false, error: 'pdf_unreadable', detail: String(e.message || '').slice(0, 120) };
  }
}

// Il bucket di BOOM (la stessa regola di storageUpload in agent/_lib.js).
export const storageBucket = () => process.env.FIREBASE_STORAGE_BUCKET
  || `${process.env.FIREBASE_PROJECT_ID || 'boom-property-dashboards'}.firebasestorage.app`;

// I nomi del bucket dello STESSO progetto: quello del server (env) e le due
// forme che il client Firebase può usare (firebase-config.js dichiara
// .firebasestorage.app; i progetti vecchi rispondono anche su .appspot.com).
const boomBuckets = () => {
  const pid = process.env.FIREBASE_PROJECT_ID || 'boom-property-dashboards';
  return new Set([storageBucket(), pid + '.firebasestorage.app', pid + '.appspot.com']);
};

// Il file grande arriva da Storage: SOLO firebasestorage.googleapis.com, SOLO
// il bucket di BOOM (un URL di un altro progetto Firebase con lo stesso path
// passava: 3/10/2026) e SOLO sotto contracts/<id>/ — l'endpoint non è un proxy.
export function allowedFileUrl(url, contractId) {
  try {
    const u = new URL(String(url || ''));
    if (u.protocol !== 'https:' || u.hostname !== 'firebasestorage.googleapis.com') return false;
    const m = /^\/v0\/b\/([^/]+)\/o\/([^/?]+)$/.exec(u.pathname);
    if (!m || !boomBuckets().has(decodeURIComponent(m[1]))) return false;
    const path = decodeURIComponent(m[2]);
    return path.startsWith('contracts/' + contractId + '/') && !path.includes('..');
  } catch (_) { return false; }
}

// Si legge al massimo MAX_PDF_BYTES: prima l'intestazione dichiarata, poi
// il flusso contato pezzo per pezzo — mai un file intero in memoria per
// scoprire DOPO che era troppo grande.
async function readCapped(r, max) {
  const len = Number(r.headers && r.headers.get && r.headers.get('content-length') || 0);
  if (len > max) return { error: 'too_large' };
  const reader = r.body && typeof r.body.getReader === 'function' ? r.body.getReader() : null;
  if (!reader) {
    const ab = await r.arrayBuffer();
    return ab.byteLength > max ? { error: 'too_large' } : { buf: Buffer.from(ab) };
  }
  const chunks = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { try { await reader.cancel(); } catch (_) {} return { error: 'too_large' }; }
    chunks.push(Buffer.from(value));
  }
  return { buf: Buffer.concat(chunks) };
}

async function readBytes(b, contractId) {
  if (typeof b.pdfBase64 === 'string' && b.pdfBase64.length) {
    const raw = b.pdfBase64.replace(/^data:[^,]*,/, '');
    if (raw.length > Math.ceil(MAX_PDF_BYTES * 4 / 3) + 16) return { error: 'too_large' };
    return { buf: Buffer.from(raw, 'base64') };
  }
  if (b.fileUrl) {
    if (!allowedFileUrl(b.fileUrl, contractId)) return { error: 'bad_file_url' };
    const r = await fetch(b.fileUrl, { signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (!r || !r.ok) return { error: 'file_fetch_failed' };
    return readCapped(r, MAX_PDF_BYTES);
  }
  return { error: 'file_required' };
}

function historyEntry(c, now, by, note, archive) {
  return {
    v: Number(c.contractVersion || 1),
    url: c.generatedPDF || null, hash: c.pdfHash || null,
    source: c.pdfSource || 'boom', fileName: c.pdfFileName || null,
    supersededAt: now, supersededBy: by, reason: note || '',
    voidedSignatures: archive,
  };
}

function statusOf(id, c) {
  const signed = signedParties(c);
  const full = isFullySigned(c);
  return {
    contractId: id,
    version: Number(c.contractVersion || 1),
    source: c.pdfSource || 'boom',
    pdfUrl: c.generatedPDF || null,
    fileName: c.pdfFileName || null,
    note: c.pdfUploadNote || '',
    revisedAt: iso(c.contractRevisedAt),
    signed,
    fullySigned: full,
    canRevise: !full,
    needsVoid: !full && signed.length > 0,
    history: (Array.isArray(c.contractVersions) ? c.contractVersions : []).map(h => ({
      v: h.v, url: h.url, source: h.source, fileName: h.fileName || null, supersededAt: h.supersededAt, reason: h.reason || '',
      voided: (h.voidedSignatures || []).map(s => ({ role: s.role, name: s.name, signedAt: s.signedAt })),
    })),
  };
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  // Sostituire il documento che le parti firmano è un atto dell'operatore.
  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;
  const by = auth.email || auth.uid || 'admin';

  const b = await readJson(req).catch(() => ({})) || {};
  const op = ['status', 'upload', 'template'].includes(b.op) ? b.op : 'status';
  const contractId = String(b.contractId || '').trim().slice(0, 80);
  if (!/^[A-Za-z0-9_-]{2,80}$/.test(contractId)) return res.status(400).json({ ok: false, error: 'contractId_required' });

  let got;
  try { got = await fsGetWithTime('contracts/' + contractId); }
  catch (e) { return res.status(500).json({ ok: false, error: 'lookup_failed' }); }
  if (!got || !got.data) return res.status(404).json({ ok: false, error: 'not_found' });
  const c = { ...got.data, id: contractId };

  if (op === 'status') return res.status(200).json({ ok: true, ...statusOf(contractId, c) });

  if (isFullySigned(c)) {
    return res.status(409).json({ ok: false, error: 'fully_signed', signed: signedParties(c) });
  }
  const signed = signedParties(c);
  if (signed.length && b.voidSignatures !== true) {
    return res.status(409).json({ ok: false, error: 'signed_needs_void', signed });
  }

  const now = new Date().toISOString();
  const note = String(b.note || '').trim().slice(0, 300);
  const nextV = Number(c.contractVersion || 1) + 1;
  // Un path UNICO per tentativo: due revisioni concorrenti calcolano la
  // stessa nextV, e il perdente (che il commit condizionato respinge)
  // sovrascriveva comunque i byte del vincitore — il contratto puntava
  // alla v2 giusta e il file era quello sbagliato (3/10/2026).
  const path = `contracts/${contractId}/contract-v${nextV}-${crypto.randomBytes(4).toString('hex')}.pdf`;

  // Le firme di questa versione: archivio (con le immagini finché il
  // documento resta leggero) + patch che riapre la firma.
  let { archive, patch } = voidSignatures(c, { withImages: true });
  const prevHistory = Array.isArray(c.contractVersions) ? c.contractVersions : [];
  const sizeOf = (x) => Buffer.byteLength(JSON.stringify(x || []));
  if (sizeOf(prevHistory) + sizeOf(archive) > ARCHIVE_IMG_BUDGET) ({ archive } = voidSignatures(c, { withImages: false }));
  const history = [...prevHistory, historyEntry(c, now, by, note, archive)];

  let fields;
  let pages = null, fileName = null;
  if (op === 'upload') {
    const rd = await readBytes(b, contractId);
    if (rd.error) return res.status(rd.error === 'too_large' ? 413 : 400).json({ ok: false, error: rd.error });
    const chk = await inspectPdf(rd.buf);
    if (!chk.ok) return res.status(chk.error === 'too_large' ? 413 : 422).json({ ok: false, error: chk.error, detail: chk.detail || null });
    pages = chk.pages;
    fileName = String(b.fileName || '').replace(/[^\w .()\-àèéìòù]/gi, '').slice(0, 120) || ('contratto-v' + nextV + '.pdf');
    let url;
    try { url = await storageUpload(path, rd.buf, 'application/pdf'); }
    catch (e) { return res.status(502).json({ ok: false, error: 'storage_failed' }); }
    if (!url) return res.status(502).json({ ok: false, error: 'storage_failed' });
    fields = {
      ...revisionResets(c),
      ...patch,
      generatedPDF: url,
      pdfHash: sha256(rd.buf).slice(0, 16), pdfSha256: sha256(rd.buf),
      pdfSource: 'upload', pdfPath: path, pdfFileName: fileName, pdfPages: pages,
      pdfUploadNote: note, pdfUploadedAt: now, pdfUploadedBy: by,
      // il file caricato non ha ancore: _finalize stampa le firme nella
      // pagina delle firme in coda (la via dei PDF senza ancore)
      sigAnchors: null,
      pdfSizeKB: Math.round(rd.buf.length / 1024),
      pdfGeneratedAt: now, pdfGeneratedBy: 'upload:' + by,
      clauseVersion: CLAUSE_VERSION,
      contractVersion: nextV, contractVersions: history,
      contractRevisedAt: now, contractRevisedBy: by,
    };
  } else {
    // Il modello BOOM rifatto dai dati di ADESSO (dopo ✎ Correggi i dati),
    // sul path della NUOVA versione: impaginato e caricato PRIMA del commit,
    // così un PDF che non nasce non lascia mai una versione a metà (firme
    // riaperte su un documento vecchio).
    const base = { ...c, ...patch, pdfSource: 'boom', pdfPath: path };
    let r = null;
    try { r = await renderContractPdf(contractId, base); }
    catch (e) { console.error('[contracts/revise] template:', e.message); }
    if (!r) return res.status(502).json({ ok: false, error: 'pdf_failed' });
    fields = {
      ...revisionResets(c),
      ...patch, ...r.fields,
      pdfSource: 'boom', pdfPath: path, pdfFileName: null, pdfUploadNote: note || null,
      pdfSha256: null, pdfPages: null,
      contractVersion: nextV, contractVersions: history,
      contractRevisedAt: now, contractRevisedBy: by,
    };
  }

  // Condizionata all'updateTime letto: una firma arrivata nel mezzo non
  // viene mai cancellata da una revisione che non l'ha vista.
  try {
    await commitWrites([{ docPath: 'contracts/' + contractId, fields, precondition: { updateTime: got.updateTime } }]);
  } catch (e) {
    if (/FAILED_PRECONDITION|precondition/i.test(String(e.message || ''))) return res.status(409).json({ ok: false, error: 'conflict' });
    console.error('[contracts/revise] write:', e.message);
    return res.status(500).json({ ok: false, error: 'write_failed' });
  }

  const fresh = { ...c, ...fields };

  // La proposta (rail pre-agreement) torna a dire lo stato vero della firma.
  const paId = String(c.preAgreementId || '').trim();
  if (paId && archive.length) {
    try {
      await commitWrites([{ docPath: 'preAgreements/' + paId, precondition: { exists: true }, fields: {
        contractSignatureStatus: 'none', tenantSignedAt: null, landlordSignedAt: null, coTenantsSignedAt: null, contractFullySignedAt: null,
        contractVersion: nextV, contractRevisedAt: now, coSignUrls: coSignUrlsForPa(contractId, fresh),
      } }]);
    } catch (e) { console.warn('[contracts/revise] pa stamp:', e.message); }
  } else if (paId) {
    try { await commitWrites([{ docPath: 'preAgreements/' + paId, precondition: { exists: true }, fields: { contractVersion: nextV, contractRevisedAt: now } }]); }
    catch (e) { console.warn('[contracts/revise] pa stamp:', e.message); }
  }

  // Chi deve firmare la NUOVA versione riceve l'invito («contratto
  // aggiornato»). Solo se il contratto era già stato mandato in firma:
  // un contratto mai inviato resta una decisione dell'operatore.
  // Il link del titolare dal deposito (signTokens — il contratto non porta
  // più i token): dopo la revisione deve firmare di nuovo, quindi si conia
  // se manca. Admin-only: la risposta può portarlo.
  let tenantUrl = null;
  if (!fresh.tenantSignature) {
    try { tenantUrl = signUrl((await ensureSignTokens(contractId, fresh, { mint: ['tenant'] })).tenant); }
    catch (e) { console.warn('[contracts/revise] sign tokens:', e.message); }
  }
  const notified = { tenant: false, coEmailed: [], coNoEmail: [] };
  const wasInvited = !!(c.signInviteTenantAt || archive.length);
  if (b.notify !== false && wasInvited) {
    let property = null;
    if (c.propertyId) { try { property = await fsGet('properties/' + c.propertyId); } catch (_) {} }
    let to = c.tenantEmail || '';
    if (!to && c.tenantId) { try { const u = await fsGet('users/' + c.tenantId); to = (u && u.email) || ''; } catch (_) {} }
    if (to && tenantUrl) {
      try {
        const r = await sendSignInvite({ contract: fresh, property, role: 'tenant', to, name: c.tenantName || '', url: tenantUrl, updated: true });
        notified.tenant = !!(r && r.ok);
      } catch (e) { console.warn('[contracts/revise] tenant invite:', e.message); }
    }
    try {
      const co = await inviteCoTenants({ contractId, contract: fresh, property, updated: true });
      notified.coEmailed = co.emailed; notified.coNoEmail = co.noEmail;
    } catch (e) { console.warn('[contracts/revise] co invite:', e.message); }
    if (notified.tenant) {
      try { await fsPatch('contracts/' + contractId, { signInviteTenantAt: new Date().toISOString() }); } catch (_) {}
    }
  }

  await logActivity('contract_revised', 'contract', {
    contractId, op, version: nextV, voided: archive.map(a => a.role + (a.coIndex != null ? a.coIndex : '')), note,
  }, by).catch(() => {});

  return res.status(200).json({
    ok: true, op, contractId, version: nextV, pdfUrl: fresh.generatedPDF, pages,
    voided: archive.map(a => ({ role: a.role, name: a.name, signedAt: a.signedAt })),
    notified,
    tenantSignUrl: tenantUrl,
    coTenants: coSignUrlsForPa(contractId, fresh).filter(x => !x.signed),
  });
}
