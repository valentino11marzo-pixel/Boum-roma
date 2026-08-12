#!/usr/bin/env python3
# LA DISCOVERY RIPENSATA — il setaccio muore, nasce la stecca.
#   · tutti i comandi in UNA riga sticky (cerca, camere, ＋filtri, ordine,
#     salva, GRID⇄SKYLINE) — le case salgono di uno schermo intero
#   · la coda lunga dei filtri va in un foglio, in un posto solo
#   · la Skyline entra nella pagina: la stessa macchina della home,
#     estratta dal builder — pin, popup, ancore, satellite, fallback onesto
#   · la skycard dentro la griglia: la mappa si vende da sola (dal live)
#   · il paragone: fino a tre case fianco a fianco, coi soldi del giorno uno
#     calcolati con la STESSA formula della pagina casa
import shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, a, b, nome):
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    return s.replace(a, b)

for f in ('pt.html', 'ad-corpo.html', 'ad-regia.html', 'costruisci-ad.py'):
    shutil.copy(f, f + '.bak')

# ═══ PT.HTML — il gancio: la mappa tiene le case che la pagina tiene ════
s = leggi('pt.html')
s = uno(s, "    el.__presa = !c.si;",
"""    el.__presa = !c.si;
    el.__id = c.id;""", 'pin id')
s = uno(s, "      var ok = el.__presa ? false : (TETTO === 0 || (el.__p > 0 && el.__p <= TETTO));",
"      var ok = (el.__presa || el.__fuori) ? false : (TETTO === 0 || (el.__p > 0 && el.__p <= TETTO));",
'pin fuori')
s = uno(s, "  /* ── l'accensione ── */",
"""  /* il gancio per la discovery: la mappa tiene solo le case che il
     setaccio della pagina tiene — nessun secondo stato, una verita sola */
  window.BoomCielo = { tieni: function (ids) {
    PIN.forEach(function (m) { var el = m.getElement();
      el.__fuori = !!(ids && ids.indexOf(el.__id) < 0); });
    if (mappa) filtra();
  } };

  /* ── l'accensione ── */""", 'gancio tieni')
scrivi('pt.html', s)

# ═══ AD-CORPO.HTML ══════════════════════════════════════════════════════
s = leggi('ad-corpo.html')

# ── via il CSS del setaccio (restano .gruppo, .pulisci, .serba: servono) ─
s = uno(s, """/* ══ IL SETACCIO — i filtri veri, nella grammatica del portale ═════════ */
.setaccio { background:var(--card); box-shadow:inset 0 0 0 1px var(--line-0);
  padding:16px 18px 14px; }
.setaccio-cerca { display:flex; align-items:center; gap:11px;
  padding-bottom:13px; border-bottom:1px solid var(--line-0); }
.setaccio-cerca svg { width:17px; height:17px; flex:none; fill:none;
  stroke:var(--text-4); stroke-width:1.6; stroke-linecap:round; }
.setaccio-cerca input { flex:1; min-width:0; background:none; border:0;
  color:var(--text); font:inherit; font-size:14.5px; }
.setaccio-cerca input::placeholder { color:var(--text-4); }
.setaccio-cerca input:focus { outline:none; }
.setaccio-cerca:focus-within svg { stroke:var(--gold); }
.setaccio-gruppi { display:flex; gap:20px; flex-wrap:wrap; margin-top:13px; }
""", """/* ══ LA STECCA + IL FOGLIO — i comandi in una riga, la coda in un foglio ═ */
""", 'css setaccio via')
s = uno(s, """.setaccio-piede { display:flex; align-items:center; justify-content:space-between;
  gap:12px; flex-wrap:wrap; margin-top:14px; padding-top:12px;
  border-top:1px solid var(--line-0); }
""", '', 'css piede via')
s = uno(s, """@media (max-width:640px){
  .setaccio { padding:14px 14px 12px; }
  .setaccio-gruppi { gap:14px; }
  .gruppo { width:100%; } }
""", """@media (max-width:640px){
  #foglioVelo .gruppo { width:100%; } }
""", 'css media setaccio')

# ── via la sezione setaccio dal markup ──────────────────────────────────
i0 = s.index('<!-- ══ I FILTRI — quelli veri del sito')
i1 = s.index('<!-- ══ IL MURO')
s = s[:i0] + s[i1:]

