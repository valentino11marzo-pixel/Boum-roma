// Bounded, document-name pagination for the PFS operational collections.
// A silent first-page cap can miss a paid client or an enabled search; an
// explicit error is safer than reporting a complete scan that was not one.
import { fsList } from '../homie/_lib.js';

export const PFS_PAGE_SIZE = 200;
export const MAX_PFS_CLIENTS = 1000;
export const MAX_RADAR_SEARCHES = 1000;

export async function listPfsDocs(collection, { filter, maxDocs = MAX_PFS_CLIENTS } = {}) {
  if (!Number.isInteger(maxDocs) || maxDocs < 1) throw new Error(`${collection}_scan_limit_invalid`);
  const out = [];
  let afterId = null;
  while (true) {
    // The extra slot probes for overflow when exactly maxDocs were read.
    const limit = Math.min(PFS_PAGE_SIZE, maxDocs - out.length + 1);
    const page = await fsList(collection, { filter, afterId, limit });
    if (!page.length) return out;
    if (page.length > limit) throw new Error(`${collection}_pagination_invalid`);
    if (out.length + page.length > maxDocs) throw new Error(`${collection}_scan_limit_exceeded`);
    for (const doc of page) {
      if (!doc?.id || (afterId && doc.id <= afterId)) throw new Error(`${collection}_pagination_invalid`);
      afterId = doc.id;
    }
    out.push(...page);
    if (page.length < limit) return out;
  }
}
