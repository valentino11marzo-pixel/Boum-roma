import {register} from 'node:module';
register('./loader.mjs',import.meta.url);
const F=await import('../registration-delivery/fixture.mjs');
const {DB,storage,PDF,SIG,res,hooks,current}=F;
const assert=(await import('node:assert/strict')).default;
const {default:handler}=await import('../../api/fiscal/registra.js');
const {default:lookup}=await import('../../api/magic-sign/lookup.js');
const {default:submit}=await import('../../api/magic-sign/submit.js');
const {default:documents}=await import('../../api/tenant/documents.js');
const {default:links}=await import('../../api/sign/links.js');
const {finalizeContract}=await import('../../api/sign/_finalize.js');
const {aspiChecklist,checklistBlocked}=await import('../../api/fiscal/_aspi.js');
const baseFetch=globalThis.fetch;
let who='admin',failArchive=false,failReceipt=false,failSigned=false;
globalThis.fetch=async (url,opts={})=>{
  const u=new URL(url);
  if(u.hostname==='identitytoolkit.googleapis.com'&&u.pathname.includes('accounts:lookup'))return F.json({users:[{localId:who,email:who+'@example.test'}]});
  if(u.hostname==='firestore.googleapis.com'&&opts.method==='PATCH'){
    if(failArchive&&u.pathname.includes('/documents/documents/contract-signed_c1_co0'))return F.json({},503);
    if(failReceipt&&u.pathname.includes('/documents/documents/registration-receipt_c1_landlord'))return F.json({},503);
  }
  if(failSigned&&u.hostname==='firebasestorage.googleapis.com'&&u.pathname.includes('external-signed'))return F.json({},404);
  return baseFetch(url,opts);
};
function reset(extra={}){
  who='admin';failArchive=failReceipt=failSigned=false;
  F.reset({signatureStatus:'none',fullySignedAt:null,tenantSignature:null,landlordSignature:null,
    tenantSignedAt:null,landlordSignedAt:null,coTenants:[{userId:'co1',name:'Synthetic Co',email:'co@example.test'}],...extra});
  DB.set('settings/registrazione',{auto:false,email:'caf@example.test',referente:'Referente sintetico'});
  DB.set('signTokens/c1',{contractId:'c1',tenant:'TOK_EXT_T',landlord:'TOK_EXT_L'});
}
async function call(body={},h=handler){const r=res();await h({method:'POST',headers:{authorization:'Bearer synthetic','x-forwarded-for':'203.0.113.20'},body:{contractId:'c1',...body}},r);return r;}
const status=async()=>{const r=await call({op:'status'});assert.equal(r.code,200,JSON.stringify(r.body));return r.body;};
async function payload(){const s=await status();return {op:'external-adopt',version:s.external.version,termsHash:s.external.termsHash,pdfBase64:PDF.toString('base64'),signedDate:'2026-10-14',confirmComplete:true,confirmTerms:true,archivePreviousSignatures:true,fileName:'signed.pdf'};}
async function adopt(){const r=await call(await payload());assert.equal(r.code,200,JSON.stringify(r.body));return r;}
async function prepare(){const r=await call({op:'external-prepare'});assert.equal(r.code,200,JSON.stringify(r.body));return r.body;}
const receipt=()=>({op:'registered',date:'2026-10-15',code:'TXX26T012345000AB',...F.upload(),confirmReceipt:true,signedHash:current().externalSignedDocument.sha256,notify:false});

export { F,DB,storage,PDF,SIG,res,hooks,current,assert,handler,lookup,submit,documents,links,finalizeContract,aspiChecklist,checklistBlocked,reset,call,status,payload,adopt,prepare,receipt };
export const setWho = value => {who=value;};
export const fault = (key,value) => {if(key==='archive')failArchive=value;else if(key==='receipt')failReceipt=value;else if(key==='signed')failSigned=value;};