# ── il muro nuovo: stecca sticky + conto + skycarta + vista cielo ───────
s = uno(s, """<!-- ══ IL MURO ═══════════════════════════════════════════════════════════ -->
<section class="sezione" style="padding-top:clamp(10px,1.2vw,16px)">
  <div class="container">
    <div class="muro-testa">
      <p class="muro-conto"><b id="conto">0</b> homes<span id="contoZona"></span></p>
      <div class="muro-ordine" role="group" aria-label="Sort homes">
        <button type="button" class="on" data-o="nuove">Newest</button>
        <button type="button" data-o="prezzo">Price</button>
        <button type="button" data-o="grandi">Size</button>
      </div>
    </div>
    <div class="muro coro" id="muro">
CASE_MURO
    </div>""",
"""<!-- ══ LA STECCA — tutti i comandi, in una riga sola ═════════════════════ -->
<div class="stecca" id="stecca">
  <div class="container stecca-int">
    <div class="stecca-cerca">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/></svg>
      <input id="fq" type="search" placeholder="Name, zone or street"
        aria-label="Search homes">
    </div>
    <div class="gruppo" role="group" aria-label="Bedrooms">
      <button type="button" data-f="letti" data-v="">Any</button>
      <button type="button" data-f="letti" data-v="0">Studio</button>
      <button type="button" data-f="letti" data-v="1">1+</button>
      <button type="button" data-f="letti" data-v="2">2+</button>
      <button type="button" data-f="letti" data-v="3">3+ beds</button>
    </div>
    <button type="button" class="stecca-piu" id="apriFiltri"
      aria-haspopup="dialog">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
      Filters<i id="filtriConta" hidden></i></button>
    <div class="muro-ordine" role="group" aria-label="Sort homes">
      <button type="button" class="on" data-o="nuove">Newest</button>
      <button type="button" data-o="prezzo">Price</button>
      <button type="button" data-o="grandi">Size</button>
    </div>
    <button type="button" class="serba" id="serba">Save this search →</button>
    <div class="vista-tog" role="group" aria-label="View">
      <button type="button" class="on" id="vGriglia">Grid</button>
      <button type="button" id="vCielo" class="pulsa">◆ Skyline</button>
    </div>
  </div>
</div>

<!-- ══ IL MURO ═══════════════════════════════════════════════════════════ -->
<section class="sezione" style="padding-top:clamp(10px,1.2vw,16px)" id="catalogo">
  <div class="container">
    <p class="muro-conto"><b id="conto">0</b> homes<span id="contoZona"></span></p>
    <div class="muro coro" id="muro">
CASE_MURO
      <button type="button" class="skycarta" id="skyCarta">
        <span class="sk-eti"><i></i>Rome's Skyline · live 3D</span>
        <span class="sk-tit">Every home, standing on the real city.</span>
        <p>Satellite view and 3D buildings — tap a home and it measures its
          own walk to Sapienza, LUISS, Termini and the Vatican.</p>
        <span class="sk-cta">Open the map view →</span>
      </button>
    </div>""", 'muro nuovo')

# la vista cielo entra prima della chiusura della sezione del muro
s = uno(s, """      <a class="btn btn-primary" href="/property-finding.html">Put the machine on it</a>
    </div>
  </div>
</section>""",
"""      <a class="btn btn-primary" href="/property-finding.html">Put the machine on it</a>
    </div>
    <div class="vista-cielo" id="vistaCielo" hidden>
VISTA_CIELO
    </div>
  </div>
</section>""", 'vista cielo')

