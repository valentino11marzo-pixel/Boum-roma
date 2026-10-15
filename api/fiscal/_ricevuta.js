// api/fiscal/_ricevuta.js — LA RICEVUTA DI REGISTRAZIONE, una volta sola (15/10/2026).
//
// Prima la registrazione si chiudeva in DUE modi che non si parlavano:
// «✓ RLI registrato» (rliRegisteredAt + scadenza «Registrare RLI») e
// «🏛️ Registrazione AdE» (registrationStatus/registrationCode + scadenza
// contract_registration). Nessuno dei due prendeva il FILE della ricevuta, e
// il cliente non la riceveva mai: restava nella casella di chi registrava.
//
// Qui un passo solo: data + codice + file → contratto segnato registrato
// (tutti e due i campi), scadenze chiuse, ricevuta su Storage, nell'archivio
// di ogni parte con un profilo (id deterministico: ripremere non duplica) e
// in allegato a inquilino e co-conduttori (EN) e proprietario (IT). Le email
// partono UNA volta per file: un secondo salvataggio con lo stesso file non
// rimanda niente, un file nuovo sì.

import { fsGet, fsPatch, fsList } from '../homie/_lib.js';
import { storageUpload } from '../agent/_lib.js';
import { sendEmail } from '../agent/_lib.js';
import { shell, para, fine, tiles } from '../preagreement/_notify.js';
import { gather, sendOutcome } from '../sign/_notify.js';
import crypto from 'node:crypto';

const MAX_BYTES = 3 * 1024 * 1024;   // una ricevuta AdE pesa decine di KB
const TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const fmtIT = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const fmtEN = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (!m) return '';
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1];
  return `${Number(m[3])} ${mo} ${m[1]}`;
};

// Pura: valida ciò che arriva dal portal. Rifiuta, mai aggiusta.
export function parseReceiptInput(b, { today } = {}) {
  const x = b || {};
  const date = String(x.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T00:00:00Z'))) return { error: 'bad_date' };
  if (today && date > today) return { error: 'future_date' };
  const code = String(x.code || '').trim().toUpperCase();
  if (code && !/^[A-Z0-9][A-Z0-9 /.-]{2,39}$/.test(code)) return { error: 'bad_code' };
  let file = null;
  if (x.base64) {
    const ct = String(x.contentType || '').toLowerCase();
    if (!TYPES[ct]) return { error: 'bad_type' };
    const raw = String(x.base64).replace(/^data:[^,]*,/, '');
    let buf;
    try { buf = Buffer.from(raw, 'base64'); } catch { return { error: 'bad_file' }; }
    if (!buf.length) return { error: 'bad_file' };
    if (buf.length > MAX_BYTES) return { error: 'file_too_large' };
    // Il tipo lo dicono i byte: un «PDF» che non comincia con %PDF non lo è.
    const sig = buf.subarray(0, 4).toString('latin1');
    const okSig = ct === 'application/pdf' ? sig === '%PDF'
      : ct === 'image/png' ? buf[0] === 0x89 && sig.slice(1) === 'PNG'
        : buf[0] === 0xff && buf[1] === 0xd8;
    if (!okSig) return { error: 'bad_file' };
    const name = String(x.name || '').replace(/[^\w.\- ]+/g, '').slice(0, 80) || ('ricevuta.' + TYPES[ct]);
    file = { buf, contentType: ct, ext: TYPES[ct], name };
  }
  return { date, code, file, notify: x.notify !== false };
}

export function receiptDocId(contractId, who) {
  return `registration-receipt_${contractId}_${who}`;
}

// Pura: una copia della ricevuta per ogni parte con un profilo.
export function receiptDocs(contract, property, { url, fileName, mimeType, code, date } = {}) {
  const c = contract || {}, p = property || {};
  if (!c.id || !url) return [];
  const label = String(p.name || p.address || c.propertyAddress || c.propertyName || '').trim().slice(0, 80) || 'Lease';
  const base = {
    type: 'receipt', category: 'registrazione contratto',
    tags: ['02_Contratti', 'registrazione', 'RLI', 'ricevuta'],
    contractId: c.id, propertyId: c.propertyId || '',
    fileUrl: url, fileName: fileName || 'ricevuta-registrazione.pdf', mimeType: mimeType || 'application/pdf',
    registrationCode: code || '', docDate: date, fiscalYear: Number(String(date).slice(0, 4)) || null,
    shared: false, uploadedBy: 'boom', source: 'registration', needsFiling: false,
  };
  const out = [], seen = new Set();
  const add = (who, uid, lang) => {
    uid = String(uid || '').trim();
    if (!uid || seen.has(uid)) return;
    seen.add(uid);
    out.push({
      id: receiptDocId(c.id, who), userId: uid,
      data: { ...base, userId: uid, party: who, lang,
        name: (lang === 'it' ? 'Ricevuta di registrazione — ' : 'Registration receipt — ') + label },
    });
  };
  add('tenant', c.tenantId, 'en');
  add('landlord', p.ownerId || c.landlordId || c.ownerId, 'it');
  (Array.isArray(c.coTenants) ? c.coTenants : []).forEach((x, i) => { if (x && x.userId) add('co' + i, x.userId, 'en'); });
  return out;
}

// Pura: chi riceve l'email. Una persona, un'email, nella sua lingua.
// La chiave del registro: file + destinatario (ruolo e indirizzo).
export function deliveryKey(url, r) {
  return 'd_' + crypto.createHash('sha1').update(String(url) + '|' + (r && r.who) + '|' + (r && r.email)).digest('hex').slice(0, 16);
}

export function receiptRecipients(contract, g) {
  const c = contract || {}, out = [], seen = new Set();
  const add = (email, name, lang, who) => {
    const e = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || seen.has(e)) return;
    seen.add(e);
    out.push({ email: e, name: String(name || '').trim(), lang, who });
  };
  add(g.tenantEmail, g.tenantName, 'en', 'tenant');
  (Array.isArray(c.coTenants) ? c.coTenants : []).forEach((x, i) => x && add(x.email, x.name, 'en', 'co' + i));
  add(g.landlordEmail, g.landlordName, 'it', 'landlord');
  return out;
}

