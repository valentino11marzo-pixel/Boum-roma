#!/usr/bin/env python3
# ld4 — le tre correzioni di Valentino sulla pagina casa.
#
#   1 · IL DEPOSITO NON E UNA NOTA A MARGINE. Messo di lato «+ €2.000»
#       sembrava una cosa non importante e non da pagare. Verita semplice:
#       il giorno uno paghi TUTTO — canone, deposito, onorario — e il
#       deposito torna. Quindi: una cifra sola sui Solari (il giorno uno
#       intero), sotto le tre voci in chiaro, e sul deposito la riga verde
#       «comes back to you». Un numero, una storia.
#
#   2 · NIENTE UPSELL €89 SULLE NOSTRE CASE. Se sei interessato a un nostro
#       appartamento, fartelo vedere e il nostro lavoro: la visita in video
#       dal vivo E GRATIS. Il Virtual Viewing a €89 e per le case degli
#       ALTRI portali. Corretti: il riquadro sotto la galleria e la prima
#       risposta del «before you ask».
#
#   3 · IL DISTINTIVO «ordered by room» confondeva: sparisce come badge a
#       parte e diventa mezza riga dentro l'unico badge rimasto.
def leggi(n): return open(n, encoding='utf-8').read()
corpo = leggi('ld-corpo.html'); regia = leggi('ld-regia.html')
def uno(s, a, b, nome):
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    return s.replace(a, b)

# ── 1 · il denaro: una cifra, tre voci, la riga verde ───────────────────
corpo = uno(corpo, '''      <div class="chiavi-cima">
        <div>
          <span class="chiavi-eti">To get the keys</span>
          <div class="chiavi-flap"><span class="flap-tot" id="totFlap"
            data-p="" aria-live="polite"></span></div>
          <p class="chiavi-somma" id="chiaviSomma">—</p>
        </div>
        <div class="chiavi-cauzione">
          <span>+ <b id="chiaviCauzione">—</b> security deposit</span>
          <em>Not a cost. It is held for you and comes back after the final
            walkthrough — the flat is filmed in and out, so its state is a
            recording, not an argument.</em>
        </div>
      </div>''',
'''      <div class="chiavi-cima">
        <span class="chiavi-eti">Due on day one — all of it, in writing</span>
        <div class="chiavi-flap"><span class="flap-tot" id="totFlap"
          data-p="" aria-live="polite"></span></div>
        <div class="voci">
          <div class="voce"><span>First month's rent</span>
            <b id="voceCanone">—</b></div>
          <div class="voce"><span>Agency fee — our only fee, once</span>
            <b id="voceOnorario">—</b></div>
          <div class="voce torna"><span>Security deposit
            <em>comes back to you at the end — held, filmed in and out</em></span>
            <b id="voceCauzione">—</b></div>
        </div>
      </div>''', 'cima denaro')

corpo = uno(corpo, '''.chiavi-cima { display:grid; gap:clamp(18px,2.4vw,34px); align-items:start;
  grid-template-columns:1fr; }
@media (min-width:820px){ .chiavi-cima {
  grid-template-columns:minmax(0,auto) minmax(0,1fr) ; } }'''
  .replace(' ;', ';'),  # tolleranza spazi
'''.chiavi-cima { max-width:560px; }''', 'css cima') if '''grid-template-columns:minmax(0,auto) minmax(0,1fr); } }''' in corpo else corpo
if '.chiavi-cima { display:grid;' in corpo:
    import re as _re
    corpo = _re.sub(r'\.chiavi-cima \{ display:grid;[^}]*\}\n@media \(min-width:820px\)\{ \.chiavi-cima \{[^}]*\} \}',
                    '.chiavi-cima { max-width:560px; }', corpo)
assert corpo.count('.chiavi-cima { max-width:560px; }') == 1, 'css cima'