# ── il foglio dei filtri + il paragone, prima della rete ────────────────
s = uno(s, """<!-- ══ LA RETE — se la casa giusta non c'è ═══════════════════════════════ -->""",
"""<!-- ══ IL FOGLIO DEI FILTRI — la coda lunga, in un posto solo ════════════ -->
<div class="serba-velo" id="foglioVelo" hidden>
  <div class="foglio-filtri" role="dialog" aria-modal="true"
    aria-labelledby="foglioTit">
    <div class="foglio-testa"><b id="foglioTit">Fine-tune the list</b>
      <button type="button" class="foglio-x" id="foglioChiudi"
        aria-label="Close filters">✕</button></div>
    <div class="gruppo" role="group" aria-label="Bathrooms">
      <span>Baths</span>
      <button type="button" data-f="bagni" data-v="">Any</button>
      <button type="button" data-f="bagni" data-v="1">1+</button>
      <button type="button" data-f="bagni" data-v="2">2+</button>
    </div>
    <div class="gruppo" role="group" aria-label="Extras">
      <span>Only</span>
      <button type="button" data-f="arredata" data-v="1">Furnished</button>
      <button type="button" data-f="video" data-v="1">Video-verified</button>
      <button type="button" data-f="salvate" data-v="1">Saved <i id="quanteSalvate"></i></button>
    </div>
    <div class="gruppo dotazioni" role="group" aria-label="Features">
      <span>Features</span>
      DOTE_TASTI
    </div>
    <div class="foglio-piede">
      <button type="button" class="pulisci" id="pulisci">Clear all</button>
      <button type="button" class="btn btn-primary" id="foglioFatto">Show
        <span id="foglioConto">all</span></button>
    </div>
  </div>
</div>

<!-- ══ IL PARAGONE — fino a tre case, fianco a fianco ════════════════════ -->
<div class="para-tray" id="paraTray" hidden>
  <div class="para-fotine" id="paraFotine"></div>
  <span class="para-dice" id="paraDice">Pick another home to compare</span>
  <button type="button" class="btn btn-primary" id="paraApri" disabled>Compare</button>
  <button type="button" class="para-svuota" id="paraSvuota"
    aria-label="Clear comparison">✕</button>
</div>
<div class="serba-velo" id="paraVelo" hidden>
  <div class="para-foglio" role="dialog" aria-modal="true"
    aria-label="Compare homes side by side">
    <div class="foglio-testa"><b>Side by side</b>
      <button type="button" class="foglio-x" id="paraChiudi"
        aria-label="Close comparison">✕</button></div>
    <div class="para-scroll"><table class="para-tavola" id="paraTavola"></table></div>
    <p class="para-nota">Day one = first month + deposit + agency fee — the
      same number each home's page shows. The deposit comes back at the end.</p>
  </div>
</div>

<!-- ══ LA RETE — se la casa giusta non c'è ═══════════════════════════════ -->""",
'foglio + paragone')

