// A portal identity is not permission to manage the external advertisement.
// Legacy receipts keep their behavior; an adopted/unknown mode fails closed.
export function publicationBlocked(receipt) {
  return !!receipt && ('managementMode' in receipt || 'adoptedAt' in receipt)
    && receipt.managementMode !== 'managed';
}

// Shared by adoption and publisher reports. Incrementing this revision in
// the same commit closes the phantom-insert race across different listing IDs.
// It contains no catalogue data and never enables settings/publisher.
export const IDENTITY_REVISION_PATH = 'settings/catalogPortalAdoption';
export function identityRevisionWrite(snapshot) {
  const revision = snapshot?.data?.revision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER)
    throw new Error('invalid_identity_revision');
  return { docPath: IDENTITY_REVISION_PATH, fields: { revision: revision + 1 },
    precondition: snapshot ? { updateTime: snapshot.updateTime } : { exists: false } };
}

export function urlIdentity(value) {
  try {
    const u = new URL(value), portal = u.hostname.replace(/^www\./,'').replace(/\.it$/,'');
    if (u.protocol !== 'https:' || u.username || u.password || !['idealista','immobiliare'].includes(portal)
      || ![portal+'.it','www.'+portal+'.it'].includes(u.hostname)) return null;
    const prefix = portal === 'idealista' ? 'immobile' : 'annunci';
    const match = u.pathname.match(new RegExp('^/'+prefix+'/([1-9][0-9]{0,19})/?$'));
    return match ? {portal,remoteId:match[1]} : null;
  } catch { return null; }
}
export function remoteCodes(row) {
  const codes = new Set();
  if (row?.remoteId != null) codes.add(String(row.remoteId));
  const identity = urlIdentity(row?.remoteUrl);
  if (identity) codes.add(identity.remoteId);
  return codes;
}
// The voice resolver recognizes URLs even when legacy portal metadata is
// absent. Never let incomplete metadata hide a conflicting assignment.
export function portalReferenceConflict(other,otherPath,target) {
  const url = urlIdentity(other?.remoteUrl), codes = remoteCodes(target);
  const sameUrl = url?.portal === target.portal && codes.has(url.remoteId);
  const couldBePortal = !other?.portal || other.portal === target.portal
    || otherPath.startsWith('portalPubs/'+target.portal+'_');
  return sameUrl || couldBePortal && [...remoteCodes(other)].some(code=>codes.has(code));
}