corpo = uno(corpo, '''.chiavi-somma { margin:10px 0 0; font-size:12.5px; line-height:1.6;
  color:var(--text-2); }
.chiavi-somma b { color:var(--text); font-weight:500;
  font-variant-numeric:tabular-nums; }
.chiavi-cauzione { padding:14px 16px; border-radius:12px;
  background:var(--surface); box-shadow:inset 0 0 0 1px var(--line-0); }
.chiavi-cauzione > span { display:block; font-size:13.5px; color:var(--text-2); }
.chiavi-cauzione b { font-family:var(--display); font-size:18px;
  font-weight:400; color:var(--text); font-variant-numeric:tabular-nums; }
.chiavi-cauzione em { display:block; margin-top:6px; font-style:normal;
  font-size:11.5px; line-height:1.6; color:var(--text-4); }''',
'''/* le tre voci sotto il numero: stessa gerarchia, nessuna nascosta.
   Il deposito e un pagamento vero del giorno uno — e torna, ed e scritto
   in verde sulla sua riga, non in un riquadro a parte. */
.voci { margin-top:14px; }
.voce { display:flex; align-items:baseline; justify-content:space-between;
  gap:14px; padding:9px 0; border-top:1px solid var(--line-0);
  font-size:13px; color:var(--text-2); }
.voce b { font-family:var(--display); font-size:16px; font-weight:400;
  color:var(--text); font-variant-numeric:tabular-nums; white-space:nowrap; }
.voce em { display:block; font-style:normal; font-size:11px; line-height:1.5;
  color:var(--green); margin-top:2px; }
.voce.torna b { color:var(--green); }''', 'css voci')

# ── 2 · la visita in video GRATIS sulle nostre case ─────────────────────
regia = uno(regia, '''    } else {
      var a = document.createElement('a');
      a.className = 'pel-v azione';
      a.href = 'VIRTUAL_URL';
      a.style.marginTop = '12px';
      a.style.borderRadius = '14px';
      a.style.boxShadow = 'inset 0 0 0 1px var(--line-gold)';
      a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">'
        + '<rect x="3.5" y="6.5" width="12" height="11" rx="2"/>'
        + '<path d="M15.5 11l5-2.6v7.2l-5-2.6z"/>'
        + '<circle cx="7.2" cy="10.2" r="1.1" class="pieno"/></svg>'
        + '<span><b>No walkthrough video for this one yet — have a better '
        + 'one.</b><span>A live tour of this exact flat, with you asking the '
        + 'questions and the red flags said out loud. <em>€89</em>, credited '
        + 'to your fee if you rent it.</span></span>';
      pel.appendChild(a);
    }''',
'''    } else {
      /* casa NOSTRA: fartela vedere e il nostro lavoro, la visita in
         video dal vivo e GRATIS. Il Virtual Viewing a €89 esiste per le
         case degli altri portali, non qui. */
      var a = document.createElement('a');
      a.className = 'pel-v azione';
      a.href = 'https://wa.me/393313251961?text='
        + encodeURIComponent('Hi! I\\'d like a live video viewing of "'
            + c.nome + '" — when is the next slot?');
      a.target = '_blank'; a.rel = 'noopener';
      a.style.marginTop = '12px';
      a.style.borderRadius = '14px';
      a.style.boxShadow = 'inset 0 0 0 1px var(--line-gold)';
      a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">'
        + '<rect x="3.5" y="6.5" width="12" height="11" rx="2"/>'
        + '<path d="M15.5 11l5-2.6v7.2l-5-2.6z"/>'
        + '<circle cx="7.2" cy="10.2" r="1.1" class="pieno"/></svg>'
        + '<span><b>See it live from where you are — free.</b>'
        + '<span>A BOOM agent walks this exact flat on live video, with you '
        + 'asking the questions. <em>Our home, our job — no charge.</em> '
        + 'Book a slot on WhatsApp.</span></span>';
      pel.appendChild(a);
    }''', 'visita gratis')

regia = uno(regia, """      ['Can I see it without flying to Rome?',
       'Yes. A BOOM agent walks this exact flat on live video with you asking '
       + 'the questions, plus HD photos and the red flags said out loud. '
       + '<em>€89</em> — credited to your agency fee if you then rent with us.'],""",
"""      ['Can I see it without flying to Rome?',
       'Yes — and for our homes it costs nothing: a BOOM agent walks this '
       + 'exact flat on live video with you asking the questions. Book a '
       + 'slot on WhatsApp. (The paid €89 Virtual Viewing is for homes on '
       + 'OTHER portals — this one is ours.)'],""", 'chiedi visita')

