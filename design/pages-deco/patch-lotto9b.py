#!/usr/bin/env python3
# LOTTO 9b — due richieste dell'operatore:
#  1. il BADGE STRIPE (col logo vero) torna sotto il form data/budget —
#     il marchio visivo vale piu delle parole; il testo evita di ripetere
#     cio che il sotto-hero gia dice (via la clausola "we reply within
#     2h": la persona che risponde sta gia nel sub).
#  2. il calendario su TOUCH usa quello di sistema (la ruota Apple):
#     un campo data nativo invisibile sopra il bottone — su desktop
#     resta il calendario BOOM millimetrico. Vale per home E discovery
#     (il modulo e condiviso via estrazione).
import shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, a, b, nome):
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    return s.replace(a, b)

shutil.copy('pt.html', 'pt.html.bak9b')
s = leggi('pt.html')

# ── 1a. il CSS della riga di fiducia (compatta) ─────────────────────────
s = uno(s, """/* il richiamo ai servizi: UNA riga che parla la situazione, non il
   prodotto — ma da PORTA, non da didascalia: puntino vivo, velo d'oro,
   l'azione in oro e la freccia nel cerchietto che scivola. */""",
"""/* la fiducia Stripe sotto il form: il MARCHIO visivo, una riga sola.
   Le parole non ripetono il sotto-hero — il logo e la prova. */
.hero-fede { display:flex; align-items:center; gap:11px;
  margin-top:clamp(14px,1.8vw,20px); padding:10px 15px;
  border-radius:100px; background:var(--surface);
  box-shadow:inset 0 0 0 1px var(--line-0); max-width:max-content; }
.hero-fede .hf-stripe { width:38px; height:auto; flex:none; opacity:.85; }
.hero-fede span { font-size:11.5px; line-height:1.5; color:var(--text-4); }
.hero-fede span b { color:var(--text-2); font-weight:500; }
@media (max-width:640px){
  .hero-fede { border-radius:14px; padding:10px 13px;
    align-items:flex-start; }
  .hero-fede .hf-stripe { margin-top:2px; } }

/* il richiamo ai servizi: UNA riga che parla la situazione, non il
   prodotto — ma da PORTA, non da didascalia: puntino vivo, velo d'oro,
   l'azione in oro e la freccia nel cerchietto che scivola. */""",
'css fede')

# ── 1b. il markup: subito sotto il form (giorno-uno incluso) ────────────
s = uno(s, """      <p class="giorno-uno" id="giornoUno" hidden></p>
      <a class="porte-eco" href="#banchina">""",
"""      <p class="giorno-uno" id="giornoUno" hidden></p>
      <div class="hero-fede">
        <svg class="hf-stripe" aria-label="Stripe" viewBox="0 0 468 222.5" xmlns="http://www.w3.org/2000/svg"> <path fill="#635BFF" d="M414 113.4c0-25.6-12.4-45.8-36.1-45.8-23.8 0-38.2 20.2-38.2 45.6 0 30.1 17 45.3 41.4 45.3 11.9 0 20.9-2.7 27.7-6.5v-20c-6.8 3.4-14.6 5.5-24.5 5.5-9.7 0-18.3-3.4-19.4-15.2h48.9c0-1.3.2-6.5.2-8.9zm-49.4-9.5c0-11.3 6.9-16 13.2-16 6.1 0 12.6 4.7 12.6 16h-25.8zm-63.5-36.3c-9.8 0-16.1 4.6-19.6 7.8l-1.3-6.2h-22v116.6l25-5.3.1-28.3c3.6 2.6 8.9 6.3 17.7 6.3 17.9 0 34.2-14.4 34.2-46.1-.1-29-16.6-44.8-34.1-44.8zm-6 68.9c-5.9 0-9.4-2.1-11.8-4.7l-.1-37.1c2.6-2.9 6.2-4.9 11.9-4.9 9.1 0 15.4 10.2 15.4 23.3 0 13.4-6.2 23.4-15.4 23.4zm-71.3-74.8l25.1-5.4V36l-25.1 5.3zm0 7.6h25.1v87.5h-25.1zm-26.9 7.4l-1.6-7.4h-21.6v87.5h25V97.5c5.9-7.7 15.9-6.3 19-5.2v-23c-3.2-1.2-14.9-3.4-20.8 7.4zm-50-29.8l-24.4 5.2-.1 80.1c0 14.8 11.1 25.7 25.9 25.7 8.2 0 14.2-1.5 17.5-3.3V135c-3.2 1.3-19 5.9-19-8.9V90.6h19V69.3h-19l.1-21.7zM79.3 94.7c0-3.9 3.2-5.4 8.5-5.4 7.6 0 17.2 2.3 24.8 6.4V72.2c-8.3-3.3-16.5-4.6-24.8-4.6C67.5 67.6 54 78.2 54 95.9c0 27.6 38 23.2 38 35.1 0 4.6-4 6.1-9.6 6.1-8.3 0-18.9-3.4-27.3-8v23.8c9.3 4 18.7 5.7 27.3 5.7 20.8 0 35.1-10.3 35.1-28.2-.1-29.8-38.2-24.5-38.2-35.7z"/> </svg>
        <span><b>Every euro through BOOM</b> — never to a stranger ·
          every home walked in person</span>
      </div>
      <a class="porte-eco" href="#banchina">""", 'fede markup')

# ── 2. il calendario di sistema su touch ────────────────────────────────
s = uno(s, """    btn.addEventListener('click', function () {
      apri(!cal.classList.contains('aperto'));
    });""",
"""    /* su touch il calendario e quello del SISTEMA (la ruota Apple):
       un campo data nativo invisibile copre il bottone. Su desktop
       resta il calendario BOOM. */
    var nativo = null;
    if (matchMedia('(pointer:coarse)').matches) {
      nativo = document.createElement('input');
      nativo.type = 'date';
      nativo.min = iso(oggi);
      nativo.setAttribute('aria-label', 'Arrival date');
      nativo.style.cssText = 'position:absolute;inset:0;width:100%;'
        + 'height:100%;opacity:0;border:0;padding:0;';
      btn.style.position = 'relative';
      btn.appendChild(nativo);
      nativo.addEventListener('change', function () {
        if (!nativo.value) return;
        scelta = new Date(nativo.value + 'T12:00:00');
        testo.textContent = bella(scelta);
        if (window.__passData) window.__passData(bella(scelta));
        btn.classList.add('scelta');
      });
    }
    btn.addEventListener('click', function (e) {
      if (nativo) {
        if (e.target !== nativo) {
          try { if (nativo.showPicker) { nativo.showPicker(); return; } }
          catch (er) {}
          nativo.focus();
        }
        return;
      }
      apri(!cal.classList.contains('aperto'));
    });""", 'calendario nativo')

scrivi('pt.html', s)
print('lotto 9b: fatto')
