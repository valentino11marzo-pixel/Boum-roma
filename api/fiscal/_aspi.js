// api/fiscal/_aspi.js — L'ITER ASPI: registrazione + asseverazione in UN tap.
//
// Il flusso REALE dell'operatore, prima di questo modulo: contratto firmato
// → il fascicolo CAF arriva nella SUA casella (sendCafDossier →
// valentino@boom-rome.com) → lui lo inoltra A MANO al referente ASPI
// (Roberto Ubertini, geometra — ASPI, Roma via S. Nicola da Tolentino),
// ricordandosi ogni volta cosa serve: identità + contratto per la
// registrazione (€37), e in più APE + planimetria + scheda di calcolo del
// canone per l'attestazione di rispondenza (€100). Con dieci contratti al
// mese l'inoltro manuale è il collo di bottiglia e il pezzo dimenticato
// (l'APE che manca, il CF non raccolto) si scopre quando ASPI risponde.
//
// Qui l'iter diventa UNA operazione:
//   - aspiChecklist() dice PRIMA cosa c'è e cosa manca, per variante
//     (solo registrazione / registrazione+asseverazione) — la stessa
//     lista che il pannello del portal mostra e che l'email dichiara;
//   - sendAspiRequest() compone l'email strutturata al referente ASPI con
//     TUTTI gli allegati (contratto firmato, certificato FES, identità,
//     e per l'asseverazione fascicolo/APE/planimetria/visura), l'operatore
//     SEMPRE in copia, i link Storage come rete se un allegato sfora il
//     budget; stampa lo stato sul contratto (aspiRequestedAt/Kind/…,
//     registrationStatus:'sent' — i badge della pagina Burocrazia si
//     accendono da soli) e, se richiesto, CREA LA FATTURA al cliente con
//     il markup BOOM (costo pratica €37/€100 → prezzo €89/€189 di
//     default): da lì il 💳 link di pagamento esistente fa il resto.
//   - maybeAutoAspi() è l'opt-in "zero tap": con settings/registrazione
//     { auto: true } la richiesta parte DA SOLA alla firma completa
//     (best-effort dentro finalize, mai bloccante). Default OFF: un invio
//     a terzi che costa denaro resta una decisione dell'operatore finché
//     lui non decide altrimenti.
//
// Le manopole stanno in settings/registrazione (admin-only in lettura:
// contiene l'email personale del referente — la lezione dell'IBAN in
// settings/company); i default vivono QUI, esportati, così console e
// server non possono divergere (disciplina _avail.js / squadra-registry).
//
// Regole dure:
//   - senza un PDF del contratto NON si invia niente: una richiesta di
//     registrazione senza contratto è rumore nella casella del geometra;
//   - i mancanti non bloccano (l'operatore vede la checklist e decide) ma
//     viaggiano DICHIARATI nell'email — mai un fascicolo che sembra
//     completo e non lo è;
//   - la fattura è idempotente per costruzione (fsCreate con id
//     deterministico aspi_<kind>_<contractId> → 409 al secondo invio):
//     ripremere Invia rimanda l'email, MAI una seconda fattura;
//   - 'registered' non si degrada: registrationStatus passa a 'sent' solo
//     da pending/assente.

import { fsGet, fsCreate, fsPatch } from '../homie/_lib.js';
import { sendEmail } from '../agent/_lib.js';
import { shell, row, para, fine } from '../preagreement/_notify.js';
import { buildFascicolo } from './fascicolo.js';

const BASE = 'https://www.boomrome.com';
const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'valentino@boom-rome.com';

