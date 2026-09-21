/* js/ai-registry.js — LA CENTRALE AI: chi spende, quanto, e dove può andare.
 *
 * Il repo chiamava un modello da VENTITRÉ file, ognuno con la propria fetch,
 * il proprio modello scritto a mano e nessun contatore: la spesa AI era una
 * riga di fattura a fine mese, mai un numero per scopo. E ogni scelta di
 * modello (opus per la prima risposta ai lead, sonnet per l'interprete del
 * bot, haiku per il resto) era una costante nel sorgente — cioè in pratica
 * non si cambiava mai, e "proviamo un modello locale" avrebbe voluto dire
 * ventitré patch.
 *
 * QUI STA SCRITTO, in una copia sola, letta dal server (api/_ai.js), dal
 * comando /ai su Telegram e — domani — da una console:
 *
 *   1. OGNI SCOPO ha un nome, un file, un modello cloud di default, la
 *      modalità (testo / immagini / documenti / audio), la posta in gioco e
 *      se può andare in locale. Un file che chiama un modello senza uno
 *      scopo dichiarato qui fa cadere il test (anti-deriva, come
 *      driftVsCrons per i cron).
 *   2. LA REGOLA DEL LOCALE. Un modello sul Mac dell'operatore costa zero
 *      token e — più importante per documenti d'identità ed estratti conto —
 *      non fa uscire i dati da casa. Ma è più debole di un modello cloud, e
 *      la differenza non si vede nel codice: si MISURA. Per questo esistono
 *      tre modalità per scopo:
 *        · cloud  — com'è oggi (il default: il deploy non cambia niente);
 *        · shadow — risponde il cloud, il locale corre in parallelo e si
 *                   registra SOLO se i due sono d'accordo (mai il contenuto);
 *        · local  — risponde il locale; se è giù, lento o scrive un JSON
 *                   illeggibile si RICADE sul cloud, dichiarandolo.
 *      La promozione da shadow a local la decide l'operatore, coi numeri
 *      davanti (campione minimo + accordo minimo — la scala della fiducia,
 *      applicata ai modelli).
 *   3. CIÒ CHE NON VA MAI IN LOCALE resta scritto: l'inventario dal video
 *      (vale sul deposito), i PDF (il locale non legge documenti), il proxy
 *      del Doc Parser (restituisce la risposta grezza alla pagina).
 *   4. IL COSTO SI CALCOLA DAI TOKEN VERI di ogni risposta con la tabella
 *      prezzi dichiarata qui — non da una stima per chiamata. Un modello
 *      sconosciuto alla tabella dà costo `null`, mai un numero inventato.
 *
 * Puro: nessun Firebase, nessuna rete. window.BOOM_AI (UMD, come boom-geo).
 */
