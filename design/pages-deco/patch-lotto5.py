#!/usr/bin/env python3
# LOTTO 5 — la home riordinata + il detail cablato su /listing/:id.
#
# A. LA HOME (pt.html):
#    prima il prodotto, poi le porte. Skyline SALE subito dopo
#    Case+Come-funziona (si resta nel catalogo finche la domanda "e se
#    non trovo?" non nasce da sola); il radar smette di essere una
#    sezione a parte e diventa l'approfondimento del capitolo servizi,
#    DENTRO la banchina — un titolo solo, niente doppio pitch. Il suo
#    titolo eredita la riga piu forte ("While you read this, it's
#    already looking"). Concierge si dichiara "After you move in".
#
# C. IL DETAIL (ld-regia.html), tre mosse per /listing/:id:
#    1. l'id arriva da window.__LISTING_ID (iniettato dal server), poi
#       dall'hash (#id=, compat v2), poi dal pathname;
#    2. un id NON nel catalogo fotografato ma con window.__LISTING
#       (annuncio pubblicato dal bot DOPO la build) si costruisce al
#       volo da quel documento — la pagina non nasce piu solo dalla
#       fotografia;
#    3. l'idrante diventa digest(nume, testo): beve SUBITO da
#       window.__LISTING (zero round-trip) e poi rilegge Firestore come
#       oggi — stessa logica, due sorgenti.
import shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, a, b, nome):
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    return s.replace(a, b)

for f in ('pt.html', 'ld-regia.html'):
    shutil.copy(f, f + '.bak5')

# ═══ A. LA HOME RIORDINATA ══════════════════════════════════════════════
h = leggi('pt.html')

# 1. estrai la sezione SKYLINE (dal suo commento fino al commento CONCIERGE)
a = h.index('<!-- ══ LA SKYLINE — lo strumento vero')
b = h.index('<!-- ══ CONCIERGE')
skyline = h[a:b]
h = h[:a] + h[b:]

# 2. estrai la sezione RETE (ora finisce dove iniziava la skyline → CONCIERGE)
a2 = h.index('<!-- ══ LA RETE')
b2 = h.index('<!-- ══ CONCIERGE')
rete_sez = h[a2:b2]
h = h[:a2] + h[b2:]

# dal corpo della sezione si salva SOLO la card del radar
ra = rete_sez.index('<div class="rete coro"')
pezzo = rete_sez[:rete_sez.index('</section>')]
pezzo = pezzo[ra:].rstrip()
assert pezzo.endswith('\n  </div>'), 'coda container inattesa'
rete_div = pezzo[:-len('\n  </div>')]

# il titolo della card eredita la riga forte del vecchio header
rete_div = uno(rete_div,
    '<h3 class="rete-titolo">Your brief becomes<br><span class="hl">a live search.</span></h3>',
    '<h3 class="rete-titolo">While you read this,<br><span class="hl">it\'s already looking.</span></h3>',
    'titolo radar')

# 3. la skyline si pianta PRIMA della banchina
c1 = h.index('<!-- ══ LA BANCHINA')
h = h[:c1] + skyline + h[c1:]

# 4. il radar entra NELLA banchina, in coda al container
d1 = h.index('<section class="sezione" id="banchina">')
e1 = h.index('</section>', d1)
ins = h.rindex('  </div>', d1, e1)
h = h[:ins] + rete_div + '\n\n' + h[ins:]

# 5. Concierge si dichiara per quello che e: il capitolo dopo le chiavi
h = uno(h, '<span class="eyebrow"><i></i>Concierge</span>',
    '<span class="eyebrow"><i></i>After you move in</span>', 'eyebrow concierge')

scrivi('pt.html', h)

# ═══ C. IL DETAIL SU /listing/:id ═══════════════════════════════════════
s = leggi('ld-regia.html')