// ── Default (una copia sola: console e server leggono questi) ────────────
export const ASPI_DEFAULTS = {
  email: process.env.ASPI_EMAIL || 'roberto.ubertini@gmail.com',
  referente: 'Roberto Ubertini',
  organizzazione: 'ASPI — Roma, via San Nicola da Tolentino',
  sigla: 'ARPE',              // chi ATTESTA sulla scheda (come da timbro)
  cc: '',                     // copie extra (l'operatore è SEMPRE in copia)
  costoRegistrazione: 37,     // quanto ASPI fattura a BOOM per pratica
  costoAsseverazione: 100,
  prezzoRegistrazione: 89,    // quanto BOOM fattura al cliente (markup)
  prezzoAsseverazione: 189,
  billTo: 'landlord',         // 'landlord' | 'tenant'
  autoInvoice: true,          // proponi la fattura all'invio
  auto: false,                // invio automatico alla firma completa (opt-in)
};

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };
const clip = (v, n = 160) => String(v == null ? '' : v).trim().slice(0, n);

// settings/registrazione sopra i default — campi whitelisted e puliti, un
// valore vuoto non sovrascrive mai un default buono (mergeCompany-style).
export function mergeAspiSettings(saved) {
  const s = { ...ASPI_DEFAULTS };
  const src = saved && typeof saved === 'object' ? saved : {};
  if (clip(src.email, 120).includes('@')) s.email = clip(src.email, 120);
  if (clip(src.sigla, 40)) s.sigla = clip(src.sigla, 40);
  if (clip(src.referente)) s.referente = clip(src.referente, 80);
  if (clip(src.organizzazione)) s.organizzazione = clip(src.organizzazione, 120);
  if (clip(src.cc, 200).includes('@')) s.cc = clip(src.cc, 200);
  s.costoRegistrazione = num(src.costoRegistrazione, s.costoRegistrazione);
  s.costoAsseverazione = num(src.costoAsseverazione, s.costoAsseverazione);
  s.prezzoRegistrazione = num(src.prezzoRegistrazione, s.prezzoRegistrazione);
  s.prezzoAsseverazione = num(src.prezzoAsseverazione, s.prezzoAsseverazione);
  if (src.billTo === 'tenant' || src.billTo === 'landlord') s.billTo = src.billTo;
  if (typeof src.autoInvoice === 'boolean') s.autoInvoice = src.autoInvoice;
  if (typeof src.auto === 'boolean') s.auto = src.auto;
  return s;
}

export async function loadAspiSettings() {
  let saved = null;
  try { saved = await fsGet('settings/registrazione'); } catch (_) {}
  return mergeAspiSettings(saved);
}

// ── Le varianti dell'iter ────────────────────────────────────────────────
export const ASPI_KINDS = ['registrazione', 'completo', 'asseverazione'];
export const KIND_LABEL = {
  registrazione: 'Registrazione telematica (RLI)',
  completo: 'Registrazione RLI + attestazione di rispondenza',
  asseverazione: 'Attestazione di rispondenza (canone concordato)',
};
export const kindPrice = (kind, s) =>
  kind === 'completo' ? s.prezzoRegistrazione + s.prezzoAsseverazione
    : kind === 'asseverazione' ? s.prezzoAsseverazione : s.prezzoRegistrazione;
export const kindCost = (kind, s) =>
  kind === 'completo' ? s.costoRegistrazione + s.costoAsseverazione
    : kind === 'asseverazione' ? s.costoAsseverazione : s.costoRegistrazione;

// La variante di default la decide il contratto: requiresAsseverazione è
// già sul doc (checkbox del portal, true dal convert PA).
export const defaultKind = (contract) =>
  (contract && contract.requiresAsseverazione === false) ? 'registrazione' : 'completo';

