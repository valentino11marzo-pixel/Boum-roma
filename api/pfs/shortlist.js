// Admin-only PFS shortlist preparation and portal publication.
// prepare freezes an ordered, evidence-backed snapshot; publish atomically
// marks that snapshot and appends its cards to the client's portal. This is a
// portal publication receipt, never proof of email/WhatsApp or client reading.
import crypto from 'node:crypto';
import { fsGet, fsGetVersioned, fsCommit, fsList, readJson } from '../homie/_lib.js';
import { requireHumanAdmin } from './_guard.js';
import { hasApprovedEvidence } from './_candidates.js';
import { MAX_SHORTLIST_ITEMS, MAX_SHORTLIST_VERSIONS, shortlistId,
  snapshotHash, portalCard, hydratePublishedShortlists, normalizePublicationChecks } from './_shortlist.js';

const validClient = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(id);
const validCase = id => typeof id === 'string' && /^pc_[a-f0-9]{40}$/.test(id);
const validShortlist = id => typeof id === 'string' && /^sl_[a-f0-9]{40}$/.test(id);
const selectionHash = ids => crypto.createHash('sha256').update(JSON.stringify(ids)).digest('hex');
const fail = (res, code, error) => res.status(code).json({ ok: false, error });

function publicDraft(doc) {
  return { id: doc.id, clientId: doc.clientId, revision: doc.revision,
    status: doc.status, snapshotHash: doc.snapshotHash, items: doc.items,
    preparedAt: doc.preparedAt, ...(doc.receipt ? { receipt: doc.receipt } : {}) };
}

