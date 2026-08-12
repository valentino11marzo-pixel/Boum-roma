#!/usr/bin/env python3
# LA HOME CHE RISPONDE — tre cose, nessuna ridondanza:
#   · il GIORNO UNO nel check-in: scegli il budget e l'hero risponde con la
#     forchetta VERA del catalogo (canone + deposito + onorario, esatti) —
#     appare solo quando interagisci, l'hero resta pulito
#   · la FILA DEI FATTI sotto l'hero: i fatti istituzionali veri, scritti
#     una volta sola (S.r.l., marchio UE, registrazione, deposito filmato)
#   · la PRESA in banchina: una barra di servizio sotto le 4 porte — il
#     hold €300 rimborsabile, senza rompere la geometria delle porte
import shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, a, b, nome):
    assert s.count(a) == 1, 'NON TROVATO/DOPPIO: %s (%d)' % (nome, s.count(a))
    return s.replace(a, b)

for f in ('pt.html', 'costruisci-portale.py'):
    shutil.copy(f, f + '.bak')

# ═══ PT.HTML ════════════════════════════════════════════════════════════
s = leggi('pt.html')

# ── la riga del giorno uno, sotto il check-in ───────────────────────────
s = uno(s, """      </form>
      <div class="hero-fede">""",
"""      </form>
      <p class="giorno-uno" id="giornoUno" hidden></p>
      <div class="hero-fede">""", 'riga giorno uno')

# ── la fila dei fatti, subito dopo l'hero ───────────────────────────────
s = uno(s, """</header>

<!-- ══ CASE DELLA SETTIMANA + COME FUNZIONA ══════════════════════════════ -->""",
"""</header>

<!-- ══ LA FILA DEI FATTI — istituzionali, veri, una volta sola ═══════════ -->
<div class="fede-fila" aria-label="Company facts">
  <div class="container fede-int">
    <span>Egidi Immobiliare S.r.l. — licensed Rome agency</span><i></i>
    <span>BOOM® · EU trade mark 019317594</span><i></i>
    <span>Contracts registered with the Agenzia delle Entrate</span><i></i>
    <span>Deposits held — filmed at move-in and move-out</span>
  </div>
</div>

<!-- ══ CASE DELLA SETTIMANA + COME FUNZIONA ══════════════════════════════ -->""",
'fila fatti')

# ── la presa in banchina, sotto le quattro porte ────────────────────────
s = uno(s, """      <div class="ba-cifre">""",
"""      <div class="ba-presa">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M13 2 3 14h7l-1 8 10-12h-7z"/></svg>
        <span class="bp-dice"><b>Already found it in our catalogue?</b>
          Hold it from its page — a refundable <b>€300</b> takes it off the
          market for 48 hours while you decide.</span>
        <a class="bp-vai" href="/apartments.html">Browse the homes →</a>
      </div>

      <div class="ba-cifre">""", 'presa banchina')

# ── il CSS ──────────────────────────────────────────────────────────────
s = uno(s, '</style>', """
/* ══ IL GIORNO UNO NEL CHECK-IN ════════════════════════════════════════ */
.giorno-uno { margin-top:10px; font-size:11.5px; line-height:1.6;
  color:var(--text-4); max-width:56ch; }
.giorno-uno b { color:var(--gold); font-weight:600;
  font-variant-numeric:tabular-nums; }

/* ══ LA FILA DEI FATTI ═════════════════════════════════════════════════ */
.fede-fila { border-top:1px solid var(--line-0);
  border-bottom:1px solid var(--line-0); background:var(--surface); }
.fede-int { display:flex; align-items:center; justify-content:center;
  flex-wrap:wrap; gap:8px 14px; padding:12px 0; }
.fede-int span { font-size:10px; font-weight:600; letter-spacing:.16em;
  text-transform:uppercase; color:var(--text-4); text-align:center;
  line-height:1.5; }
.fede-int i { width:4px; height:4px; border-radius:50%;
  background:var(--line-gold-2); flex:none; }
@media (max-width:640px){
  .fede-int { gap:7px 12px; padding:11px 0; }
  .fede-int i { display:none; } }

/* ══ LA PRESA IN BANCHINA ══════════════════════════════════════════════ */
.ba-presa { display:flex; align-items:center; gap:14px; padding:14px 18px;
  border-top:1px solid var(--line-0); background:var(--void); }
.ba-presa svg { width:20px; height:20px; flex:none; fill:none;
  stroke:var(--gold); stroke-width:1.5; stroke-linecap:round;
  stroke-linejoin:round; }
.bp-dice { flex:1; font-size:12.5px; line-height:1.6; color:var(--text-3); }
.bp-dice b { color:var(--text-2); font-weight:500; }
.bp-vai { flex:none; display:inline-flex; align-items:center;
  min-height:36px; font-size:10.5px; font-weight:600; letter-spacing:.12em;
  text-transform:uppercase; color:var(--gold); padding:0 15px;
  box-shadow:inset 0 0 0 1px var(--line-gold-2); border-radius:100px;
  transition:.25s; }
.bp-vai:hover { background:var(--gold); color:#141005; }
@media (max-width:640px){
  .ba-presa { flex-wrap:wrap; padding:13px 15px; }
  .bp-vai { margin-left:34px; } }
</style>""", 'css home')

