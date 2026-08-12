#!/usr/bin/env python3
# v23 — la fascia sotto l'hero smette di essere un badge e comincia a vendere.
#   Prima: quattro mattonelle, zero azioni, e una («ROM · Your landing,
#   handled») che non e un'informazione ma un codice aeroportuale.
#   Ora: il capofila e l'unica cosa acquistabile in quell'istante (il Virtual
#   Viewing, per chi non puo volare a vedere la casa), sotto quattro fatti che
#   rispondono alle obiezioni residue, in coda l'orologio come riga viva e il
#   secondo gancio per chi ha gia un contratto in mano.
#   Copy verbatim dalle pagine servizio live. Prezzi dal catalogo server-side.
f = 'pt.html'
s = open(f, encoding='utf-8').read()
def uno(a, b, nome):
    global s
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    s = s.replace(a, b)

# ── il CSS vecchio se ne va — regola per regola, perche le sue righe sono
#    intrecciate con quelle delle .porta, che restano ────────────────────
import re
# la riga condivisa: perde .imbarco-v, tiene .porta
uno('.imbarco-v svg .pieno, .porta svg .pieno { fill:var(--gold); stroke:none; }',
    '.porta svg .pieno { fill:var(--gold); stroke:none; }', 'pieno condiviso')
prima = len(s)
s = re.sub(r'^\.imbarco[^{]*\{[^}]*\}\n', '', s, flags=re.M)
s = re.sub(r'^@media \(min-width:840px\)\{ \.imbarco[^\n]*\n', '', s, flags=re.M)
s = s.replace("/* la strip d'imbarco: quattro fatti, onesti */\n", '')
assert '.imbarco' not in s, 'restano regole imbarco: ' + \
    str([l for l in s.split('\n') if '.imbarco' in l])[:200]
a = s.index('.porta svg .pieno')
CSS_A = r'''/* ── LA FASCIA — l'ultima cosa prima del catalogo, e la prima che vende ──
   Regola: un solo oggetto acquistabile, col peso di un titolo; i segnali di
   fiducia tutti visibili (la fiducia non si mette in un carosello); e in
   coda la riga viva, dove l'orologio di Roma sopravvive senza mattonella. */
.fascia { margin-top:clamp(20px,2.4vw,30px); border:1px solid var(--line);
  border-radius:16px; overflow:hidden; background:var(--surface); }

/* il capofila: chi non puo volare a Roma trova qui la sua risposta */
.fa-capo { display:flex; align-items:center; gap:15px; padding:16px 18px;
  border-bottom:1px solid var(--line-0); position:relative;
  background:linear-gradient(100deg, rgba(255,215,0,.075),
    rgba(255,215,0,.012) 62%, transparent);
  transition:background .3s var(--ease); }
.fa-capo:hover { background:linear-gradient(100deg, rgba(255,215,0,.12),
  rgba(255,215,0,.02) 62%, transparent); }
.fa-capo > svg { width:28px; height:28px; flex:none; color:var(--gold);
  fill:none; stroke:currentColor; stroke-width:1.5; stroke-linecap:round;
  stroke-linejoin:round; }
.fa-capo > svg .pieno { fill:var(--gold); stroke:none; }
.fa-testo { flex:1; min-width:0; }
.fa-testo b { display:block; font-family:var(--display); font-size:16.5px;
  font-weight:400; letter-spacing:.005em; color:var(--text); }
.fa-testo span { display:block; margin-top:3px; font-size:12.5px;
  line-height:1.5; color:var(--text-2); }
.fa-agisci { display:inline-flex; align-items:center; gap:9px; flex:none; }
.fa-prezzo { font-family:var(--display); font-size:15px; font-weight:400;
  letter-spacing:.04em; color:#000; background:var(--gold); border-radius:100px;
  padding:7px 14px; font-variant-numeric:tabular-nums; white-space:nowrap; }
.fa-vai { width:32px; height:32px; border-radius:50%; flex:none;
  border:1px solid var(--line); display:inline-flex; align-items:center;
  justify-content:center; color:var(--text-3);
  transition:border-color .28s var(--ease), color .28s var(--ease),
    transform .28s var(--ease); }
.fa-capo:hover .fa-vai { border-color:var(--line-gold-2); color:var(--gold);
  transform:translateX(3px); }
.fa-vai svg { width:13px; height:13px; fill:none; stroke:currentColor;
  stroke-width:1.9; stroke-linecap:round; stroke-linejoin:round; }
@media (max-width:520px){ .fa-capo .fa-vai { display:none; } }

/* i fatti: una risposta per obiezione, tutte visibili */
.fa-fatti { display:grid; grid-template-columns:repeat(2,1fr); gap:1px;
  background:var(--line-0); }
@media (min-width:840px){ .fa-fatti { grid-template-columns:repeat(4,1fr); } }
.fa-f { display:flex; align-items:flex-start; gap:10px; padding:12px 14px;
  background:var(--surface); }
.fa-f svg { width:19px; height:19px; flex:none; margin-top:1px;
  color:var(--gold); fill:none; stroke:currentColor; stroke-width:1.5;
  stroke-linecap:round; stroke-linejoin:round; }
.fa-f svg .acc { opacity:.55; }
.fa-f svg .pieno { fill:var(--gold); stroke:none; }
.fa-f b { display:block; font-size:12.5px; font-weight:500; letter-spacing:.01em;
  line-height:1.35; color:var(--text); }
.fa-f i { display:block; margin-top:2px; font-style:normal; font-size:11px;
  line-height:1.45; color:var(--text-4); }

/* la coda viva: l'ora di Roma e il secondo gancio */
.fa-coda { display:flex; align-items:center; justify-content:space-between;
  gap:14px; flex-wrap:wrap; padding:10px 18px; background:var(--void);
  border-top:1px solid var(--line-0); font-size:11.5px; color:var(--text-4); }
.fa-viva { display:inline-flex; align-items:center; gap:8px; }
.fa-viva .pt { width:6px; height:6px; border-radius:50%; background:var(--green);
  animation:fa-pulsa 2.8s ease-out infinite; }
@keyframes fa-pulsa {
  0%   { box-shadow:0 0 0 0 rgba(0,255,136,.45); }
  70%  { box-shadow:0 0 0 8px rgba(0,255,136,0); }
  100% { box-shadow:0 0 0 0 rgba(0,255,136,0); } }
.orologio-roma { color:var(--gold); font-variant-numeric:tabular-nums;
  letter-spacing:.1em; }
.fa-sec { display:inline-flex; align-items:center; gap:7px; color:var(--text-4);
  transition:color .25s var(--ease); }
.fa-sec b { color:var(--text-2); font-weight:400;
  transition:color .25s var(--ease); }
.fa-sec:hover, .fa-sec:hover b { color:var(--gold); }
@media (max-width:520px){ .fa-coda .fa-sec { display:none; } }
@media (prefers-reduced-motion:reduce){ .fa-viva .pt { animation:none; } }

'''
s = s[:a] + CSS_A + s[a:]

