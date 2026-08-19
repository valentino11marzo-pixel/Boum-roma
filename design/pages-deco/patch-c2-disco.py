#!/usr/bin/env python3
# LOTTO 13·C2 — LA DISCOVERY CONVERTE: i filtri vivono nell'URL, la
# cascata recita una volta, lo zero offre prima la via GRATUITA, e il
# badge dei filtri dice la verita'.
import shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, ago, dove):
    assert s.count(ago) == 1, f'{dove}: {s.count(ago)}'

r = leggi('ad-regia.html'); shutil.copy('ad-regia.html', 'ad-regia.html.bakC2')

# ── 1 · scriviHash + le vie d'uscita (top-scope: stato/carte/passa) ──────
ANCORA_AGG = '  function aggiorna() {'
uno(r, ANCORA_AGG, 'aggiorna')
r = r.replace(ANCORA_AGG, '''  /* lo stato dei filtri vive nell'URL: refresh e back non azzerano la
     ricerca, e «bilocali a Trastevere sotto 1.500» si condivide su
     WhatsApp — il giro lista→casa→lista E' il loop della discovery */
  function scriviHash() {
    var pz = [];
    if (stato.dal) pz.push('dal=' + stato.dal);
    if (stato.budget) pz.push('budget=' + stato.budget);
    if (stato.chi) pz.push('chi=' + encodeURIComponent(stato.chi));
    if (stato.zona) pz.push('zona=' + encodeURIComponent(stato.zona));
    try {
      history.replaceState(null, '', pz.length ? '#' + pz.join('&')
        : location.pathname + location.search);
    } catch (e) {}
  }
  /* lo zero nasce quasi sempre da UN vincolo: prima la via gratuita
     (togli quello), poi la macchina a pagamento */
  function vieUscita() {
    var box = document.getElementById('vuotoVie');
    if (!box) return;
    var VIE = [['dal', 'the move-in date'], ['budget', 'the budget cap'],
               ['chi', "who's moving"], ['zona', 'the zone']];
    var righe = [];
    VIE.forEach(function (v) {
      var k = v[0];
      if (!stato[k]) return;
      var salvo = stato[k];
      stato[k] = (k === 'budget') ? 0 : (k === 'dal' ? null : '');
      var n = 0; carte.forEach(function (c) { if (passa(c)) n++; });
      stato[k] = salvo;
      if (n > 0) righe.push({ k: k, eti: v[1], n: n });
    });
    box.innerHTML = righe.length
      ? '<b>One filter away:</b>' + righe.map(function (x) {
          return '<button type="button" data-k="' + x.k + '">Without '
            + x.eti + ' \\u2192 ' + x.n + ' home'
            + (x.n === 1 ? '' : 's') + '</button>';
        }).join('')
      : '';
  }
''' + ANCORA_AGG)

# ── 2 · aggiorna(): cascata una volta + hash + vie d'uscita ──────────────
VECCHIA_CASCATA = '''    /* il muro riappare con la sua cascata quando cambia il taglio */
    muro.classList.remove('dentro');
    requestAnimationFrame(function () { muro.classList.add('dentro'); });
  }'''
uno(r, VECCHIA_CASCATA, 'cascata')
r = r.replace(VECCHIA_CASCATA, '''    /* la cascata recita all'INGRESSO; ai filtri la lista risponde
       secca — il movimento ripetuto non porta informazione nuova */
    if (!muro.classList.contains('dentro'))
      requestAnimationFrame(function () { muro.classList.add('dentro'); });
    scriviHash();
    if (n === 0) vieUscita();
  }''')

# ── 3 · il badge dei filtri dice la verita' ──────────────────────────────
VECCHIO_ACC = '''    var acc = tutti('#foglioVelo .gruppo button.on').filter(function (b) {
      return b.dataset.v !== ''; }).length;'''
uno(r, VECCHIO_ACC, 'badge acc')
r = r.replace(VECCHIO_ACC, '''    /* il badge conta TUTTO cio' che filtra — anche zona, data, budget e
       chi: una stecca che dichiara «nessun filtro» su una lista filtrata
       insegna a non fidarsi della stecca */
    var acc = tutti('#foglioVelo .gruppo button.on').filter(function (b) {
      return b.dataset.v !== ''; }).length
      + (stato.dal ? 1 : 0) + (stato.budget ? 1 : 0)
      + (stato.chi ? 1 : 0) + (stato.zona ? 1 : 0);''')

# ── 4 · i clearer delle vie d'uscita (nel closure del picker) ────────────
CHIAMATA = '''  leggiHash();
  /* le zone sulle carte cambiano l'hash della stessa pagina: si riascolta */'''
uno(r, CHIAMATA, 'leggiHash call')
r = r.replace(CHIAMATA, '''  leggiHash();
  /* le vie d'uscita del vuoto: un tap toglie QUEL filtro — i comandi dei
     controlli vivono qui, nello stesso closure del picker */
  (function () {
    var box = document.getElementById('vuotoVie');
    if (!box) return;
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-k]'); if (!b) return;
      var k = b.dataset.k;
      if (k === 'budget') { stato.budget = 0; bud.value = '';
        bud.classList.remove('scelto'); }
      if (k === 'chi') { stato.chi = ''; chi.value = '';
        chi.classList.remove('scelto'); }
      if (k === 'dal') { stato.dal = null; scelta = null;
        testo.textContent = 'Any date'; btn.classList.remove('scelta'); }
      if (k === 'zona') { stato.zona = '';
        document.querySelectorAll('.zona-riga.on').forEach(function (z) {
          z.classList.remove('on'); z.setAttribute('aria-pressed', 'false');
        }); }
      aggiorna();
    });
  })();
  /* le zone sulle carte cambiano l'hash della stessa pagina: si riascolta */''')
scrivi('ad-regia.html', r)

# ── 5 · il vuoto guadagna le vie + CSS ───────────────────────────────────
c = leggi('ad-corpo.html'); shutil.copy('ad-corpo.html', 'ad-corpo.html.bakC2')
PITCH = '      <a class="btn btn-primary" href="/property-finding.html">Put the machine on it</a>'
uno(c, PITCH, 'vuoto pitch')
c = c.replace(PITCH, '''      <div class="vuoto-vie" id="vuotoVie"></div>
''' + PITCH)
CSS_V = '.vuoto.si { display:block; }'
uno(c, CSS_V, 'vuoto css')
c = c.replace(CSS_V, CSS_V + '''
.vuoto-vie { margin:16px auto 4px; display:flex; flex-wrap:wrap; gap:8px;
  justify-content:center; align-items:center; max-width:560px; }
.vuoto-vie:empty { display:none; }
.vuoto-vie b { flex-basis:100%; font-size:11px; letter-spacing:.18em;
  text-transform:uppercase; color:var(--gold); font-weight:600; }
.vuoto-vie button { padding:9px 14px; background:none; cursor:pointer;
  border:1px solid var(--line); border-radius:100px; color:var(--text-2);
  font-size:12.5px; transition:border-color .2s, color .2s; }
.vuoto-vie button:hover { border-color:var(--line-gold); color:var(--gold); }''')
scrivi('ad-corpo.html', c)
print('C2 discovery: URL, cascata una volta, badge vero, vie di uscita')