# ── il CSS nuovo, in coda al blocco di stile ────────────────────────────
s = uno(s, '</style>', """
/* ══ LA STECCA — appesa sotto la barra, mai un centimetro di troppo ════ */
.stecca { position:sticky; top:var(--stecca-top, 76px); z-index:80;
  background:rgba(3,3,3,.94); backdrop-filter:blur(14px);
  border-bottom:1px solid var(--line-0); }
.stecca-int { display:flex; align-items:center; gap:8px; padding:9px 0;
  overflow-x:auto; scrollbar-width:none; }
.stecca-int::-webkit-scrollbar { display:none; }
.stecca-int > * { flex:none; }
.stecca .gruppo { flex-wrap:nowrap; }
.stecca-cerca { display:flex; align-items:center; gap:8px; flex:0 1 240px;
  min-width:150px; padding:8px 12px; background:var(--input);
  box-shadow:inset 0 0 0 1px var(--line); border-radius:100px; }
.stecca-cerca svg { width:15px; height:15px; flex:none; fill:none;
  stroke:var(--text-4); stroke-width:1.6; stroke-linecap:round; }
.stecca-cerca input { flex:1; min-width:0; background:none; border:0;
  color:var(--text); font:inherit; font-size:13px; }
.stecca-cerca input::placeholder { color:var(--text-4); }
.stecca-cerca input:focus { outline:none; }
.stecca-cerca:focus-within { box-shadow:inset 0 0 0 1px var(--line-gold); }
.stecca-piu { display:inline-flex; align-items:center; gap:7px;
  padding:8px 14px; font:inherit; font-size:11.5px; color:var(--text-2);
  background:none; border:0; box-shadow:inset 0 0 0 1px var(--line);
  border-radius:100px; cursor:pointer; transition:.22s; min-height:36px; }
.stecca-piu:hover { color:var(--gold);
  box-shadow:inset 0 0 0 1px var(--line-gold-2); }
.stecca-piu svg { width:14px; height:14px; fill:none; stroke:currentColor;
  stroke-width:1.7; stroke-linecap:round; }
.stecca-piu i { font-style:normal; min-width:17px; height:17px; padding:0 4px;
  display:inline-grid; place-items:center; border-radius:100px;
  background:var(--gold); color:#141005; font-size:10px; font-weight:700; }
.vista-tog { display:inline-flex; border-radius:100px; overflow:hidden;
  box-shadow:inset 0 0 0 1px var(--line-gold-2); }
.vista-tog button { position:relative; padding:9px 14px; font:inherit;
  font-size:10.5px; font-weight:600; letter-spacing:.12em;
  text-transform:uppercase; color:var(--text-3); background:none; border:0;
  cursor:pointer; transition:.25s; min-height:36px; }
.vista-tog button.on { color:#141005; background:var(--gold); }
.vista-tog button:not(.on):hover { color:var(--gold); }
@media (prefers-reduced-motion:no-preference){
  .vista-tog button.pulsa::after { content:''; position:absolute; top:6px;
    right:7px; width:5px; height:5px; border-radius:50%;
    background:var(--gold); animation:sky-ping 2s var(--ease) infinite; }
  @keyframes sky-ping {
    0%,100% { box-shadow:0 0 0 0 rgba(255,215,0,.5); }
    50% { box-shadow:0 0 0 6px rgba(255,215,0,0); } } }
.muro-conto { margin-bottom:12px; }
#muro, #catalogo, #vistaCielo {
  scroll-margin-top:calc(var(--stecca-top, 76px) + 62px); }
.vista-cielo[hidden] { display:none; }
.vista-cielo .cielo { margin-top:clamp(10px,1.2vw,16px); }

/* ══ LA SKYCARTA — la mappa si vende da dentro la griglia ══════════════ */
.skycarta { position:relative; display:flex; flex-direction:column;
  justify-content:flex-end; gap:8px; min-height:100%; padding:20px 18px;
  text-align:left; font:inherit; color:var(--text); cursor:pointer; border:0;
  background:
    radial-gradient(2px 2px at 24% 28%, var(--gold) 40%, transparent 60%),
    radial-gradient(2px 2px at 64% 20%, var(--gold) 40%, transparent 60%),
    radial-gradient(2px 2px at 44% 50%, var(--gold) 40%, transparent 60%),
    radial-gradient(2px 2px at 79% 42%, rgba(255,215,0,.5) 40%, transparent 60%),
    radial-gradient(2px 2px at 32% 64%, rgba(255,215,0,.5) 40%, transparent 60%),
    radial-gradient(120% 90% at 70% 8%, rgba(255,215,0,.09), transparent 55%),
    linear-gradient(160deg, #101017 0%, #08080D 55%, var(--void) 100%);
  box-shadow:inset 0 0 0 1px var(--line-gold-2),
    0 30px 70px -40px rgba(0,0,0,.9);
  transition:box-shadow .3s ease; }
.skycarta::before { content:''; position:absolute; inset:0;
  pointer-events:none; background-image:
    repeating-linear-gradient(0deg, transparent 0 34px,
      rgba(255,255,255,.03) 34px 35px),
    repeating-linear-gradient(90deg, transparent 0 34px,
      rgba(255,255,255,.03) 34px 35px); }
.skycarta:hover { box-shadow:inset 0 0 0 1px var(--line-gold),
  0 30px 70px -40px rgba(0,0,0,.9); }
.sk-eti { display:inline-flex; align-items:center; gap:7px; font-size:9.5px;
  font-weight:600; letter-spacing:.24em; text-transform:uppercase;
  color:var(--gold); }
.sk-eti i { width:5px; height:5px; border-radius:50%; background:var(--gold); }
.sk-tit { font-family:var(--display); font-weight:300; font-size:20px;
  line-height:1.3; }
.skycarta p { font-size:12px; line-height:1.6; color:var(--text-3); }
.sk-cta { display:inline-flex; width:max-content; margin-top:6px;
  padding:9px 15px; font-size:11px; font-weight:600; letter-spacing:.1em;
  text-transform:uppercase; color:var(--gold);
  box-shadow:inset 0 0 0 1px var(--line-gold-2); border-radius:100px;
  transition:.25s; }
.skycarta:hover .sk-cta { background:var(--gold); color:#141005; }

/* ══ IL FOGLIO DEI FILTRI ══════════════════════════════════════════════ */
.foglio-filtri { width:100%; max-width:460px; padding:22px 22px 18px;
  background:var(--void); box-shadow:inset 0 0 0 1px var(--line-gold),
    0 40px 90px -40px rgba(0,0,0,.9);
  display:flex; flex-direction:column; gap:16px;
  max-height:min(82vh, 560px); overflow:auto; }
.foglio-testa { display:flex; align-items:center;
  justify-content:space-between; gap:12px; }
.foglio-testa b { font-family:var(--display); font-weight:300;
  font-size:19px; }
.foglio-x { width:36px; height:36px; flex:none; display:grid;
  place-items:center; background:none; border:0; color:var(--text-3);
  font-size:14px; cursor:pointer; box-shadow:inset 0 0 0 1px var(--line);
  border-radius:50%; transition:.2s; }
.foglio-x:hover { color:var(--text);
  box-shadow:inset 0 0 0 1px var(--line-gold-2); }
.foglio-piede { display:flex; align-items:center;
  justify-content:space-between; gap:12px; padding-top:14px;
  border-top:1px solid var(--line-0); }

/* ══ IL PARAGONE ═══════════════════════════════════════════════════════ */
.home-para { position:absolute; right:6px; top:50px; z-index:3; width:40px;
  height:40px; display:grid; place-items:center; border-radius:50%;
  background:rgba(3,3,3,.72); backdrop-filter:blur(6px);
  color:var(--text-3); cursor:pointer; border:0; font-size:13px;
  transition:color .25s ease, transform .25s var(--ease),
    background .25s ease; }
.home-para:hover { transform:scale(1.12); }
.home-para.on { color:#141005; background:var(--gold); }
.para-tray { position:fixed; left:50%; bottom:16px;
  transform:translateX(-50%); z-index:120; display:flex; align-items:center;
  gap:12px; max-width:min(94vw, 560px); padding:10px 12px;
  background:rgba(3,3,3,.94); backdrop-filter:blur(16px);
  box-shadow:inset 0 0 0 1px var(--line-gold), 0 24px 60px rgba(0,0,0,.6); }
.para-tray[hidden] { display:none; }
.para-fotine { display:flex; gap:6px; }
.para-fotine img, .para-fotine span { width:44px; height:34px;
  object-fit:cover; background:var(--input);
  box-shadow:inset 0 0 0 1px var(--line-0); display:block; }
.para-dice { font-size:11.5px; color:var(--text-3); }
.para-svuota { width:36px; height:36px; flex:none; display:grid;
  place-items:center; background:none; border:0; color:var(--text-4);
  font-size:13px; cursor:pointer; border-radius:50%;
  box-shadow:inset 0 0 0 1px var(--line); transition:.2s; }
.para-svuota:hover { color:var(--text); }
.para-foglio { width:100%; max-width:860px; padding:22px;
  background:var(--void); box-shadow:inset 0 0 0 1px var(--line-gold),
    0 40px 90px -40px rgba(0,0,0,.9);
  max-height:88vh; display:flex; flex-direction:column; gap:14px; }
.para-scroll { overflow:auto; }
.para-tavola { width:100%; border-collapse:collapse; font-size:12.5px; }
.para-tavola th { text-align:left; font-size:9.5px; font-weight:600;
  letter-spacing:.16em; text-transform:uppercase; color:var(--text-4);
  padding:9px 12px 9px 0; white-space:nowrap; vertical-align:middle; }
.para-tavola td { padding:9px 12px; border-top:1px solid var(--line-0);
  vertical-align:middle; min-width:150px; color:var(--text-2); }
.para-tavola tr:first-child td { border-top:0; }
.para-tavola td b { color:var(--text); font-weight:500; }
.para-tavola .verde { color:var(--green); }
.pt-capo { position:relative; }
.pt-capo img { width:100%; max-width:190px; aspect-ratio:16/10;
  object-fit:cover; display:block;
  box-shadow:inset 0 0 0 1px var(--line-0); }
.pt-capo b { display:block; margin-top:8px; font-family:var(--display);
  font-weight:300; font-size:15px; color:var(--text); }
.pt-capo span { font-size:11px; color:var(--text-3); }
.pt-x { position:absolute; top:6px; right:6px; width:36px; height:36px;
  display:grid; place-items:center; border:0; border-radius:50%;
  background:rgba(3,3,3,.72); color:var(--text-2); cursor:pointer;
  font-size:12px; }
.para-nota { font-size:11px; color:var(--text-4); line-height:1.6; }
</style>""", 'css nuovo')
scrivi('ad-corpo.html', s)