function receiptEmail(r, { propLabel, code, date }) {
  const first = String(r.name || '').split(' ')[0];
  if (r.lang === 'it') {
    return {
      subject: `Contratto registrato — ${propLabel}`,
      html: shell(
        para(`${first ? 'Gentile ' + esc(first) : 'Gentile proprietario'},<br>il contratto di locazione per <b>${esc(propLabel)}</b> è stato <b>registrato presso l'Agenzia delle Entrate</b>. In allegato la ricevuta: la conservi con il contratto.`)
        + tiles([{ k: 'Registrato il', v: fmtIT(date) }, ...(code ? [{ k: 'Codice', v: esc(code) }] : [])])
        + fine('La trova anche nel suo archivio documenti sul portale BOOM.', 'text-align:center'),
        'Contratto registrato — ricevuta in allegato.'),
    };
  }
  return {
    subject: `Your lease is registered — ${propLabel}`,
    html: shell(
      para(`Hi${first ? ' ' + esc(first) : ''},<br>your lease for <b>${esc(propLabel)}</b> has been <b>registered with the Italian Revenue Agency</b> (Agenzia delle Entrate). The receipt is attached: keep it with your contract — you may need it for residency and other paperwork.`)
      + tiles([{ k: 'Registered on', v: fmtEN(date) }, ...(code ? [{ k: 'Code', v: esc(code) }] : [])])
      + fine('You will also find it in your documents in your BOOM portal.', 'text-align:center'),
      'Your lease is registered — receipt attached.'),
  };
}