# ── il motore del giorno uno, nella coda dello script (fuori dall'onda
#    che la discovery estrae: dopo il marcatore di via()) ────────────────
s = uno(s, """  if (document.readyState === 'complete') setTimeout(cartaRoma, 0);
  else addEventListener('load', function () { setTimeout(cartaRoma, 0); });""",
"""  if (document.readyState === 'complete') setTimeout(cartaRoma, 0);
  else addEventListener('load', function () { setTimeout(cartaRoma, 0); });

  /* il giorno uno, al volo: scegli il budget e l'hero risponde con la
     forchetta VERA del catalogo — canone + deposito + onorario, esatti,
     con la STESSA aritmetica della pagina casa */
  (function () {
    var CASE_G = 'GIORNO_JSON';
    var sel = document.getElementById('quantoBudget'),
        riga = document.getElementById('giornoUno');
    if (!sel || !riga || !CASE_G.length || typeof CASE_G === 'string') return;
    function euro2(n) { return '€' + Math.round(n).toLocaleString('en-US'); }
    sel.addEventListener('change', function () {
      var b = Number(sel.value) || 0;
      if (!b) { riga.hidden = true; return; }
      var giu = b === 1000 ? 0 : b === 1500 ? 1000 : b === 2000 ? 1500 : 2000;
      var dentro = CASE_G.filter(function (x) {
        return x.p > giu && (b === 9999 ? true : x.p <= b); });
      if (!dentro.length) { riga.hidden = true; return; }
      var conti = dentro.map(function (x) {
        return x.p + x.p * x.m + Math.round(x.p * 12 * .10); });
      var minimo = Math.min.apply(null, conti),
          massimo = Math.max.apply(null, conti);
      riga.innerHTML = 'Day one for these homes: <b>' + euro2(minimo)
        + (massimo > minimo ? '\\u2013' + euro2(massimo) : '')
        + '</b> all-in \\u2014 first month + deposit (comes back) + our '
        + 'fee. The exact figure is on every home\\'s page.';
      riga.hidden = false;
    });
  })();""", 'motore giorno uno')
scrivi('pt.html', s)

# ═══ COSTRUISCI-PORTALE.PY ══════════════════════════════════════════════
s = leggi('costruisci-portale.py')
s = uno(s, """h = h.replace("'SKY_JSON'", json.dumps(SKYCASE, ensure_ascii=False))""",
"""GIORNO = []
for r in piene:
    if r.get('status') != 'available': continue
    ide = r.get('_id') or r.get('id')
    if not banca.get(ide): continue
    p = int(re.sub(r'[^\\d]', '', str(r.get('price') or '')) or 0)
    if not p: continue
    m = re.search(r'\\d+', str(r.get('depositMonths') or ''))
    GIORNO.append({'p': p, 'm': int(m.group()) if m else 1})
h = h.replace("'GIORNO_JSON'", json.dumps(GIORNO))
h = h.replace("'SKY_JSON'", json.dumps(SKYCASE, ensure_ascii=False))""",
'giorno json')
scrivi('costruisci-portale.py', s)
print('home: fatta')