# 1+2. id da server/hash/pathname, e la casa costruita al volo dal
#      documento vero quando la fotografia non la conosce
s = uno(s, """  /* quale casa: quella dell'indirizzo, o la prima disponibile */
  var ide = (location.hash.match(/id=([^&]+)/) || [])[1];
  var c = CASE.filter(function (x) { return x.id === ide; })[0] || CASE[0];""",
"""  /* quale casa: quella del server (/listing/:id), dell'indirizzo (#id=)
     o del percorso — e se il catalogo fotografato non la conosce ma il
     server ha mandato il documento (casa pubblicata dal bot DOPO la
     build), si costruisce da quello. Mai un annuncio nuovo orfano. */
  function statoDa(s2, d2) {
    var oggi = new Date().toISOString().slice(0, 10), eti, lib;
    if (s2 === 'available') {
      if (d2 && d2 > oggi) {
        var dt = new Date(d2 + 'T12:00:00');
        eti = 'Free from ' + dt.getDate() + ' '
          + dt.toLocaleDateString('en-GB', { month: 'short' });
        if (dt.getFullYear() !== new Date().getFullYear())
          eti += ' ' + dt.getFullYear();
      } else eti = 'Available now';
      lib = true;
    } else if (s2 === 'waitlist') { eti = 'Waitlist open'; lib = false; }
    else if (s2 === 'reserved') { eti = 'Reserved'; lib = false; }
    else { eti = 'Rented'; lib = false; }
    return { eti: eti, lib: lib };
  }
  function casaDaListing(d, ideNuovo) {
    function n(v) {
      var x = parseFloat(String(v == null ? '' : v).replace(',', '.'));
      return isFinite(x) && x > 0 ? x : null;
    }
    function t(v) {
      return String(v == null ? '' : v).replace(/\\s+/g, ' ').trim();
    }
    var img = (Array.isArray(d.images) ? d.images : []).filter(Boolean);
    var cover = img[0] || d.coverImage || d.image || '';
    var dal = (String(d.availableDate || d.availableFrom || '')
      .match(/^\\d{4}-\\d{2}-\\d{2}/) || [])[0] || null;
    var st = statoDa(String(d.status || 'available').toLowerCase(), dal);
    return {
      id: ideNuovo,
      nome: t(d.name) || 'Apartment',
      zona: (t(d.zone || d.neighborhood) || 'Roma').split('/')[0],
      indirizzo: t(d.address),
      prezzo: n(d.price) || 0,
      mq: n(d.sqm != null ? d.sqm : d.size),
      letti: n(d.bedrooms != null ? d.bedrooms : d.beds),
      bagni: n(d.bathrooms),
      piano: d.floor != null && t(d.floor) !== '' ? t(d.floor) : null,
      tipo: d.type ? t(d.type) : null,
      arredata: ['yes', 'true', 'si', 'sì']
        .indexOf(String(d.furnished || '').toLowerCase()) >= 0,
      stato: st.eti, libera: st.lib, dal: dal,
      racconto: t(d.description),
      dentro: (Array.isArray(d.features) ? d.features
        : Array.isArray(d.tags) ? d.tags : []).filter(Boolean).map(t),
      cauzioneMesi: n(d.depositMonths) || 1,
      lat: d.lat ? parseFloat(d.lat)
        : d.geo && d.geo.lat ? parseFloat(d.geo.lat) : null,
      lng: d.lng ? parseFloat(d.lng)
        : d.geo && d.geo.lng ? parseFloat(d.geo.lng) : null,
      cover: cover,
      foto: img.slice(0, 8).length ? img.slice(0, 8)
        : (cover ? [cover] : []),
      video: String(d.videoUrl || d.youtubeUrl || '').trim() || null,
      fotoCurate: !!d.photosEnhancedAt
    };
  }
  var ide = window.__LISTING_ID
    || (location.hash.match(/id=([^&]+)/) || [])[1]
    || (location.pathname.match(/\\/listing\\/([^\\/?#]+)/) || [])[1];
  var c = CASE.filter(function (x) { return x.id === ide; })[0];
  if (!c && ide && window.__LISTING) c = casaDaListing(window.__LISTING, ide);
  c = c || CASE[0];""", 'id e casa dal server')

