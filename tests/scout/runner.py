#!/usr/bin/env python3
"""tests/scout/runner.py — LO SCATTO, la logica pura senza bot né rete.

Importa bot/boom_scout.py via importlib (il modulo non ha effetti al load:
browser e HTTP vivono dentro le funzioni) e guida le funzioni che DECIDONO:
cosa è un annuncio, cosa si dichiara di un inserzionista, cosa si ricorda,
cosa si manda al server. Le mutazioni che contano:
  - senza prova l'inserzionista è 'unknown', MAI 'private' (il server, se il
    campo manca, assume private: un'agenzia spacciata per privato finirebbe
    nel mazzo di un cliente);
  - il payload porta SEMPRE advertiser esplicito e skipFreshHours;
  - il registro locale si pota ma non inventa.

python3 tests/scout/runner.py
"""

import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MOD = os.path.join(HERE, '..', '..', 'bot', 'boom_scout.py')

spec = importlib.util.spec_from_file_location('boom_scout', MOD)
sc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sc)

passed = failed = 0
bad = []


def check(name, cond):
    global passed, failed
    if cond:
        passed += 1
        print('PASS', name)
    else:
        failed += 1
        bad.append(name)
        print('FAIL', name)


NOW = 1_700_000_000.0

# ── estrazione URL: stessi pattern del server ─────────────────────────────
html_immo = ('<a href="/annunci/12345/">casa</a> testo '
             '<a href="https://www.immobiliare.it/annunci/67890/">altra</a> '
             '<a href="/annunci/12345/">duplicato</a>')
urls = sc.extract_listing_urls(html_immo, 'immobiliare')
check('immobiliare: assoluti e relativi, canonici, senza doppioni',
      sorted(urls) == ['https://www.immobiliare.it/annunci/12345/', 'https://www.immobiliare.it/annunci/67890/'])

html_ide = '<a href="/immobile/111/">x</a> https://www.idealista.it/immobile/222/'
urls = sc.extract_listing_urls(html_ide, 'idealista')
check('idealista: canonici', sorted(urls) == ['https://www.idealista.it/immobile/111/', 'https://www.idealista.it/immobile/222/'])
check('portale immobiliare non pesca link idealista', sc.extract_listing_urls(html_ide, 'immobiliare') == [])
big = ' '.join(f'<a href="/annunci/{i}/">.</a>' for i in range(200))
check('tetto a 60 URL per pagina', len(sc.extract_listing_urls(big, 'immobiliare')) == 60)
check('html vuoto → lista vuota, mai un crollo', sc.extract_listing_urls(None, 'immobiliare') == [])

# ── parse_listing: JSON-LD prima, regex poi, MAI inventare ────────────────
ld_html = ('<script type="application/ld+json">'
           '{"@graph":[{"@type":"Organization","name":"Immobiliare.it"},'
           '{"@type":"Apartment","name":"Bilocale Pigneto","offers":{"price":"1.200"},'
           '"floorSize":{"value":"65"},"numberOfRooms":"2","description":"Luminoso"}]}'
           '</script>')
lst = sc.parse_listing(ld_html, 'https://x/1')
check('JSON-LD: pesca il nodo IMMOBILIARE del @graph, non l\'Organization', lst['title'] == 'Bilocale Pigneto')
check('JSON-LD: prezzo dai soli numeri (1.200 → 1200)', lst['price'] == 1200)
check('JSON-LD: mq e camere', lst['sqm'] == 65 and lst['bedrooms'] == 2)

fb_html = '<h1>Trilocale <b>Monti</b></h1> affitto a € 1.850 al mese, 90 m², 3 camere'
lst = sc.parse_listing(fb_html, 'https://x/2')
check('fallback regex: titolo senza tag, prezzo, mq, camere',
      lst['title'] == 'Trilocale Monti' and lst['price'] == 1850 and lst['sqm'] == 90 and lst['bedrooms'] == 3)
lst = sc.parse_listing('<p>niente qui</p>', 'https://x/3')
check('pagina muta: tutto None, MAI inventato', lst['price'] is None and lst['title'] is None)

# ── detect_advertiser: la prova o il dubbio dichiarato ────────────────────
check('ricerca /da-privati/ → private PER COSTRUZIONE',
      sc.detect_advertiser('', 'immobiliare', 'https://www.immobiliare.it/affitto-case/roma/da-privati/?x') == 'private')
check('marker sellerType → quello che dice',
      sc.detect_advertiser('{"sellerType":"private"}', 'immobiliare') == 'private')
