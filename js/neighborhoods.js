/* AUTO-GENERATED — do not edit. Source: scripts/neighborhoods-data.js
 * Run: node scripts/neighborhoods-build.js
 *
 * window.BOOM.zoneToSlug(zoneString)   -> "trastevere" | null
 * window.BOOM.zoneToName(zoneString)   -> "Trastevere" | null
 * window.BOOM.allNeighborhoods()       -> [{slug,name,terms}]
 */
(function () {
  var N = [{"slug":"trastevere","name":"Trastevere","terms":["trastevere","gianicolo","monteverde vecchio"]},{"slug":"centro-storico","name":"Centro Storico","terms":["centro storico","centro-storico","historic centre","historic center","pantheon","navona","centro","coronari","campo de' fiori","campo dei fiori","piazza farnese","trevi","spanish steps","piazza di spagna"]},{"slug":"monti","name":"Monti","terms":["monti","rione monti","colosseo","colosseum","cavour","fori imperiali","santa maria maggiore","esquilino-monti"]},{"slug":"prati","name":"Prati","terms":["prati","mazzini","delle vittorie","vatican","vaticano","cola di rienzo","ottaviano","lepanto","castel sant'angelo","angelico"]},{"slug":"pigneto","name":"Pigneto","terms":["pigneto","via del pigneto","centocelle","casilina"]},{"slug":"testaccio","name":"Testaccio","terms":["testaccio","monte testaccio","mattatoio","piramide-testaccio"]},{"slug":"ostiense","name":"Ostiense","terms":["ostiense","garbatella","marconi","piramide","gazometro","roma tre"]},{"slug":"trieste-coppede","name":"Trieste & Coppedè","terms":["trieste","coppedè","coppede","salario","parioli","villa ada","villa torlonia","nomentano","levico"]},{"slug":"san-lorenzo","name":"San Lorenzo","terms":["san lorenzo","sapienza","verano","tiburtina","via dei volsci"]},{"slug":"esquilino","name":"Esquilino","terms":["esquilino","piazza vittorio","termini","vittorio emanuele","manzoni","mercato esquilino"]}];
  function find(input) {
    if (!input) return null;
    var s = String(input).toLowerCase();
    for (var i = 0; i < N.length; i++) {
      var n = N[i];
      for (var j = 0; j < n.terms.length; j++) {
        if (s.indexOf(n.terms[j]) !== -1) return n;
      }
    }
    return null;
  }
  window.BOOM = window.BOOM || {};
  window.BOOM.zoneToSlug = function (z) { var h = find(z); return h ? h.slug : null; };
  window.BOOM.zoneToName = function (z) { var h = find(z); return h ? h.name : null; };
  window.BOOM.allNeighborhoods = function () { return N.slice(); };
})();