# ── 3 · un badge solo sotto la galleria ─────────────────────────────────
regia = uno(regia, """    var v = [];
    v.push('<div class="pel-v"><svg viewBox="0 0 24 24" aria-hidden="true">'
      + '<path d="M12 3l7 2.8v5.4c0 4.1-3 7.1-7 8.3-4-1.2-7-4.2-7-8.3V5.8z"/>'
      + '<path d="M8.6 11.6l2.3 2.3 4.3-4.9"/></svg><span><b>Walked and '
      + 'photographed by us</b><span>' + n + ' photo' + (n === 1 ? '' : 's')
      + ' of this exact flat — nothing borrowed from a portal, nothing from '
      + 'a render.</span></span></div>');
    if (c.fotoCurate) {
      v.push('<div class="pel-v"><svg viewBox="0 0 24 24" aria-hidden="true">'
        + '<path d="M4 16l5-6 4 4.5L16 11l4 5"/><rect x="3" y="4.5" '
        + 'width="18" height="15" rx="2"/><circle cx="8.6" cy="9" r="1.2" '
        + 'class="pieno"/></svg><span><b>Ordered by room, not by upload '
        + 'date</b><span>Straightened, colour-corrected and de-duplicated, '
        + 'then sorted living → kitchen → bedrooms → bathroom, floor plans '
        + 'last. So the first photo is the room you actually care '
        + 'about.</span></span></div>');
    }
    pel.innerHTML = '<div class="pel-fila">' + v.join('') + '</div>';""",
"""    /* un badge solo: due dicevano quasi la stessa cosa e il secondo
       confondeva. La cura delle foto e mezza riga, non un cartello. */
    var dett = n + ' photo' + (n === 1 ? '' : 's')
      + ' of this exact flat — nothing borrowed, nothing rendered'
      + (c.fotoCurate ? ', ordered room by room so the first one is the '
        + 'one you care about.' : '.');
    pel.innerHTML = '<div class="pel-fila uno">'
      + '<div class="pel-v"><svg viewBox="0 0 24 24" aria-hidden="true">'
      + '<path d="M12 3l7 2.8v5.4c0 4.1-3 7.1-7 8.3-4-1.2-7-4.2-7-8.3V5.8z"/>'
      + '<path d="M8.6 11.6l2.3 2.3 4.3-4.9"/></svg><span><b>Walked and '
      + 'photographed by us</b><span>' + dett + '</span></span></div></div>';""",
'badge unico')
corpo = uno(corpo, "@media (min-width:820px){ .pel-fila { grid-template-columns:1fr 1fr; } }",
"@media (min-width:820px){ .pel-fila:not(.uno) { grid-template-columns:1fr 1fr; } }",
'pel-fila uno')

# ── la regia del numero: il giorno uno intero ───────────────────────────
regia = uno(regia, """  /* la cifra grande e quella PER LE CHIAVI: primo canone + onorario.
     La cauzione sta fuori e lo dice — non e un costo, e trattenuta. */
  var chiavi = c.prezzo + onorario;
  per('#chiaviCauzione').textContent = euro(cauzione);
  per('#chiaviOnorario').textContent = euro(onorario);
  per('#chiaviSomma').innerHTML = 'First month <b>' + euro(c.prezzo)
    + '</b> + agency fee <b>' + euro(onorario) + '</b>'
    + (c.dal ? ' · keys from <b>' + new Date(c.dal + 'T12:00:00')
        .toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
        + '</b>' : '');""",
"""  /* la cifra grande e il giorno uno INTERO: canone + deposito + onorario.
     Nessuna voce a margine — il deposito e un pagamento vero, e torna,
     ed e scritto in verde sulla sua riga. Un numero, una storia. */
  var chiavi = totale;
  per('#voceCanone').textContent = euro(c.prezzo);
  per('#voceOnorario').textContent = euro(onorario);
  per('#voceCauzione').textContent = euro(cauzione);
  per('#chiaviOnorario').textContent = euro(onorario);""", 'numero intero')

regia = uno(regia, """      per('#durNota').innerHTML = '<b>' + euro(cauzione) + '</b> of deposit sits '
        + 'on top of this and comes back to you at the end — it is held, not '
        + 'spent. Utilities and the registration tax are paid to the providers '
        + 'and to the State, never to us.';""",
"""      per('#durNota').innerHTML = 'Your <b>' + euro(cauzione) + '</b> deposit '
        + 'is not counted here: you pay it on day one and it comes back at '
        + 'the end. Utilities and the registration tax are paid to the '
        + 'providers and to the State, never to us.';""", 'nota durata')

open('ld-corpo.html', 'w', encoding='utf-8').write(corpo)
open('ld-regia.html', 'w', encoding='utf-8').write(regia)
print('ld4 · un numero una storia · visita gratis sulle nostre · badge unico')