# ═══ COSTRUISCI-AD.PY ═══════════════════════════════════════════════════
s = leggi('costruisci-ad.py')

# ── la carta porta i dati per paragone e mappa ──────────────────────────
s = uno(s, """    cerca = ' '.join([n, z, str(r.get('address') or ''),
                      str(r.get('type') or '')]).lower()""",
"""    cerca = ' '.join([n, z, str(r.get('address') or ''),
                      str(r.get('type') or '')]).lower()
    czm = re.search(r'\\d+', str(piena.get('depositMonths') or ''))
    czm = int(czm.group()) if czm else 1
    piano = re.sub(r'[\\s"]+', ' ', str(piena.get('floor') or '')).strip()[:12]""",
'dati paragone')
s = uno(s, """        data-dote="|{'|'.join(dote)}|" data-chiave="/listing/{r['id']}"
        data-cerca="{cerca}">""",
"""        data-dote="|{'|'.join(dote)}|" data-chiave="/listing/{r['id']}"
        data-cerca="{cerca}" data-id="{r['id']}" data-cauzione="{czm}"
        data-piano="{piano}">""", 'attributi paragone')
s = uno(s, """          <button type="button" class="home-cuore" data-u="/listing/{r['id']}"
            aria-label="Save this home">♥</button>""",
"""          <button type="button" class="home-cuore" data-u="/listing/{r['id']}"
            aria-label="Save this home">♥</button>
          <button type="button" class="home-para" data-id="{r['id']}"
            aria-label="Compare this home">⇄</button>""", 'bottone paragone')

