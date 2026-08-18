#!/usr/bin/env python3
# D · srcset nel detail: le varianti della pipeline enhance arrivano in
# pagina — galleria con srcset, rullino a misura, mai fidarsi del solo
# indice (allineamento per src: se gli array driftano resta il master).
r = open('ld-regia.html', encoding='utf-8').read()

old = "      cover: cover,"
assert r.count(old) == 1
r = r.replace(old, "      cover: cover,\n"
    "      varianti: Array.isArray(d.imagesVariants) ? d.imagesVariants : null,")

old2 = '''  function mostra(i) {
    img.classList.remove('qui');
    var pre = new Image();
    pre.onload = function () { img.src = pre.src; img.classList.add('qui'); };
    pre.src = immagini[i];
'''
assert r.count(old2) == 1
r = r.replace(old2, '''  /* le varianti della pipeline enhance (w480/w960): allineate per src,
     mai per solo indice — se gli array driftano, resta il master */
  function variante(i) {
    var v = c.varianti && c.varianti[i];
    return (v && v.src === immagini[i]) ? v : null;
  }
  function mostra(i) {
    img.classList.remove('qui');
    var v = variante(i);
    if (v && (v.w480 || v.w960)) {
      img.onload = function () { img.classList.add('qui'); img.onload = null; };
      img.sizes = '100vw';
      img.srcset = [v.w480 ? v.w480 + ' 480w' : '',
        v.w960 ? v.w960 + ' 960w' : '', immagini[i] + ' 1920w']
        .filter(Boolean).join(', ');
      img.src = immagini[i];
      if (img.complete && img.naturalWidth) {
        img.classList.add('qui'); img.onload = null;
      }
    } else {
      var pre = new Image();
      pre.onload = function () { img.removeAttribute('srcset');
        img.src = pre.src; img.classList.add('qui'); };
      pre.src = immagini[i];
    }
''')

old3 = "    t.src = u; t.alt = ''; t.loading = 'lazy'; t.decoding = 'async';"
assert r.count(old3) == 1
r = r.replace(old3, '''    var vt = variante(i);
    t.src = (vt && vt.w480) || u;   /* il rullino non scarica mai 1920px */
    t.alt = ''; t.loading = 'lazy'; t.decoding = 'async';''')
open('ld-regia.html', 'w', encoding='utf-8').write(r)

b = open('costruisci-ld.py', encoding='utf-8').read()
old4 = "        'cover': cover, 'foto': foto,"
assert b.count(old4) == 1
b = b.replace(old4, "        'cover': cover, 'foto': foto,\n"
    "        'varianti': (r.get('imagesVariants') or None),")
open('costruisci-ld.py', 'w', encoding='utf-8').write(b)
print('detail: varianti cablate')
