// Adopt verified agency references into the existing catalogue, never publish.
// Default: read-only preview. Apply requires the saved plan's exact fingerprint.
// No environment loading, credentials, models, notifications or new listings.
// Input: {version:1, confirmedBy:"<operator>", mappings:[{listingId:"<existing BOOM id>",
// portal:"idealista"|"immobiliare",remoteId:"<numeric code>",remoteUrl:"<HTTPS ad URL>",
// observedAt:"<ISO UTC timestamp with milliseconds>",evidence:"<what was checked in own agency account>"}]}.
// Keep input/plans outside Git. The script locks out all publisher operations
// for each adopted portal/listing pair; it never grants management permission.
// Apply only after the matching server guards are released. Already exported
// files/actions cannot be recalled, and writers bypassing this revision protocol
// (e.g. manual console edits) must not run during reconciliation.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fsGetVersioned, fsList, fsCommit } from '../api/homie/_lib.js';
import { IDENTITY_REVISION_PATH, identityRevisionWrite, remoteCodes, urlIdentity, portalReferenceConflict } from '../api/publisher/_adoption.js';

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const CODE = /^[1-9][0-9]{0,19}$/;
const MAX_EXISTING = 400, MAX_MAPPINGS = 100;
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const defaultIO = { get:fsGetVersioned, list:fsList, commit:fsCommit };
const fail = code => { throw new Error(code); };
const keys = (obj, allowed) => obj && typeof obj === 'object' && !Array.isArray(obj)
  && Object.keys(obj).every(k => allowed.includes(k));
function iso(value) {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}
export function portalReference(portal, remoteUrl, remoteId) {
  if (!['idealista','immobiliare'].includes(portal) || typeof remoteId !== 'string' || !CODE.test(remoteId))
    fail('invalid_portal_reference');
  let u;
  try { u = new URL(remoteUrl); } catch { fail('invalid_portal_url'); }
  const host = portal + '.it', prefix = portal === 'idealista' ? 'immobile' : 'annunci';
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash
    || ![host,'www.'+host].includes(u.hostname) || u.pathname.replace(/\/$/,'') !== '/'+prefix+'/'+remoteId)
    fail('inconsistent_portal_url');
  return {portal,remoteId,remoteUrl:'https://www.'+host+'/'+prefix+'/'+remoteId+'/'};
}
function inputManifest(input) {
  if (!keys(input,['version','confirmedBy','mappings']) || input.version !== 1
    || typeof input.confirmedBy !== 'string' || !input.confirmedBy.trim() || input.confirmedBy.length > 200
    || !Array.isArray(input.mappings) || !input.mappings.length || input.mappings.length > MAX_MAPPINGS)
    fail('invalid_manifest');
  const targets = new Set(), references = new Set();
  const mappings = input.mappings.map(row => {
    if (!keys(row,['listingId','portal','remoteId','remoteUrl','observedAt','evidence'])
      || typeof row.listingId !== 'string' || !ID.test(row.listingId) || !iso(row.observedAt)
      || typeof row.evidence !== 'string' || !row.evidence.trim() || row.evidence.length > 1000)
      fail('invalid_mapping');
    const reference = portalReference(row.portal,row.remoteUrl,row.remoteId);
    const target = reference.portal+'_'+row.listingId, code = reference.portal+'_'+reference.remoteId;
    if (targets.has(target) || references.has(code)) fail('duplicate_manifest_mapping');
    targets.add(target); references.add(code);
    return {listingId:row.listingId,...reference,observedAt:row.observedAt,evidence:row.evidence.trim()};
  }).sort((a,b)=>(a.portal+'_'+a.listingId).localeCompare(b.portal+'_'+b.listingId));
  return {version:1,confirmedBy:input.confirmedBy.trim(),mappings};
}
function version(snapshot) { return snapshot?.updateTime || null; }
function assertSnapshot(snapshot) {
  if (snapshot && (!snapshot.data || typeof snapshot.updateTime !== 'string' || !snapshot.updateTime)) fail('missing_version');
  return snapshot;
}
function guard(docPath,snapshot) {
  return snapshot ? {docPath,fields:{},precondition:{updateTime:snapshot.updateTime}}
    : {docPath,assertAbsent:true};
}
function adoptedExactly(snapshot,row) {
  const p = snapshot?.data;
  return p && p.managementMode === 'reference_only' && p.portal === row.portal
    && p.listingId === row.listingId && p.remoteId === row.remoteId && p.remoteUrl === row.remoteUrl
    && iso(p.adoptedAt) && p.adoptedBy && p.adoptionEvidence?.observedAt === row.observedAt
    && p.adoptionEvidence?.note === row.evidence;
}

