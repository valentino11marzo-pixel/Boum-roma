// api/contracts/verbale.js
// IL VERBALE DI CONSEGNA CHIAVI — one-tap dal portal, firmato SUL POSTO.
//
// Il contratto (Art. 3, Allegato B e C) rinvia espressamente a "quanto
// risulta dal verbale di consegna": questo endpoint lo genera davvero.
// Il flusso reale è l'operatore IN CASA col conduttore il giorno delle
// chiavi: apre /verbale?c=<contractId> sul telefono, compila chiavi +
// letture contatori + stato, il conduttore firma sullo schermo, l'operatore
// controfirma → PDF ufficiale caricato su Storage, agganciato al contratto,
// archiviato in `documents` (categoria 'verbale' — la stessa che il
// taxpack-engine già riconosce, quindi la checklist del commercialista si
// spunta da sola) e inviato via email a conduttori (EN), proprietario (IT)
// e admin.
//
// Method:   POST { contractId, keys:[{label,qty}], meters:{luce:{lettura,pod},
//                  gas:{lettura,pdr}, acqua:{lettura}}, condition, notes,
//                  firme:[{name, kind:'conduttore'|'consegnante', sig}],
//                  photos:[{base64,label}] (≤4, jpeg/png ≤2.5MB l'una) }
// Headers:  Authorization: Bearer <firebase-id-token> (admin/owner/landlord;
//           owner solo sui contratti dei PROPRI immobili)
// Response: { ok, url } | { ok:false, error }
//
// Regole ereditate dalla piattaforma: pdf-lib con StandardFonts è
// WinAnsi-only (tutto il testo passa da wa()), import statici (il bundler
// Vercel non traccia i lazy import), email best-effort e time-boxed —
// il PDF si salva anche se Gmail è giù.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { fsGet, fsCreate, fsPatch, readJson, logActivity } from '../homie/_lib.js';
import { storageUpload, sendEmail } from '../agent/_lib.js';
import { requireRole, setCors } from '../_auth.js';
import { shell, btn, para, fine } from '../preagreement/_notify.js';
import INV from '../../js/inventario-engine.js';

const clip = (v, n = 160) => String(v == null ? '' : v).trim().slice(0, n);
const ADMIN_NOTIFY = process.env.ADMIN_NOTIFY_EMAIL || 'valentino@boom-rome.com';
const MAX_PHOTO = 2.5 * 1024 * 1024;

// WinAnsi safety — stessa funzione del Fascicolo Fiscale (la lezione del
// certificato FES: una freccia "→" uccideva TUTTE le generazioni).
function wa(s) {
  return String(s == null ? '' : s)
    .replace(/[→➔➡]/g, '->')
    .replace(/[✓✔☑☒]/g, 'X')
    .replace(/−/g, '-')
    .replace(/[^\x20-\xFF–—‘’“”…€]/g, '');
}
const dIT = (s) => { try { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }); } catch { return ''; } };
const romeNow = () => {
  const now = new Date();
  const d = now.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' });
  const t = now.toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
  return { d, t, iso: now.toISOString() };
};

const dataUriToBuf = (s) => {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(String(s || ''));
  if (!m) return null;
  try { const b = Buffer.from(m[2], 'base64'); return b.length ? { buf: b, kind: m[1] === 'png' ? 'png' : 'jpg' } : null; }
  catch { return null; }
};