check('marker agenzia → agency', sc.detect_advertiser('Agenzia Immobiliare Rossi srl', 'immobiliare') == 'agency')
check('idealista "Professionista" → agency', sc.detect_advertiser('<span>Professionista</span>', 'idealista') == 'agency')
# LA MUTAZIONE CHE CONTA: senza prova NON si dice 'private'.
check('senza prova → unknown, MAI private',
      sc.detect_advertiser('<h1>Bilocale carino</h1>', 'immobiliare') == 'unknown')
check('html vuoto → unknown', sc.detect_advertiser(None, 'immobiliare') == 'unknown')

# ── il registro locale ────────────────────────────────────────────────────
known = {'a': {'ts': NOW - 40 * 86400}, 'b': {'ts': NOW - 5 * 86400}, 'c': 'roba-vecchia'}
pruned = sc.prune_known(known, NOW)
check('prune: il vecchio oltre 30g e il malformato spariscono, il fresco resta',
      'b' in pruned and 'a' not in pruned and 'c' not in pruned)
tanti = {f'u{i}': {'ts': NOW - i} for i in range(500)}
check('prune: il tetto tiene i più recenti', len(sc.prune_known(tanti, NOW, cap=100)) == 100 and 'u0' in sc.prune_known(tanti, NOW, cap=100))

# pending_urls: il contatore np vive nel registro e decide chi si riapre
check('mai visto → da aprire', sc.pending_urls(['u1'], {}) == ['u1'])
check('già ingerito (senza np) → MAI riaperto', sc.pending_urls(['u1'], {'u1': {'ts': NOW}}) == [])
check('senza-prezzo al 1° giro (np 1) → si riprova', sc.pending_urls(['u1'], {'u1': {'ts': NOW, 'np': 1}}) == ['u1'])
check('senza-prezzo esaurito (np 2) → si lascia perdere', sc.pending_urls(['u1'], {'u1': {'ts': NOW, 'np': 2}}) == [])

rows = [{'id': 'a', 'url': 'https://x/a'}, {'id': 'b', 'url': 'https://x/b'}, {'id': 'c', 'url': 'https://x/c'}]
state = {'searches': {'a': {'lastScanAt': NOW - 100}, 'b': {'lastScanAt': NOW - 999}}}
picked = sc.pick_searches(rows, state, cap=2)
check('rotazione: mai-viste prima, poi le più stantie', [s['id'] for s in picked] == ['c', 'b'])
check('senza url non si entra in giro', sc.pick_searches([{'id': 'x'}], {}, cap=5) == [])

# ── il payload verso il server ────────────────────────────────────────────
listing = {'sourceUrl': 'https://www.immobiliare.it/annunci/1/', 'price': 900, 'title': 'Bilo', 'sqm': 50, 'bedrooms': 1, 'images': [], 'description': None}
search = {'portal': 'immobiliare', 'zone': 'pigneto'}
p = sc.build_property_payload(listing, search, 'unknown')
check('payload: advertiser SEMPRE esplicito (mai delegato al default del server)', p['advertiser'] == 'unknown')
check('payload: skipFreshHours per i ri-avvistamenti', p['skipFreshHours'] == 12)
check('payload: la zona pulita della ricerca viaggia', p['zone'] == 'pigneto')
check('payload: i campi vuoti si OMETTONO', 'description' not in p and 'images' not in p)
check('payload: un advertiser fuori vocabolario degrada a unknown',
      sc.build_property_payload(listing, search, 'boh')['advertiser'] == 'unknown')

# ── il rapporto = il battito ──────────────────────────────────────────────
r = sc.build_report(5, 40, 7, 1)
check('rapporto pulito: ok true coi numeri', r == {'ok': True, 'searches': 5, 'found': 40, 'ingested': 7, 'blocked': 1})
r = sc.build_report(0, 0, 0, 0, error='x' * 500)
check('rapporto guasto: ok false, errore clippato a 300', r['ok'] is False and len(r['error']) == 300)

check('captcha → blocked', sc.looks_blocked('https://x/', 'Verifica di sicurezza', '') is True)
check('pagina normale → NON blocked (nel dubbio non si grida)', sc.looks_blocked('https://x/annunci/1/', 'Bilocale', 'affittasi') is False)

print(f'\nLo Scatto: {passed} passed, {failed} failed')
if failed:
    print('FALLITI: ' + ' | '.join(bad))
    sys.exit(1)
