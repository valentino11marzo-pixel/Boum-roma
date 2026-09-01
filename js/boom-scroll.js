/* boom-scroll.js — LA MISURA DELLA BARRA. ~500 byte, nessuna dipendenza.
 *
 * Scrive --boom-barra con l'altezza VERA di cio' che copre il bordo alto
 * della finestra, cosi' `scroll-padding-top` (css/boom-scroll.css) porta
 * ogni ancora sotto la barra invece che dietro.
 *
 * Come si misura, e perche' cosi': `elementsFromPoint` restituisce solo
 * gli elementi sotto UN punto — costa quanto la profondita' dell'albero,
 * non quanto il numero di nodi. Scorrere tutto il documento con
 * querySelectorAll('*') e chiedere getComputedStyle a ognuno costerebbe
 * millisecondi di thread principale a ogni ridimensionamento, per sapere
 * una cosa che si legge in un punto.
 *
 * Si misura al caricamento, al primo scorrimento (molte barre cambiano
 * altezza appena si scorre) e al ridimensionamento. Mai in un loop.
 */
(function () {
  var R = document.documentElement, ultimo = -1;

  function misura() {
    var x = Math.round(innerWidth / 2), coperto = 0, i, e, s, r;
    var sotto = document.elementsFromPoint ? document.elementsFromPoint(x, 2) : [];
    for (i = 0; i < sotto.length; i++) {
      e = sotto[i];
      if (!e || e === R || e === document.body) continue;
      s = getComputedStyle(e);
      if (s.position !== 'fixed' && s.position !== 'sticky') continue;
      if (s.visibility === 'hidden' || s.display === 'none') continue;
      r = e.getBoundingClientRect();
      // Una barra alta mezzo schermo non e' una barra: e' un pannello
      // aperto, e non deve spostare le ancore di tutta la pagina.
      if (r.top > 2 || r.height > innerHeight * 0.35) continue;
      if (r.bottom > coperto) coperto = r.bottom;
    }
    coperto = Math.round(coperto);
    if (coperto !== ultimo) {
      ultimo = coperto;
      R.style.setProperty('--boom-barra', coperto + 'px');
    }
  }

  var atteso = false;
  function piano() {
    if (atteso) return;
    atteso = true;
    requestAnimationFrame(function () { atteso = false; misura(); });
  }

  misura();
  addEventListener('load', misura);
  addEventListener('resize', piano, { passive: true });
  addEventListener('orientationchange', piano);
  addEventListener('scroll', function una() {
    removeEventListener('scroll', una);
    piano();
  }, { passive: true, once: true });
})();