// ── Il PDF ───────────────────────────────────────────────────────────────
export async function buildVerbalePdf({ contract, property, keys, meters, condition, notes, firme, photos, when, inventario }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.08, 0.09), grey = rgb(0.42, 0.42, 0.45), gold = rgb(0.72, 0.55, 0.05);
  const W = 595, H = 842, M = 48;

  let page, y;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - 46; };
  const T = (t, x, yy, sz, f, col) => page.drawText(wa(t), { x, y: yy, size: sz, font: f || font, color: col || ink });
  const line = (yy, x1 = M, x2 = W - M, th = 0.6, col) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: th, color: col || rgb(0.75, 0.73, 0.68) });
  const need = (h) => { if (y - h < 60) { newPage(); } };
  const wrap = (text, size, width, f) => {
    const words = wa(text).split(/\s+/).filter(Boolean); const lines = []; let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if ((f || font).widthOfTextAtSize(t, size) > width && cur) { lines.push(cur); cur = w; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const paraDraw = (text, size = 9.5, lh = 14, f, col) => {
    for (const l of wrap(text, size, W - 2 * M, f)) { need(lh); T(l, M, y, size, f, col); y -= lh; }
  };
  const sect = (title) => { need(34); y -= 8; T(title, M, y, 10.5, bold, gold); y -= 5; line(y, M, W - M, 0.9, gold); y -= 16; };
  const row = (k, v, kw = 170) => { need(16); T(k, M, y, 8, bold, grey); T(v, M + kw, y, 9.5, font, ink); y -= 15; };

  newPage();
  // Testata BOOM — stesso stile del Fascicolo Fiscale
  page.drawRectangle({ x: 0, y: H - 40, width: W, height: 40, color: rgb(0.04, 0.04, 0.05) });
  T('BOOM', M, H - 27, 15, bold, rgb(1, 1, 1));
  T('ROMA', M + 48, H - 26, 8, font, rgb(0.91, 0.78, 0.41));
  T('Verbale di consegna', W - M - 130, H - 22, 8, font, rgb(0.8, 0.8, 0.8));
  T(when.d, W - M - 130, H - 33, 8, font, rgb(0.6, 0.6, 0.6));
  y = H - 72;

  T('VERBALE DI CONSEGNA DELL\'IMMOBILE E DELLE CHIAVI', M, y, 13, bold, ink); y -= 20;
  T(`Roma, ${when.d} — ore ${when.t}`, M, y, 9.5, font, grey); y -= 22;

  sect('RIFERIMENTO');
  row('Immobile', clip(property.address || property.name || contract.propertyAddress || '', 90));
  row('Contratto di locazione', `${contract.type === 'studenti' ? 'per studenti universitari' : 'transitorio'} — decorrenza ${dIT(contract.startDate)} / scadenza ${dIT(contract.endDate)}`);
  row('Locatore', clip(contract.landlordName || '', 90));
  const condNames = [clip(contract.tenantName || '', 60)]
    .concat((Array.isArray(contract.coTenants) ? contract.coTenants : []).map((c) => clip(c.name, 60)))
    .filter(Boolean);
  row('Conduttore/i', condNames.join(', '));

  sect('1. CHIAVI CONSEGNATE');
  const ks = (Array.isArray(keys) ? keys : []).filter((k) => k && clip(k.label) && Number(k.qty) > 0);
  if (ks.length) {
    for (const k of ks) row(clip(k.label, 46), `n. ${Math.min(20, Math.round(Number(k.qty)))}`);
    const tot = ks.reduce((s, k) => s + Math.min(20, Math.round(Number(k.qty))), 0);
    row('Totale chiavi', `n. ${tot}`);
  } else {
    paraDraw('Nessuna chiave registrata.', 9.5, 14, font, grey);
  }

  sect('2. LETTURE CONTATORI ALLA CONSEGNA');
  const m = meters || {};
  const mRow = (label, r, code, codeLabel) => {
    const val = clip((r || {}).lettura, 30);
    const cod = clip((r || {})[code], 40);
    if (!val && !cod) { row(label, 'lettura non rilevata'); return; }
    row(label, (val ? `lettura: ${val}` : 'lettura non rilevata') + (cod ? `   ${codeLabel}: ${cod}` : ''));
  };
  mRow('Energia elettrica', m.luce, 'pod', 'POD');
  mRow('Gas', m.gas, 'pdr', 'PDR');
  mRow('Acqua', m.acqua, 'matricola', 'matricola');
  paraDraw('Le letture sopra riportate fanno fede tra le parti ai fini delle volture e del riparto dei consumi.', 8.5, 12, font, grey);

  sect('3. STATO DELL\'IMMOBILE');
  const condTxt = { ottimo: 'in ottimo stato di manutenzione e pulizia', buono: 'in buono stato di manutenzione', conforme: 'nello stato risultante dal contratto e dai suoi allegati' }[condition] || 'in buono stato di manutenzione';
  // L'inventario, quando c'e, PRENDE IL POSTO della formula generica: "completa
  // degli arredi e delle dotazioni pattuite" non ha mai deciso una trattenuta
  // sul deposito, un elenco si (vedi js/inventario-engine.js).
  const invRooms = (inventario && Array.isArray(inventario.rooms)) ? inventario.rooms.filter((r) => r && (r.items || []).length) : [];
  if (invRooms.length) {
    const ic = INV.counts(invRooms);
    paraDraw(`Le parti danno atto che l'unita immobiliare viene consegnata ${condTxt}, funzionante negli impianti e negli apparecchi in dotazione, completa degli arredi e delle dotazioni analiticamente elencati nell'inventario redatto in data ${dIT(inventario.at) || when.d} (${ic.pieces} pezzi in ${ic.rooms} ambienti), che le parti dichiarano di aver verificato e che costituisce parte integrante del presente verbale.`);
    y -= 4;
    for (const room of invRooms) {
      const line = (room.items || []).map((it) => {
        const bits = [];
        if ((it.qty || 1) > 1) bits.push('n. ' + it.qty);
        if (it.condition) bits.push(INV.conditionLabel(it.condition));
        if (it.note) bits.push(clip(it.note, 60));
        return clip(it.name, 60) + (bits.length ? ' (' + bits.join(', ') + ')' : '');
      }).join('; ');
      need(16);
      T(clip(room.label, 30).toUpperCase(), M, y, 8, bold, grey); y -= 12;
      paraDraw(line + '.', 8.5, 12);
      y -= 3;
    }
    if (ic.undeclared) {
      paraDraw(`Per ${ic.undeclared} voci non e stato riscontrato ne documentato alcun difetto specifico: cio non equivale ad attestazione di buono stato ne puo essere invocato come prova di un danno successivo.`, 7.5, 11, font, grey);
    }
    if (inventario.url) paraDraw('Inventario completo, con documentazione fotografica: ' + clip(inventario.url, 150), 7.5, 11, font, grey);
  } else {
    paraDraw(`Le parti danno atto che l'unita immobiliare viene consegnata ${condTxt}, completa degli arredi e delle dotazioni pattuite, funzionante negli impianti e negli apparecchi in dotazione.`);
  }
  if (clip(notes)) { y -= 2; paraDraw('Annotazioni: ' + clip(notes, 600)); }

  sect('4. DICHIARAZIONI');
  paraDraw('Il Conduttore dichiara di ricevere in consegna in data odierna l\'unita immobiliare di cui al contratto in epigrafe, unitamente alle chiavi sopra elencate, di averla visitata e trovata adatta all\'uso convenuto, costituendosi da questo momento custode della stessa ai sensi dell\'art. 1590 c.c. e impegnandosi a riconsegnarla nello stato in cui l\'ha ricevuta, salvo il normale deperimento d\'uso. Il presente verbale integra il contratto di locazione ai sensi dell\'articolo 3 dello stesso.');

  // Foto (opzionali) — 2 per riga
  const ph = (Array.isArray(photos) ? photos : []).slice(0, 4).map((p) => ({ ...p, img: dataUriToBuf(p && p.base64) })).filter((p) => p.img);
  if (ph.length) {
    sect('5. DOCUMENTAZIONE FOTOGRAFICA');
    const bw = (W - 2 * M - 16) / 2, bh = 150;
    for (let i = 0; i < ph.length; i += 2) {
      need(bh + 26);
      for (let j = i; j < Math.min(i + 2, ph.length); j++) {
        const x = M + (j - i) * (bw + 16);
        try {
          const img = ph[j].img.kind === 'png' ? await pdf.embedPng(ph[j].img.buf) : await pdf.embedJpg(ph[j].img.buf);
          const sc = Math.min(bw / img.width, bh / img.height);
          page.drawImage(img, { x, y: y - bh, width: img.width * sc, height: img.height * sc });
          T(clip(ph[j].label || `Foto ${j + 1}`, 40), x, y - bh - 11, 7.5, font, grey);
        } catch { /* una foto corrotta non ferma il verbale */ }
      }
      y -= bh + 26;
    }
  }

  // Firme — conduttori + consegnante, 2 colonne
  const sigs = (Array.isArray(firme) ? firme : []).map((f) => ({ name: clip((f || {}).name, 60), kind: (f || {}).kind === 'consegnante' ? 'consegnante' : 'conduttore', img: dataUriToBuf((f || {}).sig) })).filter((f) => f.name && f.img);
  need(40); sect(ph.length ? '6. FIRME' : '5. FIRME');
  paraDraw(`Letto, confermato e sottoscritto in Roma, ${when.d} alle ore ${when.t}. Firme apposte in presenza, su dispositivo dell'operatore.`, 8.5, 12, font, grey);
  y -= 6;
  const colW = (W - 2 * M - 24) / 2, sigH = 52;
  for (let i = 0; i < sigs.length; i += 2) {
    need(sigH + 42);
    for (let j = i; j < Math.min(i + 2, sigs.length); j++) {
      const x = M + (j - i) * (colW + 24);
      const s = sigs[j];
      T(s.kind === 'consegnante' ? 'Per la consegna' : 'Il Conduttore (per ricevuta delle chiavi)', x, y, 7.5, bold, grey);
      try {
        const img = s.img.kind === 'png' ? await pdf.embedPng(s.img.buf) : await pdf.embedJpg(s.img.buf);
        const sc = Math.min(colW / img.width, sigH / img.height);
        page.drawImage(img, { x, y: y - 12 - sigH + (sigH - img.height * sc) / 2, width: img.width * sc, height: img.height * sc });
      } catch { /* firma non renderizzabile: resta nome+riga */ }
      line(y - 16 - sigH, x, x + colW, 0.7);
      T(s.name, x, y - 26 - sigH, 9, font, ink);
    }
    y -= sigH + 44;
  }

  need(20);
  T('BOOM® è un marchio dell\'Unione europea registrato (MUE 019317594) di Egidi Immobiliare S.r.l.', M, 44, 7, font, grey);
  T('Egidi Immobiliare S.r.l. — Via dei Coronari 181/184, 00186 Roma — Sede legale: Viale Liegi 42, 00198 Roma — P.IVA 17322991005 — boomrome.com', M, 34, 7, font, grey);
  return Buffer.from(await pdf.save());
}

// ── Email (design system condiviso, best-effort, time-boxed) ─────────────
async function trySend(to, subject, html, attachments) {
  if (!to) return { ok: false, error: 'no_recipient' };
  try {
    await Promise.race([
      sendEmail({ to, subject, html, attachments }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('email_timeout')), 12000)),
    ]);
    return { ok: true };
  } catch (e) { console.warn('[verbale] send', to, e.message); return { ok: false, error: e.message }; }
}

