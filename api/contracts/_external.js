// External signatures rejoin the SAME contract. No FES is manufactured,
// no welcome/payment/invoice side effects are replayed by a recovery.
import crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { fsGet, fsGetVersioned, fsCommit, fsPatch, fsCreate, fsList } from '../homie/_lib.js';
import { storageUpload } from '../agent/_lib.js';
import { readBytes, signedParties, voidSignatures, isFullySigned } from './revise.js';
import completion from '../../js/contract-completion-engine.js';
import FIELDS from '../../js/contract-fields.js';
import { archiveSignedContract } from '../sign/_archive.js';
import { withProfileDocs } from '../sign/_iddocs.js';
import { buildFascicolo } from '../fiscal/fascicolo.js';
import { buildRegistrationPack } from '../sign/_pack.js';
import { buildRegistrationSheet } from '../sign/_foglio.js';
import { applyOccupancy } from './_occupancy.js';
import { postSignatureObligations, writeObligations, cedolareOf, isEU } from '../sign/_obligations.js';
import { ensureRentSchedule } from '../payments/_schedule.js';
import { sendWelcomeEmails, gather } from '../sign/_notify.js';

const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const stable = v => JSON.stringify(v, function(k,x) { return x && !Array.isArray(x) && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(key => [key,x[key]])) : x; });
export const termsHash = (c,p) => sha(stable(completion.terms(c,p)));
export const externalTermsValid = (c,p) => !completion.external(c) || c.externalSignedDocument.termsHash === termsHash(c,p);
const fail = (error, status = 422) => ({ ok:false, error, status });
const propertyOf = c => c.propertyId ? fsGet('properties/'+c.propertyId) : null;

export function externalReview(c, p, updateTime) {
  return { version:updateTime, terms:completion.terms(c,p), termsHash:termsHash(c,p),
    signed:signedParties(c), canAdopt:!isFullySigned(c) && !c.signedPdfUrl && c.registrationStatus !== 'registered',
    document:c.externalSignedDocument || null, preparation:c.externalPreparation || null,
    progress:c.registrationProgress || null, signedPdfUrl:c.signedPdfUrl || null,
    packUrl:c.registrationPackUrl || null, sheetUrl:c.registrationSheetUrl || null,
    missingProfiles:completion.missingProfiles(c,p), termsValid:externalTermsValid(c,p),
    receiptArchive:c.registrationReceiptArchive || null };
}

