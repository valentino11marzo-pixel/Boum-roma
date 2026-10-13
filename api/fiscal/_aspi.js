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
//     ripremere Invia rimanda l'email, MAI una seconda fattura. E si
//     fattura il SERVIZIO, non la variante (13/10/2026): il «completo»
//     comprende registrazione e attestazione, quindi un'attestazione chiesta
//     dopo il completo (contratto poi segnato ✓ RLI registrato) non crea
//     un'altra fattura da €189, e un completo dopo la sola registrazione
//     fattura solo la parte che manca (aspiInvoicePlan);
//   - 'registered' non si degrada: registrationStatus passa a 'sent' solo
//     da pending/assente.

import { fsGet, fsCreate, fsPatch } from '../homie/_lib.js';
import { sendEmail } from '../agent/_lib.js';
import { shell, row, para, fine } from '../preagreement/_notify.js';
import { buildFascicolo } from './fascicolo.js';
// Il dizionario del contratto: i campi di parte risalgono la catena users
// come nel PDF, così la checklist non dice «CF mancante» a un CF che c'è.
import FIELDS from '../../js/contract-fields.js';
// Carta e segnaposto: il contratto firmato su carta si allega come SCANSIONE
// (paperPdfUrl), un segnaposto non ha un contratto da mandare.
import CS from '../../js/contract-state.js';

const BASE = 'https://www.boomrome.com';
const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'valentino@boom-rome.com';