# ── il markup ───────────────────────────────────────────────────────────
i = s.index("  <!-- la strip d'imbarco: quattro fatti veri -->")
j = s.index('</header>', i)
HTML = '''  <!-- la fascia: una cosa da comprare, quattro fatti, la riga viva -->
  <div class="container">
    <div class="fascia coro dentro-subito">

      <a class="fa-capo" href="/virtual-viewing.html">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="6.5"
          width="12" height="11" rx="2"/><path d="M15.5 11l5-2.6v7.2l-5-2.6z"/>
          <circle cx="7.2" cy="10.2" r="1.1" class="pieno"/></svg>
        <span class="fa-testo">
          <b>Can't fly to Rome to see it?</b>
          <span>Be there, without being there — a live video tour of that
            exact flat, HD photos, and the red flags said out loud.</span>
        </span>
        <span class="fa-agisci">
          <span class="fa-prezzo">€89</span>
          <span class="fa-vai" aria-hidden="true"><svg viewBox="0 0 24 24">
            <path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
        </span>
      </a>

      <div class="fa-fatti">
        <div class="fa-f"><svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l7 2.8v5.4c0 4.1-3 7.1-7 8.3-4-1.2-7-4.2-7-8.3V5.8z"/>
          <path d="M8.6 11.6l2.3 2.3 4.3-4.9" class="acc"/></svg>
          <span><b>Walked in person</b><i>Every home video-checked before
            it is listed</i></span></div>
        <div class="fa-f"><svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.6"/><path d="M15.2 8.7a4.4 4.4 0 0
          0-6.3 1.6M8.9 13.7a4.4 4.4 0 0 0 6.3 1.6M6.9 10.8h5.4M6.9 13.2h4.6"
          class="acc"/></svg>
          <span><b>Move-in total, upfront</b><i>Rent, deposit and fee added
            up before you pay a cent</i></span></div>
        <div class="fa-f"><svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>
          <path d="M6.4 14.4h4" class="acc"/>
          <path d="M15.4 14.4l1.6 1.6 3-3.4" class="acc"/></svg>
          <span><b>Stripe · €0 hidden fees</b><i>Receipts on everything,
            refundable until you sign</i></span></div>
        <div class="fa-f"><svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.2l7.6 3v5.4c0 4.4-3.2 7.6-7.6 8.9-4.4-1.3-7.6-4.5-7.6-8.9V6.2z"/>
          <path d="M9.4 11.9h5.2M12 9.3v5.2" class="acc"/></svg>
          <span><b>A licensed agency</b><i>Egidi Immobiliare S.r.l. ·
            BOOM® registered mark</i></span></div>
      </div>

      <div class="fa-coda">
        <span class="fa-viva"><span class="pt"></span>Rome
          <span class="orologio-roma" id="oraRoma">—:—</span>
          · we reply within 2h</span>
        <a class="fa-sec" href="/contract-check-express.html">Already have a
          contract? <b>Have it checked · €49 →</b></a>
      </div>

    </div>
  </div>
'''
s = s[:i] + HTML + s[j:]

assert 'imbarco' not in s, 'residui imbarco'
assert s.count('id="oraRoma"') == 1, 'orologio'
# le porte dei servizi e il footer linkavano gia queste pagine: la fascia
# ne aggiunge una ciascuna, in cima, dove il dubbio e ancora acceso
assert s.count('/virtual-viewing.html') == 3, s.count('/virtual-viewing.html')
assert s.count('/contract-check-express.html') >= 1
assert 'fa-capo' in s and 'fa-fatti' in s and 'fa-coda' in s
open(f, 'w', encoding='utf-8').write(s)
print('v23 · la fascia vende: capofila €89, quattro fatti, coda viva + €49')
