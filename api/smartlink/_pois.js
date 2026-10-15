// Punti OSM vicini a un'AREA pubblica della scheda, mai all'indirizzo privato.
import RULES from '../../js/smartlink-engine.js';

function category(tags) {
  if (tags.station === 'subway' || tags.railway === 'subway_entrance' || (tags.railway === 'station' && tags.subway === 'yes')) return 'metro';
  if (tags.shop === 'supermarket') return 'spesa';
  if (tags.amenity === 'university') return 'universita';
  if (tags.leisure === 'park') return 'verde';
  return null;
}

export async function nearbyPois(rawMap) {
  const map = RULES.cleanMap(rawMap);
  if (!map) return { ok:true, status:'unavailable', points:[] };
  const around = `around:1600,${map.lat},${map.lng}`;
  const query = `[out:json][timeout:12];(`
    + `nwr(${around})["station"="subway"];`
    + `nwr(${around})["railway"="subway_entrance"];`
    + `nwr(${around})["shop"="supermarket"];`
    + `nwr(${around})["amenity"="university"];`
    + `nwr(${around})["leisure"="park"];`
    + `);out center;`;
  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'BOOMRome/1.0 (+https://www.boomrome.com)'},
      body:new URLSearchParams({data:query}), signal:AbortSignal.timeout(14000),
    });
    if (!r.ok || Number(r.headers.get('content-length')) > 1_500_000) return { ok:true, status:'unavailable', points:[] };
    const raw = await r.text();
    if (raw.length > 1_500_000) return { ok:true, status:'unavailable', points:[] };
    const json = JSON.parse(raw);
    const seen = new Set();
    const points = (Array.isArray(json.elements) ? json.elements : []).map(e => {
      const t = e.tags || {}, cat = category(t);
      const lat = Number(e.lat ?? e.center?.lat), lng = Number(e.lon ?? e.center?.lon);
      const name = RULES.cleanText(t['name:it'] || t.name, 80);
      const km = RULES.distanceKm(map, {lat,lng});
      if (!cat || !name || km == null || km > 2 || km < 0.03) return null;
      return { name, category:cat, lat, lng, meters:Math.round(km * 1000 / 10) * 10 };
    }).filter(Boolean).sort((a,b) => a.meters - b.meters).filter(p => {
      const key = p.category + ':' + p.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 40);
    return { ok:true, status:'ok', points };
  } catch {
    return { ok:true, status:'unavailable', points:[] };
  }
}
