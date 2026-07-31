// api/sign/_notify.js
// The WHOLE Magic Sign email lifecycle, on the ONE BOOM design system
// (api/preagreement/_notify.js — black masthead with the real gold mark,
// white paper card, gold pill actions, dark-mode aware):
//
//   • sendSignInvite            — the invitation to sign (server-side, ANY
//                                 contract — replaces the portal's EmailJS
//                                 sendSignatureEmail, which only fired with
//                                 the portal open)
//   • notifyPartialSignature    — after ONE party signs: confirm the signer,
//                                 nudge the counterparty with their link
//   • notifyAdminContractSigned — milestone to the operator on completion
//   • sendWelcomeEmails         — tenant (EN) + landlord (IT) welcomes
//   • sendCafDossier            — the CAF/asseverazione dossier with the
//                                 FULL anagrafica (post-firma it is complete
//                                 by construction) → valentino@boom-rome.com
//
// Language follows the reader: tenant-facing mails are English (the BOOM
// tenant is an expat), landlord- and operator-facing mails are Italian.
// Everything is best-effort and time-boxed; this module never throws, so it
// can never block or fail a signature.

import { fsGet } from '../homie/_lib.js';
import { sendEmail } from '../agent/_lib.js';
import { shell, btn, btn2, para, fine, tiles, timeline, includes, rule, row } from '../preagreement/_notify.js';
// Il pass Wallet del contratto è servito LIVE da /api/my-pass (ricostruito
// da Firestore a ogni tap): il link è derivato, niente da generare o salvare.
import { generateAuthToken } from '../generate-pass.js';

export const tenantWalletUrl = (contractId) =>
  `${'https://www.boomrome.com'}/api/my-pass?type=tenant&id=${encodeURIComponent(contractId)}&t=${generateAuthToken(String(contractId))}`;

const BASE = 'https://www.boomrome.com';
const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'valentino@boom-rome.com';
// Il fascicolo CAF/asseverazione arriva all'operatore (la nuova associazione
// è la sua): override via env se un giorno dovesse andare a terzi.
const CAF_EMAIL = process.env.CAF_EMAIL || 'valentino@boom-rome.com';

