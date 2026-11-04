/* js/radar-markets.js — IL RADAR PER MERCATO: di quale città è questo annuncio,
 * e di quale città è questo cliente. Puro, UMD (window.BOOM_RADAR_MARKETS +
 * module.exports), come radar-engine.
 *
 * LA DOMANDA A CUI RISPONDE. Il radar PFS è nato per Roma e non si è mai
 * chiesto "di che città?": un appartamento di Madrid letto da un alert
 * idealista.com prendeva 100/100 contro una cliente romana con zona 'centro'
 * (budget giusto, camere giuste, e 'centro' dentro il testo) e finiva nel suo
 * mazzo. Da quando i desk di Madrid e Barcellona vendono Full Search, il radar
 * deve servire PIÙ città senza che una sporchi l'altra.
 *
 * LE REGOLE, tutte qui (il resto del codice le chiama, non le riscrive):
 *   - un cliente SENZA `market` è di Roma (ogni cliente nato prima di oggi);
 *     un valore sconosciuto o scritto male non è di nessuna città (fail
 *     closed: meglio un mazzo vuoto e segnalato che una casa nella città
 *     sbagliata);
 *   - un annuncio prende la città dalla PROVA più forte disponibile:
 *     dichiarata da chi lo manda → dominio del portale (idealista.it e
 *     immobiliare.it sono Roma) → l'alias della casella (+radar-madrid) →
 *     la città scritta nel testo dell'annuncio → le fonti storiche di Roma,
 *     SOLO quando alias e testo tacciono (un Casafari a +radar-madrid è di
 *     Madrid). Due prove che si contraddicono non si mediano: market_conflict;
 *   - idealista.com è la Spagna intera, e così i portali spagnoli (Fotocasa,
 *     Habitaclia, pisos.com, .es/.cat): il dominio da solo non dice la città
 *     ('needs_city'), la dicono l'alias o il testo — mai Roma per difetto.
 *
 * Amsterdam è DICHIARATA ma spenta (enabled:false). Motivo: gli alert email
 * gratuiti di Pararius e Funda arrivano una volta al giorno (l'istantaneo è a
 * pagamento) e il formato delle email non è verificato. URL verificati il
 * 25/10/2026 da risultati di ricerca (mai aperti dal sandbox):
 *   pararius: https://www.pararius.com/apartment-for-rent/amsterdam/<8-hex>/<via>
 *             ricerche /apartments/amsterdam[/district-oud-zuid]
 *   funda:    https://www.funda.nl/detail/huur/amsterdam/<slug>/<8 cifre>/
 *             ricerca /zoeken/huur?selected_area=["amsterdam"]
 * Le "kamers" olandesi non sono camere da letto: prima di accenderla serve
 * una regola sul conteggio.
 */