# ── la Skyline si estrae dal portale: la stessa macchina, una volta sola ─
s = uno(s, """h = '\\n'.join([testa, nav, leggi('ad-corpo.html'), piede,
               leggi('ad-regia.html'), onda,
               leggi('solari-engine.html'), leggi('deco-organi.html')])""",
"""# la Skyline della home, per intero: il blocco e la sua macchina.
# Nessuna copia a mano — se la home migliora, la discovery la segue.
ci_a = pt.index('<div class="cielo sale" id="cielo">')
ci_b = pt.index('</section>', ci_a)
cielo_blocco = pt[ci_a:ci_b].rstrip()
assert cielo_blocco.endswith('</div>'), 'blocco cielo'
cielo_blocco = cielo_blocco[:-6].rstrip()  # cade il </div> del container
sc_a = pt.index('/* ── LA SKYLINE, dentro ─')
sc_a = pt.rindex('<script>', 0, sc_a)
sc_b = pt.index('</script>', sc_a) + len('</script>')
cielo_js = pt[sc_a:sc_b]

h = '\\n'.join([testa, nav, leggi('ad-corpo.html'), piede,
               leggi('ad-regia.html'), onda, cielo_js,
               leggi('solari-engine.html'), leggi('deco-organi.html')])""",
'estrazione cielo')

s = uno(s, "h = h.replace('CASE_MURO', MURO)",
"""h = h.replace('CASE_MURO', MURO)
h = h.replace('VISTA_CIELO', cielo_blocco)
SKYD = []
for r in mostrate:
    p = piene.get(r['id']) or {}
    if not p.get('lat') or not p.get('lng'): continue
    if r['status'] not in ('available', 'reserved', 'waitlist'): continue
    SKYD.append({'id': r['id'], 'nome': re.sub(r'\\s+', ' ', r['nome']).strip(),
        'zona': zona_di(r), 'lat': float(p['lat']), 'lng': float(p['lng']),
        'da': euro(prezzo(r)), 'si': r['status'] == 'available',
        'foto': (rem.get(r['id'], '') if MODO == 'sito' else ''),
        'stato': 'reserved' if r['status'] in ('reserved', 'waitlist') else 'rented'})
h = h.replace("'SKY_JSON'", json.dumps(SKYD, ensure_ascii=False))
h = h.replace('SKYLINE_URL', 'https://www.boomrome.com/skyline'
    if MODO == 'artefatto' else '/skyline')
h = h.replace('CASA_BASE',
    ('https://claude.ai/code/artifact/db7c3240-a12d-4734-9eb7-06a780584231#id=')
    if MODO == 'artefatto' else '/v2-listing.html#id=')""", 'sky json')

# rem serve anche in modalita artefatto (per la scelta della foto)
s = uno(s, "uri = json.load(open('foto-uri.json')); rem = json.load(open('foto-map.json'))",
"uri = json.load(open('foto-uri.json'))\nrem = json.load(open('foto-map.json'))", 'rem sempre')
scrivi('costruisci-ad.py', s)