// I/O. Ritorna { ok, ... } e non lancia per i guasti delle parti accessorie
// (archivio, email): il dato della registrazione è ciò che deve restare.
export async function recordRegistration(contractId, input, { force = false } = {}) {
  const contract = await fsGet('contracts/' + contractId);
  if (!contract) return { ok: false, error: 'contract_not_found' };
  contract.id = contractId;
  const property = contract.propertyId ? await fsGet('properties/' + contract.propertyId).catch(() => null) : null;

  let url = contract.registrationReceiptUrl || '';
  let fileName = contract.registrationReceiptName || '';
  let mimeType = contract.registrationReceiptType || '';
  if (input.file) {
    const path = `contracts/${contractId}/ricevuta-registrazione-${Date.now().toString(36)}.${input.file.ext}`;
    url = await storageUpload(path, input.file.buf, input.file.contentType);
    if (!url) return { ok: false, error: 'storage_unavailable' };
    fileName = input.file.name;
    mimeType = input.file.contentType;
  }

  const now = new Date();
  const patch = {
    registrationStatus: 'registered',
    rliRegisteredAt: input.date,
    registeredAt: now,
    ...(input.code ? { registrationCode: input.code } : {}),
    ...(input.file ? { registrationReceiptUrl: url, registrationReceiptName: fileName, registrationReceiptType: mimeType, registrationReceiptAt: now } : {}),
  };
  await fsPatch('contracts/' + contractId, patch);
  const fresh = { ...contract, ...patch };

  // Le scadenze della registrazione, in tutte e due le forme che esistono.
  let closed = 0;
  try {
    const dl = await fsList('deadlines', { filter: { field: 'linkedContractId', op: 'EQUAL', value: contractId }, limit: 50 });
    for (const d of dl) {
      const isReg = String(d.title || '').startsWith('Registrare RLI') || d.type === 'contract_registration';
      if (isReg && d.status !== 'done') {
        await fsPatch('deadlines/' + d.id, { status: 'done', completedAt: now });
        closed++;
      }
    }
  } catch (e) { console.warn('[ricevuta] deadlines', e.message); }

  // L'archivio delle parti (solo se c'è un file: un documento senza file è rumore).
  let archived = 0;
  if (url) {
    for (const d of receiptDocs(fresh, property, { url, fileName, mimeType, code: fresh.registrationCode || '', date: input.date })) {
      try { await fsPatch('documents/' + d.id, { ...d.data, createdAt: now }); archived++; }
      catch (e) { console.warn('[ricevuta] archive', d.id, e.message); }
    }
  }

  // Le email: UNA volta per destinatario e per file (15/10/2026, review).
  // Prima bastava che partisse a UNO perché il file risultasse «inviato» a
  // tutti: il proprietario respinto non lo riceveva più, e un resend
  // rimandava anche a chi l'aveva già. Ora c'è un registro per coppia
  // (file, destinatario) — `registrationReceiptDelivery` — scritto 'sending'
  // PRIMA dell'invio e poi 'sent' | 'failed' | 'uncertain'. Un nuovo giro
  // manda solo a chi non ha 'sent': i 'failed' ripartono da soli, gli
  // 'uncertain' (e un 'sending' rimasto appeso) solo col resend esplicito,
  // e chi ha 'sent' non riceve MAI un doppione.
  const sent = [], failed = [], uncertain = [], already = [];
  let skipped = null;
  if (!url) skipped = 'no_file';
  else if (!input.notify) skipped = 'notify_off';
  else {
    const g = await gather(fresh, property).catch(() => null);
    const recipients = g ? receiptRecipients(fresh, g) : [];
    const ledger = { ...((contract.registrationReceiptDelivery && typeof contract.registrationReceiptDelivery === 'object') ? contract.registrationReceiptDelivery : {}) };
    // Il registro di prima (un timbro per file): chi c'era, è 'sent'.
    if (contract.registrationReceiptSentUrl === url && Array.isArray(contract.registrationReceiptSentTo)) {
      for (const r of recipients) {
        const k = deliveryKey(url, r);
        if (!ledger[k] && contract.registrationReceiptSentTo.includes(r.who)) ledger[k] = { who: r.who, email: r.email, url, status: 'sent', at: contract.registrationReceiptSentAt || null };
      }
    }
    const todo = [];
    for (const r of recipients) {
      const e = ledger[deliveryKey(url, r)];
      const st = e && e.status;
      if (st === 'sent') { already.push(r.who); continue; }
      if ((st === 'uncertain' || st === 'sending') && !force) { uncertain.push(r.who); continue; }
      todo.push(r);
    }
    if (!recipients.length) skipped = 'no_recipients';
    else if (!todo.length) skipped = uncertain.length ? 'uncertain_needs_resend' : 'already_sent';
    else {
      let att = null;
      if (input.file) att = { filename: 'Ricevuta_registrazione.' + input.file.ext, content: input.file.buf, contentType: mimeType };
      else {
        try {
          const r = await fetch(url);
          if (r.ok) att = { filename: 'Ricevuta_registrazione.' + (TYPES[mimeType] || 'pdf'), content: Buffer.from(await r.arrayBuffer()), contentType: mimeType || 'application/pdf' };
        } catch (e) { console.warn('[ricevuta] fetch', e.message); }
      }
      if (!att) skipped = 'file_unreachable';
      else {
        const save = () => fsPatch('contracts/' + contractId, { registrationReceiptDelivery: ledger });
        for (const r of todo) {
          const k = deliveryKey(url, r);
          ledger[k] = { who: r.who, email: r.email, url, status: 'sending', at: new Date().toISOString() };
          // Senza la marca non si invia: un invio non registrato è il caso
          // che il giro dopo non saprebbe distinguere.
          try { await save(); } catch (e) { console.warn('[ricevuta] mark', r.who, e.message); delete ledger[k]; failed.push(r.who); continue; }
          const m = receiptEmail(r, { propLabel: g.propLabel, code: fresh.registrationCode || '', date: input.date });
          let outcome = 'sent', err = '';
          try {
            await Promise.race([
              sendEmail({ to: r.email, subject: m.subject, html: m.html, attachments: [att] }),
              new Promise((_, rej) => setTimeout(() => rej(new Error('email_timeout')), 20000)),
            ]);
          } catch (e) { outcome = sendOutcome(e); err = String(e.message || '').slice(0, 160); console.warn('[ricevuta] send', r.who, e.message); }
          ledger[k] = { who: r.who, email: r.email, url, status: outcome, at: new Date().toISOString(), ...(err ? { error: err } : {}) };
          try { await save(); } catch (e) { console.warn('[ricevuta] record', r.who, e.message); }
          (outcome === 'sent' ? sent : outcome === 'failed' ? failed : uncertain).push(outcome === 'sent' ? { who: r.who, lang: r.lang } : r.who);
        }
        if (sent.length) {
          await fsPatch('contracts/' + contractId, { registrationReceiptSentUrl: url, registrationReceiptSentAt: new Date(), registrationReceiptSentTo: recipients.filter(r => (ledger[deliveryKey(url, r)] || {}).status === 'sent').map(r => r.who) })
            .catch((e) => console.warn('[ricevuta] stamp', e.message));
        }
      }
    }
  }

  return {
    ok: true,
    registrationStatus: 'registered',
    rliRegisteredAt: input.date,
    registrationCode: fresh.registrationCode || '',
    registrationReceiptUrl: url || null,
    deadlinesClosed: closed,
    archived,
    sent,
    failed,
    uncertain,
    alreadySent: already,
    skipped,
  };
}
