// Canonical PFS shortlist snapshots. portalProperties is still written by
// legacy routes, so a published shortlist remains visible through its
// immutable snapshot + atomic marker even if an old array write races it.
import crypto from 'node:crypto';
import { fsGetMany } from '../homie/_lib.js';

export const MAX_SHORTLIST_ITEMS = 8;
export const MAX_SHORTLIST_VERSIONS = 24;
export const PUBLICATION_CHECK_MAX_AGE_MS = 24 * 3600_000;
export const shortlistId = (clientId, key) => 'sl_' + crypto.createHash('sha256')
  .update(String(clientId) + '\0' + String(key)).digest('hex').slice(0, 40);
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : value;
export const snapshotHash = items => crypto.createHash('sha256')
  .update(JSON.stringify(canonical(items))).digest('hex');

export function normalizePublicationChecks(items, input, now = Date.now()) {
  if (!Array.isArray(input) || input.length !== items.length) return null;
  const recentUtc = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) return null;
    const at = Date.parse(value);
    return Number.isFinite(at) && at <= now + 5 * 60_000 && now - at <= PUBLICATION_CHECK_MAX_AGE_MS
      ? new Date(at).toISOString() : null;
  };
  const filled = (value, min, max) => typeof value === 'string'
    && value.trim().length >= min && value.trim().length <= max;
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const check = input[i], item = items[i];
    const availableAt = recentUtc(check?.availabilityCheckedAt);
    const sharingAt = recentUtc(check?.sharingCheckedAt);
    if (check?.candidateId !== item.candidateId || check.propertyId !== item.propertyId
        || check.sourceUrl !== item.sourceUrl
        || check.availabilityConfirmed !== true || check.sharingPermissionConfirmed !== true
        || !availableAt || !sharingAt
        || !filled(check.availabilityCheckedWith, 3, 160)
        || !filled(check.availabilityEvidence, 8, 500)
        || !filled(check.sharingCheckedWith, 3, 160)
        || !filled(check.sharingEvidence, 8, 500)) return null;
    out.push({ candidateId: item.candidateId, propertyId: item.propertyId, sourceUrl: item.sourceUrl,
      availabilityConfirmed: true, availabilityCheckedAt: availableAt,
      availabilityCheckedWith: check.availabilityCheckedWith.trim(),
      availabilityEvidence: check.availabilityEvidence.trim(),
      sharingPermissionConfirmed: true, sharingCheckedAt: sharingAt,
      sharingCheckedWith: check.sharingCheckedWith.trim(), sharingEvidence: check.sharingEvidence.trim() });
  }
  return out;
}

export function portalCard(item, shortlist) {
  return {
    ...item.portalCard,
    id: item.propertyId,
    sourceUrl: item.sourceUrl,
    source: item.source || null,
    isNew: true,
    addedAt: shortlist.receipt.publishedAt,
    addedBy: 'pfs-shortlist',
    shortlistId: shortlist.id,
    shortlistRevision: shortlist.revision,
  };
}

function verifyPublished(shortlist, clientId, id) {
  const receipt = shortlist?.receipt;
  if (!shortlist || shortlist.id !== id || shortlist.clientId !== clientId
      || shortlist.status !== 'published' || !receipt || receipt.channel !== 'portal'
      || receipt.clientId !== clientId || receipt.shortlistId !== id
      || receipt.revision !== shortlist.revision || !receipt.publishedBy
      || !Number.isFinite(Date.parse(receipt.publishedAt || ''))
      || receipt.snapshotHash !== shortlist.snapshotHash
      || !Array.isArray(shortlist.items) || !shortlist.items.length
      || snapshotHash(shortlist.items) !== shortlist.snapshotHash
      || !Array.isArray(receipt.propertyIds)
      || receipt.itemCount !== shortlist.items.length
      || !normalizePublicationChecks(shortlist.items, receipt.finalChecks,
        Date.parse(receipt.publishedAt) || Date.now())
      || JSON.stringify(receipt.propertyIds) !== JSON.stringify(shortlist.items.map(x => x.propertyId))) {
    throw new Error('published_shortlist_inconsistent');
  }
}

export async function hydratePublishedShortlists(client) {
  const ids = Array.isArray(client?.publishedShortlistIds) ? client.publishedShortlistIds : [];
  if (ids.length > MAX_SHORTLIST_VERSIONS || new Set(ids).size !== ids.length
      || ids.some(id => typeof id !== 'string' || !/^sl_[a-f0-9]{40}$/.test(id)))
    throw new Error('published_shortlist_marker_invalid');
  const current = Array.isArray(client.portalProperties) ? client.portalProperties.filter(p => p && p.id) : [];
  if (!ids.length) return { client: { ...client, portalProperties: current }, publishedPropertyIds: new Set() };

  const paths = ids.map(id => 'pfsShortlists/' + id);
  const docs = await fsGetMany(paths, { chunk: MAX_SHORTLIST_VERSIONS });
  const entries = new Map(current.map(p => [p.id, p]));
  const publishedPropertyIds = new Set();
  for (const id of ids) {
    const shortlist = docs.get('pfsShortlists/' + id);
    verifyPublished(shortlist, client.id, id);
    for (const item of shortlist.items) {
      if (!item?.propertyId || !item.sourceUrl || item.portalCard?.id !== item.propertyId
          || item.portalCard?.sourceUrl !== item.sourceUrl || publishedPropertyIds.has(item.propertyId))
        throw new Error('published_shortlist_item_invalid');
      publishedPropertyIds.add(item.propertyId);
      const old = entries.get(item.propertyId) || {};
      const feedback = {};
      for (const field of ['clientLiked', 'clientRejected', 'rejectReason', 'viewingRequested',
        'viewingPreference', 'clientActionAt']) if (old[field] !== undefined) feedback[field] = old[field];
      entries.set(item.propertyId, { ...portalCard(item, shortlist), ...feedback });
    }
  }
  return { client: { ...client, portalProperties: [...entries.values()] }, publishedPropertyIds };
}