// ── La checklist: cosa c'è, cosa manca, cosa blocca ──────────────────────
// state: 'ok' | 'warn' | 'missing'. blocking=true solo dove inviare senza
// sarebbe rumore (il contratto stesso). Tutto il resto avverte, non blocca
// — la lezione di checkSlot: l'operatore vede e decide.
export function aspiChecklist(contract, property, kind) {
  const c = contract || {};
  const p = property || {};
  const dossier = p.dossier || {};
  const docs = Array.isArray(c.identityDocs) ? c.identityDocs : [];
  const idTenant = docs.filter(d => d && d.url && d.kind !== 'extra' && d.role !== 'landlord');
  const idLandlord = docs.filter(d => d && d.url && d.kind !== 'extra' && d.role === 'landlord');
  const extras = docs.filter(d => d && d.url && d.kind === 'extra');
  const wantsAss = kind === 'completo' || kind === 'asseverazione';
  const studenti = c.type === 'studenti';

  const items = [];
  const push = (key, label, state, url, hint) => items.push({ key, label, state, url: url || '', hint: hint || '' });

  const contractUrl = c.signedPdfUrl || c.generatedPDF || '';
  if (c.signedPdfUrl) push('contratto', 'Contratto firmato (PDF con firme)', 'ok', c.signedPdfUrl);
  else if (c.generatedPDF) push('contratto', 'Contratto (PDF non firmato digitalmente)', 'warn', c.generatedPDF,
    'firma su carta? il PDF allegato è senza firme — se hai la scansione firmata mandala in risposta alla stessa email');
  else push('contratto', 'Contratto (PDF)', 'missing', '',
    'genera il PDF dalla riga contratto (🔄 Rigenera PDF) — senza contratto la richiesta NON parte');
  items[items.length - 1].blocking = !contractUrl;

  push('id_conduttore', 'Documento identità conduttore', idTenant.length ? 'ok' : 'missing', idTenant[0] && idTenant[0].url,
    idTenant.length ? '' : 'manda al conduttore il suo link /scheda (Share Hub) — upload con OCR');
  push('id_locatore', 'Documento identità locatore', idLandlord.length ? 'ok' : 'missing', idLandlord[0] && idLandlord[0].url,
    idLandlord.length ? '' : 'link /scheda lato locatore (Share Hub)');
  push('cf_conduttore', 'Codice Fiscale conduttore', c.tenantCF ? 'ok' : 'missing', '',
    c.tenantCF ? '' : 'si raccoglie da /scheda o /sign');
  push('cf_locatore', 'Codice Fiscale locatore', c.landlordCF ? 'ok' : 'missing', '',
    c.landlordCF ? '' : 'si raccoglie da /scheda locatore');
  push('esigenza', studenti ? 'Attestazione iscrizione universitaria' : 'Attestazione esigenza transitoria',
    extras.length ? 'ok' : 'warn', extras[0] && extras[0].url,
    extras.length ? '' : 'console PA (documenti richiesti) o pagina accettazione del cliente');

  if (wantsAss) {
    const fits = c.canoneScheda && c.canoneScheda.fits;
    if (!c.fascicoloFiscaleUrl) push('scheda_canone', 'Scheda di calcolo canone (Fascicolo Fiscale)', 'missing', '',
      'si genera automaticamente all\'invio (o da 📑 Fascicolo): il foglio esce sempre, senza zona o mq resta da completare a mano');
    else if (fits === false) push('scheda_canone', 'Scheda di calcolo canone — CANONE FUORI FASCIA', 'warn', c.fascicoloFiscaleUrl,
      'l\'organizzazione non può attestare un canone sopra il massimo di fascia: riporta il canone o verifica i parametri da 📑 Fascicolo');
    else push('scheda_canone', 'Scheda di calcolo canone (Fascicolo Fiscale)', 'ok', c.fascicoloFiscaleUrl);
    push('ape', 'APE — Attestato di Prestazione Energetica', dossier.ape && dossier.ape.url ? 'ok' : 'missing',
      dossier.ape && dossier.ape.url, dossier.ape ? '' : 'console pre-agreement → 📦 Fascicolo ARPE (si carica UNA volta per immobile)');
    push('planimetria', 'Planimetria', dossier.planimetria && dossier.planimetria.url ? 'ok' : 'missing',
      dossier.planimetria && dossier.planimetria.url, dossier.planimetria ? '' : 'console pre-agreement → 📦 Fascicolo ARPE');
    push('visura', 'Visura catastale', dossier.visura && dossier.visura.url ? 'ok' : 'warn',
      dossier.visura && dossier.visura.url, dossier.visura ? '' : 'utile ma non indispensabile — Fascicolo ARPE');
    push('delega', 'Delega ARPE firmata', dossier.delega && dossier.delega.url ? 'ok' : 'warn',
      dossier.delega && dossier.delega.url, dossier.delega ? '' : 'se ASPI la richiede: Fascicolo ARPE');
  }

  return items;
}