export async function prepareAdoption(rawInput,{io=defaultIO,now=new Date().toISOString()}={}) {
  const input = inputManifest(rawInput);
  if (!iso(now)) fail('invalid_clock');
  // This read must precede the scan. Every supported portalPubs writer bumps
  // the same document atomically, so a new unseen reference invalidates apply.
  const revision = assertSnapshot(await io.get(IDENTITY_REVISION_PATH));
  identityRevisionWrite(revision); // validate even in a no-op preview
  const config = assertSnapshot(await io.get('settings/publisher'));
  if (config?.data?.enabled === true) fail('publisher_must_be_disabled');
  const rows = await io.list('portalPubs',{limit:MAX_EXISTING+1,strictResponse:true});
  if (!Array.isArray(rows) || rows.length > MAX_EXISTING) fail('incomplete_portal_scan');
  const paths = new Set(rows.map(row => {
    if (!row || typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,180}$/.test(row.id)) fail('invalid_existing_mapping');
    return 'portalPubs/'+row.id;
  }));
  for (const row of input.mappings) paths.add('portalPubs/'+row.portal+'_'+row.listingId);
  const snapshots = new Map();
  // Small bounded batches avoid opening hundreds of reads at once.
  const allPaths = [...paths].sort();
  for (let i=0;i<allPaths.length;i+=12) await Promise.all(allPaths.slice(i,i+12).map(async p => {
    snapshots.set(p,assertSnapshot(await io.get(p)));
  }));
  for (const row of rows) if (!snapshots.get('portalPubs/'+row.id)) fail('mapping_changed_during_scan');
  const listingSnapshots = new Map();
  for (const id of new Set(input.mappings.map(r=>r.listingId))) {
    const s = assertSnapshot(await io.get('listings/'+id));
    if (!s) fail('listing_not_found:'+id);
    listingSnapshots.set(id,s);
  }
  const changes = [], summaries = [];
  for (const row of input.mappings) {
    const path = 'portalPubs/'+row.portal+'_'+row.listingId, snapshot = snapshots.get(path);
    const current = snapshot?.data;
    if (current && ((current.portal && current.portal !== row.portal)
      || (current.listingId && current.listingId !== row.listingId))) fail('target_identity_conflict:'+path);
    if (current && ((current.remoteId && String(current.remoteId) !== row.remoteId)
      || [...remoteCodes(current)].some(code=>code !== row.remoteId)
      || (current.remoteUrl && !remoteCodes(current).has(row.remoteId)))) fail('target_reference_conflict:'+path);
    for (const [otherPath,other] of snapshots) {
      if (otherPath === path || !other) continue;
      const url = urlIdentity(other.data.remoteUrl);
      if (other.data.listingId === row.listingId && (other.data.portal === row.portal || url?.portal === row.portal
        || otherPath.startsWith('portalPubs/'+row.portal+'_'))) fail('target_alias_conflict:'+path);
      if (portalReferenceConflict(other.data,otherPath,row))
        fail('remote_reference_already_assigned:'+row.portal+'_'+row.remoteId);
    }
    const unchanged = adoptedExactly(snapshot,row), listing = listingSnapshots.get(row.listingId).data;
    summaries.push({...row,name:listing.name || null,address:listing.address || null,action:unchanged?'unchanged':'adopt'});
    if (!unchanged) changes.push({docPath:path,fields:{portal:row.portal,listingId:row.listingId,
      remoteId:row.remoteId,remoteUrl:row.remoteUrl,managementMode:'reference_only',
      adoptedAt:now,adoptedBy:input.confirmedBy,
      adoptionEvidence:{source:'agency_account',observedAt:row.observedAt,note:row.evidence}},
      precondition:snapshot ? {updateTime:snapshot.updateTime} : {exists:false}});
  }
  const observed = [[IDENTITY_REVISION_PATH,version(revision)],['settings/publisher',version(config)],
    ...[...snapshots].map(([p,s])=>[p,version(s)]),
    ...[...listingSnapshots].map(([id,s])=>['listings/'+id,version(s)])].sort(([a],[b])=>a.localeCompare(b));
  const fingerprint = sha({version:1,input,observed});
  const changedPaths = new Set(changes.map(c=>c.docPath));
  const writes = changes.length ? [identityRevisionWrite(revision),guard('settings/publisher',config),
    ...[...snapshots].filter(([p])=>!changedPaths.has(p)).map(([p,s])=>guard(p,s)),
    ...[...listingSnapshots].map(([id,s])=>guard('listings/'+id,s)),...changes] : [];
  if (writes.length > 450) fail('adoption_batch_too_large');
  return {plan:{version:1,input,fingerprint,preparedAt:now,changes:changes.length,mappings:summaries},writes};
}

