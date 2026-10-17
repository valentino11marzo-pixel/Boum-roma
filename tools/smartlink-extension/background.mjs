// Una richiesta esplicita del Portal apre l'annuncio nella sessione Chrome
// dell'operatore. La scheda sorgente viene chiusa appena letta.
const SOURCES = new Map([
  ['immobiliare.it', /^\/annunci\/\d+\/?$/],
  ['idealista.it', /^\/immobile\/\d+\/?$/],
  ['subito.it', /^\/annunci-[^/]+/],
  ['casafari.com', /^\/estate\/sharepage\//],
  ['casa.it', /^\/immobili\//],
]);

export function canonical(raw) {
  try {
    const u = new URL(String(raw || ''));
    if (u.protocol !== 'https:' || u.port || u.username || u.password) return null;
    const source = [...SOURCES].find(([host]) => u.hostname === host || u.hostname.endsWith('.' + host));
    if (!source || !source[1].test(u.pathname)) return null;
    u.search=''; u.hash='';
    return u.toString();
  } catch { return null; }
}

export function listingSnapshot(sourceUrl) {
  const host = new URL(sourceUrl).hostname;
  const expected = host.includes('immobiliare.it') ? /(?:^|\.)im-cdn\.it$/ :
    host.includes('idealista.it') ? /(?:^|\.)idealista\.(?:it|com)$/ :
    host.includes('subito.it') ? /(?:^|\.)subito\.it$/ :
    host.includes('casafari.com') ? /(?:^|\.)casafari\.com$/ : /(?:^|\.)casa\.it$/;
  const images=[], seen=new Set();
  const add = raw => {
    try {
      const u=new URL(String(raw || '').replace(/\\\//g,'/'));
      if (u.protocol!=='https:' || !expected.test(u.hostname) || !/\.(?:jpe?g|png|webp)$/i.test(u.pathname) || /logo|avatar|icon|sprite|pixel/i.test(u.pathname)) return;
      const identity=host.includes('immobiliare.it') ? u.pathname.match(/\/image\/(\d+)\//)?.[1] || u.pathname : u.pathname;
      if (!seen.has(identity) && images.length<12) { seen.add(identity); images.push(u.toString()); }
    } catch { /* Non è una foto della fonte. */ }
  };
  // In Immobiliare le immagini della galleria sono già nel DOM anche se lazy.
  for (const image of document.images) {
    for (const candidate of [image.currentSrc,image.src,image.getAttribute('data-src')]) add(candidate);
  }
  if (images.length<12) {
    const html=document.documentElement.outerHTML.slice(0,3_000_000);
    for (const match of html.matchAll(/https:\\?\/\\?\/[a-z0-9.-]+(?:\\?\/[^\s"'<>`]+)?/gi)) {
      add(match[0]); if (images.length>=12) break;
    }
  }
  const text=document.body?.innerText || '';
  const title=document.querySelector('h1')?.textContent?.trim().slice(0,130) || null;
  const zone=title?.match(/,\s*([^,]{2,60}),\s*Roma$/i)?.[1]?.trim() || null;
  const price=text.match(/€\s*([\d.]+)\s*\/\s*mes[ea]/i);
  const sqm=text.match(/\b(\d{1,4})\s*m[²2](?=\s|$)/i);
  const rooms=text.match(/\b(\d{1,2})\s*local[ei]\b/i);
  return { images, data:{ title, zone, price:price ? Number(price[1].replace(/\./g,'')) : null, sqm:sqm ? Number(sqm[1]) : null, rooms:rooms ? Number(rooms[1]) : null } };
}

function waitForTab(id) {
  return new Promise((resolve,reject) => {
    let done=false;
    const finish=(error) => {
      if (done) return;
      done=true; clearTimeout(timer); chrome.tabs.onUpdated.removeListener(onUpdated);
      error ? reject(error) : resolve();
    };
    const onUpdated=(tabId, change) => { if (tabId===id && change.status==='complete') finish(); };
    const timer=setTimeout(() => finish(new Error('timeout')),25000);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(id).then(tab => { if (tab.status==='complete') finish(); }).catch(finish);
  });
}

async function extract(url) {
  const tab=await chrome.tabs.create({ url, active:false });
  try {
    await waitForTab(tab.id);
    const actual=await chrome.tabs.get(tab.id);
    if (canonical(actual.url)!==url) return { ok:false, error:'source_blocked' };
    const result=await chrome.scripting.executeScript({ target:{ tabId:tab.id }, func:listingSnapshot, args:[url] });
    const snapshot=result?.[0]?.result;
    return snapshot?.images?.length ? { ok:true, ...snapshot } : { ok:false, error:'photos_not_found' };
  } catch { return { ok:false, error:'browser_unavailable' }; }
  finally { chrome.tabs.remove(tab.id).catch(() => {}); }
}

if (typeof chrome !== 'undefined') chrome.runtime.onMessage.addListener((message,sender,respond) => {
  const from=sender.tab?.url || sender.url || '';
  const allowed=/^https:\/\/www\.boomrome\.com\/portal(?:[?#]|$)/.test(from) || /^http:\/\/127\.0\.0\.1:417[78]\/preview(?:[?#]|$)/.test(from);
  const url=canonical(message?.url);
  if (!allowed || message?.type!=='BOOM_SMARTLINK_EXTRACT' || !url) { respond({ ok:false, error:'invalid_request' }); return; }
  extract(url).then(respond).catch(() => respond({ ok:false, error:'browser_unavailable' }));
  return true;
});