export const checklistMissing = (items) =>
  items.filter(i => i.state !== 'ok').map(i => i.label);
export const checklistBlocked = (items) => items.some(i => i.blocking);

// ── Email al referente ASPI ──────────────────────────────────────────────
const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
const eur = n => (n == null || n === '') ? '—' : '€' + Number(n).toLocaleString('it-IT');
const dIT = s => { try { const d = new Date(String(s).slice(0, 10) + 'T00:00'); return isNaN(d) ? '—' : d.toLocaleDateString('it-IT'); } catch { return '—'; } };

export function buildAspiEmail({ contract, property, kind, checklist, settings, note, attachedNames }) {
  const c = contract, p = property || {};
  const propLabel = p.address || p.name || 'immobile';
  const firstName = String(settings.referente || '').split(/\s+/)[0] || 'gentile referente';
  const studenti = c.type === 'studenti';
  const wantsAss = kind !== 'registrazione';
  const ask = kind === 'completo'
    ? 'la <b>registrazione telematica</b> del contratto allegato e l\'<b>attestazione di rispondenza</b> del canone concordato'
    : kind === 'asseverazione'
      ? 'l\'<b>attestazione di rispondenza</b> del canone concordato per il contratto allegato'
      : 'la <b>registrazione telematica</b> del contratto allegato';

  const missing = checklist.filter(i => i.state !== 'ok');
  const okDocs = checklist.filter(i => i.state === 'ok' || (i.state === 'warn' && i.url));

  const html = shell(
    para(`Buongiorno ${esc(firstName)},`)
    + para(`ti chiediamo ${ask}. Trovi in allegato tutta la documentazione; qui sotto il riepilogo del contratto.`)
    + `<table width="100%" cellpadding="0" cellspacing="0" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;margin-top:8px">
        ${row('Immobile', `<b>${esc('ROMA — ' + propLabel)}</b>`, [p.cadastralData || c.cadastral ? 'Catasto: ' + (p.cadastralData || c.cadastral) : null, p.sqm ? p.sqm + ' mq' : null, (c.energyClass || p.energyClass) ? 'Classe ' + (c.energyClass || p.energyClass) : null].filter(Boolean).map(esc).join(' · ') || null)}
        ${row('Locatore', `<b>${esc(c.landlordName || '—')}</b>`, [c.landlordCF ? 'CF ' + c.landlordCF : null, c.landlordDob ? 'nato/a ' + dIT(c.landlordDob) + (c.landlordPob ? ' a ' + c.landlordPob : '') : null, c.landlordAddress ? 'res. ' + c.landlordAddress : null].filter(Boolean).map(esc).join(' · ') || null)}
        ${row('Conduttore', `<b>${esc(c.tenantName || '—')}</b>`, [c.tenantCF ? 'CF ' + c.tenantCF : null, c.tenantDob ? 'nato/a ' + dIT(c.tenantDob) + (c.tenantPob ? ' a ' + c.tenantPob : '') : null, c.tenantNationality || null].filter(Boolean).map(esc).join(' · ') || null)}
        ${row('Contratto', `<b>${esc(studenti ? 'Studenti universitari (art. 5 c.2 L.431/98)' : 'Transitorio (art. 5 c.1 L.431/98)')}</b>`, [
            `${dIT(c.startDate)} - ${dIT(c.endDate)}`,
            `canone ${eur(c.rent)}/mese`,
            `deposito ${eur(c.deposit)}`,
            `cedolare secca: ${(c.cedolareSecca || 'si') !== 'no' ? 'SI' : 'NO'}`,
          ].map(esc).join(' · '))}
        ${wantsAss && c.canoneScheda && c.canoneScheda.zonaCod ? row('Canone concordato', `<b>${esc('zona ' + c.canoneScheda.zonaCod + (c.canoneScheda.zonaNome ? ' — ' + c.canoneScheda.zonaNome : ''))}</b>`, [c.canoneScheda.fascia ? 'fascia ' + c.canoneScheda.fascia : null, c.canoneScheda.cMax ? 'max asseverabile ' + eur(c.canoneScheda.cMax) + '/mese' : null, c.canoneScheda.fits === false ? 'ATTENZIONE: canone pattuito FUORI fascia' : null].filter(Boolean).map(esc).join(' · ') || null) : ''}
        ${row('Allegati', okDocs.map(i => i.url ? `<a href="${esc(i.url)}" style="color:#8A6D1D">${esc(i.label)}</a>` : esc(i.label)).join('<br>') || '—',
          attachedNames && attachedNames.length ? attachedNames.length + ' file in allegato a questa email; i link restano validi in ogni caso' : 'documenti raggiungibili dai link')}
      </table>`
    + (missing.length
      ? `<div style="margin:16px 0;padding:12px 14px;background:#FBF3E4;border:1px solid #E5C878;border-radius:8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#6b5620">
           <b>Non ancora nel fascicolo (${missing.length}):</b><br>${missing.map(i => '· ' + esc(i.label)).join('<br>')}<br>
           <span style="font-size:12px">Li facciamo seguire appena disponibili — se qualcosa è indispensabile per procedere, rispondi a questa email.</span>
         </div>`
      : '')
    + (note ? para('Nota: ' + esc(note)) : '')
    + para('Per qualsiasi cosa rispondi pure a questa email — arriva direttamente a Valentino (BOOM · Egidi Immobiliare).')
    + fine('BOOM Roma · Egidi Immobiliare S.r.l. — Via dei Coronari 181/184, 00186 Roma · P.IVA 17322991005', 'text-align:center'),
    `${KIND_LABEL[kind]} — ${propLabel}`);

  return {
    subject: `${KIND_LABEL[kind]} — ${propLabel} · ${c.tenantName || c.id || ''}`.slice(0, 160),
    html,
  };
}

