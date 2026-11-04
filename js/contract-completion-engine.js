(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ContractCompletion = factory();
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';
  const external = c => !!(c && c.externalSignedDocument && c.externalSignedDocument.sha256);
  const definitive = c => !!(c && c.signedPdfUrl && c.signatureStatus === 'complete');
  const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
    && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  // The operator reviews exactly these facts. A later terms edit invalidates
  // preparation/registration; signatures are never transferred to new terms.
  function terms(c, p) {
    const keys = ['propertyId','tenantId','landlordId','ownerId','tenantName','tenantCF','landlordName','landlordCF',
      'type','startDate','endDate','rent','monthlyRent','canone','deposit','depositMonths','installmentMonths','paymentDay','cedolareSecca',
      'requiresAsseverazione','roomId','roomName','unit','floor','internal','cadastralData'];
    const out = {};
    keys.forEach(k => { out[k] = c[k] == null ? null : c[k]; });
    out.coTenants = (c.coTenants || []).map(x => ({ userId:x.userId || '', name:x.name || '', cf:x.cf || x.fiscalCode || '' }));
    out.property = {};
    ['ownerId','address','name','floor','internal','unit','cadastralData'].forEach(k => { out.property[k] = (p || {})[k] == null ? null : p[k]; });
    return out;
  }
  function missingProfiles(c, p) {
    const out = [];
    if (!c.tenantId) out.push('tenant');
    if (!(c.externalSignedDocument?.landlordId || (p || {}).ownerId || c.landlordId || c.ownerId)) out.push('landlord');
    (c.coTenants || []).forEach((x,i) => { if (!x.userId) out.push('co'+i); });
    return out;
  }
  const steps = ['prepared','draft','awaiting_spid','submitted','rejected'];
  function progressError(c, b) {
    if (!definitive(c)) return 'signed_contract_required';
    if (c.registrationStatus === 'registered') return 'already_registered';
    if (!['caf','rli'].includes(b.channel) || !steps.includes(b.stage)) return 'invalid_progress';
    if (b.stage !== 'prepared' && !String(b.reference || '').trim()) return 'reference_required';
    if (b.stage === 'rejected' && !String(b.note || '').trim()) return 'rejection_reason_required';
    return null;
  }
  return { external, definitive, validDate, terms, missingProfiles, progressError };
});
