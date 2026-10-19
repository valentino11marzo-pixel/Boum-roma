// Accesso ufficiale Immobiliare.it Insights. Nessuna chiamata senza attivazione esplicita.
import RULES from '../../js/smartlink-engine.js';

const BASE = 'https://comparables.realitycs.it';
let cachedToken, pendingToken;
export function configured() {
  return process.env.SMARTLINK_REALITYCS_ENABLED === '1' && ['CLIENT_ID','CLIENT_SECRET','USERNAME','PASSWORD'].every(key => process.env['REALITYCS_' + key]);
}
export function listingId(source) {
  if (source?.source !== 'Immobiliare.it') return null;
  return new URL(source.url).pathname.match(/^\/annunci\/(\d+)\/?$/)?.[1] || null;
}
export function providerPhoto(raw, source) {
  try {
    const u = new URL(raw), id = listingId(source);
    return id && u.origin === 'https://images.realitycs.it' && !u.username && !u.password && !u.search && !u.hash && new RegExp('^/img/' + id + '/[0-9]+$').test(u.pathname) ? u.href : null;
  } catch { return null; }
}
async function json(response) {
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'access_denied' : response.status === 404 ? 'not_found' : response.status === 429 ? 'rate_limited' : 'unavailable');
  if (!/application\/json/i.test(response.headers.get('content-type') || '')) throw new Error('invalid_response');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('invalid_response');
  const chunks = []; let size = 0;
  while (true) {
    const {done, value} = await reader.read(); if (done) break;
    size += value.length;
    if (size > 2_000_000) { await reader.cancel(); throw new Error('invalid_response'); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function accessToken() {
  if (!configured()) throw new Error('not_configured');
  if (cachedToken?.until > Date.now()) return cachedToken.value;
  if (pendingToken) return pendingToken;
  pendingToken = (async () => {
    const response = await fetch(BASE + '/oauth/token', {
      method:'POST', redirect:'error', signal:AbortSignal.timeout(8000),
      headers:{'Content-Type':'application/x-www-form-urlencoded', Authorization:'Basic ' + Buffer.from(process.env.REALITYCS_CLIENT_ID + ':' + process.env.REALITYCS_CLIENT_SECRET).toString('base64')},
      body:new URLSearchParams({grant_type:'password', username:process.env.REALITYCS_USERNAME, password:process.env.REALITYCS_PASSWORD}).toString()
    });
    const data = await json(response);
    if (typeof data.access_token !== 'string' || !data.access_token || /[\r\n]/.test(data.access_token) || !(Number(data.expires_in) > 60)) throw new Error('invalid_response');
    // Solo cache effimera del token OAuth; nessun dato dell'annuncio o credenziale in Firestore/log.
    cachedToken = {value:data.access_token, until:Date.now() + (Math.min(Number(data.expires_in), 14400) - 60) * 1000};
    return cachedToken.value;
  })().finally(() => { pendingToken = null; });
  return pendingToken;
}
export async function extractOfficial(source) {
  const id = listingId(source);
  if (!id) return {status:'unsupported'};
  if (!configured()) return {status:'not_configured'};
  try {
    const response = await fetch(BASE + '/comparable/id/' + id, {
      redirect:'error', signal:AbortSignal.timeout(10000), headers:{Accept:'application/json', Authorization:'Bearer ' + await accessToken()}
    });
    if (response.status === 401) cachedToken = null;
    const detail = await json(response);
    // La risposta deve identificare proprio l'annuncio richiesto, non un comparabile simile.
    const actual = RULES.normalizeUrl(detail.listingUrl);
    if (listingId(actual) !== id) return {status:'mismatched_listing'};
    const candidates = [detail.attachments?.coverImage, ...(Array.isArray(detail.attachments?.image) ? detail.attachments.image : [])];
    const images = [...new Set(candidates.map(value => providerPhoto(value, source) || RULES.photoUrl(value, source.source)).filter(Boolean))].slice(0,12);
    const data = {
      title:RULES.cleanText(detail.extra?.title,130), zone:RULES.cleanText(detail.location?.marketZone || detail.location?.district,90),
      price:Number(detail.contractTypeID) === 2 ? RULES.positiveNumber(detail.value?.askingPrice,1000000) : null, sqm:RULES.positiveNumber(detail.grossSquareFootage,100000), rooms:RULES.positiveNumber(detail.rooms,100)
    };
    return {status:images.length ? 'ready' : 'no_photos', data, images};
  } catch (error) {
    const safe = ['access_denied','not_found','rate_limited','invalid_response','not_configured'];
    return {status:safe.includes(error.message) ? error.message : 'unavailable'};
  }
}
