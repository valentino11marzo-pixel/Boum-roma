// api/sign/_pack.js — IL PACK REGISTRAZIONE & ASSEVERAZIONE
// Un solo ZIP con tutto ciò che servono la registrazione RLI e
// l'asseverazione ARPE: contratto firmato, certificato FES, Fascicolo
// Fiscale (scheda canone + dati RLI + scadenzario), visura catastale,
// planimetria, APE, delega ARPE, documenti d'identità delle parti e
// attestazione dell'esigenza (transitoria / iscrizione universitaria) —
// più 00_INDICE.txt: anagrafica con i codici fiscali, la motivazione
// della transitorietà e la CHECKLIST di cosa c'è e cosa manca, con il
// posto esatto dove caricare i mancanti.
//
// Generato alla firma completa (dentro finalize, con un BUDGET rigido:
// il pack non deve mai allungare l'attesa del firmatario) e rigenerabile
// in ogni momento da POST /api/fiscal/pack — quando arriva l'APE o la
// planimetria, un tap e il pack è di nuovo completo.
// URL persistito su contract.registrationPackUrl (+ Missing/At).

import { getAdminToken, fsPatch } from '../homie/_lib.js';
import { buildZip } from '../_zip.js';

const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'boom-property-dashboards.firebasestorage.app';
const FILE_CAP = 15 * 1024 * 1024;   // un singolo documento oltre 15MB non entra nel pack
const PACK_BUDGET_MS = 25000;        // budget totale download: oltre → si rigenera dopo

const eur = (v) => (v == null || v === '') ? '-' : '€' + Number(v).toLocaleString('it-IT');

function extOf(url, contentType, fallback) {
  const m = /\.([a-z0-9]{2,4})(?:\?|$)/i.exec(String(url || '').split('%2F').pop() || '');
  if (m) return '.' + m[1].toLowerCase();
  const ct = String(contentType || '');
  if (ct.includes('pdf')) return '.pdf';
  if (ct.includes('jpeg')) return '.jpg';
  if (ct.includes('png')) return '.png';
  if (ct.includes('webp')) return '.webp';
  return fallback;
}

