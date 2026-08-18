#!/usr/bin/env python3
# LOTTO 13·C1 — LA HOME CONVERTE: un solo gesto primario, il form che
# conta le case VERE, il PFS detto una volta sola, la fiducia senza eco.
import re, shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, ago, dove):
    assert s.count(ago) == 1, f'{dove}: {s.count(ago)}'

p = leggi('pt.html'); shutil.copy('pt.html', 'pt.html.bakC1')

# ── 1 · un solo gesto primario nell'hero ─────────────────────────────────
# «View Apartments» e il FIND HOMES del form portavano allo STESSO posto a
# 40px di distanza: lo stesso viaggio venduto due volte. Il form E' il
# primario; «How it works» scende nella riga di fiducia come link quieto.
AZIONI = '''      <div class="hero-azioni">
        <a class="btn btn-primary" href="/apartments.html">View Apartments</a>
        <a class="btn btn-secondary" href="COME_URL">How It Works</a>
      </div>
'''
uno(p, AZIONI, 'hero-azioni')
p = p.replace(AZIONI, '')

# ── 2 · la fiducia senza eco ─────────────────────────────────────────────
# «Every euro through BOOM» ripeteva il sub-hero («Every euro through
# Stripe, receipted») nella stessa schermata: la riga ora AGGIUNGE
# (mai a uno sconosciuto · casa camminata) e ospita il link How it works.
FEDE = '''        <span><b>Every euro through BOOM</b> — never to a stranger ·
          every home walked in person</span>'''
uno(p, FEDE, 'fede testo')
p = p.replace(FEDE, '''        <span><b>Never pay a stranger</b> — every home walked in person
          · <a class="hf-come" href="COME_URL">How it works ↓</a></span>''')
uno(p, '.hero-fede span b { color:var(--text-2); font-weight:500; }', 'fede css')
p = p.replace('.hero-fede span b { color:var(--text-2); font-weight:500; }',
    '.hero-fede span b { color:var(--text-2); font-weight:500; }\n'
    '.hero-fede .hf-come { color:var(--gold); text-decoration:none; }\n'
    '.hero-fede .hf-come:hover { text-decoration:underline; }')

# ── 3 · il PFS detto UNA volta ───────────────────────────────────────────
# In home compariva tre volte (porte-eco, Gate 02, sezione radar intera —
# identica a quella della discovery). La sezione radar resta alla
# discovery, dove risponde al catalogo che non basta; qui restano la
# porta e il Gate.
a = p.index('<div class="rete coro" style="margin-top:clamp(22px,2.6vw,34px)">')
depth = 0; j = a
for m in re.finditer(r'<div\b|</div>', p[a:a+20000]):
    depth += 1 if m.group() == '<div' else -1
    if depth == 0:
        j = a + m.end(); break
assert 'radar-colonna' in p[a:j] and 'rete-pfs' in p[a:j], 'blocco rete inatteso'
p = p[:a] + p[j:]
p = p.replace('\n\n\n', '\n\n')

# ── 4 · il bottone del form conta le case, live ──────────────────────────
SUBMIT = "    forma.addEventListener('submit', function (e) {"
uno(p, SUBMIT, 'submit atterro')
CONTA_JS = '''    /* il bottone dice QUANTE case rispondono, prima del click: i dati
       sono gia' in pagina (CONTA = disponibili con prezzo e data), la
       data testo libero passa dal motore condiviso quando c'e' */
    var CONTA = 'CONTA_JSON';
    var bottone = forma.querySelector('.btn');
    var bottoneEti = bottone ? bottone.textContent : '';
    function contaCase() {
      if (!bottone || !Array.isArray(CONTA)) return;
      var b = +document.getElementById('quantoBudget').value || 0;
      var dal = scelta ? iso(scelta) : null;
      if (!b && !dal) { bottone.textContent = bottoneEti; return; }
      var n = CONTA.filter(function (r) {
        if (b && r.p > b) return false;
        if (dal && r.a && window.BOOM_DISPO) {
          try {
            var pa = BOOM_DISPO.parseAvailability(r.a, new Date());
            if (pa && pa.kind === 'date' && pa.iso > dal) return false;
          } catch (err) {}
        }
        return true;
      }).length;
      /* zero non e' mai un vicolo cieco: la porta resta aperta */
      bottone.textContent = n
        ? 'See ' + n + ' home' + (n === 1 ? '' : 's') + ' \\u2192'
        : 'See all homes \\u2192';
    }
    forma.addEventListener('change', contaCase);
    var quandoT = document.getElementById('quandoTesto');
    if (quandoT && 'MutationObserver' in window)
      new MutationObserver(contaCase)
        .observe(quandoT, { childList: true, characterData: true, subtree: true });

'''
p = p.replace(SUBMIT, CONTA_JS + SUBMIT)
scrivi('pt.html', p)

# ── 5 · il builder riempie CONTA ─────────────────────────────────────────
b = leggi('costruisci-portale.py'); shutil.copy('costruisci-portale.py', 'costruisci-portale.py.bakC1')
ANCORA = "h = h.replace('PT_BOARD'"
assert ANCORA in b, 'ancora PT_BOARD'
i = b.index(ANCORA)
i = b.rindex('\n', 0, i) + 1
CONTA_PY = '''# il contatore del form: SOLO disponibili, prezzo e data grezza — la
# lettura della data resta al motore condiviso, in pagina
CONTA = [{'p': int(re.sub(r'[^\\d]', '', str(r['price'])) or 0),
          'a': str(r.get('avail') or '')}
         for r in tutti if r['status'] == 'available'
         and re.sub(r'[^\\d]', '', str(r['price']))]
h = h.replace("'CONTA_JSON'", json.dumps(CONTA))
'''
b = b[:i] + CONTA_PY + b[i:]
scrivi('costruisci-portale.py', b)
print('C1 home: primario unico · fede senza eco · PFS una volta · form che conta')
