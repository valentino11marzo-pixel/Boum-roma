/* js/behavior-engine.js — BOOM Behavior Intelligence, pure aggregation.
 *
 * Turns anonymous, consented page-view summaries into the operator's view:
 * pages, sections, exits, interactions, journeys, acquisition channels (AI
 * assistants named per engine) and evidence-based actions.
 * No network, DOM or database. Shared by the API and its tests.
 */
(function (root) {
  'use strict';

  function n(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function pct(a, b) { return b ? Math.round((a / b) * 1000) / 10 : 0; }
  function avg(sum, count) { return count ? Math.round((sum / count) * 10) / 10 : 0; }
  function key(v, fallback) { return String(v || fallback || 'unknown').slice(0, 160); }
  // Ogni mappa ha le chiavi scelte da chi visita (utm_source, sessionId): un
  // 'constructor', '__proto__' o 'hasOwnProperty' trovava già qualcosa su
  // Object.prototype e il riepilogo intero cadeva (503 su /behavior per tutta
  // la finestra che conteneva quella riga). Le mappe nascono senza prototipo,
  // e add() guarda solo le chiavi proprie.
  function dict() { return Object.create(null); }
  function add(map, id, seed) {
    if (!Object.prototype.hasOwnProperty.call(map, id)) map[id] = seed();
    return map[id];
  }
  function values(o) { return Object.keys(o).map(function (k) { return o[k]; }); }
  function by(field) { return function (a, b) { return n(b[field]) - n(a[field]); }; }

  /* CLASSIFY:BEGIN */
  // Una copia sola, incollata identica in js/boom-track.js e in
  // js/behavior-engine.js (tests/attribution la confronta byte per byte).
  // L'AI si guarda PRIMA di Google: gemini.google.com è un assistente, non
  // una ricerca.
  var AI_SRC = [['chatgpt', /^(?:chatgpt(?:\.com)?|chat\.openai\.com|openai(?:\.com)?)$/], ['perplexity', /^perplexity(?:\.ai)?$/], ['gemini', /^(?:gemini(?:\.google\.com)?|bard\.google\.com)$/], ['copilot', /^(?:copilot(?:\.microsoft\.com)?|copilot\.cloud\.microsoft)$/], ['claude', /^claude(?:\.ai)?$/], ['you', /^you\.com$/], ['deepseek', /^(?:chat\.)?deepseek\.com$/], ['meta_ai', /^meta\.ai$/], ['mistral', /^chat\.mistral\.ai$/], ['grok', /^grok\.com$/]];
  function aiEngine(v) {
    v = String(v == null ? '' : v).toLowerCase().trim().replace(/^www\./, '');
    for (var i = 0; i < AI_SRC.length; i++) if (AI_SRC[i][1].test(v)) return AI_SRC[i][0];
    return '';
  }
  function classifySource(utm, host) {
    utm = String(utm == null ? '' : utm).trim();
    host = String(host == null ? '' : host).toLowerCase().trim().replace(/^www\./, '');
    var engine = aiEngine(utm) || aiEngine(host);
    if (engine) return { channel: 'ai_assistant', engine: engine };
    if (utm) return { channel: utm, engine: '' };
    if (!host) return { channel: 'direct', engine: '' };
    if (/(^|\.)boomrome\.com$/.test(host)) return { channel: 'internal', engine: '' };
    if (/(^|\.)google\./.test(host)) return { channel: 'google', engine: '' };
    if (/(^|\.)(?:bing|duckduckgo|ecosia|yahoo|brave|qwant|kagi)\./.test(host)) return { channel: 'organic_search', engine: '' };
    if (/(^|\.)(?:instagram|facebook|linkedin|reddit|twitter)\./.test(host) || /(^|\.)(?:x\.com|t\.co|lnkd\.in)$/.test(host)) return { channel: 'social', engine: '' };
    return { channel: 'referral', engine: '' };
  }
  /* CLASSIFY:END */
  // Il motore conosce i suoi id: un id salvato ('chatgpt') vale, un host
  // ('chat.openai.com') si riconduce all'id, il resto non è un motore.
  function engineId(v) {
    v = String(v == null ? '' : v).toLowerCase().trim();
    for (var i = 0; i < AI_SRC.length; i++) if (AI_SRC[i][0] === v) return v;
    return aiEngine(v);
  }

  var EXIT = ['checkpoint', 'navigate_internal', 'navigate_external', 'close_or_background'];
  var KINDS = ['internal', 'external', 'anchor', 'cta', 'whatsapp', 'checkout', 'lead', 'conversion'];
  function clip(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }
  function ident(v) { v = clip(v, 64); return /^[A-Za-z0-9_-]{12,64}$/.test(v) ? v : null; }
  function bounded(v, min, max) { v = Number(v); return isFinite(v) ? Math.max(min, Math.min(max, v)) : 0; }
  function pathname(v) {
    v = clip(v, 180).split(/[?#]/)[0];
    return /^\/[A-Za-z0-9._~!$&'()*+,;=:@%\/-]*$/.test(v) ? v : '/';
  }
  function interactionTarget(v) {
    v = clip(v, 180);
    if (/^(?:external:[A-Za-z0-9.-]{1,100}|whatsapp|stripe|mailto|tel|anchor:[A-Za-z0-9_-]{0,72})$/.test(v)) return v;
    return pathname(v);
  }
  function normalizeJourney(b, nowValue) {
    if (!b || b.consent !== true || b.schema !== 1) return null;
    var pageViewId = ident(b.pageViewId), sessionId = ident(b.sessionId);
    if (!pageViewId || !sessionId) return null;
    var now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
    var sections = Array.isArray(b.sections) ? b.sections.slice(0, 30).map(function (s) { return {
      id: clip(s.id, 72) || 'section', label: clip(s.label, 90) || 'Section',
      viewedMs: Math.round(bounded(s.viewedMs, 0, 1800000)), firstAt: Math.round(bounded(s.firstAt, 0, 3600))
    }; }) : [];
    var interactions = Array.isArray(b.interactions) ? b.interactions.slice(-32).map(function (x) { return {
      kind: KINDS.indexOf(x.kind) >= 0 ? x.kind : 'cta', label: clip(x.label, 80) || 'Interaction',
      target: interactionTarget(x.target), section: clip(x.section, 72), atSecond: Math.round(bounded(x.atSecond, 0, 3600))
    }; }) : [];
    var source = b.source && typeof b.source === 'object' ? {
      channel: clip(b.source.channel, 80) || 'direct', engine: engineId(b.source.engine),
      medium: clip(b.source.medium, 60),
      campaign: clip(b.source.campaign, 80), landing: pathname(b.source.landing),
      referrerHost: clip(b.source.referrerHost, 100)
    } : { channel: 'direct', engine: '', medium: '', campaign: '', landing: pathname(b.pagePath), referrerHost: '' };
    return {
      schema: 1, consent: true, pageViewId: pageViewId, sessionId: sessionId,
      pagePath: pathname(b.pagePath), pageTitle: clip(b.pageTitle, 120), service: clip(b.service, 60) || 'other',
      language: clip(b.language, 12), device: ['mobile', 'tablet', 'desktop'].indexOf(b.device) >= 0 ? b.device : 'desktop',
      viewport: clip(b.viewport, 20), source: source,
      startedAt: new Date(bounded(b.startedAt, 0, now.getTime()) || now.getTime()),
      receivedAt: now, expiresAt: new Date(now.getTime() + 90 * 86400000),
      elapsedSeconds: Math.round(bounded(b.elapsedSeconds, 0, 3600)),
      activeSeconds: Math.round(bounded(b.activeSeconds, 0, 1800)), scrollMax: Math.round(bounded(b.scrollMax, 0, 100)),
      lastSection: clip(b.lastSection, 72), exitType: EXIT.indexOf(b.exitType) >= 0 ? b.exitType : 'checkpoint',
      sections: sections, interactions: interactions
    };
  }

  // Il canale si legge ADESSO, non quando la visita è stata salvata: una riga
  // vecchia con channel 'chatgpt.com' (utm) o col referrer gemini.google.com
  // (allora contata 'google') torna all'assistente giusto.
  function channelOf(src) {
    src = src && typeof src === 'object' ? src : {};
    var channel = clip(src.channel, 80) || 'direct';
    var engine = engineId(src.engine) || aiEngine(channel) || aiEngine(src.referrerHost);
    if (engine) return { id: 'ai:' + engine, engine: engine, ai: true };
    return { id: channel, engine: '', ai: channel === 'ai_assistant' };
  }

  function summarize(input) {
    var rows = (input || []).filter(function (r) { return r && r.consent === true && r.pagePath; });
    var pages = dict(), sections = dict(), interactions = dict(), sessions = dict();
    var totalActive = 0, totalScroll = 0, engaged = 0, exits = 0, conversions = 0;

    rows.forEach(function (r) {
      var path = key(r.pagePath, '/');
      var p = add(pages, path, function () { return {
        pagePath: path, service: key(r.service, 'other'), views: 0, sessions: dict(),
        activeSeconds: 0, scroll: 0, engaged: 0, exits: 0, interactions: 0, conversions: 0
      }; });
      p.views += 1;
      p.sessions[key(r.sessionId)] = true;
      p.activeSeconds += n(r.activeSeconds);
      p.scroll += n(r.scrollMax);
      p.engaged += n(r.activeSeconds) >= 10 ? 1 : 0;
      var isExit = r.exitType && r.exitType !== 'navigate_internal' && r.exitType !== 'checkpoint';
      p.exits += isExit ? 1 : 0;
      totalActive += n(r.activeSeconds); totalScroll += n(r.scrollMax);
      if (n(r.activeSeconds) >= 10) engaged += 1;
      if (isExit) exits += 1;

      var sid = key(r.sessionId);
      var s = add(sessions, sid, function () { return { id: sid, source: key(r.source && r.source.channel, 'direct'), rows: [] }; });
      s.rows.push(r);

      (r.sections || []).forEach(function (x) {
        var sectionId = key(x.id, 'section');
        var sk = path + '::' + sectionId;
        var z = add(sections, sk, function () { return {
          pagePath: path, sectionId: sectionId, label: key(x.label, sectionId),
          views: 0, dwellSeconds: 0, lastSection: 0
        }; });
        z.views += 1;
        z.dwellSeconds += Math.round(n(x.viewedMs) / 1000);
        if (key(r.lastSection) === sectionId) z.lastSection += 1;
      });

      (r.interactions || []).forEach(function (x) {
        var kind = key(x.kind, 'click'), label = key(x.label, 'interaction');
        var ik = path + '::' + kind + '::' + label;
        var it = add(interactions, ik, function () { return {
          pagePath: path, service: key(r.service, 'other'), kind: kind,
          label: label, target: key(x.target, ''), section: key(x.section, ''), count: 0
        }; });
        it.count += 1; p.interactions += 1;
        if (kind === 'conversion' || kind === 'checkout' || kind === 'lead') {
          conversions += 1; p.conversions += 1;
        }
      });
    });

    var pageList = values(pages).map(function (p) {
      p.uniqueSessions = Object.keys(p.sessions).length;
      delete p.sessions;
      p.avgActiveSeconds = avg(p.activeSeconds, p.views);
      p.avgScroll = avg(p.scroll, p.views);
      p.engagementRate = pct(p.engaged, p.views);
      p.exitRate = pct(p.exits, p.views);
      return p;
    }).sort(by('views'));

    var sectionList = values(sections).map(function (s) {
      s.avgDwellSeconds = avg(s.dwellSeconds, s.views);
      s.lastSectionRate = pct(s.lastSection, s.views);
      return s;
    }).sort(by('views'));
    var interactionList = values(interactions).sort(by('count'));

    var flows = dict(), channels = dict();
    values(sessions).forEach(function (s) {
      s.rows.sort(function (a, b) { return String(a.startedAt || a.receivedAt).localeCompare(String(b.startedAt || b.receivedAt)); });
      var path = [], previous = null;
      s.rows.forEach(function (r) {
        var p = key(r.pagePath, '/');
        if (p !== previous) path.push(p);
        previous = p;
      });
      var name = path.slice(0, 5).join(' → ');
      if (name) flows[name] = (flows[name] || 0) + 1;

      // Canali: una sessione conta una volta, col primo contatto della sua
      // prima pagina. Tentativo = un modulo inviato o un checkout avviato;
      // conversione = un esito CONFERMATO (boom-conversion o acquisto).
      var first = s.rows[0], ch = channelOf(first.source);
      var c = add(channels, ch.id, function () { return {
        id: ch.id, engine: ch.engine, ai: ch.ai, sessions: 0,
        engagedSessions: 0, attemptSessions: 0, conversionSessions: 0, landings: dict()
      }; });
      var engagedS = false, attempt = false, converted = false;
      s.rows.forEach(function (r) {
        if (n(r.activeSeconds) >= 10) engagedS = true;
        (r.interactions || []).forEach(function (x) {
          var kind = x && x.kind;
          if (kind === 'lead' || kind === 'checkout') attempt = true;
          if (kind === 'conversion') converted = true;
        });
      });
      c.sessions += 1;
      if (engagedS) c.engagedSessions += 1;
      if (attempt) c.attemptSessions += 1;
      if (converted) c.conversionSessions += 1;
      var landing = key((first.source && first.source.landing) || first.pagePath, '/');
      c.landings[landing] = (c.landings[landing] || 0) + 1;
    });
    var flowList = Object.keys(flows).map(function (path) { return { path: path, sessions: flows[path] }; }).sort(by('sessions')).slice(0, 12);
    var channelList = values(channels).map(function (c) {
      c.topLandings = Object.keys(c.landings).map(function (path) { return { path: path, sessions: c.landings[path] }; })
        .sort(function (a, b) { return b.sessions - a.sessions || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0); }).slice(0, 3);
      delete c.landings;
      return c;
    }).sort(function (a, b) {
      return (b.ai ? 1 : 0) - (a.ai ? 1 : 0) || b.sessions - a.sessions || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });

    var recommendations = [];
    pageList.forEach(function (p) {
      if (p.views >= 8 && p.avgScroll < 45) recommendations.push({
        priority: 'alta', type: 'message', pagePath: p.pagePath,
        title: 'La promessa iniziale non porta abbastanza in profondità',
        evidence: p.views + ' visite, profondità media ' + p.avgScroll + '%.',
        action: 'Rendere il primo schermo più specifico e anticipare la prova o la CTA principale.'
      });
      if (p.views >= 8 && p.exitRate >= 55 && p.conversions === 0) recommendations.push({
        priority: 'alta', type: 'exit', pagePath: p.pagePath,
        title: 'Uscita alta senza azione commerciale',
        evidence: 'Tasso di uscita ' + p.exitRate + '% e nessuna conversione osservata.',
        action: 'Verificare l’ultima sezione vista e inserire un passaggio successivo coerente con l’intento.'
      });
      if (p.views >= 10 && p.engagementRate >= 50 && p.interactions === 0) recommendations.push({
        priority: 'media', type: 'curiosity', pagePath: p.pagePath,
        title: 'Interesse reale senza un passo successivo',
        evidence: 'Coinvolgimento ' + p.engagementRate + '% ma nessuna interazione.',
        action: 'Trasformare la sezione più letta in una scelta semplice: approfondisci, confronta o contattaci.'
      });
    });
    sectionList.forEach(function (s) {
      if (s.views >= 8 && s.avgDwellSeconds >= 12 && s.lastSectionRate >= 40) recommendations.push({
        priority: 'media', type: 'section', pagePath: s.pagePath, sectionId: s.sectionId,
        title: 'Curiosità concentrata prima dell’uscita',
        evidence: '“' + s.label + '”: ' + s.avgDwellSeconds + ' s medi, ultima sezione nel ' + s.lastSectionRate + '%.',
        action: 'Chiarire il dubbio in questa sezione e collegarla direttamente alla CTA pertinente.'
      });
    });
    var rank = { alta: 3, media: 2, bassa: 1 };
    recommendations.sort(function (a, b) { return rank[b.priority] - rank[a.priority]; });

    return {
      generatedAt: new Date().toISOString(),
      totals: {
        pageViews: rows.length, sessions: Object.keys(sessions).length,
        avgActiveSeconds: avg(totalActive, rows.length), avgScroll: avg(totalScroll, rows.length),
        engagementRate: pct(engaged, rows.length), exitRate: pct(exits, rows.length),
        interactions: interactionList.reduce(function (a, x) { return a + x.count; }, 0),
        conversions: conversions
      },
      pages: pageList, sections: sectionList.slice(0, 80),
      interactions: interactionList.slice(0, 80), flows: flowList,
      channels: channelList.slice(0, 40),
      recommendations: recommendations.slice(0, 20)
    };
  }

  var API = {
    summarize: summarize, normalizeJourney: normalizeJourney,
    aiEngine: aiEngine, classifySource: classifySource, channelOf: channelOf,
    AI_ENGINES: AI_SRC.map(function (x) { return x[0]; })
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_BEHAVIOR = API;
})(typeof window !== 'undefined' ? window : this);