async function fetchBytes(url, msBudget) {
  const ms = Math.max(1500, Math.min(8000, msBudget));
  const r = await Promise.race([
    fetch(url),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
  if (!r || !r.ok) throw new Error('http_' + (r ? r.status : 'ko'));
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length) throw new Error('empty');
  if (buf.length > FILE_CAP) throw new Error('too_large');
  return buf;
}

async function uploadZip(path, bytes) {
  const token = await getAdminToken();
  const url = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`;
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/zip' }, body: bytes });
  if (!r.ok) throw new Error('storage_' + r.status + ': ' + (await r.text()).slice(0, 200));
  const meta = await r.json().catch(() => ({}));
  const dt = (meta.downloadTokens || '').split(',')[0];
  return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(path)}?alt=media${dt ? ('&token=' + dt) : ''}`;
}

const safe = (s, n) => String(s || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, n || 50);

// contract va passato con i fallback nome già applicati (come per il
// certificato). Ritorna { ok, url, missing[], files[], bytes } e persiste
// registrationPackUrl/Missing/At sul contratto.
export async function buildRegistrationPack(contract, property, { signedPdfUrl, certUrl, fascicoloUrl } = {}) {
  if (!contract || !contract.id) return { ok: false, error: 'no_contract' };
  const t0 = Date.now();
  const left = () => PACK_BUDGET_MS - (Date.now() - t0);
  const prop = property || {};
  const dossier = prop.dossier || {};
  const studenti = contract.type === 'studenti';
  const attLabel = studenti ? 'Attestazione iscrizione universitaria (esigenza studenti)' : 'Attestazione esigenza transitoria';

  // ── Le voci del pack: cosa DEVE esserci e da dove viene ──
  const items = [];
  const push = (label, name, url, hint, contentType) => items.push({ label, name, url: url || '', hint, contentType });

  push('Contratto firmato', '01_Contratto_firmato.pdf',
    signedPdfUrl || contract.signedPdfUrl, 'si genera alla firma completa (Magic Sign)');
  push('Certificato di firma FES', '02_Certificato_firma_FES.pdf',
    certUrl || contract.signingCertificateUrl, 'si genera alla firma completa');
  push('Fascicolo Fiscale (scheda canone + dati RLI + scadenzario)', '03_Fascicolo_Fiscale.pdf',
    fascicoloUrl || contract.fascicoloFiscaleUrl, 'bottone 📑 Fascicolo sulla riga contratto nel portal');

  const slots = [
    ['visura', 'Visura catastale', '04_Visura_catastale'],
    ['planimetria', 'Planimetria', '05_Planimetria'],
    ['ape', 'APE — Attestato di Prestazione Energetica', '06_APE'],
    ['delega', 'Delega ARPE firmata', '07_Delega_ARPE'],
  ];
  for (const [slot, label, base] of slots) {
    const d = dossier[slot] || null;
    push(label, base + extOf(d && d.url, d && d.contentType, '.pdf'), d && d.url,
      'console pre-agreement → 📦 Fascicolo ARPE (si carica UNA volta per immobile)', d && d.contentType);
  }

  // Documenti d'identità + attestazione dell'esigenza (contract.identityDocs:
  // raccolti da pre-agreement, /scheda o /sign; kind 'extra' = il secondo
  // documento richiesto, cioè la prova dell'esigenza transitoria/studenti).
  const docs = Array.isArray(contract.identityDocs) ? contract.identityDocs : [];
  const seenUrl = new Set();
  let idN = 0, extraN = 0;
  for (const d of docs) {
    if (!d || !d.url || seenUrl.has(d.url)) continue;
    seenUrl.add(d.url);
    const isExtra = d.kind === 'extra';
    const who = d.role === 'landlord' ? 'locatore' : 'conduttore';
    if (isExtra) {
      extraN++;
      push(attLabel, `09_${extraN > 1 ? extraN + '_' : ''}Attestazione_esigenza${extOf(d.url, '', '.pdf')}`,
        d.url, 'console PA (documenti richiesti) o pagina accettazione del cliente');
    } else {
      idN++;
      push(`Documento identità ${who}${idN > 1 ? ' ' + idN : ''}`,
        `08_${idN}_Documento_${who}_${safe(d.name, 40)}${/\.[a-z0-9]{2,4}$/i.test(d.name || '') ? '' : extOf(d.url, '', '.jpg')}`,
        d.url, 'si carica da /scheda (anche con OCR) o dal pre-agreement');
    }
  }
  if (!idN) push('Documento identità conduttore', '08_Documento_conduttore', '', 'manda al conduttore il suo link /scheda (Share Hub) — upload con OCR');
  if (!extraN) push(attLabel, '09_Attestazione_esigenza', '', studenti
    ? 'certificato di iscrizione/Erasmus: richiedibile dalla console PA (documenti richiesti) o via /scheda'
    : 'lettera datore di lavoro / iscrizione corso: console PA (documenti richiesti)');

  // ── Download (parallelo, time-boxed, mai bloccante) ──
  const fetched = await Promise.all(items.map(async (it) => {
    if (!it.url) return { ...it, data: null, state: 'mancante' };
    if (left() < 1500) return { ...it, data: null, state: 'saltato (tempo esaurito — rigenera con 📦 Pack)' };
    try { return { ...it, data: await fetchBytes(it.url, left()), state: 'ok' }; }
    catch (e) { return { ...it, data: null, state: 'download fallito (' + e.message + ')' }; }
  }));

  const included = fetched.filter(f => f.data);
  const missing = fetched.filter(f => !f.data);

  // ── Dati che il CAF deve avere sott'occhio (anche senza aprire i PDF) ──
  const cfWarn = [];
  if (!contract.tenantCF) cfWarn.push('Codice Fiscale conduttore MANCANTE (raccoglilo via /scheda)');
  if (!contract.landlordCF) cfWarn.push('Codice Fiscale locatore MANCANTE (raccoglilo via /scheda locatore)');

  const L = [];
  L.push('BOOM ROMA — PACK REGISTRAZIONE & ASSEVERAZIONE');
  L.push('Contratto ' + (contract.id || '') + ' — ' + (prop.address || prop.name || ''));
  L.push('Generato il ' + new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC');
  L.push('');
  L.push('IMMOBILE');
  L.push('  Indirizzo: ' + (prop.address || prop.name || '-'));
  L.push('  Catasto:   ' + (prop.cadastralData || contract.cadastral || '-'));
  if (prop.sqm) L.push('  Superficie: ' + prop.sqm + ' mq');
  L.push('');
  L.push('LE PARTI (con codici fiscali)');
  L.push('  Locatore:   ' + (contract.landlordName || '-') + ' · CF ' + (contract.landlordCF || 'MANCANTE')
    + (contract.landlordDob ? ' · nato/a ' + contract.landlordDob + (contract.landlordPob ? ' a ' + contract.landlordPob : '') : ''));
  L.push('  Conduttore: ' + (contract.tenantName || '-') + ' · CF ' + (contract.tenantCF || 'MANCANTE')
    + (contract.tenantDob ? ' · nato/a ' + contract.tenantDob + (contract.tenantPob ? ' a ' + contract.tenantPob : '') : '')
    + (contract.tenantNationality ? ' · ' + contract.tenantNationality : ''));
  if (contract.cohabitants) L.push('  Conviventi: ' + contract.cohabitants);
  L.push('');
  L.push('CONTRATTO');
  L.push('  Tipo: ' + (studenti ? 'Studenti (art. 5 c.2 L.431/98)' : 'Transitorio (art. 5 c.1 L.431/98)'));
  L.push('  Periodo: ' + (contract.startDate || '-') + ' - ' + (contract.endDate || '-'));
  L.push('  Canone: ' + eur(contract.rent) + '/mese · Deposito: ' + eur(contract.deposit)
    + ' · Cedolare secca: ' + ((contract.cedolareSecca || 'si') !== 'no' ? 'SI' : 'NO'));
  L.push('');
  L.push(studenti ? 'ESIGENZA (STUDENTI)' : 'ESIGENZA TRANSITORIA (motivazione)');
  L.push('  ' + (contract.transitionalReason || (studenti ? 'Iscrizione a corso universitario in Roma (v. contratto art. 2)' : 'NON INDICATA — compilala sul contratto prima della registrazione')));
  if (contract.transitionalDocs) L.push('  Documentazione dichiarata: ' + contract.transitionalDocs);
  L.push('');
  L.push('CONTENUTO DEL PACK');
  for (const f of included) L.push('  [OK] ' + f.name + '  — ' + f.label);
  if (missing.length) {
    L.push('');
    L.push('MANCA (' + missing.length + ')');
    for (const f of missing) {
      L.push('  [--] ' + f.label + ' — ' + f.state);
      L.push('       dove: ' + f.hint);
    }
  }
  if (cfWarn.length) { L.push(''); L.push('ATTENZIONE DATI'); for (const w of cfWarn) L.push('  [!] ' + w); }
  L.push('');
  L.push('NOTE');
  L.push('  - Il Fascicolo Fiscale contiene la scheda di calcolo per l\'attestazione di');
  L.push('    rispondenza (accordo Roma 25/07/2023): il verdetto fascia e i 20 parametri.');
  L.push('  - Registrazione RLI entro 30 giorni dalla firma; la scadenza e\' gia\' nel portal.');
  L.push('  - Rigenera il pack aggiornato con il bottone 📦 Pack sulla riga contratto.');

  const zipBytes = buildZip([
    { name: '00_INDICE.txt', data: L.join('\n') },
    ...included.map(f => ({ name: f.name, data: f.data })),
  ]);

  const url = await uploadZip(`contracts/${contract.id}/pack-registrazione.zip`, zipBytes);
  const missingLabels = [...missing.map(f => f.label), ...cfWarn.map(w => w.split(' (')[0])];
  try {
    await fsPatch(`contracts/${contract.id}`, {
      registrationPackUrl: url,
      registrationPackAt: new Date(),
      registrationPackMissing: missingLabels,
    });
  } catch (e) { console.warn('[pack] patch failed:', e.message); }

  return { ok: true, url, missing: missingLabels, files: included.map(f => f.name), bytes: zipBytes.length };
}