# 3. l'idrante beve da due sorgenti: __LISTING subito, Firestore dopo
s = uno(s, """  if (VERO) setTimeout(function () {
    fetch('https://firestore.googleapis.com/v1/projects/'
        + 'boom-property-dashboards/databases/(default)/documents/listings/'
        + encodeURIComponent(c.id))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.fields) return;
        var f = j.fields;
        function nume(k) {
          var v = f[k]; if (!v) return null;
          var n = parseFloat(v.integerValue || v.doubleValue
            || v.stringValue);
          return isFinite(n) && n > 0 ? n : null;
        }
        function testo(k) {
          var v = f[k]; return v ? String(v.stringValue || '') : '';
        }
        var cambia = false;
        var p2 = nume('price');
        if (p2 && p2 !== c.prezzo) { c.prezzo = p2; cambia = true; }
        var m2 = nume('depositMonths');
        if (m2 && m2 !== c.cauzioneMesi) {
          c.cauzioneMesi = m2; cambia = true;
        }
        var s2 = testo('status').toLowerCase();
        if (s2) {
          var d2 = (testo('availableDate')
            .match(/^\\d{4}-\\d{2}-\\d{2}/) || [])[0] || c.dal;
          var oggi2 = new Date().toISOString().slice(0, 10);
          var eti, lib;
          if (s2 === 'available') {
            if (d2 && d2 > oggi2) {
              var dt = new Date(d2 + 'T12:00:00');
              eti = 'Free from ' + dt.getDate() + ' '
                + dt.toLocaleDateString('en-GB', { month: 'short' });
              if (dt.getFullYear() !== new Date().getFullYear())
                eti += ' ' + dt.getFullYear();
            } else eti = 'Available now';
            lib = true;
          } else if (s2 === 'waitlist') { eti = 'Waitlist open'; lib = false; }
          else if (s2 === 'reserved') { eti = 'Reserved'; lib = false; }
          else { eti = 'Rented'; lib = false; }
          if (eti !== c.stato || lib !== c.libera || d2 !== c.dal) {
            c.stato = eti; c.libera = lib; c.dal = d2; cambia = true;
          }
        }
        if (!cambia) return;
        scriviStato(); contiSoldi(); mostraTotale(true); mostraCanone(true);
        rifaiDurata(); scriviChiedi(); rifaiPresa(); rifaiPorte();
      })
      .catch(function () { /* niente rete: restano i numeri del builder */ });
  }, 600);""",
"""  function digest(nume, testo) {
    var cambia = false;
    var p2 = nume('price');
    if (p2 && p2 !== c.prezzo) { c.prezzo = p2; cambia = true; }
    var m2 = nume('depositMonths');
    if (m2 && m2 !== c.cauzioneMesi) {
      c.cauzioneMesi = m2; cambia = true;
    }
    var s2 = testo('status').toLowerCase();
    if (s2) {
      var d2 = (testo('availableDate')
        .match(/^\\d{4}-\\d{2}-\\d{2}/) || [])[0] || c.dal;
      var st2 = statoDa(s2, d2);
      if (st2.eti !== c.stato || st2.lib !== c.libera || d2 !== c.dal) {
        c.stato = st2.eti; c.libera = st2.lib; c.dal = d2; cambia = true;
      }
    }
    if (!cambia) return;
    scriviStato(); contiSoldi(); mostraTotale(true); mostraCanone(true);
    rifaiDurata(); scriviChiedi(); rifaiPresa(); rifaiPorte();
  }
  /* prima sorsata: il documento gia iniettato dal server — zero rete */
  if (VERO && window.__LISTING && window.__LISTING_ID === c.id)
    (function (d) {
      digest(function (k) {
        var n = parseFloat(d[k]);
        return isFinite(n) && n > 0 ? n : null;
      }, function (k) { return d[k] == null ? '' : String(d[k]); });
    })(window.__LISTING);
  /* seconda: la rilettura viva, come sempre */
  if (VERO) setTimeout(function () {
    fetch('https://firestore.googleapis.com/v1/projects/'
        + 'boom-property-dashboards/databases/(default)/documents/listings/'
        + encodeURIComponent(c.id))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.fields) return;
        var f = j.fields;
        digest(function (k) {
          var v = f[k]; if (!v) return null;
          var n = parseFloat(v.integerValue || v.doubleValue
            || v.stringValue);
          return isFinite(n) && n > 0 ? n : null;
        }, function (k) {
          var v = f[k]; return v ? String(v.stringValue || '') : '';
        });
      })
      .catch(function () { /* niente rete: restano i numeri del builder */ });
  }, 600);""", 'idrante a due sorgenti')

scrivi('ld-regia.html', s)
print('lotto 5 A+C: fatto')
