#!/usr/bin/env python3
# LA BANCHINA RIFATTA + VIA LA FILA — additivi per l'occhio, non per noi:
#   · le 4 porte diventano PULSANTI: griglia 2×2 su mobile, mai piu scroll
#     orizzontale (la porta nascosta era una porta che non esisteva)
#   · la frase-Stripe (un pippone) muore: al suo posto i badge piccoli di
#     garanzia, che assorbono anche i fatti istituzionali
#   · la fila dei fatti sotto l'hero sparisce: troppe righe nel posto
#     sbagliato — ora i fatti vivono nei badge della banchina e nel footer
import shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, a, b, nome):
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    return s.replace(a, b)

shutil.copy('pt.html', 'pt.html.bak')
s = leggi('pt.html')

# ── via la fila dei fatti (markup) ──────────────────────────────────────
i0 = s.index('<!-- ══ LA FILA DEI FATTI — istituzionali, veri, una volta sola ═══════════ -->')
i1 = s.index('<!-- ══ CASE DELLA SETTIMANA')
s = s[:i0] + s[i1:]

# ── via la fila dei fatti (css) ─────────────────────────────────────────
i0 = s.index('/* ══ LA FILA DEI FATTI ═════════════════════════════════════════════════ */')
i1 = s.index('/* ══ LA PRESA IN BANCHINA ══════════════════════════════════════════════ */')
s = s[:i0] + s[i1:]

# ── mobile: le porte in griglia 2×2, compatte — mai piu scroll ──────────
s = uno(s, """@media (max-width:860px){
  .ba-porte { display:flex; overflow-x:auto; scroll-snap-type:x mandatory;
    scrollbar-width:none; -webkit-overflow-scrolling:touch; }
  .ba-porte::-webkit-scrollbar { display:none; }
  .ba-p { flex:0 0 min(72vw,232px); scroll-snap-align:start;
    border-right:1px solid var(--line-0); }
  .ba-p:last-child { border-right:0; } }""",
"""@media (max-width:860px){
  /* quattro pulsanti, tutti visibili in un colpo d'occhio: la porta che
     devi scorrere per vedere e una porta che non esiste */
  .ba-porte { grid-template-columns:1fr 1fr; }
  .ba-p { padding:12px 13px 13px; }
  .ba-p .fa { display:none; }
  .ba-p .caso { margin-top:7px; font-size:12.5px; }
  .ba-p .costo { margin-top:7px; }
  .ba-p .costo b { font-size:16px; } }""", 'porte griglia')

# ── il pippone Stripe → i badge di garanzia ─────────────────────────────
i0 = s.index('<div class="ba-soldi">')
i1 = s.index('</div>', s.index('ba-stripe', i0)) + len('</div>')
s = s[:i0] + """<div class="ba-garanzie" aria-label="Guarantees">
        <span class="ba-g">Stripe — a receipt for every line</span>
        <span class="ba-g">Deposit filmed in &amp; out</span>
        <span class="ba-g">Refunded or credited if we don't deliver</span>
        <span class="ba-g">Egidi Immobiliare S.r.l. — licensed agency</span>
        <span class="ba-g">BOOM® · EU trade mark 019317594</span>
      </div>""" + s[i1:]

# via il css del vecchio blocco
i0 = s.index('/* la garanzia: dove finiscono i soldi, detta con le parole del sito */')
i1 = s.index('@media (max-width:640px){ .ba-stripe { display:none; } }')
i1 = s.index('\n', i1) + 1
s = s[:i0] + """/* le garanzie: badge piccoli, tutti veri — i fatti istituzionali vivono
   qui e nel footer, una volta sola */
.ba-garanzie { display:flex; flex-wrap:wrap; gap:7px; padding:12px 18px;
  border-top:1px solid var(--line-0); background:var(--void); }
.ba-g { display:inline-flex; align-items:center; gap:7px; padding:7px 11px;
  font-size:10.5px; font-weight:500; letter-spacing:.04em;
  color:var(--text-3); box-shadow:inset 0 0 0 1px var(--line);
  border-radius:100px; }
.ba-g::before { content:''; width:4px; height:4px; border-radius:50%;
  background:var(--gold); opacity:.8; flex:none; }
@media (max-width:640px){
  .ba-garanzie { padding:11px 15px; gap:6px; }
  .ba-g { font-size:10px; padding:6px 10px; } }
""" + s[i1:]

scrivi('pt.html', s)
print('banchina: fatta')
