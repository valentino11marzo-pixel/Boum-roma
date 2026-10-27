/* One Flight palette over the existing OpenFreeMap/MapLibre map. No data,
 * camera, route or precision rules live here. Custom GeoJSON lines and
 * satellite imagery retain the styling owned by their original engines. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BOOM_FLIGHT_MAP = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function dress(map, buildingLayer) {
    if (!map || typeof map.getStyle !== 'function') return false;
    var style = map.getStyle();
    if (!style || !Array.isArray(style.layers)) return false;
    style.layers.forEach(function (layer) {
      var source = style.sources && style.sources[layer.source];
      // Commute connectors, itinerary lines and property highlights belong
      // to the page's geo engine, not the base-cartography colour treatment.
      if (source && source.type === 'geojson') return;
      try {
        if (layer.type === 'background') map.setPaintProperty(layer.id, 'background-color', '#090b0e');
        if (layer.type === 'fill') map.setPaintProperty(layer.id, 'fill-color', /water/.test(layer.id) ? '#15242b' : /park|landcover|landuse|wood/.test(layer.id) ? '#121c19' : '#16191e');
        if (layer.type === 'line' && !/^links/.test(layer.id)) map.setPaintProperty(layer.id, 'line-color', /water/.test(layer.id) ? '#263e47' : /motorway|trunk|primary/.test(layer.id) ? '#53504a' : '#30343b');
        if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
          map.setPaintProperty(layer.id, 'text-color', /place|state|country/.test(layer.id) ? '#c9cbd0' : '#9298a2');
          map.setPaintProperty(layer.id, 'text-halo-color', '#0b0d11');
        }
      } catch (_) { /* An optional style layer must not stop the map. */ }
    });
    if (buildingLayer) {
      try { map.setPaintProperty(buildingLayer, 'fill-extrusion-color', ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 10], 0, '#373b43', 24, '#50545d', 60, '#707177']); } catch (_) {}
    }
    try { if (map.setLight) map.setLight({ anchor: 'viewport', color: '#fff3d3', intensity: .45, position: [1.5, 210, 55] }); } catch (_) {}
    try { if (map.setSky) map.setSky({ 'sky-color': '#07090d', 'horizon-color': '#171b22', 'fog-color': '#12171e', 'sky-horizon-blend': .7, 'horizon-fog-blend': .6, 'fog-ground-blend': .3 }); } catch (_) {}
    return true;
  }
  return { dress: dress };
});