// ── Default (una copia sola: console e server leggono questi) ────────────
export const ASPI_DEFAULTS = {
  email: process.env.ASPI_EMAIL || 'roberto.ubertini@gmail.com',
  referente: 'Roberto Ubertini',
  organizzazione: 'ASPI — Roma, via San Nicola da Tolentino',
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

// Il contratto è GIÀ registrato all'AdE? (✓ RLI registrato, la colonna
// «Registrato il» della presa in carico, o lo stato 'registered'.) Allora ad
// ASPI si chiede SOLO l'attestazione: una seconda richiesta di registrazione
// (con la sua fattura) è un errore che costa. Ritorna la data se c'è, true
// se lo dice solo lo stato, null altrimenti.
export function registeredAt(contract) {
  const c = contract || {};
  const at = String(c.rliRegisteredAt || '').trim();
  if (at) return at;
  return c.registrationStatus === 'registered' ? true : null;
}
// La variante proposta: su un registrato, solo l'attestazione — e niente
// del tutto se il contratto la dichiara non richiesta (requiresAsseverazione
// false: compliance-rules la dà 'na'). Proporre e fatturare un servizio che
// il contratto dichiara non dovuto è l'errore che costa (null = nulla da
// chiedere ad ASPI).
export const kindFor = (contract) => {
  if (registeredAt(contract)) return contract && contract.requiresAsseverazione === false ? null : 'asseverazione';
  return defaultKind(contract);
};

// Le richieste già fatte, per variante: { completo: '<iso>', … } — la PRIMA
// volta che ciascuna è partita. aspiRequestKind resta l'ultima (lo leggono
// il portal e i badge); per i contratti nati prima della mappa vale quella.
export function aspiRequestsOf(contract) {
  const c = contract || {}, out = {};
  const m = c.aspiRequestsAt && typeof c.aspiRequestsAt === 'object' ? c.aspiRequestsAt : {};
  for (const k of ASPI_KINDS) if (typeof m[k] === 'string' && m[k]) out[k] = m[k];
  if (ASPI_KINDS.includes(c.aspiRequestKind) && !out[c.aspiRequestKind]) out[c.aspiRequestKind] = String(c.aspiRequestedAt || '') || true;
  return out;
}
// Cosa è già stato chiesto, per SERVIZIO: il completo copre registrazione e
// attestazione. → { registrazione: {kind, at}|null, asseverazione: {kind, at}|null }
export function aspiAlready(contract) {
  const r = aspiRequestsOf(contract);
  const pick = (own) => r.completo ? { kind: 'completo', at: r.completo === true ? null : r.completo }
    : r[own] ? { kind: own, at: r[own] === true ? null : r[own] } : null;
  return { registrazione: pick('registrazione'), asseverazione: pick('asseverazione') };
}

// LA FATTURA PER SERVIZIO. Dalle fatture ASPI già emesse per il contratto
// (existing: { registrazione?, completo?, asseverazione? } → il documento),
// cosa fatturare per la variante chiesta:
//   → { bill: <variante da fatturare>|null, covered: { R?: '<id>', A?: '<id>' } }
// Il completo copre entrambe le componenti; una fattura annullata non copre.
// Pura: si testa senza rete.
const COMPONENTS = { registrazione: ['R'], asseverazione: ['A'], completo: ['R', 'A'] };
const voidInvoice = (d) => /^(cancelled|canceled|void|voided)$/i.test(String((d && d.status) || ''));
export function aspiInvoicePlan(kind, existing, contractId) {
  const ex = existing || {};
  const has = (k) => !!(ex[k] && !voidInvoice(ex[k]));
  const id = (k) => `aspi_${k}_${contractId}`;
  const coverOf = (comp) => has('completo') ? id('completo') : has(comp === 'R' ? 'registrazione' : 'asseverazione') ? id(comp === 'R' ? 'registrazione' : 'asseverazione') : '';
  const covered = {}, need = [];
  for (const comp of COMPONENTS[kind] || []) { const by = coverOf(comp); if (by) covered[comp] = by; else need.push(comp); }
  const bill = need.length === 2 ? 'completo' : need[0] === 'R' ? 'registrazione' : need[0] === 'A' ? 'asseverazione' : null;
  return { bill, covered };
}

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

  // Il contratto da mandare. Tre nature diverse, tre righe diverse:
  //  · segnaposto (contractMissing): l'interno è occupato ma il contratto
  //    non è in archivio — niente da registrare finché non arriva;
  //  · firmato SU CARTA (signatureStatus 'paper', presa in carico del
  //    Palazzo): vale SOLO la scansione firmata (paperPdfUrl). Il PDF del
  //    modello BOOM non è quel contratto — prima la riga suggeriva «🔄
  //    Rigenera PDF», cioè di mandare all'associazione un documento DIVERSO
  //    da quello firmato con la proprietà;
  //  · digitale: il firmato, o il generato dichiarandolo.
  let contractUrl = '';
  if (CS.isPlaceholder(c)) {
    push('contratto', 'Contratto (non ancora in archivio)', 'missing', '',
      'il contratto di questo interno non è in archivio: caricalo dal Palazzo (riga con canone e date) prima della registrazione');
  } else if (CS.isPaper(c)) {
    contractUrl = c.paperPdfUrl || '';
    if (contractUrl) push('contratto', 'Contratto firmato su carta (scansione)', 'ok', contractUrl);
    else push('contratto', 'Contratto firmato su carta (scansione)', 'missing', '',
      // L'istruzione dice SOLO dove si può fare davvero: il pannello ASPI
      // del portal non offre ancora il 📎 su questa riga (13/10/2026), il
      // Palazzo sì. `allegabile` è il segnale per il pannello: quando lo
      // legge, il 📎 compare qui e fiscal/allega lo accetta già (key
      // 'contratto' → paperPdfUrl, solo PDF).
      'carica la scansione del contratto firmato su carta dal Palazzo (scheda dell\'interno) — il modello BOOM non è quel contratto');
    items[items.length - 1].allegabile = true;   // anche a scansione presente: si può sostituire
    items[items.length - 1].accept = 'application/pdf';
  } else {
    contractUrl = c.signedPdfUrl || c.generatedPDF || '';
    if (c.signedPdfUrl) push('contratto', 'Contratto firmato (PDF con firme)', 'ok', c.signedPdfUrl);
    else if (c.generatedPDF) push('contratto', 'Contratto (PDF non firmato digitalmente)', 'warn', c.generatedPDF,
      'firma su carta? il PDF allegato è senza firme — se hai la scansione firmata mandala in risposta alla stessa email');
    else push('contratto', 'Contratto (PDF)', 'missing', '',
      'genera il PDF dalla riga contratto (🔄 Rigenera PDF) — senza contratto la richiesta NON parte');
  }
  items[items.length - 1].blocking = !contractUrl;

  push('id_conduttore', 'Documento identità conduttore', idTenant.length ? 'ok' : 'missing', idTenant[0] && idTenant[0].url,
    idTenant.length ? '' : 'manda al conduttore il suo link /scheda (Share Hub) — upload con OCR');
  push('id_locatore', 'Documento identità locatore', idLandlord.length ? 'ok' : 'missing', idLandlord[0] && idLandlord[0].url,
    idLandlord.length ? '' : 'link /scheda lato locatore (Share Hub)');
  push('cf_conduttore', 'Codice Fiscale conduttore', c.tenantCF ? 'ok' : 'missing', '',
    c.tenantCF ? '' : 'si raccoglie da /scheda o /sign');
  push('cf_locatore', 'Codice Fiscale locatore', c.landlordCF ? 'ok' : 'missing', '',
    c.landlordCF ? '' : 'si raccoglie da /scheda locatore');
  // Il 3+2 (Allegato A) non ha un'esigenza da attestare.
  if (c.type !== '3+2') push('esigenza', studenti ? 'Attestazione iscrizione universitaria' : 'Attestazione esigenza transitoria',
    extras.length ? 'ok' : 'warn', extras[0] && extras[0].url,
    extras.length ? '' : 'console PA (documenti richiesti) o pagina accettazione del cliente');

  if (wantsAss) {
    const fits = c.canoneScheda && c.canoneScheda.fits;
    // La scheda e' l'Allegato 2/B dell'accordo, 1:1 col modulo ARPE: da sola
    // (schedaCanoneUrl) o come pagina 1 del Fascicolo Fiscale (legacy).
    const schedaUrl = c.schedaCanoneUrl || c.fascicoloFiscaleUrl || '';
    if (!schedaUrl) push('scheda_canone', 'Scheda di calcolo canone (Allegato 2/B ARPE)', 'missing', '',
      'si genera automaticamente all\'invio (o da 📑 Fascicolo); servono zona accordo e mq');
    else if (fits === false) push('scheda_canone', 'Scheda di calcolo canone (Allegato 2/B ARPE) — CANONE FUORI FASCIA', 'warn', schedaUrl,
      'un canone sopra il massimo di fascia non e\' attestabile: riporta il canone o verifica i parametri da 📑 Fascicolo');
    else push('scheda_canone', 'Scheda di calcolo canone (Allegato 2/B ARPE)', 'ok', schedaUrl);
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
  // Un segnaposto non si registra: non c'è un contratto da mandare (né un
  // fascicolo da generare sui puntini). Lo si dice, non si spedisce niente.
  if (CS.isPlaceholder(contract)) return { ok: false, error: 'contract_missing' };
  // Già registrato: mai una seconda richiesta di registrazione (né la sua
  // fattura, né l'email) — solo l'attestazione si può ancora chiedere.
  const reg0 = registeredAt(contract);
  const kind0 = ASPI_KINDS.includes(opts.kind) ? opts.kind : kindFor(contract);
  if (reg0 && kind0 && kind0 !== 'asseverazione') return { ok: false, error: 'already_registered', at: reg0 === true ? null : reg0, kind: kind0 };
  // Registrato e attestazione dichiarata NON richiesta: non resta niente da
  // chiedere ad ASPI (nessuna email, nessuna fattura), qualunque variante.
  if (reg0 && (!kind0 || contract.requiresAsseverazione === false)) return { ok: false, error: 'not_required', at: reg0 === true ? null : reg0, kind: kind0 || null };
  const property = (opts.preloaded && opts.preloaded.property)
    || (contract.propertyId ? await fsGet('properties/' + contract.propertyId).catch(() => null) : null) || {};

  const ov = opts.overrides || {};
  if (ov.signedPdfUrl && !contract.signedPdfUrl) contract.signedPdfUrl = ov.signedPdfUrl;
  if (ov.certUrl && !contract.signingCertificateUrl) contract.signingCertificateUrl = ov.certUrl;
  if (ov.fascicoloUrl && !contract.fascicoloFiscaleUrl) contract.fascicoloFiscaleUrl = ov.fascicoloUrl;
  if (ov.schedaPdfUrl && !contract.schedaCanoneUrl) contract.schedaCanoneUrl = ov.schedaPdfUrl;

  // fallback nomi come fa il pack: il fascicolo non stampa mai "—" evitabili
  if (!contract.tenantName && contract.tenantId) {
    try { const t = await fsGet('users/' + contract.tenantId); if (t && t.name) contract.tenantName = t.name; } catch (_) {}
  }
  if (!contract.landlordName && property.ownerId) {
    try { const l = await fsGet('users/' + property.ownerId); if (l && l.name) contract.landlordName = l.name; } catch (_) {}
  }

  // I campi di parte risalgono la catena users come nel PDF (un CF presente
  // solo sul profilo non è «mancante»).
  try {
    const tU = contract.tenantId ? await fsGet('users/' + contract.tenantId).catch(() => null) : null;
    const lU = property.ownerId ? await fsGet('users/' + property.ownerId).catch(() => null) : null;
    const lR = property.ownerId ? await fsGet('landlords/' + property.ownerId).catch(() => null) : null;
    Object.assign(contract, FIELDS.hydrateParties(contract, tU, { ...(lR || {}), ...(lU || {}) }, property));
  } catch (_) {}

  const kind = kind0;
  const wantsAss = kind !== 'registrazione';

  // Per l'asseverazione la scheda di calcolo È il fascicolo fiscale: se
  // manca si genera QUI (best-effort — senza zona/mq il PDF nasce comunque
  // con le pagine RLI e la checklist lo dichiara).
  if (wantsAss && !contract.fascicoloFiscaleUrl) {
    try {
      const fasc = await buildFascicolo(contractId, { contract, property });
      if (fasc && fasc.ok) { contract.fascicoloFiscaleUrl = fasc.url; if (fasc.schedaUrl) contract.schedaCanoneUrl = fasc.schedaUrl; }
    } catch (e) { console.warn('[aspi] fascicolo:', e.message); }
  }

  const checklist = aspiChecklist(contract, property, kind);
  if (checklistBlocked(checklist)) {
    return { ok: false, error: 'contratto_pdf_mancante', checklist };
  }

  // ── Allegati: contratto, certificato, identità (+ asseverazione set) ──
  const wanted = [];
  if (CS.isPaper(contract)) wanted.push([contract.paperPdfUrl, 'Contratto_firmato_su_carta.pdf', 'application/pdf']);
  else wanted.push([contract.signedPdfUrl || contract.generatedPDF, 'BOOM_Contratto' + (contract.signedPdfUrl ? '_firmato' : '') + '.pdf', 'application/pdf']);
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
    // Ad ARPE va la scheda DA SOLA (Allegato 2/B); il fascicolo intero solo
    // per i contratti nati prima che la scheda avesse il suo PDF.
    const schedaHref = contract.schedaCanoneUrl || contract.fascicoloFiscaleUrl;
    if (schedaHref) wanted.push([schedaHref, 'BOOM_Scheda_calcolo_canone_ARPE.pdf', 'application/pdf']);
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
  const nowIso = new Date().toISOString();
  // Le richieste per variante: la prima volta di ciascuna resta (il pannello
  // dice «attestazione già richiesta col completo del …»).
  const requests = aspiRequestsOf(contract);
  const requestsAt = {};
  for (const k of Object.keys(requests)) if (typeof requests[k] === 'string') requestsAt[k] = requests[k];
  if (!requestsAt[kind]) requestsAt[kind] = nowIso;
  const patch = {
    aspiRequestedAt: nowIso,
    aspiRequestKind: kind,
    aspiRequestsAt: requestsAt,
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
    // Le fatture ASPI già emesse per questo contratto, per variante: si
    // fattura solo il SERVIZIO che nessuna copre (il completo copre tutto).
    const existing = {};
    await Promise.all(ASPI_KINDS.map(async (k) => {
      const d = await fsGet(`invoices/aspi_${k}_${contractId}`).catch(() => null);
      if (d) existing[k] = d;
    }));
    const plan = aspiInvoicePlan(kind, existing, contractId);
    const coveredBy = {};
    if (plan.covered.R) coveredBy.registrazione = plan.covered.R;
    if (plan.covered.A) coveredBy.asseverazione = plan.covered.A;
    if (!plan.bill) {
      // Tutto già fatturato: nessuna fattura nuova. Si dice da quale.
      const ownId = `aspi_${kind}_${contractId}`;
      const by = existing[kind] ? ownId : (plan.covered.A || plan.covered.R || ownId);
      invoice = existing[kind]
        ? { id: ownId, amount: kindPrice(kind, settings), created: false }
        : { id: by, amount: null, created: false, coveredBy };
    } else {
      const billKind = plan.bill;
      const amount = kindPrice(billKind, settings);
      const toTenant = settings.billTo === 'tenant';
      const recipientId = toTenant ? (contract.tenantId || '') : (property.ownerId || contract.landlordId || '');
      const recipientName = toTenant ? (contract.tenantName || '') : (contract.landlordName || '');
      const invId = `aspi_${billKind}_${contractId}`;
      const propLabel = property.address || property.name || '';
      const part = billKind !== kind ? ` Parte della richiesta «${KIND_LABEL[kind]}»: ${coveredBy.registrazione ? 'la registrazione' : 'l’attestazione'} è già fatturata (${coveredBy.registrazione || coveredBy.asseverazione}).` : '';
      try {
        await fsCreate('invoices', {
          number: 'BOOM-ASPI-' + safeName(contractId, 10).toUpperCase(),
          recipientId, clientId: recipientId,
          recipientType: toTenant ? 'tenant' : 'landlord',
          recipientName,
          service: KIND_LABEL[billKind],
          amount,
          date: new Date().toISOString().slice(0, 10),
          description: `${propLabel} — contratto ${contractId}. Pratica gestita da BOOM: preparazione fascicolo, invio, follow-up e archivio.${part}`,
          status: 'pending',
          source: 'aspi',
          contractId,
          createdAt: new Date().toISOString(),
        }, invId);
        invoice = { id: invId, amount, created: true, ...(billKind !== kind ? { billed: billKind, coveredBy } : {}) };
      } catch (e) {
        // 409 = fattura già emessa a un invio precedente: MAI duplicare.
        invoice = e && e.exists ? { id: invId, amount, created: false } : null;
        if (!(e && e.exists)) console.warn('[aspi] invoice:', e.message);
      }
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
    // Un contratto già registrato non riparte da solo (nemmeno per la sola
    // attestazione): è una decisione dell'operatore dal pannello.
    if (registeredAt(contract)) return { skipped: 'already_registered' };
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
