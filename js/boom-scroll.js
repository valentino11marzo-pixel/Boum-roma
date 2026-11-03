/* boom-scroll.js — LA MISURA DELLA BARRA. Nessuna dipendenza.
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
 * Si misura quando il documento e' letto (DOMContentLoaded), al primo
 * fotogramma, al load, al primo scorrimento (molte barre cambiano altezza
 * appena si scorre) e al ridimensionamento. Mai in un loop.
 *
 * Mai prima del documento (03/11/2026): misurata nella head, senza il
 * body, scriveva 0px e un link /pagina#sezione aperto da fuori finiva
 * sotto la barra. Se al load la barra e' cambiata dopo lo scorrimento al
 * frammento, lo si rifa' una volta: solo su navigazione nuova e se il
 * lettore non ha toccato niente (mai l'evento scroll: lo genera il
 * frammento stesso). Storia intera in tests/scroll/run.mjs.
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

  var mosso = false, MOSSE = ['wheel', 'touchstart', 'keydown', 'mousedown'];
  function muove() { mosso = true; }
  for (var k = 0; k < MOSSE.length; k++) {
    addEventListener(MOSSE[k], muove, { passive: true, capture: true });
  }
  function margine() { return parseFloat(getComputedStyle(R).scrollPaddingTop) || 0; }

  function riporta(prima) {
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    if (mosso || !location.hash || (nav && nav.type !== 'navigate')) return;
    var dopo = margine(), id, t, m, b;
    if (Math.abs(dopo - prima) < 1) return;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (e) { return; }
    t = id && document.getElementById(id);
    if (!t || !t.getClientRects().length || t.closest('[data-scroll-libero]')) return;
    m = parseFloat(getComputedStyle(t).scrollMarginTop) || 0;
    if (Math.abs(t.getBoundingClientRect().top - (prima + m)) > 2) return;
    b = R.style.scrollBehavior;
    R.style.scrollBehavior = 'auto';
    t.scrollIntoView(true);
    R.style.scrollBehavior = b;
  }

  // Nella head una misura direbbe "nessuna barra": si aspetta il
  // documento, poi il primo fotogramma (fogli di stile arrivati).
  if (document.readyState !== 'loading') misura();
  else addEventListener('DOMContentLoaded', function () { misura(); piano(); });
  // Un nome, non una funzione anonima: chi legge l'HTML come testo (i
  // test dei desk) cerca il SUO gestore del load, e questo sta prima.
  function alLoad() {
    var prima = margine();
    misura();
    riporta(prima);
    for (var k = 0; k < MOSSE.length; k++) {
      removeEventListener(MOSSE[k], muove, { capture: true });
    }
  }
  addEventListener('load', alLoad);
  addEventListener('resize', piano, { passive: true });
  addEventListener('orientationchange', piano);
  addEventListener('scroll', function una() {
    removeEventListener('scroll', una);
    piano();
  }, { passive: true, once: true });
})();