// `opts.checkPdf` (facoltativo, la console pre-agreement): legge il PDF contro
// i dati PRIMA di qualunque scrittura. Una differenza ferma tutto con 409
// `pdf_terms_mismatch` e le voci; con `acceptMismatch:true` si carica e la
// scelta resta sul contratto (`pdfCheck.accepted`). Senza il gancio il
// percorso del portal resta quello di sempre.
export async function adoptExternal(contractId, b, actor, opts = {}) {
  const v = await fsGetVersioned('contracts/'+contractId);
  if (!v) return fail('contract_not_found',404);
  const c = {...v.data,id:contractId}, p = await propertyOf(c);
  const bytes = await readBytes(b, contractId);
  if (bytes.error) return fail(bytes.error);
  const buf = bytes.buf, hash = sha(buf);
  if (completion.external(c)) {
    if (c.externalSignedDocument.sha256 !== hash) return fail('definitive_already_exists',409);
    return {ok:true, adopted:true, duplicate:true};
  }
  if (isFullySigned(c) || c.signedPdfUrl || c.registrationStatus === 'registered') return fail('fully_signed',409);
  if (!b.version || b.version !== v.updateTime || b.termsHash !== termsHash(c,p)) return fail('review_changed',409);
  if (b.confirmComplete !== true || b.confirmTerms !== true) return fail('review_required');
  if (!completion.validDate(b.signedDate) || b.signedDate > new Date().toISOString().slice(0,10)) return fail('bad_signed_date');
  if (!c.propertyId || !p || !c.tenantName || !c.landlordName || !completion.validDate(c.startDate) || !completion.validDate(c.endDate)) return fail('contract_data_incomplete');
  if (completion.missingProfiles(c,p).length) return fail('party_profiles_required');
  const profiles = [c.tenantId,p.ownerId||c.landlordId||c.ownerId,...(c.coTenants||[]).map(x=>x.userId)];
  if ((await Promise.all(profiles.map(id=>fsGet('users/'+id)))).some(x=>!x)) return fail('party_profiles_required');
  if (signedParties(c).length && b.archivePreviousSignatures !== true) return fail('archive_signatures_required');
  if (!buf.length || buf.length > 15*1024*1024 || !buf.subarray(0,1024).includes(Buffer.from('%PDF-'))) return fail('not_pdf');
  let pages;
  try { const pdf = await PDFDocument.load(buf); pages = pdf.getPageCount(); if (!pages) throw Error(); }
  catch { return fail('pdf_unreadable'); }
  let pdfCheck = null;
  if (typeof opts.checkPdf === 'function') {
    try { pdfCheck = await opts.checkPdf({ buf, contract: c, property: p, pages }); }
    catch { pdfCheck = { status: 'unchecked', reason: 'check_failed', diff: [], unread: [] }; }
    if (pdfCheck && pdfCheck.status === 'mismatch' && b.acceptMismatch !== true) return { ...fail('pdf_terms_mismatch', 409), check: pdfCheck };
  }
  const url = await storageUpload(`contracts/${contractId}/external-signed/${hash}.pdf`,buf,'application/pdf');
  if (!url) return fail('storage_failed',503);
  const now = new Date().toISOString();
  const prior = voidSignatures(c,{withImages:false});
  const proof = {v:Number(c.contractVersion)||1, url:c.generatedPDF||null, hash:c.pdfHash||null,
    source:c.pdfSource||'boom', supersededAt:now, supersededBy:actor.uid,
    reason:'Contratto definitivo firmato esternamente', voidedSignatures:prior.archive};
  const document = {sha256:hash,url,pages,bytes:buf.length,name:String(b.fileName||'contratto-firmato.pdf').slice(0,120),
    source:'external', verification:'operator', verifiedBy:actor.uid, verifiedAt:now, signedDate:b.signedDate,
    termsHash:termsHash(c,p), terms:completion.terms(c,p), landlordId:p.ownerId||c.landlordId||c.ownerId||''};
  const patch = {...prior.patch, signedPdfUrl:url, externalSignedDocument:document,
    signingCertificateUrl:null, signatureStatus:'complete', fullySignedAt:b.signedDate+'T12:00:00.000Z',
    finalizedAt:now, contractVersion:(Number(c.contractVersion)||1)+1,
    // The uploaded original is also protected from template regeneration.
    pdfSource:'upload', pdfHash:hash, generatedPDF:url, pdfFileName:document.name,
    contractVersions:[...(c.contractVersions||[]),proof],
    externalPreparation:{status:'pending',at:now}, updatedAt:now,
    ...(pdfCheck ? { pdfCheck: { ...pdfCheck, accepted: pdfCheck.status === 'mismatch', by: actor.uid, via: 'external' } } : {})};
  // Preserve the economic terms and associations fingerprint across adoption.
  document.termsHash = termsHash({...c,...patch},p);
  document.terms = completion.terms({...c,...patch},p);
  // A property reassignment while uploading also invalidates the review.
  const pv = await fsGetVersioned('properties/'+c.propertyId);
  if (!pv || termsHash(c,pv.data) !== b.termsHash) return fail('review_changed',409);
  try {
    await fsCommit([
      {docPath:'contracts/'+contractId,fields:patch,precondition:{updateTime:v.updateTime}},
      {docPath:'properties/'+c.propertyId,fields:{},precondition:{updateTime:pv.updateTime}},
    ]);
  } catch(e) { if (e.conflict) return fail('review_changed',409); throw e; }
  return {ok:true,adopted:true,...(pdfCheck?{check:pdfCheck}:{})};
}