async function prepare(body, operator, res) {
  const { clientId, candidateIds, idempotencyKey } = body;
  if (!validClient(clientId) || !Array.isArray(candidateIds)
      || candidateIds.length < 1 || candidateIds.length > MAX_SHORTLIST_ITEMS
      || candidateIds.some(id => !validCase(id)) || new Set(candidateIds).size !== candidateIds.length
      || typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{8,120}$/.test(idempotencyKey))
    return fail(res, 400, 'invalid_prepare_request');

  const id = shortlistId(clientId, idempotencyKey);
  const path = 'pfsShortlists/' + id;
  const chosenHash = selectionHash(candidateIds);
  for (let attempt = 0; attempt < 4; attempt++) {
    let existing;
    try { existing = await fsGet(path); }
    catch { return fail(res, 500, 'shortlist_lookup_failed'); }
    if (existing) {
      if (existing.clientId !== clientId || existing.selectionHash !== chosenHash)
        return fail(res, 409, 'idempotency_key_reused');
      return res.status(200).json({ ok: true, already: true, draft: publicDraft(existing) });
    }

    let clientSnap;
    try { clientSnap = await fsGetVersioned('pfsClients/' + clientId); }
    catch { return fail(res, 500, 'client_lookup_failed'); }
    if (!clientSnap || clientSnap.data.reviewRequired !== true)
      return fail(res, 404, 'reviewed_client_not_found');
    const revision = (Number(clientSnap.data.shortlistRevision) || 0) + 1;
    if (revision > MAX_SHORTLIST_VERSIONS) return fail(res, 409, 'shortlist_version_limit');

    let portalView;
    try { portalView = await hydratePublishedShortlists(clientSnap.data); }
    catch { return fail(res, 500, 'published_shortlist_recovery_failed'); }
    const inPortal = new Set((portalView.client.portalProperties || []).map(p => p.id));
    let caseSnaps;
    try { caseSnaps = await Promise.all(candidateIds.map(cid => fsGetVersioned('pfsCandidateReviews/' + cid))); }
    catch { return fail(res, 500, 'candidate_lookup_failed'); }
    if (caseSnaps.some(s => !s)) return fail(res, 404, 'candidate_not_found');
    const items = [];
    for (const snap of caseSnaps) {
      const c = snap.data;
      if (!hasApprovedEvidence(c, clientId, c.propertyId, c.sourceUrl)
          || !/^[a-f0-9]{64}$/.test(c.decisionHash || '')
          || c.id !== candidateIds[items.length] || inPortal.has(c.propertyId))
        return fail(res, 409, 'candidate_not_eligible');
      if (!Number.isFinite(Number(c.price)) || Number(c.price) <= 0 || !(c.address || c.title)
          || c.sourceUrl.length > 1024 || (c.title && c.title.length > 240)
          || (c.address && c.address.length > 240) || (c.source && c.source.length > 80))
        return fail(res, 409, 'candidate_details_missing');
      let master;
      try { master = await fsGet('pfsProperties/' + c.propertyId); }
      catch { return fail(res, 500, 'property_lookup_failed'); }
      if (master?.sourceUrl && master.sourceUrl !== c.sourceUrl)
        return fail(res, 409, 'candidate_source_changed');
      const images = Array.isArray(master?.images)
        ? master.images.filter(x => typeof x === 'string' && x.length <= 400 && /^https?:\/\//i.test(x)).slice(0, 6) : [];
      items.push({
        candidateId: c.id, propertyId: c.propertyId, sourceUrl: c.sourceUrl, source: c.source || null,
        title: c.title || null, address: c.address || null, price: Number(c.price),
        decisionHash: c.decisionHash || null, reviewedBy: c.reviewedBy, reviewedAt: c.reviewedAt,
        reviewEvidence: c.reviewEvidence,
        portalCard: {
          id: c.propertyId, address: c.address || c.title, price: Math.round(Number(c.price)),
          rooms: c.bedrooms ?? null, sqm: c.sqm ?? null, match: c.score ?? null,
          images, description: String(master?.description || '').slice(0, 800),
          zone: String(c.zone || master?.zone || '').slice(0, 160),
          sourceUrl: c.sourceUrl, source: c.source || null,
          matchReasons: Array.isArray(c.reasons) ? c.reasons.filter(x => typeof x === 'string').slice(0, 8).map(x => x.slice(0, 240)) : [],
        },
      });
    }
    const now = new Date().toISOString();
    const draft = { clientId, revision, status: 'draft', selectionHash: chosenHash,
      snapshotHash: snapshotHash(items), items, preparedAt: now, preparedBy: operator };
    const writes = [
      { docPath: 'pfsClients/' + clientId, fields: { shortlistRevision: revision },
        precondition: { updateTime: clientSnap.updateTime } },
      { docPath: path, fields: draft, precondition: { exists: false } },
      ...caseSnaps.map(s => ({ docPath: 'pfsCandidateReviews/' + s.data.id,
        fields: {}, precondition: { updateTime: s.updateTime } })),
    ];
    try {
      await fsCommit(writes);
      return res.status(200).json({ ok: true, already: false, draft: publicDraft({ id, ...draft }) });
    } catch (err) {
      if (!err.conflict) return fail(res, 500, 'shortlist_prepare_write_failed');
    }
  }
  return fail(res, 409, 'shortlist_prepare_conflict');
}

async function publish(body, operator, res) {
  const { clientId, shortlistId: id, snapshotHash: seenHash } = body;
  if (!validClient(clientId) || !validShortlist(id) || !/^[a-f0-9]{64}$/.test(seenHash || ''))
    return fail(res, 400, 'invalid_publish_request');
  const path = 'pfsShortlists/' + id;
  for (let attempt = 0; attempt < 4; attempt++) {
    let draftSnap, clientSnap;
    try { [draftSnap, clientSnap] = await Promise.all([
      fsGetVersioned(path), fsGetVersioned('pfsClients/' + clientId)]); }
    catch { return fail(res, 500, 'shortlist_publish_lookup_failed'); }
    const draft = draftSnap?.data;
    const client = clientSnap?.data;
    if (!draft || draft.clientId !== clientId || !client || client.reviewRequired !== true)
      return fail(res, 404, 'shortlist_not_found');
    if (!Array.isArray(draft.items) || draft.items.length < 1 || draft.items.length > MAX_SHORTLIST_ITEMS
        || draft.snapshotHash !== seenHash || snapshotHash(draft.items) !== seenHash)
      return fail(res, 409, 'shortlist_preview_changed');
    const markers = Array.isArray(client.publishedShortlistIds) ? client.publishedShortlistIds : [];
    if (draft.status === 'published') {
      if (!markers.includes(id) || !draft.receipt) return fail(res, 500, 'publication_receipt_inconsistent');
      return res.status(200).json({ ok: true, already: true, receipt: draft.receipt });
    }
    if (draft.status !== 'draft') return fail(res, 409, 'shortlist_not_draft');
    if (client.portalEnabled !== true || !client.portalAccessCode)
      return fail(res, 409, 'portal_not_ready');
    let codeHolders;
    try { codeHolders = await fsList('pfsClients', { filter: {
      field: 'portalAccessCode', op: 'EQUAL', value: client.portalAccessCode }, limit: 3 }); }
    catch { return fail(res, 500, 'portal_code_lookup_failed'); }
    const enabledHolders = codeHolders.filter(c => c.portalEnabled === true);
    if (enabledHolders.length !== 1 || enabledHolders[0].id !== clientId)
      return fail(res, 409, 'portal_code_ambiguous');
    if (markers.length >= MAX_SHORTLIST_VERSIONS) return fail(res, 409, 'shortlist_version_limit');

    let portalView;
    try { portalView = await hydratePublishedShortlists(client); }
    catch { return fail(res, 500, 'published_shortlist_recovery_failed'); }
    const inPortal = new Set((portalView.client.portalProperties || []).map(p => p.id));
    if (draft.items.some(item => inPortal.has(item.propertyId))) return fail(res, 409, 'already_in_portal');
    let caseSnaps;
    try { caseSnaps = await Promise.all(draft.items.map(item => fsGetVersioned('pfsCandidateReviews/' + item.candidateId))); }
    catch { return fail(res, 500, 'candidate_lookup_failed'); }
    if (caseSnaps.some(s => !s)) return fail(res, 409, 'candidate_changed_reprepare');
    for (let i = 0; i < caseSnaps.length; i++) {
      const c = caseSnaps[i].data, item = draft.items[i];
      if (!hasApprovedEvidence(c, clientId, item.propertyId, item.sourceUrl)
          || c.decisionHash !== item.decisionHash || c.reviewedAt !== item.reviewedAt
          || Number(c.price) !== item.price || c.title !== item.title || c.address !== item.address)
        return fail(res, 409, 'candidate_changed_reprepare');
    }
    const publishedAt = new Date().toISOString();
    const finalChecks = normalizePublicationChecks(draft.items, body.finalChecks, Date.parse(publishedAt));
    if (!finalChecks) return fail(res, 409, 'reverification_required');
    const receipt = { channel: 'portal', clientId, shortlistId: id, revision: draft.revision,
      snapshotHash: draft.snapshotHash, propertyIds: draft.items.map(item => item.propertyId),
      itemCount: draft.items.length, publishedAt, publishedBy: operator, finalChecks };
    const shortlist = { ...draft, receipt };
    const cards = draft.items.map(item => portalCard(item, shortlist));
    const activity = (Array.isArray(client.portalActivity) ? client.portalActivity : []).concat([{
      type: 'shortlist_published', shortlistId: id, revision: draft.revision,
      propertyIds: receipt.propertyIds, timestamp: publishedAt, actor: operator,
    }]).slice(-200);
    const clientFields = {
      publishedShortlistIds: markers.concat(id),
      portalProperties: (portalView.client.portalProperties || []).concat(cards),
      portalActivity: activity, shortlistLastPublishedAt: publishedAt,
      ...(!client.firstShortlistPublishedAt ? { firstShortlistPublishedAt: publishedAt } : {}),
    };
    try {
      await fsCommit([
        { docPath: 'pfsClients/' + clientId, fields: clientFields,
          precondition: { updateTime: clientSnap.updateTime } },
        { docPath: path, fields: { status: 'published', receipt },
          precondition: { updateTime: draftSnap.updateTime } },
        ...caseSnaps.map(s => ({ docPath: 'pfsCandidateReviews/' + s.data.id,
          fields: {}, precondition: { updateTime: s.updateTime } })),
      ]);
      return res.status(200).json({ ok: true, already: false, receipt });
    } catch (err) {
      if (!err.conflict) return fail(res, 500, 'shortlist_publish_write_failed');
    }
  }
  return fail(res, 409, 'shortlist_publish_conflict');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  const operator = await requireHumanAdmin(req, res);
  if (!operator) return;
  let body;
  try { body = await readJson(req); }
  catch { return fail(res, 400, 'invalid_json'); }
  if (body?.action === 'prepare') return prepare(body, operator, res);
  if (body?.action === 'publish') return publish(body, operator, res);
  return fail(res, 400, 'invalid_action');
}