# ═══ AD-REGIA.HTML — il secondo atto: stecca, foglio, vista, paragone ═══
s = leggi('ad-regia.html')
assert s.rstrip().endswith('</script>'), 'coda regia'
s = s.rstrip() + """

<script>
/* LA STECCA, IL FOGLIO, LA VISTA, IL PARAGONE — il secondo atto della
   discovery. Non tocca lo stato dei filtri: lo osserva (il conto cambia
   a ogni aggiorna) e ci si sincronizza sopra. */
(function () {
  'use strict';
  var per = function (s, c) { return (c || document).querySelector(s); };
  var tutti = function (s, c) {
    return [].slice.call((c || document).querySelectorAll(s)); };
  var muro = per('#muro'); if (!muro) return;
  var nav = per('.nav');

  /* ── la stecca si appende sotto la barra: misura vera, non magia ── */
  function quota() {
    var h = nav ? nav.offsetHeight : 76;
    document.documentElement.style.setProperty('--stecca-top', (h - 1) + 'px');
  }
  quota();
  addEventListener('resize', quota);
  addEventListener('scroll', function () { requestAnimationFrame(quota); },
    { passive: true });

  /* ── la scheda di una casa, letta dalla sua carta: una verita sola ── */
  function eu(n) { return '€' + Math.round(n).toLocaleString('en-US'); }
  function scheda(id) {
    var c = tutti('.casa-p', muro).filter(function (x) {
      return x.dataset.id === id; })[0];
    if (!c) return null;
    var img = per('img', c), st = per('.casa-stato', c);
    var p = +c.dataset.prezzo || 0, mesi = +c.dataset.cauzione || 1;
    /* la STESSA aritmetica della pagina casa: onorario 10% del canone
       annuo, deposito = mesi di cauzione — mai due versioni dei soldi */
    var fee = Math.round(p * 12 * .10);
    return { id: id, href: c.getAttribute('href'),
      nome: (per('.nome', c) || {}).textContent || '',
      zona: c.dataset.zona || '', foto: img ? img.src : '',
      prezzo: p, cauzione: mesi * p, mesi: mesi, fee: fee,
      giornouno: p + mesi * p + fee,
      letti: +c.dataset.letti || 0, bagni: +c.dataset.bagni || 0,
      mq: +c.dataset.mq || 0, piano: c.dataset.piano || '',
      arredata: c.dataset.arredata === '1', video: c.dataset.video === '1',
      stato: st ? st.textContent : '',
      dote: (c.dataset.dote || '').split('|').filter(Boolean) };
  }
  function visibili() {
    return tutti('.casa-p', muro).filter(function (c) {
      return !c.classList.contains('via'); });
  }

  /* ── la sincronia: parte da sola ogni volta che il conto cambia ── */
  var sky = per('#skyCarta');
  function sincronia() {
    var vis = visibili();
    if (sky) {
      if (vis.length > 6) muro.insertBefore(sky, vis[6]);
      else muro.appendChild(sky);
      sky.style.display = vis.length ? '' : 'none';
    }
    var acc = tutti('#foglioVelo .gruppo button.on').filter(function (b) {
      return b.dataset.v !== ''; }).length;
    var fc = per('#filtriConta');
    if (fc) { fc.hidden = !acc; fc.textContent = acc; }
    var fg = per('#foglioConto'), ct = per('#conto');
    if (fg && ct) fg.textContent = ct.textContent + ' home' +
      (ct.textContent === '1' ? '' : 's');
    if (window.BoomCielo) window.BoomCielo.tieni(vis.map(function (c) {
      return c.dataset.id; }));
  }
  var conto = per('#conto');
  if (conto) new MutationObserver(sincronia)
    .observe(conto, { childList: true });
  sincronia();

  /* ── il foglio dei filtri ── */
  var foglio = per('#foglioVelo');
  var apriF = per('#apriFiltri');
  if (apriF) apriF.addEventListener('click', function () {
    foglio.hidden = false; });
  [per('#foglioChiudi'), per('#foglioFatto')].forEach(function (b) {
    if (b) b.addEventListener('click', function () { foglio.hidden = true; });
  });
  if (foglio) foglio.addEventListener('click', function (e) {
    if (e.target === foglio) foglio.hidden = true; });

  /* ── la vista: griglia ⇄ skyline ── */
  var cieloBox = per('#vistaCielo'), vg = per('#vGriglia'), vc = per('#vCielo');
  var contoRiga = per('.muro-conto'), vuoto = per('#vuoto');
  function vista(mappa) {
    if (!cieloBox) return;
    cieloBox.hidden = !mappa;
    muro.style.display = mappa ? 'none' : '';
    if (contoRiga) contoRiga.style.display = mappa ? 'none' : '';
    if (vuoto) vuoto.style.display = mappa ? 'none' : '';
    if (vg) vg.classList.toggle('on', !mappa);
    if (vc) { vc.classList.toggle('on', mappa); vc.classList.remove('pulsa'); }
    if (mappa) sincronia();
  }
  if (vg) vg.addEventListener('click', function () { vista(false); });
  if (vc) vc.addEventListener('click', function () { vista(true); });
  if (sky) sky.addEventListener('click', function () {
    vista(true);
    try { cieloBox.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    catch (e) {}
  });

  /* ── il paragone ── */
  var PARA = [];
  var tray = per('#paraTray'), fotine = per('#paraFotine'),
      dice = per('#paraDice'), apriP = per('#paraApri'),
      svuota = per('#paraSvuota'), velaP = per('#paraVelo'),
      tavola = per('#paraTavola');
  function paraSegna() {
    tutti('.home-para', muro).forEach(function (b) {
      b.classList.toggle('on', PARA.indexOf(b.dataset.id) >= 0); });
    if (!tray) return;
    tray.hidden = !PARA.length;
    fotine.innerHTML = PARA.map(function (id) {
      var sc = scheda(id);
      return sc && sc.foto ? '<img src="' + sc.foto + '" alt="">'
                           : '<span></span>';
    }).join('');
    apriP.disabled = PARA.length < 2;
    apriP.textContent = 'Compare' +
      (PARA.length > 1 ? ' ' + PARA.length : '');
    dice.textContent = PARA.length < 2 ? 'Pick another home to compare'
      : PARA.length + ' homes side by side';
  }
  muro.addEventListener('click', function (e) {
    var b = e.target.closest('.home-para'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var id = b.dataset.id, k = PARA.indexOf(id);
    if (k >= 0) PARA.splice(k, 1);
    else if (PARA.length >= 3) {
      if (dice) dice.textContent = 'Three is the limit — remove one first.';
      if (tray) tray.hidden = false;
      return;
    } else PARA.push(id);
    paraSegna();
  });
  function segno(v) { return v ? '<b>✓</b>' : '—'; }
  function tabella() {
    var ss = PARA.map(scheda).filter(Boolean);
    function fila(eti, f) {
      return '<tr><th scope="row">' + eti + '</th>' + ss.map(function (x) {
        return '<td>' + f(x) + '</td>'; }).join('') + '</tr>';
    }
    tavola.innerHTML =
      '<tr><th></th>' + ss.map(function (x) {
        return '<td class="pt-capo">' +
          (x.foto ? '<img src="' + x.foto + '" alt="">' : '') +
          '<button type="button" class="pt-x" data-id="' + x.id +
          '" aria-label="Remove from comparison">✕</button>' +
          '<b>' + x.nome + '</b><span>' + x.zona + '</span></td>';
      }).join('') + '</tr>' +
      fila('Monthly rent', function (x) {
        return '<b>' + eu(x.prezzo) + '</b>/mo'; }) +
      fila('Day one, all-in', function (x) {
        return '<b>' + eu(x.giornouno) + '</b>'; }) +
      fila('of which deposit', function (x) {
        return '<span class="verde">' + eu(x.cauzione) +
          '</span> · comes back'; }) +
      fila('Agency fee', function (x) { return eu(x.fee); }) +
      fila('Status', function (x) { return x.stato || '—'; }) +
      fila('Beds', function (x) {
        return x.letti === 0 ? 'Studio' : x.letti; }) +
      fila('Baths', function (x) { return x.bagni || '—'; }) +
      fila('Size', function (x) {
        return x.mq ? x.mq + ' m²' : '—'; }) +
      fila('Floor', function (x) { return x.piano || '—'; }) +
      fila('Furnished', function (x) { return segno(x.arredata); }) +
      fila('Video tour', function (x) { return segno(x.video); }) +
      fila('Features', function (x) {
        return x.dote.length ? x.dote.join(', ') : '—'; }) +
      fila('', function (x) {
        return '<a class="btn btn-primary" href="' + x.href +
          '">See this home</a>'; });
  }
  if (apriP) apriP.addEventListener('click', function () {
    if (PARA.length < 2) return;
    tabella(); velaP.hidden = false;
  });
  if (svuota) svuota.addEventListener('click', function () {
    PARA = []; paraSegna(); });
  if (per('#paraChiudi')) per('#paraChiudi')
    .addEventListener('click', function () { velaP.hidden = true; });
  if (velaP) velaP.addEventListener('click', function (e) {
    if (e.target === velaP) velaP.hidden = true; });
  if (tavola) tavola.addEventListener('click', function (e) {
    var b = e.target.closest('.pt-x'); if (!b) return;
    var k = PARA.indexOf(b.dataset.id);
    if (k >= 0) PARA.splice(k, 1);
    paraSegna();
    if (PARA.length < 2) velaP.hidden = true; else tabella();
  });
  addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (foglio) foglio.hidden = true;
    if (velaP) velaP.hidden = true;
  });
})();
</script>"""
scrivi('ad-regia.html', s)
print('discovery: fatta')