export async function applyAdoption(plan,confirmation,{io=defaultIO,now=new Date().toISOString()}={}) {
  if (!plan || plan.version !== 1 || typeof confirmation !== 'string' || !/^[a-f0-9]{64}$/.test(confirmation)
    || plan.fingerprint !== confirmation) fail('confirmed_plan_required');
  const fresh = await prepareAdoption(plan.input,{io,now});
  // A lost response may be retried safely, without a second write or timestamp.
  if (!fresh.writes.length) return {ok:true,alreadyApplied:true,adopted:0};
  if (fresh.plan.fingerprint !== confirmation) fail('plan_changed_run_preview_again');
  await io.commit(fresh.writes);
  return {ok:true,alreadyApplied:false,adopted:fresh.plan.changes};
}

async function main(args) {
  const usage = 'Preview: node scripts/catalogo-adopt-portals.mjs --input verified.json --plan preview.json\nApply: node scripts/catalogo-adopt-portals.mjs --apply preview.json --confirm <fingerprint>';
  const allowed = new Set(['--input','--plan','--apply','--confirm']);
  const flags = {};
  for (let i=0;i<args.length;i+=2) {
    if (!allowed.has(args[i]) || !args[i+1] || args[i+1].startsWith('--') || flags[args[i]]) fail(usage);
    flags[args[i]] = args[i+1];
  }
  if (flags['--apply']) {
    if (flags['--input'] || flags['--plan'] || !flags['--confirm']) fail(usage);
    const result = await applyAdoption(JSON.parse(readFileSync(flags['--apply'],'utf8')),flags['--confirm']);
    console.log(JSON.stringify(result));
  } else {
    if (!flags['--input'] || flags['--confirm']) fail(usage);
    const {plan} = await prepareAdoption(JSON.parse(readFileSync(flags['--input'],'utf8')));
    if (flags['--plan']) writeFileSync(flags['--plan'],JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify(plan,null,2));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error=>{
    // Never print backend payloads or authentication errors containing secrets.
    const known = /^(invalid_|inconsistent_|duplicate_|missing_|incomplete_|mapping_|listing_not_found|target_|remote_reference_|publisher_must_|adoption_batch_|confirmed_plan_|plan_changed_|Preview:)/;
    console.error(known.test(error.message) ? error.message : error.conflict ? 'Concurrent change: no adoption committed; prepare a new preview.' : 'Adoption failed; verify access or retry the read. No success confirmed.');
    process.exitCode=1;
  });
}