// Recovery writes are deterministic; every incomplete step remains visible.
// No email is sent by preparing or retrying the dossier.
export async function prepareExternal(contractId) {
  const v = await fsGetVersioned('contracts/'+contractId);
  if (!v) return fail('contract_not_found',404);
  let c = {...v.data,id:contractId};
  if (!completion.external(c) || !completion.definitive(c)) return fail('external_contract_required');
  const p = await propertyOf(c);
  if (!externalTermsValid(c,p)) return fail('signed_terms_changed',409);
  if (c.externalPreparation?.status === 'running' && Date.now()-Date.parse(c.externalPreparation.at) < 90000) return fail('preparation_running',409);
  const claim = crypto.randomUUID();
  try { await fsCommit([{docPath:'contracts/'+contractId,fields:{externalPreparation:{status:'running',at:new Date().toISOString(),claim}},precondition:{updateTime:v.updateTime}}]); }
  catch(e) { if(e.conflict) return fail('preparation_running',409); throw e; }
  const steps = {};
  const step = async (key,fn) => { try { steps[key] = await fn(); } catch { steps[key] = {ok:false,error:key+'_failed'}; } };
  await step('preagreement',async () => {
    if(!c.preAgreementId) return {ok:true,skipped:'no_preagreement'};
    const pv=await fsGetVersioned('preAgreements/'+c.preAgreementId);
    if(!pv || pv.data.contractId!==contractId) return {ok:false,error:'preagreement_link_changed'};
    await fsCommit([{docPath:'preAgreements/'+c.preAgreementId,fields:{contractId,contractSignatureStatus:'complete',
      contractSignatureAt:c.externalSignedDocument.verifiedAt,contractFullySignedAt:c.fullySignedAt,contractSignatureSource:'external'},precondition:{updateTime:pv.updateTime}}]);
    return {ok:true};
  });
  await step('archive',async () => {
    const r = await archiveSignedContract(c,p,{signedPdfUrl:c.signedPdfUrl});
    const missingProfiles = completion.missingProfiles(c,p);
    return {...r,ok:r.ok && !missingProfiles.length,missingProfiles};
  });
  await step('deadline',async () => {
    if (c.registrationStatus === 'registered') return {ok:true,skipped:'registered'};
    const existing = await fsList('deadlines',{filter:{field:'linkedContractId',op:'EQUAL',value:contractId},limit:100});
    if (!existing.some(d => d.type === 'contract_registration' || String(d.title||'').startsWith('Registrare RLI'))) {
      try { await fsCreate('deadlines',{title:'Registrare RLI - '+(p?.address||p?.name||contractId),type:'contract_registration',
        date:FIELDS.rliFacts(c).registrationDeadline,priority:'high',linkedContractId:contractId,linkedPropertyId:c.propertyId,status:'pending',autoGenerated:true},'rli_'+contractId); }
      catch(e) { if (!String(e.message).includes('409') && !String(e.message).includes('ALREADY_EXISTS')) throw e; }
    }
    return {ok:true};
  });
  // La casa È affittata e lo scadenzario è quello di Magic Sign (2/11/2026):
  // prima il firmato esterno lasciava l'immobile libero, l'annuncio senza data
  // di rilascio e la sola RLI a scadenzario. Scritture deterministiche,
  // nessuna email (benvenuto e calendario canoni sono in onboardExternal).
  await step('occupancy',async () => applyOccupancy(contractId,c));
  await step('obligations',async () => {
    const tenant = c.tenantId ? await fsGet('users/'+c.tenantId).catch(()=>null) : null;
    const signed = c.fullySignedAt || (c.externalSignedDocument.signedDate+'T12:00:00.000Z');
    const ob = postSignatureObligations({contract:c,nationality:c.tenantNationality||(tenant&&tenant.nationality)||'',now:new Date(),signDate:new Date(signed)});
    const r = await writeObligations(contractId,ob);
    return {ok:r.failed===0,created:r.created};
  });
  await step('dossier',async () => {
    c = {...c,identityDocs:(await withProfileDocs(c,p)).identityDocs||c.identityDocs};
    const r = await buildFascicolo(contractId,{contract:c,property:p});
    if(r.ok) {c.fascicoloFiscaleUrl=r.url;c.schedaCanoneUrl=r.schedaUrl;}
    return {ok:!!r.ok,url:r.url||null,schedaUrl:r.schedaUrl||null};
  });
  await step('sheet',async () => {
    const sheet = buildRegistrationSheet({contract:c,property:p,propLabel:p?.address||p?.name||'',attachedNames:[],generatedAt:new Date().toISOString()});
    const url = await storageUpload(`contracts/${contractId}/registration-sheet.html`,Buffer.from(sheet.html),'text/html; charset=utf-8');
    if (!url) throw Error();
    await fsPatch('contracts/'+contractId,{registrationSheetUrl:url});
    return {ok:true,url};
  });
  await step('pack',async () => {
    const r = await buildRegistrationPack(c,p,{signedPdfUrl:c.signedPdfUrl});
    return {ok:!!r.ok,url:r.url||null,missing:r.missing||[]};
  });
  const fresh = await fsGetVersioned('contracts/'+contractId);
  if (!fresh || fresh.data.externalPreparation?.claim !== claim) return fail('preparation_changed',409);
  if (!externalTermsValid(fresh.data,await propertyOf(fresh.data))) steps.terms = {ok:false,error:'signed_terms_changed'};
  const state = {status:Object.values(steps).every(x=>x.ok)?'ready':'incomplete',at:new Date().toISOString(),steps};
  await fsCommit([{docPath:'contracts/'+contractId,fields:{externalPreparation:state},precondition:{updateTime:fresh.updateTime}}]);
  return {ok:true,preparation:state};
}