(function (root) {
  'use strict';

  var MODES = ['cloud', 'shadow', 'local'];

  /* ── Prezzi USD per MILIONE di token (listino Anthropic first-party,
   *    tabella del 2026-06). Cache: lettura ×0.1, scrittura ×1.25.
   *    I modelli locali costano 0 token: la corrente del Mac non si conta
   *    qui, e lo si dice. ── */
  var PRICES = {
    'claude-haiku-4-5':          { in: 1,  out: 5,  tier: 'haiku' },
    'claude-haiku-4-5-20251001': { in: 1,  out: 5,  tier: 'haiku' },
    'claude-sonnet-5':           { in: 2,  out: 10, tier: 'sonnet' },
    'claude-sonnet-4-6':         { in: 3,  out: 15, tier: 'sonnet' },
    'claude-opus-5':             { in: 5,  out: 25, tier: 'opus' },
    'claude-opus-4-8':           { in: 5,  out: 25, tier: 'opus' },
    'claude-opus-4-7':           { in: 5,  out: 25, tier: 'opus' },
    'claude-opus-4-6':           { in: 5,  out: 25, tier: 'opus' }
  };
  var CACHE_READ_FACTOR = 0.1, CACHE_WRITE_FACTOR = 1.25;
  /* STT: OpenAI Whisper si paga al minuto di audio. */
  var STT_PRICES = { 'whisper-1': { perMinuteUsd: 0.006 } };
  /* Cambio DICHIARATO per la sola visualizzazione in euro — la fattura è in
   * dollari, il numero vero resta quello. */
  var EUR_PER_USD = 0.92;

  /* ── Gli scopi. `code` è il nome corto per i bottoni Telegram (≤ 2 char,
   *    unico: il test lo pretende). `agreeOn`: le chiavi del JSON su cui
   *    cloud e locale devono coincidere perché la coppia conti come
   *    "d'accordo" (null = tutto l'oggetto; false = testo libero, non
   *    misurabile qui: si misura con le approvazioni dell'operatore). ── */
  var PURPOSES = [
    { key: 'agent.reply',       code: 'ar', label: 'Bozza risposta al lead (portal/Homie)',    file: 'api/agent/ai.reply.js',
      cloudModel: 'claude-opus-4-8', modality: 'text', localOk: true,  stakes: 'cliente',  json: true,  agreeOn: false,
      why: 'la bozza passa sempre da un tap umano: un locale si misura sulle approvazioni' },
    { key: 'commerciale.first', code: 'cf', label: 'Commerciale — prima risposta al lead',       file: 'api/employees/commerciale.js',
      cloudModel: 'claude-opus-4-8', modality: 'text', localOk: true,  stakes: 'cliente',  json: true,  agreeOn: false,
      why: 'proposta in action_queue, approvata a mano' },
    { key: 'segretaria.turn',   code: 'sg', label: 'Segretaria — turno WhatsApp',               file: 'api/segretaria/_core.js',
      cloudModel: 'claude-opus-4-8', modality: 'text', localOk: true,  stakes: 'cliente',  json: true,  agreeOn: ['escalate'],
      why: 'parla al cliente in tempo reale: i binari (sanitizeReply, escalation) reggono, ma la voce si misura in ombra prima' },
    { key: 'banking.mail',      code: 'bm', label: 'Banca — movimento da email di avviso',       file: 'api/banking/scan-inbox.js',
      cloudModel: 'claude-haiku-4-5-20251001', modality: 'text', localOk: true, stakes: 'interno', json: true, agreeOn: ['movements'],
      why: 'estrazione con JSON validato a valle; dati bancari: il locale li tiene in casa' },
    { key: 'banking.pdf',       code: 'bp', label: 'Banca — estratto conto PDF',                 file: 'api/banking/scan-inbox.js',
      cloudModel: 'claude-haiku-4-5-20251001', modality: 'document', localOk: false, stakes: 'interno', json: true, agreeOn: ['movements'],
      why: 'blocco documento PDF: il locale non lo legge' },
    { key: 'leads.brain',       code: 'lb', label: 'Lead Brain — voto in lotto',                 file: 'api/leads/brain.js',
      cloudModel: 'claude-haiku-4-5-20251001', modality: 'text', localOk: true, stakes: 'interno', json: true, agreeOn: ['grade', 'intent'],
      why: 'classificazione con regole prima e whitelist dopo: il caso ideale per un locale' },
    { key: 'leads.inbox',       code: 'li', label: 'Lead — estrazione da email dei portali',     file: 'api/leads/scan-inbox.js',
      cloudModel: 'claude-haiku-4-5-20251001', modality: 'text', localOk: true, stakes: 'interno', json: true, agreeOn: ['name', 'email', 'phone'],
      why: 'estrazione di campi presenti nel testo, mai inventati' },
    { key: 'wizard.interpret',  code: 'wi', label: 'Wizard — interprete comandi (catalogo)',     file: 'api/wizard/interpret.js',
      cloudModel: 'claude-sonnet-5', modality: 'text', localOk: true, stakes: 'interno', json: true, agreeOn: ['action', 'id'],
      why: 'il piano passa dalla whitelist e dal ✅ dell\'operatore; è la chiamata più cara del bot' },
    { key: 'wizard.describe',   code: 'wd', label: 'Copywriter — descrizione annuncio IT/EN',    file: 'api/wizard/describe.js',
      cloudModel: 'claude-haiku-4-5-20251001', modality: 'text', localOk: true, stakes: 'pubblico', json: true, agreeOn: false,
      why: 'testo pubblicato in vetrina: si giudica leggendolo, non confrontandolo' },
    { key: 'listing.ask',       code: 'la', label: 'Scheda pubblica — domanda del visitatore',   file: 'api/ask-listing.js',
      cloudModel: 'claude-haiku-4-5-20251001', modality: 'text', localOk: true, stakes: 'pubblico', json: false, agreeOn: false,
      why: 'endpoint pubblico: in locale il costo di un abuso è zero' },
    { key: 'canone.bot',        code: 'cb', label: 'Calcolatore canone — dialogo',               file: 'api/canone-bot.js',
      cloudModel: 'claude-haiku-4-5-20251001', modality: 'text', localOk: true, stakes: 'pubblico', json: true, agreeOn: ['completo'],
      why: 'raccolta campi guidata, JSON a schema fisso' },
    { key: 'concierge.chat',    code: 'cc', label: 'Concierge inquilino — chat',                 file: 'api/agent/concierge.js',
      cloudModel: 'claude-haiku-4-5-20251001', modality: 'text', localOk: true, stakes: 'cliente', json: false, agreeOn: false,
      why: 'le emergenze le risolve una regex prima del modello' },
    { key: 'media.caption',     code: 'mc', label: 'Media Studio — copy social/portale',         file: 'api/media/caption.js',
      cloudModel: 'claude-haiku-4-5-20251001', modality: 'text', localOk: true, stakes: 'interno', json: false, agreeOn: false,
      why: 'testo che l\'operatore rilegge prima di pubblicare' },
    { key: 'outreach.draft',    code: 'od', label: 'Contatto — rifinitura messaggio al privato', file: 'api/outreach/draft.js',
      cloudModel: 'claude-haiku-4-5-20251001', modality: 'text', localOk: true, stakes: 'cliente', json: false, agreeOn: false,
      why: 'ogni messaggio è approvato uno per uno; il template regge anche senza modello' },
    { key: 'docs.smista',       code: 'ds', label: 'Smistatore — categoria e immobile',          file: 'api/documents/_smista.js',
      cloudModel: 'claude-haiku-4-5-20251001', modality: 'document', localOk: true, stakes: 'interno', json: true, agreeOn: ['category', 'propertyId'],
      why: 'foto → anche in locale (visione); PDF → sempre cloud' },
    { key: 'docs.ocr',          code: 'do', label: 'Documenti — OCR e categoria',                file: 'api/documents/ocr.js',
      cloudModel: 'claude-haiku-4-5-20251001', modality: 'document', localOk: true, stakes: 'interno', json: true, agreeOn: ['category'],
      why: 'foto → locale (visione); PDF → cloud' },
    { key: 'docs.qa',           code: 'dq', label: 'Documenti — domande sull\'archivio',         file: 'api/documents/qa.js',
      cloudModel: 'claude-haiku-4-5-20251001', modality: 'text', localOk: true, stakes: 'interno', json: false, agreeOn: false,
      why: 'risposta letta dall\'operatore' },
    { key: 'portal.ingest',     code: 'pi', label: 'Innesto — le quattro entità dal documento',  file: 'api/portal/ingest.js',
      cloudModel: 'claude-haiku-4-5-20251001', modality: 'document', localOk: true, stakes: 'interno', json: true, agreeOn: false,
      why: 'proposta confermata a mano; foto → locale, PDF → cloud' },
    { key: 'profile.ocr',       code: 'po', label: 'Scheda — lettura del documento d\'identità', file: 'api/profile/upload.js',
      cloudModel: 'claude-haiku-4-5-20251001', modality: 'vision', localOk: true, stakes: 'interno', json: true, agreeOn: ['cf', 'docNum'],
      why: 'documento d\'identità di una persona vera: in locale NON esce di casa (l\'argomento è la privacy, prima del costo)' },
    { key: 'parse.docs',        code: 'pd', label: 'Doc Parser — proxy per la pagina',           file: 'api/parse-docs.js',
      cloudModel: 'claude-haiku-4-5-20251001', modality: 'document', localOk: false, stakes: 'interno', json: false, agreeOn: false,
      direct: true, why: 'proxy: la pagina legge la risposta Anthropic grezza; si conta, non si instrada' },
    { key: 'phone.analyze',     code: 'ph', label: 'Centralino — analisi della chiamata',        file: 'api/phone/_lib.js',
      cloudModel: 'claude-haiku-4-5-20251001', modality: 'text', localOk: true, stakes: 'interno', json: true, agreeOn: ['intent'],
      why: 'riassunto e bozza per l\'operatore, JSON con whitelist' },
    { key: 'photos.audit',      code: 'pa', label: 'Fotografo — audit delle foto',               file: 'api/photos/enhance.js',
      cloudModel: 'claude-haiku-4-5-20251001', modality: 'vision', localOk: true, stakes: 'vetrina', json: true, agreeOn: ['kind', 'rotateDeg'],
      why: 'classificazione visiva; serve un modello locale con visione' },
    { key: 'pfs.brief',         code: 'pb', label: 'PFS — brief del mattino',                    file: 'api/pfs/brief.js',
      cloudModel: 'claude-opus-4-8', modality: 'text', localOk: true, stakes: 'interno', json: false, agreeOn: false,
      why: 'una chiamata al giorno, letta dall\'operatore' },
    { key: 'inventario.video',  code: 'iv', label: 'Inventario dal video',                       file: 'api/contracts/inventario.js',
      cloudModel: 'claude-opus-5', modality: 'vision', localOk: false, stakes: 'legale', json: true, agreeOn: false,
      why: 'il documento vale sul deposito: qui non si risparmia (CLAUDE.md, L\'inventario dal video)' },
    { key: 'stt.transcribe',    code: 'st', label: 'Trascrizione vocale (note e chiamate)',      file: 'api/wizard/_stt.js',
      cloudModel: 'whisper-1', modality: 'audio', localOk: true, stakes: 'interno', json: false, agreeOn: false,
      why: 'Whisper gira benissimo su Apple Silicon: qualità pari, costo zero' }
  ];

  var BY_KEY = {}, BY_CODE = {};
  PURPOSES.forEach(function (p) { BY_KEY[p.key] = p; BY_CODE[p.code] = p; });

  function purposeOf(key) { return BY_KEY[key] || null; }
  function byCode(code) { return BY_CODE[code] || null; }
  /* Il nome dello scopo dentro un field path Firestore: il punto separa i
   * livelli di una mappa, quindi 'leads.brain' → 'leads_brain'. */
  function slugOf(key) { return String(key || '').replace(/[^A-Za-z0-9]/g, '_'); }
  function keyOfSlug(slug) {
    for (var i = 0; i < PURPOSES.length; i++) if (slugOf(PURPOSES[i].key) === slug) return PURPOSES[i].key;
    return null;
  }

  /* ── Le impostazioni: default TUTTO CLOUD (il deploy non cambia niente),
   *    valori impossibili RIFIUTATI, mai aggiustati in silenzio (la lezione
   *    di buildConfig: una regola corretta di nascosto è una regola che
   *    l'operatore crede di aver messo e non è quella applicata). ── */
  var DEFAULTS = {
    local: { enabled: false, url: '', model: '', visionModel: '', sttUrl: '', sttModel: '', timeoutMs: 20000, fallback: true },
    purposes: {},                       // { 'leads.brain': { mode:'shadow', cloudModel?, localModel? } }
    shadow: { minSample: 30, minAgree: 90 }
  };
  var LIMITS = { timeoutMs: [2000, 55000], minSample: [5, 500], minAgree: [50, 100] };
  /* Un URL locale è https (tunnel) oppure http SOLO su rete privata: il
   * server sta su Vercel e un http pubblico manderebbe i documenti in
   * chiaro. */
  var URL_RE = /^(https:\/\/[^\s\/]+(\/[^\s]*)?|http:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?(\/[^\s]*)?)$/;
  var MODEL_RE = /^[\w.\-:\/@]{1,120}$/;

  function cleanUrl(u) { return String(u || '').trim().replace(/\/+$/, ''); }

  function mergeSettings(raw) {
    var cfg = {
      local: {}, purposes: {}, shadow: { minSample: DEFAULTS.shadow.minSample, minAgree: DEFAULTS.shadow.minAgree }
    };
    Object.keys(DEFAULTS.local).forEach(function (k) { cfg.local[k] = DEFAULTS.local[k]; });
    var rejected = [];
    if (!raw || typeof raw !== 'object') return { cfg: cfg, rejected: rejected };

    var L = raw.local && typeof raw.local === 'object' ? raw.local : {};
    cfg.local.enabled = L.enabled === true;
    cfg.local.fallback = L.fallback !== false;
    ['url', 'sttUrl'].forEach(function (k) {
      if (L[k] == null || L[k] === '') return;
      var u = cleanUrl(L[k]);
      if (!URL_RE.test(u)) { rejected.push({ key: 'local.' + k, got: String(L[k]).slice(0, 80), why: 'serve https:// (o http:// solo su rete privata)' }); return; }
      cfg.local[k] = u;
    });
    ['model', 'visionModel', 'sttModel'].forEach(function (k) {
      if (L[k] == null || L[k] === '') return;
      var m = String(L[k]).trim();
      if (!MODEL_RE.test(m)) { rejected.push({ key: 'local.' + k, got: m.slice(0, 80), why: 'nome modello non valido' }); return; }
      cfg.local[k] = m;
    });
    if (L.timeoutMs != null) {
      var t = Number(L.timeoutMs);
      if (!isFinite(t) || t < LIMITS.timeoutMs[0] || t > LIMITS.timeoutMs[1]) rejected.push({ key: 'local.timeoutMs', got: L.timeoutMs, why: 'fuori dall\'intervallo ' + LIMITS.timeoutMs.join('–') });
      else cfg.local.timeoutMs = Math.round(t);
    }

    var S = raw.shadow && typeof raw.shadow === 'object' ? raw.shadow : {};
    ['minSample', 'minAgree'].forEach(function (k) {
      if (S[k] == null) return;
      var n = Number(S[k]);
      if (!isFinite(n) || n < LIMITS[k][0] || n > LIMITS[k][1]) { rejected.push({ key: 'shadow.' + k, got: S[k], why: 'fuori dall\'intervallo ' + LIMITS[k].join('–') }); return; }
      cfg.shadow[k] = Math.round(n);
    });

    var P = raw.purposes && typeof raw.purposes === 'object' ? raw.purposes : {};
    Object.keys(P).forEach(function (key) {
      var p = purposeOf(key);
      var v = P[key] && typeof P[key] === 'object' ? P[key] : { mode: P[key] };
      if (!p) { rejected.push({ key: 'purposes.' + key, got: v.mode, why: 'scopo sconosciuto' }); return; }
      var out = {};
      if (v.mode != null) {
        var mode = String(v.mode);
        if (MODES.indexOf(mode) < 0) rejected.push({ key: 'purposes.' + key + '.mode', got: mode, why: 'modalità sconosciuta (cloud|shadow|local)' });
        else if (mode !== 'cloud' && !p.localOk) rejected.push({ key: 'purposes.' + key + '.mode', got: mode, why: 'mai in locale: ' + p.why });
        else out.mode = mode;
      }
      if (v.cloudModel != null && v.cloudModel !== '') {
        var cm = String(v.cloudModel).trim();
        if (!PRICES[cm]) rejected.push({ key: 'purposes.' + key + '.cloudModel', got: cm.slice(0, 80), why: 'modello non in tabella prezzi' });
        else out.cloudModel = cm;
      }
      if (v.localModel != null && v.localModel !== '') {
        var lm = String(v.localModel).trim();
        if (!MODEL_RE.test(lm)) rejected.push({ key: 'purposes.' + key + '.localModel', got: lm.slice(0, 80), why: 'nome modello non valido' });
        else out.localModel = lm;
      }
      if (Object.keys(out).length) cfg.purposes[key] = out;
    });
    return { cfg: cfg, rejected: rejected };
  }

  /* ── La politica IN VIGORE per una chiamata. `req` dice cosa contiene
   *    davvero la richiesta (un PDF forza il cloud, un'immagine esige un
   *    modello locale con visione). `why` spiega ogni ricaduta: un
   *    instradamento silenzioso è indistinguibile da un bug. ── */
  function resolvePolicy(key, cfg, req) {
    var p = purposeOf(key);
    if (!p) return null;
    req = req || {};
    cfg = cfg || mergeSettings(null).cfg;
    var pv = cfg.purposes[key] || {};
    var mode = pv.mode || 'cloud';
    var out = {
      key: key, purpose: p, mode: mode, effective: mode, why: '',
      cloudModel: pv.cloudModel || p.cloudModel,
      localModel: pv.localModel || (req.hasImage ? cfg.local.visionModel : cfg.local.model) || '',
      localOk: !!p.localOk
    };
    if (mode === 'cloud') return out;
    var back = function (why) { out.effective = 'cloud'; out.why = why; return out; };
    if (!p.localOk) return back('mai in locale: ' + p.why);
    if (!cfg.local.enabled) return back('locale spento');
    if (p.modality === 'audio') {
      if (!cfg.local.sttUrl) return back('nessun URL di trascrizione locale');
      return out;
    }
    if (!cfg.local.url) return back('nessun URL locale');
    if (req.hasDocument) return back('PDF: il locale non legge documenti');
    if (req.hasImage && !cfg.local.visionModel) return back('nessun modello locale con visione');
    if (!out.localModel) return back('nessun modello locale configurato');
    return out;
  }

  /* ── Il costo, dai token VERI della risposta. Modello ignoto → null. ── */
  function costUsd(model, usage) {
    if (!model || !usage) return null;
    if (model === 'local' || /^local[:/]/.test(model)) return 0;
    var p = PRICES[model];
    if (!p) return null;
    var inT = Number(usage.input_tokens) || 0, outT = Number(usage.output_tokens) || 0;
    var cr = Number(usage.cache_read_input_tokens) || 0, cw = Number(usage.cache_creation_input_tokens) || 0;
    return (inT * p.in + outT * p.out + cr * p.in * CACHE_READ_FACTOR + cw * p.in * CACHE_WRITE_FACTOR) / 1e6;
  }
  function sttCostUsd(model, seconds) {
    var p = STT_PRICES[model];
    if (!p) return model === 'local' ? 0 : null;
    return (Math.max(0, Number(seconds) || 0) / 60) * p.perMinuteUsd;
  }
  function tierOf(model) { return (PRICES[model] && PRICES[model].tier) || (model === 'local' ? 'locale' : '?'); }

  /* ── L'accordo fra cloud e locale, sui SOLI campi dichiarati. ── */
  function canon(v) {
    if (v == null) return null;
    if (typeof v === 'string') return v.trim().toLowerCase().replace(/\s+/g, ' ');
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    if (Array.isArray(v)) return v.map(canon);
    if (typeof v === 'object') {
      var o = {};
      Object.keys(v).sort().forEach(function (k) { o[k] = canon(v[k]); });
      return o;
    }
    return String(v);
  }
  function deepEq(a, b) { return JSON.stringify(canon(a)) === JSON.stringify(canon(b)); }
  function agreement(purposeOrKey, a, b) {
    var p = typeof purposeOrKey === 'string' ? purposeOf(purposeOrKey) : purposeOrKey;
    if (!p || p.agreeOn === false) return null;          // non misurabile qui
    if (a == null || b == null) return null;
    if (p.agreeOn == null) return deepEq(a, b);
    var keys = p.agreeOn;
    var onKeys = function (x, y) {
      if (!x || !y || typeof x !== 'object' || typeof y !== 'object') return false;
      for (var i = 0; i < keys.length; i++) if (!deepEq(x[keys[i]], y[keys[i]])) return false;
      return true;
    };
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) if (!onKeys(a[i], b[i])) return false;
      return true;
    }
    return onKeys(a, b);
  }

  /* ── Il verdetto di promozione: la scala della fiducia, applicata ai
   *    modelli. `stats` è il doc aiShadow/<slug>: { samples, agree,
   *    disagree, localFail }. ── */
  function shadowVerdict(purposeOrKey, stats, cfg) {
    var p = typeof purposeOrKey === 'string' ? purposeOf(purposeOrKey) : purposeOrKey;
    cfg = cfg || mergeSettings(null).cfg;
    var s = stats || {};
    var samples = Number(s.samples) || 0, agree = Number(s.agree) || 0, disagree = Number(s.disagree) || 0, lf = Number(s.localFail) || 0;
    var compared = agree + disagree;
    var agreePct = compared ? Math.round(100 * agree / compared) : null;
    var failPct = samples ? Math.round(100 * lf / samples) : null;
    var out = { key: p ? p.key : null, samples: samples, compared: compared, agreePct: agreePct, localFailPct: failPct, state: '', why: '' };
    if (!p) { out.state = 'ignoto'; out.why = 'scopo sconosciuto'; return out; }
    if (!p.localOk) { out.state = 'mai'; out.why = p.why; return out; }
    if (p.agreeOn === false) {
      out.state = 'non_misurabile';
      out.why = 'testo libero: si misura con le approvazioni dell\'operatore, non col confronto' + (samples ? ' (' + samples + ' coppie, locale fallito ' + failPct + '%)' : '');
      return out;
    }
    if (samples < cfg.shadow.minSample) { out.state = 'in_misura'; out.why = samples + '/' + cfg.shadow.minSample + ' coppie'; return out; }
    if (failPct > 10) { out.state = 'bocciata'; out.why = 'il locale fallisce il ' + failPct + '% delle volte'; return out; }
    if (agreePct != null && agreePct >= cfg.shadow.minAgree) { out.state = 'pronta'; out.why = 'accordo ' + agreePct + '% su ' + compared; return out; }
    out.state = 'bocciata'; out.why = 'accordo ' + (agreePct == null ? 'n/d' : agreePct + '%') + ' < ' + cfg.shadow.minAgree + '%';
    return out;
  }

  /* ── Lettura dei contatori (aiUsage/<giorno>: p.<slug>.<backend>.<campo>) ── */
  var FIELDS = ['calls', 'ok', 'fail', 'fallback', 'inTok', 'outTok', 'cacheRead', 'cacheWrite', 'usd', 'ms'];
  function emptyBucket() { var b = {}; FIELDS.forEach(function (f) { b[f] = 0; }); return b; }
  function addInto(dst, src) { FIELDS.forEach(function (f) { dst[f] += Number(src && src[f]) || 0; }); return dst; }
  /* Somma uno o più documenti aiUsage in { total:{cloud,local}, byPurpose:{key:{cloud,local}} }. */
  function usageSummary(docs) {
    var out = { total: { cloud: emptyBucket(), local: emptyBucket() }, byPurpose: {}, days: 0 };
    (docs || []).forEach(function (d) {
      if (!d || typeof d !== 'object') return;
      out.days++;
      var P = d.p && typeof d.p === 'object' ? d.p : {};
      Object.keys(P).forEach(function (slug) {
        var key = keyOfSlug(slug) || slug;
        var row = out.byPurpose[key] || (out.byPurpose[key] = { cloud: emptyBucket(), local: emptyBucket() });
        ['cloud', 'local'].forEach(function (b) {
          if (P[slug] && P[slug][b]) { addInto(row[b], P[slug][b]); addInto(out.total[b], P[slug][b]); }
        });
      });
    });
    return out;
  }
  function fmtUsd(n) { return '$' + (Math.round((Number(n) || 0) * 100) / 100).toFixed(2); }
  function fmtEur(usd) { return '≈€' + (Math.round((Number(usd) || 0) * EUR_PER_USD * 100) / 100).toFixed(2); }

  /* Le righe per il comando /ai: uno scopo, la sua modalità, cosa vale davvero. */
  function statusRows(cfg) {
    cfg = cfg || mergeSettings(null).cfg;
    return PURPOSES.map(function (p) {
      var pol = resolvePolicy(p.key, cfg, {});
      return { key: p.key, code: p.code, label: p.label, mode: pol.mode, effective: pol.effective, why: pol.why,
               cloudModel: pol.cloudModel, tier: tierOf(pol.cloudModel), localOk: p.localOk, direct: !!p.direct, stakes: p.stakes };
    });
  }
  /* Il prossimo passo del bottone: cloud → shadow → local → cloud (chi non può
   * andare in locale salta il passo). */
  function nextMode(p, mode) {
    if (!p || !p.localOk) return 'cloud';
    return mode === 'cloud' ? 'shadow' : mode === 'shadow' ? 'local' : 'cloud';
  }

  var API = {
    MODES: MODES, PRICES: PRICES, STT_PRICES: STT_PRICES, EUR_PER_USD: EUR_PER_USD,
    PURPOSES: PURPOSES, DEFAULTS: DEFAULTS, LIMITS: LIMITS, FIELDS: FIELDS,
    purposeOf: purposeOf, byCode: byCode, slugOf: slugOf, keyOfSlug: keyOfSlug,
    mergeSettings: mergeSettings, resolvePolicy: resolvePolicy,
    costUsd: costUsd, sttCostUsd: sttCostUsd, tierOf: tierOf,
    agreement: agreement, shadowVerdict: shadowVerdict,
    usageSummary: usageSummary, fmtUsd: fmtUsd, fmtEur: fmtEur, statusRows: statusRows, nextMode: nextMode
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_AI = API;
})(typeof window !== 'undefined' ? window : this);