// ── Allegati (best-effort, budget 18MB — i link nel corpo restano) ───────
async function fetchAttachment(url, filename, contentType) {
  if (!url) return null;
  try {
    const r = await Promise.race([
      fetch(url),
      new Promise((_, rej) => setTimeout(() => rej(new Error('att_timeout')), 8000)),
    ]);
    if (!r || !r.ok) return null;
    const content = Buffer.from(await r.arrayBuffer());
    if (!content.length || content.length > 8 * 1024 * 1024) return null;
    return contentType ? { filename, content, contentType } : { filename, content };
  } catch (e) { console.warn('[aspi] attachment', filename, e.message); return null; }
}

const safeName = (s, n = 40) => String(s || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, n);
const extOf = (url, fallback) => {
  const m = /\.([a-z0-9]{2,4})(?:\?|$)/i.exec(String(url || '').split('%2F').pop() || '');
  return m ? '.' + m[1].toLowerCase() : fallback;
};

// ── L'operazione: componi, invia, stampa lo stato, fattura ──────────────
// opts: { kind, note, bill, preloaded:{contract,property}, overrides:{signedPdfUrl,certUrl,fascicoloUrl} }
export async function sendAspiRequest(contractId, opts = {}) {
  if (!contractId) return { ok: false, error: 'contract_required' };
  const settings = opts.settings || await loadAspiSettings();

  const contract = (opts.preloaded && opts.preloaded.contract) || await fsGet('contracts/' + contractId);
  if (!contract) return { ok: false, error: 'contract_not_found' };
  contract.id = contractId;
  const property = (opts.preloaded && opts.preloaded.property)
    || (contract.propertyId ? await fsGet('properties/' + contract.propertyId).catch(() => null) : null) || {};

  const ov = opts.overrides || {};
  if (ov.signedPdfUrl && !contract.signedPdfUrl) contract.signedPdfUrl = ov.signedPdfUrl;
  if (ov.certUrl && !contract.signingCertificateUrl) contract.signingCertificateUrl = ov.certUrl;
  if (ov.fascicoloUrl && !contract.fascicoloFiscaleUrl) contract.fascicoloFiscaleUrl = ov.fascicoloUrl;

  // fallback nomi come fa il pack: il fascicolo non stampa mai "—" evitabili
  if (!contract.tenantName && contract.tenantId) {
    try { const t = await fsGet('users/' + contract.tenantId); if (t && t.name) contract.tenantName = t.name; } catch (_) {}
  }
  if (!contract.landlordName && property.ownerId) {
    try { const l = await fsGet('users/' + property.ownerId); if (l && l.name) contract.landlordName = l.name; } catch (_) {}
  }

  const kind = ASPI_KINDS.includes(opts.kind) ? opts.kind : defaultKind(contract);
  const wantsAss = kind !== 'registrazione';

  // Per l'asseverazione la scheda di calcolo È il fascicolo fiscale: se
  // manca si genera QUI (best-effort — senza zona/mq il PDF nasce comunque
  // con le pagine RLI e la checklist lo dichiara).
  if (wantsAss && !contract.fascicoloFiscaleUrl) {
    try {
      const fasc = await buildFascicolo(contractId, { contract, property });
      if (fasc && fasc.ok) contract.fascicoloFiscaleUrl = fasc.url;
    } catch (e) { console.warn('[aspi] fascicolo:', e.message); }
  }

  const checklist = aspiChecklist(contract, property, kind);
  if (checklistBlocked(checklist)) {
    return { ok: false, error: 'contratto_pdf_mancante', checklist };
  }

  // ── Allegati: contratto, certificato, identità (+ asseverazione set) ──
  const wanted = [];
  wanted.push([contract.signedPdfUrl || contract.generatedPDF, 'BOOM_Contratto' + (contract.signedPdfUrl ? '_firmato' : '') + '.pdf', 'application/pdf']);
  if (contract.signingCertificateUrl) wanted.push([contract.signingCertificateUrl, 'BOOM_Certificato_firma_FES.pdf', 'application/pdf']);
  const docs = (Array.isArray(contract.identityDocs) ? contract.identityDocs : []).filter(d => d && d.url);
  const seen = new Set();
  let idN = 0, exN = 0;
  for (const d of docs.slice(0, 8)) {
    if (seen.has(d.url)) continue; seen.add(d.url);
    if (d.kind === 'extra') { exN++; wanted.push([d.url, 'Attestazione_esigenza_' + exN + extOf(d.url, '.pdf'), null]); }
    else { idN++; wanted.push([d.url, 'Documento_' + (d.role === 'landlord' ? 'locatore' : 'conduttore') + '_' + idN + '_' + safeName(d.name || 'id') + extOf(d.url, '.jpg'), null]); }
  }
  if (wantsAss) {
    if (contract.fascicoloFiscaleUrl) wanted.push([contract.fascicoloFiscaleUrl, 'BOOM_Scheda_calcolo_canone_Fascicolo_Fiscale.pdf', 'application/pdf']);
    const dossier = property.dossier || {};
    if (dossier.ape && dossier.ape.url) wanted.push([dossier.ape.url, 'APE' + extOf(dossier.ape.url, '.pdf'), null]);
    if (dossier.planimetria && dossier.planimetria.url) wanted.push([dossier.planimetria.url, 'Planimetria' + extOf(dossier.planimetria.url, '.pdf'), null]);
    if (dossier.visura && dossier.visura.url) wanted.push([dossier.visura.url, 'Visura_catastale' + extOf(dossier.visura.url, '.pdf'), null]);
    if (dossier.delega && dossier.delega.url) wanted.push([dossier.delega.url, 'Delega_ARPE' + extOf(dossier.delega.url, '.pdf'), null]);
  }

  const attachments = [];
  let budget = 18 * 1024 * 1024;
  for (const [url, name, ct] of wanted) {
    if (budget <= 0) break;
    const att = await fetchAttachment(url, name, ct);
    if (att && att.content.length <= budget) { attachments.push(att); budget -= att.content.length; }
  }

  const { subject, html } = buildAspiEmail({
    contract, property, kind, checklist, settings,
    note: clip(opts.note, 500), attachedNames: attachments.map(a => a.filename),
  });

  // Operatore SEMPRE in copia: l'email È il registro dell'invio.
  const cc = [ADMIN_EMAIL, settings.cc].filter(Boolean).join(', ');
  try {
    await Promise.race([
      sendEmail({ to: settings.email, cc, subject, html, attachments }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('email_timeout')), 25000)),
    ]);
  } catch (e) {
    console.warn('[aspi] send failed:', e.message);
    return { ok: false, error: 'email_failed', detail: e.message, checklist };
  }

  const missing = checklistMissing(checklist);

  // ── Stato sul contratto (i badge Burocrazia leggono registrationStatus) ─
  const patch = {
    aspiRequestedAt: new Date().toISOString(),
    aspiRequestKind: kind,
    aspiRequestTo: settings.email,
    aspiRequestMissing: missing,
    aspiRequestCount: (Number(contract.aspiRequestCount) || 0) + 1,
  };
  if (kind !== 'asseverazione' && contract.registrationStatus !== 'registered') {
    patch.registrationStatus = 'sent';
  }
  try { await fsPatch('contracts/' + contractId, patch); } catch (e) { console.warn('[aspi] patch:', e.message); }

  // ── La fattura col markup (idempotente: un kind, una fattura) ─────────
  const bill = opts.bill !== undefined ? !!opts.bill : settings.autoInvoice;
  let invoice = null;
  if (bill) {
    const amount = kindPrice(kind, settings);
    const toTenant = settings.billTo === 'tenant';
    const recipientId = toTenant ? (contract.tenantId || '') : (property.ownerId || contract.landlordId || '');
    const recipientName = toTenant ? (contract.tenantName || '') : (contract.landlordName || '');
    const invId = `aspi_${kind}_${contractId}`;
    const propLabel = property.address || property.name || '';
    try {
      await fsCreate('invoices', {
        number: 'BOOM-ASPI-' + safeName(contractId, 10).toUpperCase(),
        recipientId, clientId: recipientId,
        recipientType: toTenant ? 'tenant' : 'landlord',
        recipientName,
        service: KIND_LABEL[kind],
        amount,
        date: new Date().toISOString().slice(0, 10),
        description: `${propLabel} — contratto ${contractId}. Pratica gestita da BOOM: preparazione fascicolo, invio, follow-up e archivio.`,
        status: 'pending',
        source: 'aspi',
        contractId,
        createdAt: new Date().toISOString(),
      }, invId);
      invoice = { id: invId, amount, created: true };
    } catch (e) {
      // 409 = fattura già emessa a un invio precedente: MAI duplicare.
      invoice = e && e.exists ? { id: invId, amount, created: false } : null;
      if (!(e && e.exists)) console.warn('[aspi] invoice:', e.message);
    }
  }

  return {
    ok: true, kind, to: settings.email,
    attachments: attachments.map(a => a.filename),
    missing, invoice,
    cost: kindCost(kind, settings), price: kindPrice(kind, settings),
  };
}

// ── Zero tap (opt-in): la richiesta parte da sola alla firma completa ───
// Chiamata da _finalize.js DOPO le welcome/CAF, best-effort e time-boxed
// dal chiamante. settings/registrazione.auto default false: finché
// l'operatore non gira la manopola, questo è un no-op silenzioso.
export async function maybeAutoAspi(contract, overrides = {}) {
  try {
    const settings = await loadAspiSettings();
    if (!settings.auto) return { skipped: 'off' };
    return await sendAspiRequest(contract.id, {
      settings, overrides,
      preloaded: { contract },
      kind: defaultKind(contract),
    });
  } catch (e) {
    console.warn('[aspi] auto:', e.message);
    return { ok: false, error: e.message };
  }
}