const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const eur = n => (n == null || n === '') ? '—' : '€' + Number(n).toLocaleString('it-IT');
const fmtEN = s => { try { return new Date(String(s).slice(0, 10) + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return s || '—'; } };
const fmtIT = s => { try { return new Date(String(s).slice(0, 10) + 'T00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return s || '—'; } };

// Time-boxed send — SMTP can stall, and much of this runs inside the
// signer's own request.
function send(to, subject, html, attachments) {
  return Promise.race([
    sendEmail({ to, subject, html, attachments }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('email_timeout')), 20000)),
  ]);
}
const trySend = (to, subject, html, attachments) => send(to, subject, html, attachments).then(() => true)
  .catch((e) => { console.warn('[sign/notify] send', to, e.message); return false; });

// Scarica un PDF da Storage e lo prepara come allegato nodemailer.
// Best-effort e time-boxed: un download fallito non ferma mai l'email —
// il documento resta raggiungibile dal link. Cap 8MB (limite Gmail 25MB
// totali: contratto + certificato + fascicolo restano ampiamente sotto).
async function fetchPdfAttachment(url, filename, contentType = 'application/pdf') {
  if (!url) return null;
  try {
    const r = await Promise.race([
      fetch(url),
      new Promise((_, rej) => setTimeout(() => rej(new Error('att_timeout')), 8000)),
    ]);
    if (!r || !r.ok) return null;
    const content = Buffer.from(await r.arrayBuffer());
    if (!content.length || content.length > 8 * 1024 * 1024) return null;
    // contentType null → nodemailer lo deduce dal nome file (foto documento)
    return contentType ? { filename, content, contentType } : { filename, content };
  } catch (e) { console.warn('[sign/notify] attachment', filename, e.message); return null; }
}

async function gather(contract, property) {
  const prop = property
    || (contract.propertyId ? await fsGet('properties/' + contract.propertyId).catch(() => null) : null)
    || {};
  const ownerId = prop.ownerId;
  const tenant    = contract.tenantId ? await fsGet('users/' + contract.tenantId).catch(() => null) : null;
  const landlordU = ownerId ? await fsGet('users/' + ownerId).catch(() => null) : null;
  const landlordR = ownerId ? await fsGet('landlords/' + ownerId).catch(() => null) : null;
  return {
    prop, tenant, landlordU, landlordR,
    propLabel: prop.address || prop.name || 'the property',
    tenantEmail: (tenant && tenant.email) || contract.tenantEmail || '',
    tenantName: contract.tenantName || (tenant && tenant.name) || '',
    landlordEmail: (landlordU && landlordU.email) || (landlordR && landlordR.email) || contract.landlordEmail || '',
    landlordName: contract.landlordName || (landlordU && landlordU.name) || (landlordR && landlordR.name) || '',
  };
}

// ── The invitation to sign ────────────────────────────────────────────────
// One party, their /sign link, in their language. Used by api/sign/send-link
// (the portal's "invia invito/promemoria") and re-usable anywhere.
export async function sendSignInvite({ contract, property, role, to, name, url, resend = false }) {
  try {
    if (!to || !url) return { ok: false, error: 'no_recipient_or_url' };
    const g = await gather(contract, property);
    const first = String(name || '').split(' ')[0] || (role === 'landlord' ? 'Gentile proprietario' : 'there');
    const months = (contract.startDate && contract.endDate)
      ? Math.max(1, Math.round((new Date(contract.endDate) - new Date(contract.startDate)) / (1000 * 60 * 60 * 24 * 30)))
      : null;

    let subject, html, preheader;
    if (role === 'landlord') {
      subject = `${resend ? 'Promemoria — ' : ''}✍️ Contratto pronto per la Sua firma — ${g.propLabel}`;
      preheader = 'Firma digitale dal telefono, due minuti — copia e certificato inclusi.';
      html = shell(
        para(`Gentile ${esc(first)},<br>il contratto di locazione per <b>${esc(g.propLabel)}</b> è pronto per la Sua firma digitale come locatore. Due minuti, direttamente dal telefono:`)
        + tiles([
          { k: 'Canone', v: eur(contract.rent) + '<span style="font-size:12px;color:#6E6A60"> /mese</span>' },
          { k: 'Periodo', v: `${fmtIT(contract.startDate)} → ${fmtIT(contract.endDate)}`, sub: months ? months + ' mesi' : null },
          g.tenantName ? { k: 'Conduttore', v: esc(g.tenantName) } : null,
        ])
        + btn(url, 'Rivedi e firma il contratto')
        + fine(`Firma Elettronica Semplice ai sensi dell'art. 21 CAD, registrata con certificato. ${contract.signingOrder !== 'any' && !contract.tenantSignature ? 'Il link si attiva dopo la firma dell’inquilino — Le arriverà conferma.' : ''} Link personale monouso: non inoltrarlo.`, 'margin-top:20px;text-align:center'),
        preheader);
    } else {
      subject = `${resend ? 'Reminder — ' : ''}✍️ Your rental contract is ready to sign — ${g.propLabel}`;
      preheader = 'Sign digitally from your phone in about two minutes.';
      html = shell(
        para(`Ciao ${esc(first)} — your rental contract for <b>${esc(g.propLabel)}</b> is ready for your digital signature. It takes about two minutes, straight from your phone:`)
        + tiles([
          { k: 'Monthly rent', v: eur(contract.rent) },
          { k: 'Period', v: `${fmtEN(contract.startDate)} → ${fmtEN(contract.endDate)}`, sub: months ? months + ' months' : null },
          contract.deposit ? { k: 'Deposit', v: eur(contract.deposit) } : null,
        ])
        + btn(url, 'Review & sign your contract')
        + fine(`Your signature is a legally valid electronic signature (FES — Art. 21 CAD), recorded with a signed
          certificate. This link is personal and single-use — please don’t forward it. Questions? Just reply, or
          <a href="https://wa.me/393313251961" style="color:#141414">WhatsApp BOOM</a>.`, 'margin-top:20px;text-align:center'),
        preheader);
    }
    const ok = await trySend(to, subject, html);
    return { ok };
  } catch (e) { console.warn('[sign/notify] invite:', e.message); return { ok: false, error: e.message }; }
}

// ── After exactly one party has signed ───────────────────────────────────
// opts.nudgeOnly: skip the signer's own confirmation (used by the cron
// re-nudge, which would otherwise re-send "your signature is recorded").
export async function notifyPartialSignature(contract, signedRole, property, opts = {}) {
  try {
    const g = await gather(contract, property);
    const signerIsTenant = signedRole === 'tenant';
    const signerEmail = signerIsTenant ? g.tenantEmail : g.landlordEmail;
    const signerName  = (signerIsTenant ? g.tenantName : g.landlordName) || 'there';
    const otherEmail  = signerIsTenant ? g.landlordEmail : g.tenantEmail;
    const otherName   = (signerIsTenant ? g.landlordName : g.tenantName) || 'there';
    const otherToken  = signerIsTenant ? contract.landlordSignToken : contract.tenantSignToken;
    const link = otherToken ? `${BASE}/sign?sign=${encodeURIComponent(otherToken)}` : '';

    const jobs = [];
    if (signerEmail && !opts.nudgeOnly) {
      // Conferma al firmatario — nella sua lingua.
      if (signerIsTenant) {
        jobs.push(trySend(signerEmail, '✓ Your signature is recorded', shell(
          para(`Hi ${esc(String(signerName).split(' ')[0])},<br>thank you — your signature for <b>${esc(g.propLabel)}</b> is recorded.`)
          + timeline([
            { title: 'Your signature', note: 'Recorded with FES certificate (Art. 21 CAD)' },
            { title: 'Landlord countersigns', note: 'We’ve sent them their link — nothing to do on your side' },
            { title: 'Contract active', note: 'You’ll get your welcome email with portal access' },
          ]),
          'Your signature is recorded — we’re on the landlord now.')));
      } else {
        jobs.push(trySend(signerEmail, '✓ Firma registrata', shell(
          para(`Gentile ${esc(String(signerName).split(' ')[0])},<br>grazie — la Sua firma per <b>${esc(g.propLabel)}</b> è registrata con certificato (art. 21 CAD). Le confermeremo il perfezionamento del contratto.`),
          'La Sua firma è registrata.')));
      }
    }
    if (otherEmail && link) {
      // "Tocca a te" alla controparte — nella SUA lingua.
      if (signerIsTenant) {
        // → landlord, in italiano
        jobs.push(trySend(otherEmail, '✍️ Tocca a Lei — l’inquilino ha firmato', shell(
          para(`Gentile ${esc(String(otherName).split(' ')[0])},<br><b>${esc(signerName)}</b> ha firmato il contratto per <b>${esc(g.propLabel)}</b>. Ora tocca a Lei — un minuto, dal telefono:`)
          + btn(link, 'Firma il contratto')
          + fine('Link personale monouso · Firma Elettronica Semplice (art. 21 CAD). Se non se lo aspettava, ignori questa email.', 'margin-top:20px;text-align:center'),
          `${signerName} ha firmato — manca solo la Sua firma.`)));
      } else {
        jobs.push(trySend(otherEmail, '✍️ It’s your turn to sign', shell(
          para(`Hi ${esc(String(otherName).split(' ')[0])},<br><b>${esc(signerName)}</b> has signed the lease for <b>${esc(g.propLabel)}</b>. It’s your turn now — about a minute, from your phone:`)
          + btn(link, 'Sign the contract')
          + fine('Secure single-use link · FES (Art. 21 CAD). If you didn’t expect this, you can ignore this email.', 'margin-top:20px;text-align:center'),
          `${signerName} signed — your signature completes the contract.`)));
      }
    }
    await Promise.all(jobs);
    return { ok: true, signer: !!signerEmail, counterparty: !!(otherEmail && link) };
  } catch (e) { console.warn('[sign/notify] partial:', e.message); return { ok: false, error: e.message }; }
}

// ── On full completion — milestone to the operator (italiano) ────────────
export async function notifyAdminContractSigned(contract, property) {
  try {
    if (!ADMIN_EMAIL) return { ok: false, error: 'no_admin_email' };
    const g = await gather(contract, property);
    const ok = await trySend(ADMIN_EMAIL, `✓ Contratto firmato da tutti — ${g.propLabel}`, shell(
      para(`Un contratto è appena diventato <b>completo</b>.`)
      + tiles([
        { k: 'Immobile', v: esc(g.propLabel) },
        { k: 'Inquilino', v: esc(g.tenantName || '—') },
        { k: 'Canone', v: eur(contract.rent) },
      ])
      + includes([
        'Obbligazioni fiscali e procedurali a scadenzario',
        'Certificato di firma FES generato',
        'Welcome email a inquilino e proprietario',
        `Fascicolo CAF inviato a ${esc(CAF_EMAIL)}`,
      ])
      + btn(BASE + '/portal', 'Apri il portal')
      + fine(`Contratto <b>${esc(contract.id || '')}</b> · ${esc(g.landlordName || '')} ⇄ ${esc(g.tenantName || '')}`, 'text-align:center'),
      `${g.propLabel} — contratto completo, automazioni partite.`));
    return { ok };
  } catch (e) { console.warn('[sign/notify] admin:', e.message); return { ok: false, error: e.message }; }
}

// ── Welcome emails on completion (tenant EN · landlord IT) ───────────────
// Il contratto FIRMATO viaggia in ALLEGATO a entrambe le parti (insieme al
// certificato di firma): nessuno deve entrare da nessuna parte per avere il
// proprio documento. I link restano nel corpo come rete di sicurezza.
export async function sendWelcomeEmails(contract, property, { portalLink, certUrl, cedolare, nonEU, signedPdfUrl } = {}) {
  const g = await gather(contract, property);
  const out = { tenant: false, landlord: false };
  const certHref = certUrl || contract.signingCertificateUrl || '';
  const signedHref = signedPdfUrl || contract.signedPdfUrl || '';
  const [contractPdf, certPdf] = await Promise.all([
    fetchPdfAttachment(signedHref, 'contratto-firmato.pdf'),
    fetchPdfAttachment(certHref, 'certificato-firma.pdf'),
  ]);
  const attachFor = (contractName, certName) => [
    contractPdf ? { ...contractPdf, filename: contractName } : null,
    certPdf ? { ...certPdf, filename: certName } : null,
  ].filter(Boolean);
  const certLine = certHref
    ? fine(`⬇ <a href="${esc(certHref)}" style="color:#8A6D1D">Signing certificate (PDF)</a> — keep it with your records.`, 'text-align:center')
    : '';

  if (g.tenantEmail) {
    const first = String(g.tenantName || 'there').split(' ')[0];
    const depositPending = !contract.depositPaid && contract.depositPayToken && Number(contract.deposit || 0) > 0;
    const atts = attachFor('BOOM_Signed_Contract.pdf', 'BOOM_Signing_Certificate.pdf');
    out.tenant = await trySend(g.tenantEmail, '🔑 Welcome home — your BOOM contract is active', shell(
      para(`Hi ${esc(first)},<br>your lease for <b>${esc(g.propLabel)}</b> is now <b>fully signed and active</b>. One tap and you’re in your portal — payments, documents and support in one place.`)
      + (contractPdf ? fine('📎 Attached: your <b>signed contract</b> and the signing certificate (PDF) — keep them with your records.', 'text-align:center') : '')
      + btn(portalLink || BASE + '/casa', 'Enter my portal')
      + (contract.id ? btn2(tenantWalletUrl(contract.id), ' Add to Apple Wallet — your home pass') : '')
      + (depositPending
        ? btn2(`${BASE}/sign?deposit=retry&pt=${encodeURIComponent(contract.depositPayToken)}`, `Pay the deposit — ${eur(Math.max(0, Number(contract.deposit || 0) - Number(contract.depositAlreadyPaidEur || 0)))}`)
        : '')
      + rule()
      + timeline([
        { title: 'Set up utilities', note: 'Electricity, gas, water — around your move-in. We’ll remind you.' },
        { title: 'TARI (waste tax)', note: 'Registration with the Comune di Roma' },
        { title: 'Residence / domicile', note: 'If you need it — we can point you the right way' },
      ])
      + (contractPdf ? '' : certLine)
      + fine('Prefer a password? Open the portal, then choose “Set a password”. The one-tap link expires in 72 hours.', 'text-align:center'),
      'Your contract is active — signed copy attached.'), atts);
  }

  if (g.landlordEmail) {
    const first = String(g.landlordName || '').split(' ')[0] || 'Gentile proprietario';
    const fiscal = (cedolare
      ? ['Cedolare secca: raccomandata/PEC al conduttore (rinuncia adeguamento ISTAT)']
      : ['Scelta regime: cedolare secca vs registro + bollo', 'Imposta di registro 2% (min €67) + bollo €16'])
      .concat(['Registrazione contratto (RLI) entro 30 giorni — la seguiamo noi'])
      .concat(nonEU ? ['Cessione di fabbricato alla Questura entro 48h (conduttore extra-UE)'] : []);
    const atts = attachFor('BOOM_Contratto_firmato.pdf', 'BOOM_Certificato_di_firma.pdf');
    out.landlord = await trySend(g.landlordEmail, '✓ Contratto firmato — i prossimi passi', shell(
      para(`Gentile ${esc(first)},<br>il contratto per <b>${esc(g.propLabel)}</b> è <b>firmato da entrambe le parti</b>. BOOM ha già messo a scadenzario i passi qui sotto — la registrazione la seguiamo insieme.`)
      + (contractPdf ? fine('📎 In allegato: il <b>contratto firmato</b> e il certificato di firma (PDF) — da conservare.', 'text-align:center') : '')
      + includes(fiscal.map(esc))
      + btn(BASE + '/portal', 'Apri la dashboard')
      + (contractPdf ? '' : (certHref ? fine(`⬇ <a href="${esc(certHref)}" style="color:#8A6D1D">Certificato di firma (PDF)</a>`, 'text-align:center') : '')),
      'Contratto perfezionato — copia firmata in allegato.'), atts);
  }
  return out;
}

// ── Il fascicolo CAF / asseverazione ─────────────────────────────────────
// Parte UNA volta, a contratto completo (finalize è idempotente): tutta
// l'anagrafica raccolta da Scheda/Magic Sign, l'immobile, i termini, i
// link al PDF firmato, al certificato e ai documenti d'identità. Prima
// viveva in portal-app.js via EmailJS e partiva SOLO dal vecchio flusso di
// firma dentro il portal — su /sign non partiva affatto.
export async function sendCafDossier(contract, property, { certUrl, fascicoloUrl, signedPdfUrl, packUrl, packMissing } = {}) {
  try {
    if (!CAF_EMAIL) return { ok: false, error: 'no_caf_email' };
    const g = await gather(contract, property);
    // Il dossier deve poter essere INOLTRATO così com'è ad ARPE/CAF:
    // contratto firmato, certificato e fascicolo fiscale in allegato.
    const signedHref = signedPdfUrl || contract.signedPdfUrl || '';
    const fascHref = fascicoloUrl || contract.fascicoloFiscaleUrl || '';
    const cafAtts = (await Promise.all([
      fetchPdfAttachment(signedHref, 'BOOM_Contratto_firmato.pdf'),
      fetchPdfAttachment(certUrl || contract.signingCertificateUrl, 'BOOM_Certificato_di_firma.pdf'),
      fetchPdfAttachment(fascHref, 'BOOM_Fascicolo_Fiscale.pdf'),
    ])).filter(Boolean);
    // Documenti d'identità + attestazione esigenza IN ALLEGATO (max 6,
    // budget totale ~18MB): l'email si inoltra ad ARPE/CAF senza aprire
    // nulla. Un download fallito non ferma niente — i link restano sotto.
    {
      const idDocs = (Array.isArray(contract.identityDocs) ? contract.identityDocs : []).slice(0, 6);
      let budget = 18 * 1024 * 1024 - cafAtts.reduce((n, a) => n + (a.content ? a.content.length : 0), 0);
      for (let i = 0; i < idDocs.length; i++) {
        const d = idDocs[i];
        if (!d || !d.url || budget <= 0) continue;
        const isExtra = d.kind === 'extra';
        const base = String(d.name || 'doc').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40);
        const name = (isExtra ? 'Attestazione_esigenza_' : 'Documento_identita_') + (i + 1) + '_'
          + base + (/\.[a-z0-9]{2,4}$/i.test(base) ? '' : '.jpg');
        const att = await fetchPdfAttachment(d.url, name, null);
        if (att && att.content.length <= budget) { cafAtts.push(att); budget -= att.content.length; }
      }
    }
    const reqType = contract.requiresAsseverazione !== false ? 'Asseverazione + Registrazione' : 'Registrazione';
    const cad = g.prop.cadastralData || contract.cadastral || '—';
    const docs = Array.isArray(contract.identityDocs) ? contract.identityDocs : [];
    const docLinks = docs.slice(0, 8).map((d, i) =>
      `<a href="${esc(d.url)}" style="color:#8A6D1D">Doc ${i + 1}${d.name ? ' · ' + esc(d.name) : ''}</a>`).join('<br>') || '—';
    const cadence = [1, 2, 3, 6, 12].includes(Number(contract.installmentMonths)) ? Number(contract.installmentMonths) : 1;
    const cadLabel = { 1: 'mensile', 2: 'bimestrale', 3: 'trimestrale', 6: 'semestrale', 12: 'annuale' }[cadence];

    const partyRows = (P, label) => {
      const name = contract[P + 'Name'] || (P === 'tenant' ? g.tenantName : g.landlordName) || '—';
      const doc = [contract[P + 'DocType'], contract[P + 'DocNum']].filter(Boolean).join(' n. ')
        + (contract[P + 'DocIssuer'] ? ` · rilasciato da ${contract[P + 'DocIssuer']}` : '')
        + (contract[P + 'DocIssueDate'] ? ` il ${contract[P + 'DocIssueDate']}` : '');
      return row(label, `<b>${esc(name)}</b>`,
        [contract[P + 'CF'] ? 'CF ' + contract[P + 'CF'] : null,
         contract[P + 'Dob'] ? 'nato/a ' + contract[P + 'Dob'] + (contract[P + 'Pob'] ? ' a ' + contract[P + 'Pob'] : '') : null,
         contract[P + 'Address'] ? 'res. ' + contract[P + 'Address'] : null,
         doc || null,
         contract[P + 'Nationality'] || null,
        ].filter(Boolean).map(esc).join(' · ') || null);
    };

    const html = shell(
      para(`Fascicolo pronto per la <b>${reqType.toLowerCase()}</b> del contratto <b>${esc(contract.id || '')}</b> — firmato da entrambe le parti, anagrafica completa.`)
      + `<table width="100%" cellpadding="0" cellspacing="0" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;margin-top:8px">
          ${row('Immobile', `<b>${esc(g.propLabel)}</b>`, [cad !== '—' ? 'Catasto: ' + cad : null, g.prop.rooms ? g.prop.rooms + ' vani' : null, g.prop.sqm ? g.prop.sqm + ' mq' : null, (contract.energyClass || g.prop.energyClass) ? 'Classe ' + (contract.energyClass || g.prop.energyClass) : null].filter(Boolean).map(esc).join(' · '))}
          ${partyRows('landlord', 'Locatore')}
          ${partyRows('tenant', 'Conduttore')}
          ${row('Contratto', `<b>${esc(contract.type === 'studenti' ? 'Studenti (art. 5 c.2 L.431/98)' : 'Transitorio')}</b>`, [
              `${fmtIT(contract.startDate)} → ${fmtIT(contract.endDate)}`,
              `canone ${eur(contract.rent)}/mese (rata ${cadLabel})`,
              `deposito ${eur(contract.deposit)}`,
              `cedolare secca: ${(contract.cedolareSecca || 'si') !== 'no' ? 'SÌ' : 'NO'}`,
            ].map(esc).join(' · '))}
          ${row('Allegati', [
              signedHref ? `<a href="${esc(signedHref)}" style="color:#8A6D1D"><b>Contratto firmato (PDF)</b></a>`
                : contract.generatedPDF ? `<a href="${esc(contract.generatedPDF)}" style="color:#8A6D1D"><b>Contratto (PDF, pre-firma)</b></a>` : '<b>PDF non ancora generato</b>',
              certUrl ? `<a href="${esc(certUrl)}" style="color:#8A6D1D"><b>Certificato FES</b></a>` : null,
              fascHref ? `<a href="${esc(fascHref)}" style="color:#8A6D1D"><b>Fascicolo Fiscale</b></a>` : null,
            ].filter(Boolean).join(' · '),
            [cafAtts.length ? `${cafAtts.length} allegati — email pronta da inoltrare` : null,
             fascHref ? 'il Fascicolo contiene: scheda attestazione canone (fascia di oscillazione), dati RLI, scadenzario' : null,
            ].filter(Boolean).join(' · ') || null)}
          ${row('Pack registrazione',
            (packUrl || contract.registrationPackUrl)
              ? `<a href="${esc(packUrl || contract.registrationPackUrl)}" style="color:#8A6D1D"><b>📦 ZIP completo per RLI + ARPE</b></a>`
              : '<b>non generato</b> — bottone 📦 Pack sulla riga contratto',
            (Array.isArray(packMissing) && packMissing.length)
              ? '⚠ Nel pack mancano: ' + packMissing.map(esc).join(', ') + ' — l\'INDICE.txt dentro lo ZIP dice dove caricarli; poi rigenera con 📦 Pack'
              : ((packUrl || contract.registrationPackUrl) ? 'completo: contratto firmato, certificato, fascicolo, visura, planimetria, APE, delega, identità, attestazione esigenza' : null))}
          ${row('Documenti identità', docLinks, null)}
        </table>`
      + btn(BASE + '/portal', 'Apri nel portal')
      + fine('Generato automaticamente alla firma completa. La scadenza RLI (30gg) è già a scadenzario nel portal.', 'text-align:center'),
      `${reqType} — ${g.propLabel} · anagrafica completa e allegati.`);

    const ok = await trySend(CAF_EMAIL, `📑 ${reqType} — ${g.propLabel}`, html, cafAtts);
    return { ok };
  } catch (e) { console.warn('[sign/notify] caf:', e.message); return { ok: false, error: e.message }; }
}