async function sendVerbaleEmails({ contract, property, url, pdfBytes, when, keysCount }) {
  const propLabel = clip(property.address || property.name || '', 90);
  const tenant = contract.tenantId ? await fsGet('users/' + contract.tenantId).catch(() => null) : null;
  const ownerId = property.ownerId;
  const landlordU = ownerId ? await fsGet('users/' + ownerId).catch(() => null) : null;
  const landlordR = ownerId ? await fsGet('landlords/' + ownerId).catch(() => null) : null;
  const tenantEmail = (tenant && tenant.email) || contract.tenantEmail || '';
  const landlordEmail = (landlordU && landlordU.email) || (landlordR && landlordR.email) || contract.landlordEmail || '';
  const att = pdfBytes && pdfBytes.length < 8 * 1024 * 1024
    ? [{ filename: 'BOOM_Verbale_consegna.pdf', content: pdfBytes, contentType: 'application/pdf' }] : undefined;

  // Conduttori — EN (l'inquilino BOOM è un expat)
  const toTenants = [tenantEmail].concat((Array.isArray(contract.coTenants) ? contract.coTenants : []).map((c) => c && c.email).filter(Boolean)).filter(Boolean);
  const seen = new Set();
  for (const to of toTenants) {
    if (seen.has(to.toLowerCase())) continue; seen.add(to.toLowerCase());
    await trySend(to, '🔑 Keys delivered — your handover report', shell(
      para(`Welcome home! Today (${when.d}) you received the keys to <strong>${propLabel}</strong>.`)
      + para(`Attached is the official <strong>handover report</strong> (verbale di consegna): keys delivered${keysCount ? ` (${keysCount})` : ''}, meter readings and the condition of the apartment at move-in. Keep it — it protects your deposit at the end of the lease.`)
      + btn(url, 'Open the handover report')
      + fine('Meter readings in this report are the official starting point for your utility bills.'),
      'Your keys + handover report'), att);
  }
  // Locatore — IT
  if (landlordEmail) {
    await trySend(landlordEmail, '🔑 Consegna chiavi effettuata — verbale in allegato', shell(
      para(`In data ${when.d} sono state consegnate le chiavi di <strong>${propLabel}</strong> al conduttore.`)
      + para('In allegato il <strong>verbale di consegna</strong> firmato: chiavi, letture contatori e stato dell\'immobile. Le letture fanno fede per volture e riparto consumi.')
      + btn(url, 'Apri il verbale')
      + fine('Documento archiviato automaticamente nel fascicolo del contratto.'),
      'Verbale di consegna firmato'), att);
  }
  // Admin — copia
  await trySend(ADMIN_NOTIFY, `🔑 Verbale consegna firmato — ${propLabel}`, shell(
    para(`Verbale di consegna generato e inviato alle parti per <strong>${propLabel}</strong> (${when.d} ore ${when.t}).`)
    + btn(url, 'Apri il verbale')
    + fine('Copia archiviata in Documenti (categoria verbale) e agganciata al contratto.'),
    'Verbale consegna — copia admin'), att);
}

// ── Handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const auth = await requireRole(req, res, ['admin', 'owner', 'landlord']);
  if (!auth) return;

  let body;
  try { body = await readJson(req); } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const contractId = clip((body || {}).contractId, 80);
  if (!contractId) return res.status(400).json({ ok: false, error: 'contract_required' });

  const firme = Array.isArray(body.firme) ? body.firme.slice(0, 6) : [];
  const conduttori = firme.filter((f) => f && f.kind !== 'consegnante' && dataUriToBuf(f.sig));
  const consegnanti = firme.filter((f) => f && f.kind === 'consegnante' && dataUriToBuf(f.sig));
  if (!conduttori.length) return res.status(400).json({ ok: false, error: 'tenant_signature_required' });
  if (consegnanti.length !== 1) return res.status(400).json({ ok: false, error: 'operator_signature_required' });
  for (const p of (Array.isArray(body.photos) ? body.photos : [])) {
    if (p && String(p.base64 || '').length > MAX_PHOTO * 1.4) return res.status(413).json({ ok: false, error: 'photo_too_large' });
  }

  try {
    const contract = await fsGet('contracts/' + contractId);
    if (!contract) return res.status(404).json({ ok: false, error: 'contract_not_found' });
    const property = (contract.propertyId ? await fsGet('properties/' + contract.propertyId).catch(() => null) : null) || {};
    // Object-level auth: owner/landlord solo sui contratti dei PROPRI immobili
    if (auth.profile.role !== 'admin' && String(property.ownerId || '') !== auth.uid) {
      return res.status(403).json({ ok: false, error: 'not_your_property' });
    }

    const when = romeNow();
    contract.id = contractId;
    const pdfBytes = await buildVerbalePdf({
      contract, property,
      keys: body.keys, meters: body.meters, condition: clip(body.condition, 20),
      notes: body.notes, firme, photos: body.photos, when,
      inventario: contract.inventario || property.inventario || null,
    });

    const path = `contracts/${contractId}/verbale-consegna_${Date.now()}.pdf`;
    const url = await storageUpload(path, pdfBytes, 'application/pdf');
    if (!url) return res.status(502).json({ ok: false, error: 'storage_failed' });

    const keysCount = (Array.isArray(body.keys) ? body.keys : []).reduce((s, k) => s + (Number((k || {}).qty) > 0 ? Math.round(Number(k.qty)) : 0), 0);
    await fsPatch('contracts/' + contractId, {
      verbaleConsegna: {
        at: when.iso, url, by: auth.email || auth.uid,
        keysCount, meters: body.meters || {}, condition: clip(body.condition, 20),
        firme: firme.map((f) => ({ name: clip((f || {}).name, 60), kind: (f || {}).kind === 'consegnante' ? 'consegnante' : 'conduttore' })),
      },
    });

    // Archivio documenti: categoria 'verbale' = quella che il taxpack riconosce
    const yr = new Date().getFullYear();
    await fsCreate('documents', {
      name: `Verbale di consegna · ${clip(property.address || property.name || contractId, 60)} · ${yr}`,
      type: 'legal', category: 'verbale',
      tags: ['02_Contratti', 'verbale', 'consegna', 'handover'],
      fileUrl: url, fileName: 'verbale-consegna.pdf', mimeType: 'application/pdf',
      propertyId: contract.propertyId || null, contractId, fiscalYear: yr,
      docDate: when.iso.slice(0, 10), tenantName: contract.tenantName || null,
      notes: `Consegna chiavi ${when.d} ore ${when.t}` + (keysCount ? ` — ${keysCount} chiavi` : ''),
      source: 'verbale', uploadedBy: auth.email || 'admin',
      needsFiling: false, shared: false, createdAt: new Date(),
    }).catch((e) => console.warn('[verbale] documents filing:', e.message));

    await sendVerbaleEmails({ contract, property, url, pdfBytes, when, keysCount });
    logActivity('Verbale consegna generato', 'contract', { contractId, keysCount }, auth.email || 'admin').catch(() => {});

    return res.status(200).json({ ok: true, url });
  } catch (e) {
    console.error('[verbale] failed:', e.message);
    return res.status(500).json({ ok: false, error: 'verbale_failed' });
  }
}