export async function saveRegistrationProgress(contractId,b,actor) {
  const v = await fsGetVersioned('contracts/'+contractId);
  if(!v) return fail('contract_not_found',404);
  const c=v.data,p=await propertyOf(c),error=completion.progressError(c,b);
  if(error) return fail(error);
  if(!externalTermsValid(c,p)) return fail('signed_terms_changed',409);
  if(b.version !== v.updateTime) return fail('review_changed',409);
  const progress={channel:b.channel,stage:b.stage,reference:String(b.reference||'').trim().slice(0,180),
    note:String(b.note||'').trim().slice(0,1000),at:new Date().toISOString(),by:actor.uid,
    signedHash:c.externalSignedDocument?.sha256||null};
  const fields={registrationProgress:progress,
    registrationProgressHistory:[...(c.registrationProgressHistory||[]).slice(-39),progress]};
  try{await fsCommit([{docPath:'contracts/'+contractId,fields,precondition:{updateTime:v.updateTime}}]);}
  catch(e){if(e.conflict)return fail('review_changed',409);throw e;}
  return {ok:true,progress};
}

// An uncertain transport is resolved only by an explicit operator check.
// This records evidence; it does not send mail. A later Send is a new action.
export async function resolveCafDelivery(contractId,b,actor) {
  const v=await fsGetVersioned('contracts/'+contractId);
  if(!v) return fail('contract_not_found',404);
  const c=v.data,d=c.registrationCafDelivery;
  if(!completion.external(c)||!d||!['sending','uncertain'].includes(d.status)) return fail('no_uncertain_delivery',409);
  if(b.version!==v.updateTime) return fail('review_changed',409);
  if(Date.now()-Date.parse(d.at)<90000) return fail('delivery_still_running',409);
  if(!['sent','not_sent'].includes(b.outcome)||b.confirm!==true||!String(b.note||'').trim()) return fail('delivery_verification_required');
  const evidence={...d,resolvedAt:new Date().toISOString(),resolvedBy:actor.uid,outcome:b.outcome,note:String(b.note).trim().slice(0,1000)};
  const fields={registrationCafDelivery:b.outcome==='sent'?{...evidence,status:'sent'}:null,
    registrationCafHistory:[...(c.registrationCafHistory||[]).slice(-19),evidence]};
  if(b.outcome==='sent')Object.assign(fields,{aspiRequestedAt:d.at,aspiRequestTo:d.to,
    ...(c.registrationStatus!=='registered'?{registrationStatus:'sent'}:{})});
  try{await fsCommit([{docPath:'contracts/'+contractId,fields,precondition:{updateTime:v.updateTime}}]);}
  catch(e){if(e.conflict)return fail('review_changed',409);throw e;}
  return {ok:true};
}