(function (root) {
  'use strict';

  var MARKETS = {
    roma: {
      id: 'roma', labelIt: 'Roma', labelEn: 'Rome', flag: '🇮🇹', currency: 'EUR',
      agencyPolicy: 'drop', enabled: true
    },
    madrid: {
      id: 'madrid', labelIt: 'Madrid', labelEn: 'Madrid', flag: '🇪🇸', currency: 'EUR',
      // 'flag', non 'drop': la pagina di Madrid promette "Every working day:
      // Idealista, Fotocasa, agencies" (cities/madrid.json, Full Search).
      // Scartare le agenzie romperebbe una promessa pubblicata. Una riga sola
      // da cambiare se il fondatore decide diversamente.
      agencyPolicy: 'flag', enabled: true,
      aliasTag: 'radar-madrid', cityTokens: ['madrid'],
      idealistaCity: 'madrid-madrid', idealistaRoot: 'madrid'
    },
    barcelona: {
      id: 'barcelona', labelIt: 'Barcellona', labelEn: 'Barcelona', flag: '🇪🇸', currency: 'EUR',
      agencyPolicy: 'flag', enabled: true,
      aliasTag: 'radar-barcelona', cityTokens: ['barcelona'],
      idealistaCity: 'barcelona-barcelona', idealistaRoot: 'barcelona'
    },
    amsterdam: {
      id: 'amsterdam', labelIt: 'Amsterdam', labelEn: 'Amsterdam', flag: '🇳🇱', currency: 'EUR',
      agencyPolicy: 'flag', enabled: false,
      aliasTag: 'radar-amsterdam', cityTokens: ['amsterdam']
    }
  };

  // Le fonti che esistevano prima dei mercati: tutte romane per costruzione
  // (homie/property, scan-market e scan-inbox non conoscevano altro).
  var LEGACY_ROME_SOURCES = ['immobiliare', 'idealista', 'casafari', 'subito', 'whatsapp', 'manual'];

  function fold(s) {
    return String(s == null ? '' : s).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function enabledIds() {
    return Object.keys(MARKETS).filter(function (k) { return MARKETS[k].enabled === true; });
  }

  function isEnabledMarket(id) {
    var m = MARKETS[String(id || '')];
    return !!(m && m.enabled === true);
  }

  /* Il mercato di un cliente PFS. Assente/vuoto = Roma (i clienti di prima);
   * un valore fuori lista = null, cioè nessun annuncio gli arriva. */
  function clientMarket(c) {
    var raw = c && c.market;
    if (raw == null || (typeof raw === 'string' && raw.trim() === '')) return 'roma';
    var k = String(raw).trim().toLowerCase();
    return isEnabledMarket(k) ? k : null;
  }

  function hostOf(url) {
    try { return new URL(String(url)).hostname.toLowerCase(); }
    catch (e) { return ''; }
  }
  function pathOf(url) {
    try { return new URL(String(url)).pathname.toLowerCase(); }
    catch (e) { return ''; }
  }
  function hostIs(host, domain) {
    return host === domain || host.slice(-(domain.length + 1)) === '.' + domain;
  }

  /* Cosa dice il dominio. 'roma' | 'needs_city' | 'amsterdam' | null | undefined
   * (undefined = il dominio non dice niente; null = dice una città spenta). */
  function marketOfUrl(url) {
    var h = hostOf(url);
    if (!h) return undefined;
    if (hostIs(h, 'idealista.it') || hostIs(h, 'immobiliare.it')) return 'roma';
    if (hostIs(h, 'idealista.com')) return 'needs_city';
    // La Spagna, città da dire: un portale spagnolo (Fotocasa, Habitaclia,
    // pisos.com) o un dominio .es/.cat non è MAI Roma per difetto — senza
    // l'alias o il testo è "da verificare", mai un annuncio romano.
    if (hostIs(h, 'fotocasa.es') || hostIs(h, 'habitaclia.com') || hostIs(h, 'pisos.com') ||
        /\.(es|cat)$/.test(h)) return 'needs_city';
    if ((hostIs(h, 'pararius.com') || hostIs(h, 'pararius.nl') || hostIs(h, 'funda.nl')) &&
        /\/amsterdam(\/|$)/.test(pathOf(url))) {
      return isEnabledMarket('amsterdam') ? 'amsterdam' : null;
    }
    return undefined;
  }

  /* L'alias della casella: valentino+radar-madrid@… oppure radar-madrid@…
   * (l'indirizzo alternativo di Workspace se il portale rifiuta il '+').
   * Esattamente UNA città abilitata → quella; zero o più di una → null. */
  function marketOfRecipients(addresses) {
    var found = {};
    (addresses || []).forEach(function (a) {
      var s = String(a == null ? '' : a).toLowerCase();
      var re = /([a-z0-9._%+-]+)@[a-z0-9.-]+/g, m;
      while ((m = re.exec(s))) {
        var local = m[1];
        var plus = local.indexOf('+');
        var tag = plus >= 0 ? local.slice(plus + 1) : local;
        enabledIds().forEach(function (k) {
          var t = MARKETS[k].aliasTag;
          if (t && tag === t) found[k] = 1;
        });
      }
    });
    var ks = Object.keys(found);
    return ks.length === 1 ? ks[0] : null;
  }

  function tokenRe(tok) {
    return new RegExp('(^|[^a-z0-9])' + fold(tok).replace(/ /g, '[^a-z0-9]+') + '($|[^a-z0-9])');
  }

  /* La città scritta nel testo dell'annuncio, a parole intere. Una sola città
   * nominata → quella; nessuna o due ("Avinguda de Madrid, Barcelona") → null. */
  function marketFromText(text) {
    var hay = fold(text);
    if (!hay) return null;
    var hits = enabledIds().filter(function (k) {
      var toks = MARKETS[k].cityTokens || [];
      return toks.some(function (t) { return tokenRe(t).test(hay); });
    });
    return hits.length === 1 ? hits[0] : null;
  }

  /* La città di un annuncio, con la prova che l'ha decisa.
   * → { market, via } oppure { market:null, reason:'market_unknown'|'market_conflict' } */
  function resolveListingMarket(o) {
    var x = o || {};
    var explicit = x.explicit != null ? String(x.explicit).trim().toLowerCase() : '';
    var dom = marketOfUrl(x.sourceUrl);
    if (explicit && isEnabledMarket(explicit)) {
      // Dichiarata, ma mai contro una prova più dura: un idealista.it
      // dichiarato "madrid", o un idealista.com che nomina un'altra città.
      if (dom && dom !== 'needs_city' && dom !== explicit) return { market: null, reason: 'market_conflict' };
      if (dom === 'needs_city') {
        var named = marketFromText(x.text);
        if (named && named !== explicit) return { market: null, reason: 'market_conflict' };
      }
      return { market: explicit, via: 'explicit' };
    }

    if (dom === 'roma') return { market: 'roma', via: 'domain' };
    if (dom && dom !== 'needs_city') return { market: dom, via: 'domain' };
    if (dom === 'needs_city') {
      var alias = x.aliasMarket && isEnabledMarket(x.aliasMarket) ? x.aliasMarket : null;
      var said = marketFromText(x.text);
      if (alias) {
        if (said && said !== alias) return { market: null, reason: 'market_conflict' };
        return { market: alias, via: 'alias' };
      }
      if (said) return { market: said, via: 'text' };
      return { market: null, reason: 'market_unknown' };
    }
    if (dom === undefined) {
      // Il dominio tace (casafari.com, una fonte a mano): prima le prove che
      // ci sono — l'alias della casella e la città scritta nell'annuncio —
      // e solo se tacciono anche loro, la regola storica "è Roma". Prima la
      // fonte storica vinceva su tutto: un alert Casafari arrivato a
      // +radar-madrid, o un Fotocasa "…, Madrid" aggiunto a mano, finivano
      // nei mazzi romani.
      var aliasU = x.aliasMarket && isEnabledMarket(x.aliasMarket) ? x.aliasMarket : null;
      var hay = fold(x.text);
      var saidU = marketFromText(x.text);
      // "Via Madrid, Roma" / "Calle de Roma, Madrid": due città nel testo
      // non si mediano — da verificare, mai Roma per difetto
      var romeToo = !!hay && (tokenRe('roma').test(hay) || tokenRe('rome').test(hay));
      if (saidU && romeToo) return { market: null, reason: 'market_unknown' };
      if (aliasU && saidU && saidU !== aliasU) return { market: null, reason: 'market_conflict' };
      if (aliasU) return { market: aliasU, via: 'alias' };
      if (saidU) return { market: saidU, via: 'text' };
      var src = String(x.source || '').toLowerCase();
      if (LEGACY_ROME_SOURCES.indexOf(src) >= 0) return { market: 'roma', via: 'legacy' };
    }
    return { market: null, reason: 'market_unknown' };
  }

  /* Il nome della città per l'operatore (IT) o per il cliente (EN). */
  function marketLabel(id, lang) {
    var m = MARKETS[String(id || '')];
    if (!m) return '';
    return lang === 'en' ? m.labelEn : m.labelIt;
  }
  function marketFlag(id) {
    var m = MARKETS[String(id || '')];
    return m ? m.flag : '';
  }
  function agencyPolicy(id) {
    var m = MARKETS[String(id || '')];
    return m ? m.agencyPolicy : 'drop';
  }

  /* La salute di un flusso di alert di una città (pfsRadarHealth/inbox-<città>).
   * Nessun cliente attivo → niente da dire. Altrimenti il riferimento è
   * l'ultimo alert visto o, se non ne è mai arrivato uno, il momento in cui la
   * città ha avuto il suo primo cliente attivo: 48 ore senza un alert con
   * clienti che pagano è una ricerca salvata spenta o un alias che non
   * consegna, e va detto. */
  function marketStreamVerdict(o) {
    var x = o || {};
    var n = Number(x.activeClients) || 0;
    var label = marketLabel(x.market, 'it') || x.market || '';
    if (n <= 0) return { ok: true, error: null };
    var now = x.nowMs != null ? x.nowMs : Date.now();
    var grace = (x.graceHours != null ? x.graceHours : 48) * 3600e3;
    var last = +new Date(x.lastAlertAt || 0) || 0;
    var since = +new Date(x.activeSince || 0) || 0;
    var ref = Math.max(last, since);
    if (!ref) return { ok: true, error: null };
    if (now - ref > grace) {
      return {
        ok: false,
        error: 'nessun alert ' + label + ' da ' + Math.round((x.graceHours != null ? x.graceHours : 48)) +
          'h con ' + n + ' clienti attivi: ricerca salvata e alias attivi?'
      };
    }
    return { ok: true, error: null };
  }

  var API = {
    MARKETS: MARKETS,
    LEGACY_ROME_SOURCES: LEGACY_ROME_SOURCES,
    enabledIds: enabledIds,
    isEnabledMarket: isEnabledMarket,
    clientMarket: clientMarket,
    marketOfUrl: marketOfUrl,
    marketOfRecipients: marketOfRecipients,
    marketFromText: marketFromText,
    resolveListingMarket: resolveListingMarket,
    marketLabel: marketLabel,
    marketFlag: marketFlag,
    agencyPolicy: agencyPolicy,
    marketStreamVerdict: marketStreamVerdict
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_RADAR_MARKETS = API;
})(typeof window !== 'undefined' ? window : this);
