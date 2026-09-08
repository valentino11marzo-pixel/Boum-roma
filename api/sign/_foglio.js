// api/sign/_foglio.js — IL FOGLIO DI REGISTRAZIONE (l'email pulita).
//
// A firma completa Valentino riceve DUE email: il fascicolo completo
// (api/sign/_notify.js sendCafDossier — interno: verdetto, link da copiare,
// pack, bottoni) e QUESTO: un documento, non una notifica. Niente bottoni,
// niente link al portal, niente «mancano / rigenera / pack», niente emoji
// nell'oggetto. Si inoltra così com'è al commercialista o ad ASPI, si stampa,
// e in Gmail funziona da ARCHIVIO: oggetto stabile e cercabile
// («Registrazione contratto — <immobile> — <conduttore> — <decorrenza>»),
// tutti i dati del modello RLI in righe, gli allegati dentro.
//
// I numeri sono quelli del modello RLI e vengono da UNA aritmetica sola
// (js/contract-fields.js rliFacts): tipologia L2 per entrambi i modelli,
// importo = corrispettivo per l'intera durata se il contratto è inferiore a
// 12 mesi (non canone×12), scadenza registrazione = 30 giorni da
// min(stipula, decorrenza), imponibile 70% quando NON c'è la cedolare. Il
// catasto è stampato a CASELLE (sezione, foglio, particella, subalterno,
// categoria, rendita) come le vuole il quadro B; ogni co-conduttore è un
// conduttore a sé, con la sua riga.
//
// Un valore mancante si stampa «non dichiarato»: l'archivio è onesto ma non
// dà istruzioni — quelle stanno nell'email completa.
//
// Destinatario: REGISTRATION_EMAIL → CAF_EMAIL → valentino@boom-rome.com.
// Best-effort e time-boxed: non blocca mai una firma. Idempotenza: la
// chiama _finalize (dietro finalizedAt) e il portal (✉ Foglio, che RIMANDA
// di proposito). Stampa contract.registrationSheetSentAt.

import { fsPatch } from '../homie/_lib.js';
import { sendEmail } from '../agent/_lib.js';
import { shell, para, fine, rule, row } from '../preagreement/_notify.js';
import { fetchPdfAttachment, gather } from './_notify.js';
import FIELDS from '../../js/contract-fields.js';

const REGISTRATION_EMAIL = process.env.REGISTRATION_EMAIL || process.env.CAF_EMAIL || 'valentino@boom-rome.com';