// Link an existing portal identity before reviewing the final PDF. Never
// replace an existing party or infer a profile from a similar name.
export async function linkExternalParty(contractId,b) {
  const v=await fsGetVersioned('contracts/'+contractId);
  if(!v)return fail('contract_not_found',404);
  const c=v.data;
  if(isFullySigned(c)||c.signedPdfUrl)return fail('fully_signed',409);
  if(b.version!==v.updateTime)return fail('review_changed',409);
  if(!/^[\w-]{1,128}$/.test(b.userId||'')||b.confirm!==true)return fail('profile_confirmation_required');
  const pv=await fsGetVersioned('properties/'+c.propertyId),uv=await fsGetVersioned('users/'+b.userId);
  if(!pv||!uv)return fail('profile_not_found');
  const missing=completion.missingProfiles(c,pv.data);
  if(!missing.includes(b.party))return fail('party_already_linked',409);
  const role=b.party==='landlord'?'landlord':'tenant';
  if(uv.data.role!==role)return fail('profile_role_mismatch');
  const partyCf=b.party==='tenant'?c.tenantCF:b.party==='landlord'?c.landlordCF:c.coTenants[Number(b.party.slice(2))]?.cf;
  const userCf=uv.data.cf||uv.data.codiceFiscale;
  const norm=x=>String(x||'').replace(/\s/g,'').toUpperCase();
  if(partyCf&&userCf&&norm(partyCf)!==norm(userCf))return fail('profile_identity_mismatch');
  if([c.tenantId,pv.data.ownerId,c.landlordId,...(c.coTenants||[]).map(x=>x.userId)].includes(b.userId))return fail('profile_already_used');
  const fields={},writes=[];
  if(b.party==='tenant')fields.tenantId=b.userId;
  else if(b.party==='landlord'){
    fields.landlordId=b.userId;
    writes.push({docPath:'properties/'+c.propertyId,fields:{ownerId:b.userId},precondition:{updateTime:pv.updateTime}});
  } else {
    const index=Number(b.party.slice(2));
    fields.coTenants=c.coTenants.map((x,i)=>i===index?{...x,userId:b.userId}:x);
  }
  writes.push({docPath:'contracts/'+contractId,fields,precondition:{updateTime:v.updateTime}},
    {docPath:'users/'+b.userId,fields:{},precondition:{updateTime:uv.updateTime}});
  try{await fsCommit(writes);}catch(e){if(e.conflict)return fail('review_changed',409);throw e;}
  return {ok:true};
}

// ── Dopo il firmato esterno, la vita continua (console pre-agreement) ──
// Benvenuto alle parti e calendario dei canoni: gli effetti che il recupero
// NON ripete da solo (prepareExternal resta senza email né rate). Partono solo
// quando l'operatore li chiede, una volta: il benvenuto si timbra
// (welcomeEmailSent, come il finalize di Magic Sign) e una seconda richiesta
// non rimanda niente; il calendario usa gli id `pay_<contratto>_<mese>` e non
// si raddoppia mai, nemmeno con il portal.
export async function onboardExternal(contractId, b = {}, actor = {}) {
  const v = await fsGetVersioned('contracts/'+contractId);
  if (!v) return fail('contract_not_found',404);
  const c = {...v.data,id:contractId};
  if (!completion.external(c) || !completion.definitive(c)) return fail('external_contract_required');
  const p = await propertyOf(c);
  if (!externalTermsValid(c,p)) return fail('signed_terms_changed',409);
  const out = {ok:true};
  if (b.schedule === true) {
    try { out.schedule = {ok:true,...await ensureRentSchedule(contractId,c)}; }
    catch { out.schedule = {ok:false,error:'schedule_failed'}; }
  }
  if (b.welcome === true) out.welcome = await externalWelcome(contractId,p,actor,b.welcomeResolve);
  return out;
}

