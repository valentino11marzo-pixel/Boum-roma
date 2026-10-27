export { resolve } from '../registration-delivery/loader.mjs';
export async function load(url,context,nextLoad){
  const out=await nextLoad(url,context);let source=out.source&&String(out.source);
  const mutation=process.env.EXTERNAL_MUTATION;
  if(mutation==='adopt-stale'&&url.endsWith('/api/contracts/_external.js')) source=source.replace("if (!b.version || b.version !== v.updateTime || b.termsHash !== termsHash(c,p))",'if (false)');
  if(mutation==='unsigned-send'&&url.endsWith('/api/fiscal/_aspi.js')) source=source.replace("const contractUrl = c.signedPdfUrl || '';","const contractUrl = c.signedPdfUrl || c.generatedPDF || '';");
  if(mutation==='receipt-without-evidence'&&url.endsWith('/api/fiscal/_ricevuta.js')) source=source.replace("if (!input.confirmReceipt || !input.code || !(input.file || contract.registrationReceiptUrl))",'if (false)');
  if(mutation==='magic-sign-reopens'&&url.endsWith('/api/magic-sign/lookup.js')) source=source.replace('if (contract.externalSignedDocument)','if (false)');
  return source&&source!==String(out.source)?{...out,source}:out;
}
