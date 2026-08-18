#!/usr/bin/env python3
# faq.html: il 98% mai misurato esce, la garanzia vera (3 opzioni / 15
# giorni, gia scritta a riga 528) entra ovunque, il 48h diventa capacita.
s = open('/home/user/Boum-roma/faq.html', encoding='utf-8').read()

def sub(old, new):
    global s
    assert s.count(old) == 1, 'non trovato: ' + old[:70]
    s = s.replace(old, new)

sub("with a 98% success rate. Full refund if we don't deliver.",
    "- including off-market homes. Full refund if we don't present at "
    "least 3 matching options within 15 days.")
sub('"48 hours from application approval. Record: 6 hours for emergency relocation."',
    '"As fast as 48 hours from application approval when the home is free; '
    'complex cases usually take about a week."')
sub('Average placement: <strong>8 days</strong> vs. the 45-day market '
    'average. <span class="badge badge-gold">98% success rate</span>',
    'Move-in as fast as <strong>48 hours</strong> from approval. '
    '<span class="badge badge-gold">Full refund if we don\'t deliver</span>')
sub('<span class="badge badge-gold">98% success rate</span> '
    "— if we don't deliver, you pay nothing.",
    '<span class="badge badge-gold">Full refund if we don\'t deliver</span> '
    '— you risk nothing.')
sub('Full refund. 98% success rate, but if we fail, you pay nothing…',
    "Full refund. If we can't present 3 matching options in 15 days, "
    'you pay nothing…')
sub("you get your €350 back — no questions asked. With a <strong>98% "
    "success rate</strong> across hundreds of searches, this almost never "
    "happens. We'd rather refund than disappoint.",
    "you get your €350 back — no questions asked. We'd rather refund "
    'than disappoint.')
assert '98%' not in s, 'faq: resta un 98%'
open('/home/user/Boum-roma/faq.html', 'w', encoding='utf-8').write(s)
print('faq: 98% via, garanzia vera, 48h come capacita')