// Esito incerto = un invio interrotto a metà (timeout, connessione caduta) o
// un 'sending' rimasto appeso oltre 90 secondi: il benvenuto PUÒ essere
// arrivato, e un secondo invio automatico sarebbe un doppione (la regola di
// sendOutcome, la stessa della consegna al CAF). Decide l'operatore, dopo
// aver guardato: `resolve:'sent'` lo timbra senza mandare niente,
// `resolve:'resend'` lo rimanda.
async function externalWelcome(contractId, p, actor, resolve) {
  const v = await fsGetVersioned('contracts/'+contractId);
  const c = {...v.data,id:contractId};
  if (c.welcomeEmailSent) return {ok:true,skipped:'already_sent',at:c.welcomeEmailSentAt||null};
  const w = c.externalWelcome;
  // Partito ad almeno una parte: un secondo tap non lo rimanda a chi l'ha già
  // ricevuto (sendWelcomeEmails scrive a entrambe). Il resto si fa a mano.
  if (w && w.status === 'sent') return {ok:true,skipped:'already_sent',at:w.at||null,tenant:!!w.tenant,landlord:!!w.landlord};
  const stale = !!(w && w.status === 'sending' && !(Date.now()-Date.parse(w.at) < 90000));
  if (w && w.status === 'sending' && !stale) return {ok:false,error:'welcome_running'};
  if (stale || (w && w.status === 'uncertain')) {
    if (resolve === 'sent') {
      const at = new Date().toISOString();
      const state = {...w,status:'sent',resolution:'confirmed_sent',resolvedAt:at,resolvedBy:actor.uid||actor.email||''};
      try { await fsCommit([{docPath:'contracts/'+contractId,fields:{externalWelcome:state,welcomeEmailSent:true,welcomeEmailSentAt:at,welcomeEmailBy:'external-confirmed'},precondition:{updateTime:v.updateTime}}]); }
      catch(e) { if (e.conflict) return {ok:false,error:'welcome_running'}; throw e; }
      return {ok:true,resolved:'sent',...state};
    }
    if (resolve !== 'resend') return {ok:false,error:'welcome_uncertain',at:w.at||null,outcome:w.outcome||null};
  }
  const g = await gather(c,p);
  if (!g.tenantEmail && !g.landlordEmail) return {ok:false,error:'no_recipients'};
  const now = new Date(), claim = crypto.randomUUID();
  try { await fsCommit([{docPath:'contracts/'+contractId,fields:{externalWelcome:{status:'sending',at:now.toISOString(),claim}},precondition:{updateTime:v.updateTime}}]); }
  catch(e) { if (e.conflict) return {ok:false,error:'welcome_running'}; throw e; }
  // Il link al portale, monouso e 72h: lo stesso del finalize di Magic Sign.
  let magicId = '';
  try {
    const ml = await fsCreate('magicLinks',{contractId,tenantId:c.tenantId||'',tenantEmail:g.tenantEmail||'',
      used:false,expiresAt:new Date(now.getTime()+72*60*60*1000),issuedBy:'external',createdAt:now});
    magicId = ml.id;
  } catch(e) { console.warn('[external] magicLink failed:',e.message); }
  const portalLink = magicId ? `https://www.boomrome.com/portal.html?postSign=1&magicToken=${magicId}` : 'https://www.boomrome.com/portal.html';
  const tenant = g.tenant || {};
  let sent = {tenant:false,landlord:false,outcome:{}}, threw = false;
  try { sent = await sendWelcomeEmails(c,p,{portalLink,signedPdfUrl:c.signedPdfUrl,cedolare:cedolareOf(c),nonEU:!isEU(c.tenantNationality||tenant.nationality||'')}); }
  catch(e) { threw = true; console.warn('[external] welcome:',e.message); }
  const at = new Date().toISOString();
  const oc = sent.outcome || {};
  // 'failed' solo quando NESSUN invio può essere partito (rifiuto SMTP,
  // connessione mai nata): lì rimandare è sicuro. Il resto è 'uncertain'.
  const status = (sent.tenant||sent.landlord) ? 'sent'
    : (threw || Object.values(oc).includes('uncertain')) ? 'uncertain' : 'failed';
  const state = {status,at,claim,tenant:!!sent.tenant,landlord:!!sent.landlord,outcome:oc,
    tenantEmail:!!g.tenantEmail,landlordEmail:!!g.landlordEmail,by:actor.uid||actor.email||'',...(resolve==='resend'?{resent:true}:{})};
  // Il timbro di Magic Sign (badge «Onboarding incompleto», 🚀 Ri-attiva):
  // solo a invio riuscito all'inquilino — un false non cancella mai un true.
  const fields = {externalWelcome:state,...(sent.tenant?{welcomeEmailSent:true,welcomeEmailSentAt:at,welcomeEmailBy:'external'}:{})};
  try { await fsPatch('contracts/'+contractId,fields); } catch(e) { console.warn('[external] welcome stamp:',e.message); }
  return {ok:state.status==='sent',...state,error:state.status==='sent'?undefined:status==='uncertain'?'welcome_uncertain':'welcome_failed'};
}