const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
// Numeri all'italiana DETERMINISTICI (la lezione /executive e del fascicolo:
// toLocaleString su runtime con ICU ridotta stampa 1250,00 invece di
// 1.250,00 — su un foglio per l'AdE il punto delle migliaia non è un dettaglio).
const itNum = (n) => { const f = Math.abs(Number(n)).toFixed(2); const [i, d] = f.split('.'); return (Number(n) < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d; };
const eur = n => (n === null || n === undefined || n === '' || isNaN(Number(n))) ? '' : '€ ' + itNum(n);
const dIT = s => { const t = String(s || '').slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return ''; const d = new Date(t + 'T00:00'); return isNaN(d) ? '' : d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
const ND = '<span style="color:#9A958A">non dichiarato</span>';
const v = (s) => { const t = String(s == null ? '' : s).trim(); return t ? esc(t) : ND; };
const vd = (s) => { const t = dIT(s); return t ? esc(t) : ND; };
const ve = (n) => { const t = eur(n); return t ? esc(t) : ND; };

export const H = (title) => `<tr><td colspan="2" style="padding:22px 0 6px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:2.2px;text-transform:uppercase;color:#8A6D1D;border-bottom:1px solid #D4AF37">${esc(title)}</td></tr>`;
const R = (k, val, sub) => row(k, val, sub);

export function tableHtml(rows) {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">${rows.join('')}</table>`;
}

// Costruisce oggetto + HTML del foglio. Pura rispetto alla rete: i dati
// arrivano risolti (contratto IDRATATO dalla catena users, immobile,
// etichetta). Esportata per i test.
// Le RIGHE del foglio (immobile a caselle, locatore, conduttori, contratto):
// le usa anche l'email COMPLETA di _notify.js, così le due email non possono
// dire due cose diverse sullo stesso dato.
export function sheetRows({ contract, property }) {
  const c = contract || {};
  const p = property || {};
  const ctx = { contract: c, property: p, tenant: {}, landlord: {} };
  const rli = FIELDS.rliFacts(c);
  const legal = FIELDS.legalChecks(ctx);
  const studenti = c.type === 'studenti';
  const read = (k) => FIELDS.read(k, ctx);
  const tenantNat = read('tenantNationality');
  const nonEU = !!tenantNat && !FIELDS.isEU(tenantNat);
  const cessioneEntro = (() => { const d = c.startDate ? new Date(String(c.startDate).slice(0, 10) + 'T00:00') : null; if (!d || isNaN(d)) return ''; d.setDate(d.getDate() + 2); return d.toISOString().slice(0, 10); })();
  const kind = read('landlordKind') === 'giuridica' ? 'giuridica' : 'fisica';
  const docLine = (P) => {
    const t = read(P + 'DocType'), n = read(P + 'DocNum'), by = read(P + 'DocIssuer'), on = read(P + 'DocIssueDate');
    if (!t && !n) return '';
    return [t ? FIELDS.docTypeIt(t) : '', n ? 'n. ' + n : '', by ? 'rilasciato da ' + by : '', on ? 'il ' + dIT(on) : ''].filter(Boolean).join(' ');
  };
  const cadence = { 1: 'mensile', 2: 'bimestrale', 3: 'trimestrale', 6: 'semestrale', 12: 'annuale' }[[1, 2, 3, 6, 12].includes(Number(c.installmentMonths)) ? Number(c.installmentMonths) : 1];
  const depMonths = (() => { const d = c.deposit && typeof c.deposit === 'object' ? c.deposit : { amount: c.deposit, months: c.depositMonths }; const m = Number(d.months); if (m > 0) return m; const a = Number(d.amount), r = Number(rli.rentMonthly); return (a > 0 && r > 0) ? Math.round(a / r * 100) / 100 : 0; })();
  const depAmount = (c.deposit && typeof c.deposit === 'object') ? c.deposit.amount : c.deposit;
  const city = read('propertyCity') || 'Roma';
  const isRoma = /roma/i.test(city);

  const rows = [];
  rows.push(H('Immobile'));
  rows.push(R('Indirizzo', `<b>${v([city, read('propertyAddress')].filter(Boolean).join(', '))}</b>`,
    [read('propertyFloor') ? 'piano ' + esc(read('propertyFloor')) : null, read('propertyScala') ? 'scala ' + esc(read('propertyScala')) : null, read('propertyInterno') ? 'int. ' + esc(read('propertyInterno')) : null, read('propertyRooms') ? esc(read('propertyRooms')) + ' vani' : null, read('propertyFurnished') ? (read('propertyFurnished') === 'yes' ? 'ammobiliato' : 'non ammobiliato') : null].filter(Boolean).join(' · ') || null));
  rows.push(R('Comune (codice)', isRoma ? '<b>Roma (H501)</b>' : v(city)));
  rows.push(R('Sezione urbana', v(read('catSezione') || '—')));
  rows.push(R('Foglio', `<b>${v(read('catFoglio'))}</b>`));
  rows.push(R('Particella', `<b>${v(read('catParticella'))}</b>`));
  rows.push(R('Subalterno', `<b>${v(read('catSub'))}</b>`));
  rows.push(R('Categoria', v(read('catCategoria'))));
  rows.push(R('Rendita catastale', ve(read('propertyRendita') || null)));
  rows.push(R('Classe energetica', v(read('propertyEnergy'))));
  if (!read('catFoglio') && (p.cadastralData || c.cadastral)) rows.push(R('Catasto (testo)', v(p.cadastralData || c.cadastral), 'dato non strutturato — verificare in visura'));

  rows.push(H('Locatore'));
  rows.push(R('Nome / denominazione', `<b>${v(read('landlordName'))}</b>`, kind === 'giuridica' ? 'persona giuridica' : 'persona fisica'));
  rows.push(R('Codice fiscale', `<b>${v(read('landlordCF'))}</b>`));
  if (kind === 'giuridica') rows.push(R('Partita IVA', v(read('landlordPIva'))));
  else rows.push(R('Nascita', read('landlordDob') || read('landlordPob') ? esc([dIT(read('landlordDob')), read('landlordPob') ? 'a ' + read('landlordPob') : ''].filter(Boolean).join(' ')) : ND));
  rows.push(R(kind === 'giuridica' ? 'Sede legale' : 'Residenza', v(read('landlordAddress'))));
  if (docLine('landlord')) rows.push(R('Documento', esc(docLine('landlord'))));
  if (read('landlordEmail')) rows.push(R('Email', esc(read('landlordEmail'))));

  const cos = Array.isArray(c.coTenants) ? c.coTenants.filter(x => x && x.name) : [];
  rows.push(H(cos.length ? 'Conduttore 1' : 'Conduttore'));
  rows.push(R('Nome', `<b>${v(read('tenantName'))}</b>`));
  rows.push(R('Codice fiscale', `<b>${v(read('tenantCF'))}</b>`));
  rows.push(R('Nascita', read('tenantDob') || read('tenantPob') ? esc([dIT(read('tenantDob')), read('tenantPob') ? 'a ' + read('tenantPob') : ''].filter(Boolean).join(' ')) : ND));
  rows.push(R('Residenza', v(read('tenantAddress')), studenti ? 'sul contratto: domiciliato nei locali locati' : null));
  rows.push(R('Documento', docLine('tenant') ? esc(docLine('tenant')) : ND));
  rows.push(R('Nazionalità', v(tenantNat), tenantNat ? (nonEU ? 'extra-UE' : 'UE/SEE') : null));
  if (nonEU) rows.push(R('Cessione di fabbricato', `<b>SÌ — entro il ${esc(dIT(cessioneEntro) || '48 ore dalla consegna')}</b>`,
    [read('tenantPermessoNumero') ? 'permesso/visto n. ' + esc(read('tenantPermessoNumero')) : 'estremi del permesso non dichiarati', read('tenantPermessoScadenza') ? 'scadenza ' + esc(dIT(read('tenantPermessoScadenza'))) : null].filter(Boolean).join(' · ')));
  if (read('tenantEmail')) rows.push(R('Email', esc(read('tenantEmail'))));
  cos.forEach((co, i) => {
    const d = FIELDS.cotenantIdentity(co);
    rows.push(H('Conduttore ' + (i + 2)));
    rows.push(R('Nome', `<b>${v(d.name)}</b>`));
    rows.push(R('Codice fiscale', `<b>${v(d.cf)}</b>`));
    rows.push(R('Nascita', d.dob || d.pob ? esc([dIT(d.dob), d.pob ? 'a ' + d.pob : ''].filter(Boolean).join(' ')) : ND));
    rows.push(R('Residenza', v(d.address)));
    rows.push(R('Documento', d.docNum ? esc([d.docType ? FIELDS.docTypeIt(d.docType) : '', 'n. ' + d.docNum].filter(Boolean).join(' ')) : ND));
    rows.push(R('Nazionalità', v(d.nationality)));
  });

  rows.push(H('Contratto'));
  rows.push(R('Tipologia RLI', `<b>${esc(rli.tipologiaLabel)}</b>`, esc((studenti ? 'Locazione per studenti universitari — ' : 'Locazione transitoria — ') + rli.article + ' · ' + rli.accordo)));
  rows.push(R('Decorrenza → scadenza', `<b>${vd(c.startDate)} → ${vd(c.endDate)}</b>`, rli.months ? rli.months + ' mesi' : null));
  rows.push(R('Canone mensile', `<b>${ve(rli.rentMonthly || null)}</b>`, 'rate ' + cadence + (Number(c.paymentDay) ? ', entro il giorno ' + Number(c.paymentDay) : '')));
  rows.push(R('Canone annuo', ve(rli.rentMonthly ? rli.rentAnnual : null)));
  rows.push(R('Corrispettivo per la durata', ve(rli.rentMonthly ? rli.totalForTerm : null)));
  rows.push(R('Importo da indicare in RLI', `<b>${ve(rli.rentMonthly ? rli.amountForRli : null)}</b>`, esc(rli.amountForRliNote)));
  rows.push(R('Deposito cauzionale', Number(depAmount) > 0 ? esc(eur(depAmount)) : (studenti ? 'nessuno' : ND), Number(depAmount) > 0 && depMonths ? depMonths + ' mensilità' : null));
  rows.push(R('Cedolare secca', `<b>${rli.cedolare ? 'SÌ' : 'NO'}</b>`, rli.cedolare ? 'esente da imposta di registro e bollo (art. 3 D.Lgs. 23/2011)' : `imponibile registro ${esc(eur(rli.imponibileRegistro))} (70%) · imposta di registro ${esc(eur(rli.impostaRegistro))} · bollo ${esc(eur(rli.bollo))}`));
  rows.push(R('Oneri accessori', read('condoMode') === 'incluso' ? 'compresi nel canone' : (read('oneriQuota') ? esc(eur(read('oneriQuota'))) + ' al mese, salvo conguaglio' : 'a consuntivo (Tabella oneri accessori, allegato D)')));
  rows.push(R('Uso / conviventi', v(read('cohabitants') || (cos.length ? '' : 'nessuno'))));
  if (studenti) {
    rows.push(R('Corso di studi', v(read('studCorsoStudi'))));
    rows.push(R('Università', v(read('studUniversita')), [read('studTipoIscrizione') ? esc(read('studTipoIscrizione')) : null, read('studAnnoAccademico') ? 'a.a. ' + esc(read('studAnnoAccademico')) : null, read('studUniversitaIndirizzo') ? esc(read('studUniversitaIndirizzo')) : null].filter(Boolean).join(' · ') || null));
  } else {
    rows.push(R('Esigenza transitoria', v(read('transitionalReason')), (read('esigenzaDi') === 'locatore' ? 'dichiarata dal locatore' : 'dichiarata dal conduttore') + (read('transitionalDocs') ? ' · documentata con: ' + esc(read('transitionalDocs')) : '')));
  }
  rows.push(R('Stipula', rli.stipula ? esc(dIT(rli.stipula)) : ND, 'firma elettronica (FES, art. 21 CAD) con certificato'));
  rows.push(R('Registrazione entro', rli.registrationDeadline ? `<b>${esc(dIT(rli.registrationDeadline))}</b>` : ND, rli.registrationFrom ? '30 giorni da ' + esc(dIT(rli.registrationFrom)) + (rli.stipula && rli.decorrenza && rli.stipula < rli.decorrenza ? ' (stipula)' : ' (decorrenza)') : null));
  rows.push(R('Parti', `${rli.nLocatori} locatore · ${rli.nConduttori} conduttor${rli.nConduttori === 1 ? 'e' : 'i'}`));
  legal.forEach(l => rows.push(R('Durata di legge', l.ok ? 'conforme' : '<b>NON conforme</b>', esc(l.note.it) + (l.ok ? '' : ' — durata pattuita ' + l.months + ' mesi'))));
  rows.push(R('Protocollo BOOM', esc(c.id || ''), c.preAgreementRef ? 'proposta ' + esc(c.preAgreementRef) : null));
  return { rows, rli, legal, studenti };
}

export function buildRegistrationSheet({ contract, property, propLabel, attachedNames, generatedAt }) {
  const c = contract || {};
  const p = property || {};
  const ctx = { contract: c, property: p, tenant: {}, landlord: {} };
  const read = (k) => FIELDS.read(k, ctx);
  const { rows, rli, studenti } = sheetRows({ contract: c, property: p });

  rows.push(H('Allegati'));
  const names = Array.isArray(attachedNames) ? attachedNames : [];
  rows.push(R('In questa email', names.length ? names.map(esc).join('<br>') : ND, names.length ? names.length + ' file' : null));

  const title = `Registrazione contratto — ${propLabel} — ${read('tenantName') || 'conduttore'} — ${String(c.startDate || '').slice(0, 10) || 'data da definire'}`;
  const html = shell(
    para(`<b>Contratto di locazione ${studenti ? 'per studenti universitari' : 'transitorio'} — dati per la registrazione (Mod. RLI).</b><br>Immobile <b>${esc(propLabel)}</b>, conduttore <b>${esc(read('tenantName') || '—')}</b>, decorrenza ${vd(c.startDate)}. Il foglio riporta i dati dichiarati dalle parti e i documenti in allegato: si inoltra così com'è.`)
    + tableHtml(rows)
    + rule()
    + fine(`Foglio generato automaticamente da BOOM Roma · Egidi Immobiliare S.r.l. il ${esc(dIT(generatedAt) || '')} · contratto ${esc(c.id || '')}${rli.stipula ? ' · firmato il ' + esc(dIT(rli.stipula)) : ''}. I valori indicati come «non dichiarato» non sono stati forniti dalle parti al momento della generazione.`, 'text-align:center'),
    `Foglio di registrazione — ${propLabel} · ${read('tenantName') || ''}`);
  return { subject: title.slice(0, 180), html };
}

// L'operazione: idrata, allega, manda, stampa lo stato. Mai lancia.
export async function sendRegistrationSheet(contract, property, { certUrl, fascicoloUrl, signedPdfUrl, tenant, landlord, now } = {}) {
  try {
    if (!contract || !contract.id) return { ok: false, error: 'no_contract' };
    const to = REGISTRATION_EMAIL;
    if (!to) return { ok: false, error: 'no_recipient' };
    const g = await gather(contract, property);
    const prop = property || g.prop || {};
    const t = tenant || g.tenant || {};
    const l = landlord || { ...(g.landlordR || {}), ...(g.landlordU || {}) };
    // Il contratto IDRATATO: un CF presente solo sul profilo utente compare
    // sul foglio come sul PDF (stessa catena di lettura).
    const hydrated = FIELDS.hydrateParties({ ...contract, id: contract.id }, t, l, prop);
    const signedHref = signedPdfUrl || contract.signedPdfUrl || '';
    const cert = certUrl || contract.signingCertificateUrl || '';
    const fasc = fascicoloUrl || contract.fascicoloFiscaleUrl || '';

    const wanted = [];
    if (signedHref) wanted.push([signedHref, 'Contratto_firmato.pdf', 'application/pdf']);
    else if (contract.generatedPDF) wanted.push([contract.generatedPDF, 'Contratto.pdf', 'application/pdf']);
    if (cert) wanted.push([cert, 'Certificato_firma_FES.pdf', 'application/pdf']);
    if (fasc) wanted.push([fasc, 'Fascicolo_fiscale.pdf', 'application/pdf']);
    const docs = (Array.isArray(contract.identityDocs) ? contract.identityDocs : []).filter(d => d && d.url);
    const seen = new Set();
    let idN = 0, exN = 0;
    const extOf = (url, fb) => { const m = /\.([a-z0-9]{2,4})(?:\?|$)/i.exec(String(url || '').split('%2F').pop() || ''); return m ? '.' + m[1].toLowerCase() : fb; };
    for (const d of docs.slice(0, 8)) {
      if (seen.has(d.url)) continue; seen.add(d.url);
      if (d.kind === 'extra') { exN++; wanted.push([d.url, 'Attestazione_esigenza_' + exN + extOf(d.url, '.pdf'), null]); }
      else { idN++; wanted.push([d.url, 'Documento_' + (d.role === 'landlord' ? 'locatore' : 'conduttore') + '_' + idN + extOf(d.url, '.jpg'), null]); }
    }
    const attachments = [];
    let budget = 18 * 1024 * 1024;
    for (const [url, name, ct] of wanted) {
      if (budget <= 0) break;
      const att = await fetchPdfAttachment(url, name, ct);
      if (att && att.content.length <= budget) { attachments.push(att); budget -= att.content.length; }
    }

    const { subject, html } = buildRegistrationSheet({
      contract: hydrated, property: prop, propLabel: g.propLabel,
      attachedNames: attachments.map(a => a.filename), generatedAt: (now || new Date()).toISOString(),
    });
    await Promise.race([
      sendEmail({ to, subject, html, attachments }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('email_timeout')), 20000)),
    ]);
    const stamp = (now || new Date()).toISOString();
    fsPatch('contracts/' + contract.id, { registrationSheetSentAt: stamp, registrationSheetTo: to }).catch(() => {});
    return { ok: true, to, attachments: attachments.length, subject };
  } catch (e) { console.warn('[sign/foglio]', e.message); return { ok: false, error: e.message }; }
}
