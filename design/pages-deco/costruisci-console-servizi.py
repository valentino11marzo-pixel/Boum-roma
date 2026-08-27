#!/usr/bin/env python3
# LE PAGINE SERVIZIO — una fonte sola. Il motore (console_motore.py)
# trasforma ogni pagina «Services 2.0» pristina in una Console; qui
# vivono solo i CONTENUTI: il registro del patto e le obiezioni vere di
# ogni servizio, con la prova che le regge. Cambiare il disegno una
# volta le cambia tutte e sei.
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from console_motore import costruisci

BASE = 'design/pages-deco/'
CSS = open(BASE + 'console.css', encoding='utf-8').read()

# ── i reperti condivisi ──────────────────────────────────────────────────
SALA = open(BASE + 'reperto-sala.html', encoding='utf-8').read()
VERIFICA = open(BASE + 'reperto-verifica.html', encoding='utf-8').read()

PIEDE_PROVE = """
        <p class="footer-prove">
          <a href="https://euipo.europa.eu/eSearch/#details/trademarks/019317594"
            target="_blank" rel="noopener">EU trademark 019317594 ↗</a>
          <a href="https://share.google/xikmVxQCRuKOdWcND" target="_blank"
            rel="noopener">4.9★ on Google · 47 reviews ↗</a>
          <a href="/terms.html">Terms & fees — §4 →</a>
          <span>Card payments via Stripe · never a transfer to an
            individual</span>
        </p>"""


def sheet(testo, sotto, prezzo, dove):
    return (f"""<button class="paybtn" onclick="openSheet('{dove}')">"""
            f"""<span class="lk">🛡</span><span class="tx"><b>{testo}</b>"""
            f"""<small>{sotto}</small></span>"""
            f"""<span class="amt">{prezzo}</span></button>""")


def wa(testo, msg, dove):
    return (f"""<a class="paybtn" href="https://wa.me/393313251961?text={msg}" """
            f"""target="_blank" rel="noopener" """
            f"""onclick="boomTrack('generate_lead',{{channel:'whatsapp',"""
            f"""source_page:'{dove}'}})"><span class="lk">💬</span>"""
            f"""<span class="tx"><b>{testo}</b><small>a human answers within"""
            f""" 2 hours</small></span><span class="amt">→</span></a>""")


def lp(testo, valore, tot=False):
    c = ' tot' if tot else ''
    return (f'<div class="lp{c}"><span class="lp-t">{testo}</span>'
            f'<i class="lp-v">{valore}</i></div>')


PIEDE = 'P.IVA 17322991005 · REA RM-1710623</div>'

VERDETTO_DAS = open(BASE + 'reperto-verdetto.html', encoding='utf-8').read()
CONTO_DAS = open(BASE + 'reperto-conto.html', encoding='utf-8').read()
RITIRO_DAS = open(BASE + 'reperto-ritiro.html', encoding='utf-8').read()

SPEC = {}

# ══ 1 · DEAL ASSISTANCE ═════════════════════════════════════════════════
SPEC['deal-assistance'] = dict(
  base=BASE + 'das-base.html', out='deal-assistance.html', pref='d',
  # «Average client saves €600+» non l'abbiamo mai misurata: non e' una
  # media, e' una speranza. Stava nell'ultima riga prima del tasto paga,
  # cioe' nel punto dove una promessa non dimostrabile costa di piu'.
  sostituzioni=[
    (' Average client saves €600+.', ''),
    ('review in 24h · Stripe · avg saving €600+',
     'review in 24h · Stripe · receipt by email'),
  ],
  piede_ancora=PIEDE,
  registro_eti='The deal, in one breath',
  registro=(lp('You pay <b>€249</b>, once, before you sign.', '− €249')
    + lp('Every page, <b>clause by clause</b>, in plain English.', 'the read')
    + lp('The owner checked against the <b>property registry</b>.', 'included')
    + lp("What's unfair — <b>renegotiated before you sign</b>.", 'included')
    + lp('One bad clause costs <b>months of rent — or your residency</b>.',
         'the risk you remove', True)),
  registro_nota='First pass within 24h · Contract Check €49 credited · Terms §4.3',
  console_h2='Before you hand us a contract,<br><span>ask us anything.</span>',
  console_sotto='The eight questions clients actually ask. <b>Open the ones '
    'you care about</b> — every answer carries its evidence.',
  basta='Enough? <b>Send us the contract.</b>',
  cta_basta=sheet('Get protected', 'pay now · first review within 24h', '€249', 'console'),
  cta_hud="""<button class="hud-vai" onclick="openSheet('hud')">Protect the deal · €249</button>""",
  chiusa_h2='Eleven pages of Italian.<br><span>One read, before you sign.</span>',
  cta_chiusa=sheet('Get protected', 'pay now · first review within 24h · Stripe', '€249', 'close'),
  chiusa_nota='Card via Stripe to Egidi Immobiliare S.r.l. — never a bank '
    'transfer to an individual.',
  righe=[
    ('d1', 'The product', 'What does the contract review cover?', '3',
     'layers checked',
     'Every article, the owner,<br>and the <b>registration setup</b>.',
     ["""We read all of it, clause by clause, and hand it back <b>in plain
        English</b>: what each article means and what it costs you. We flag
        the unfair ones and the missing ones, verify the landlord's identity
        and the property ownership, and check how the lease is being
        registered — the part that decides your residency and your tax
        position."""],
     '', 'The verdict — what we flag', VERDETTO_DAS),
    ('d2', 'The clock', 'How fast is the review?', '24h', 'first pass',
     'First pass within <b>24 hours</b><br>of payment.',
     ["""You pay, you send the draft, we come back with the first read inside
        a day. If your landlord wants an answer by Friday, <b>we work to your
        deadline</b>, not ours — the whole point of this service is that it
        fits inside the window you actually have."""]),
    ('d3', 'The reach', 'I already found a place — can you still help?', 'any',
     'portal · agency · private',
     'That is <b>exactly</b><br>what this is for.',
     ["""Deal Assistance works on the apartment <b>you</b> found — any portal,
        any agency, a private landlord, a friend of a friend. We verify the
        listing, review the contract and negotiate on your behalf. We don't
        need it to be one of ours; we need it to be safe for you."""]),
    ('d4', 'The price', 'Is €249 really worth it?', '€49',
     'your check, credited',
     'Compare it to <b>one bad clause</b>,<br>not to zero.',
     ["""The honest way to judge it is against the exposure, not against
        nothing. An exit penalty is counted in months of rent. A deposit
        above the legal ceiling is money you chase later. A lease that is
        never registered costs you your residency. If you already bought the
        €49 Contract Check, <b>it is credited in full</b> against this."""],
     '<a href="/contract-check-express.html">The €49 check — the fast '
     'verdict <i>→</i></a>', 'The exposure vs the price', CONTO_DAS),
    ('d5', 'The counterpart', 'My accountant can read it — why you?', '6',
     'Rome rules we check',
     "Reading Italian isn't the job.<br><b>Knowing Rome</b> is.",
     ["""A translator gives you the words; an accountant gives you the tax
        line. Neither tells you that the rent can't be attested in that zone,
        that the deposit is over the ceiling, that the transitional form
        needs a documented reason, or that the handover has to be written
        down. These are the six rules that decide whether your year here is
        calm or expensive — and we check them on your draft, one by one."""],
     '', 'What a Rome local checks', SALA),
    ('d6', 'The trap', "It's a standard contract — what could go wrong?",
     '30gg', "to register — or it doesn't exist",
     'There is no such thing<br>as a <b>standard</b> contract.',
     ["""“Standard” usually means a template someone downloaded and edited.
        The most expensive problems are not exotic: the wrong contract type
        for your stay, a registration that never happens, a deposit clause
        that quietly becomes “last month's rent”, repairs pushed onto you.
        Every one of those is legal-looking on the page and costly in the
        year that follows."""],
     '<a href="/blog-scam-bible.html">The patterns we see most <i>→</i></a>'),
    ('d7', 'The trust', "How do I know it isn't a scam?", '€5',
     'the visura that names the owner',
     'Two answers: <b>who they are</b>,<br>and <b>who we are</b>.',
     ["""On their side: we pull the property registry extract — five euros,
        and it names the actual owner — and we verify the identity of whoever
        is renting to you, <b>before</b> a single euro moves.""",
      """On ours: you can check us in thirty seconds. Registered company,
        registered EU trademark, 47 public reviews, and every payment through
        Stripe with a receipt — never a transfer to a person."""],
     '', "Check us, don't trust us", VERIFICA),
    ('d8', 'The handover', 'What do you need from me?', '1', "PDF. That's it.",
     'The draft, the listing,<br>and <b>your deadline</b>.',
     ["""Reply to the confirmation email with the contract as you received it
        — PDF, Word, even photos of the pages. Add the listing link if you
        have one. Then it's our turn: you'll get the read, the flags and the
        negotiation plan, and a human answering your questions until the keys
        are in your hand."""],
     '', 'What to send', RITIRO_DAS),
  ])

# ══ 2 · VIRTUAL VIEWING ═════════════════════════════════════════════════
CHECKLIST = """<div class="verdetto">
      <div class="vd male"><span class="vd-eti">What photos hide</span>
        <h4>The things a listing never shows</h4>
        <ul><li>Damp behind furniture and along the skirting</li>
          <li>Street noise with the windows open</li>
          <li>Which rooms get light, and at what hour</li>
          <li>The real size of the rooms, next to a person</li></ul></div>
      <div class="vd manca"><span class="vd-eti">What we ask on site</span>
        <h4>Questions you'd forget from 2,000 km</h4>
        <ul><li>Heating: what kind, whose bill, how expensive</li>
          <li>Meters, boiler and their last service</li>
          <li>What exactly is included with the furniture</li>
          <li>Building, stairs, lift, bins, neighbours</li></ul></div>
      <div class="vd bene"><span class="vd-eti">What you keep</span>
        <h4>Yours after the call</h4>
        <ul><li>The recorded tour — you directed it</li>
          <li><b>24+ HD photos</b>, not the agency's set</li>
          <li>A condition report and a neighbourhood check</li>
          <li>Our honest recommendation, including what we didn't like</li></ul></div>
    </div>"""

SPEC['virtual-viewing'] = dict(
  base=BASE + 'vv-base.html', out='virtual-viewing.html', pref='v',
  piede_ancora=PIEDE,
  registro_eti='The deal, in one breath',
  registro=(lp('You pay <b>€89</b>, once.', '− €89')
    + lp('I walk the apartment and <b>you direct the call</b>.', 'the visit')
    + lp('24+ HD photos, a condition report, a neighbourhood check.',
         'yours to keep')
    + lp("If we can't reach the property — <b>refunded in full</b>.", '+ €89')
    + lp('You never wire a deposit for a home <b>nobody walked</b>.',
         'the risk you remove', True)),
  registro_nota='Usually within 24–48h · credited to your agency fee if you '
    'rent the home with BOOM',
  console_h2='Before you trust their photos,<br><span>ask us anything.</span>',
  console_sotto='The eight questions clients ask before booking a viewing '
    'they cannot attend. <b>Open the ones you care about.</b>',
  basta='Enough? <b>Send us the listing.</b>',
  cta_basta=sheet('Book the viewing', 'pay now · usually within 24–48h', '€89', 'console'),
  cta_hud="""<button class="hud-vai" onclick="openSheet('hud')">Book the viewing · €89</button>""",
  chiusa_h2='Two thousand kilometres away.<br><span>One honest walk-through.</span>',
  cta_chiusa=sheet('Book the viewing', 'pay now · usually within 24–48h · Stripe', '€89', 'close'),
  chiusa_nota='Card via Stripe to Egidi Immobiliare S.r.l. — never a bank '
    'transfer to an individual.',
  righe=[
    ('v1', 'The product', 'What exactly do I receive?', '4', 'things you keep',
     'A live tour <b>you direct</b>,<br>and everything after it.',
     ["""A live video tour where you point and we look — then <b>24+ HD
        photos</b>, a condition report, a neighbourhood check and our honest
        recommendation, <b>including what we didn't like</b>. The call is
        recorded and it's yours."""],
     '', 'What a camera catches — and what it hides', CHECKLIST),
    ('v2', 'The clock', 'How fast can you do a viewing?', '48h',
     'usually 24–48',
     'Usually within <b>24–48 hours</b><br>of payment.',
     ["""We schedule directly with the landlord or the agency. If the flat is
        moving fast, say so when you book — we push for the first slot
        available, because the good ones do not wait."""]),
    ('v3', 'The reach', 'Does it work for apartments not listed on BOOM?',
     'any', 'portal · agency · private',
     'Any apartment in Rome.<br><b>Send the link.</b>',
     ["""Immobiliare, Idealista, Facebook, an agency window, a friend of a
        friend — it doesn't matter where you found it. Send us the link or
        the address and we take it from there."""]),
    ('v4', 'The house rule', 'Is this for apartments listed on BOOM?', '€0',
     'for our own homes',
     'For ours it is <b>free</b>.<br>Always.',
     ["""Live video tours of BOOM's own homes cost nothing — just ask from
        any listing page. This service exists for the apartments you found
        <b>somewhere else</b>, where nobody is on your side yet."""]),
    ('v5', 'The tools', 'Which platforms do you use?', '0', 'apps to install',
     'Zoom, WhatsApp or FaceTime.<br><b>Whatever you already have.</b>',
     ["""Whatever is easiest for you, from anywhere in the world. The call is
        recorded and the recording is yours — to watch again, or to show the
        person who is paying the deposit with you."""]),
    ('v6', 'The verdict', "What if the apartment isn't good?", '✓',
     'we say so, with reasons',
     'Then we tell you.<br><b>With reasons.</b>',
     ["""We are not there to sell you the flat — we are there to look at it
        for you. If it is damp, dark, noisy or simply smaller than the photos
        suggest, that is what the report says. <b>€89 spent beats a deposit
        committed.</b>"""]),
    ('v7', 'The guarantee', "What if you can't reach the property?", '100%',
     'refunded, no questions',
     'Full refund.<br><b>No questions.</b>',
     ["""If the advertiser goes silent or the visit cannot happen, the €89
        comes back. And if you later rent that home through BOOM, the €89 is
        <b>credited to your agency fee</b> — so it is never money spent
        twice."""]),
    ('v8', 'The alternative', 'Why not just send a friend?', '6',
     'Rome rules we check',
     'A friend sees a flat.<br>We see <b>a contract coming</b>.',
     ["""A friend can tell you if the kitchen is nice. They will not ask who
        actually owns it, whether that rent can be attested in that zone,
        what the heating really costs, or whether the contract type fits your
        stay. We look at the apartment <b>and</b> at the deal behind it."""],
     '', 'What a Rome local checks', SALA),
  ])

# ══ 3 · CONTRACT CHECK EXPRESS ══════════════════════════════════════════
SEMAFORO = """<div class="verdetto">
      <div class="vd bene"><span class="vd-eti">● Green</span>
        <h4>Sign it</h4>
        <ul><li>Nothing unfair, nothing missing</li>
          <li>The registration setup is correct</li>
          <li>You know exactly what you're agreeing to</li></ul></div>
      <div class="vd manca"><span class="vd-eti">● Amber</span>
        <h4>Negotiate these points</h4>
        <ul><li>The exact clauses to push back on</li>
          <li>What to ask for instead — in writing</li>
          <li>What it costs you if you sign as is</li></ul></div>
      <div class="vd male"><span class="vd-eti">● Red</span>
        <h4>Walk away</h4>
        <ul><li>What makes it unsafe, in plain English</li>
          <li>What would have to change for it to work</li>
          <li>Better one lost flat than one lost year</li></ul></div>
    </div>"""

SPEC['contract-check-express'] = dict(
  base=BASE + 'cce-base.html', out='contract-check-express.html', pref='c',
  piede_ancora=PIEDE,
  registro_eti='The deal, in one breath',
  registro=(lp('You pay <b>€49</b>, once.', '− €49')
    + lp('A written verdict <b>within 24 hours</b>.', 'the read')
    + lp('Green, amber or red — with <b>every flagged clause explained</b>.',
         'in plain English')
    + lp('If you upgrade to Deal Assistance — <b>credited in full</b>.',
         '+ €49')
    + lp('The cheapest way to <b>not sign something stupid</b>.',
         'the risk you remove', True)),
  registro_nota='24 hours from when we receive the contract · credited on '
    'Deal Assistance · Terms §4.3',
  console_h2='Before you sign it tomorrow,<br><span>ask us anything.</span>',
  console_sotto='Six questions, six straight answers. <b>Open the ones you '
    'care about</b> — the verdict itself is below.',
  basta='Enough? <b>Send the contract.</b>',
  cta_basta=sheet('Get the verdict', 'pay now · written verdict within 24h', '€49', 'console'),
  cta_hud="""<button class="hud-vai" onclick="openSheet('hud')">Get the verdict · €49</button>""",
  chiusa_h2='They want an answer by tomorrow.<br><span>You want to know what you\'re signing.</span>',
  cta_chiusa=sheet('Get the verdict', 'pay now · written verdict within 24h · Stripe', '€49', 'close'),
  chiusa_nota='Card via Stripe to Egidi Immobiliare S.r.l. — never a bank '
    'transfer to an individual.',
  righe=[
    ('c1', 'The product', 'What exactly do I get for €49?', '3',
     'green · amber · red',
     'A written verdict<br><b>within 24 hours</b>.',
     ["""Green means sign it. Amber means negotiate these points — and we
        name them. Red means walk away, and we say why. Every flagged clause
        comes explained in plain English: what it means, and what it costs
        you if you leave it there."""],
     '', 'The three verdicts', SEMAFORO),
    ('c2', 'The clock', 'My landlord wants an answer tomorrow — is 24h real?',
     '24h', 'from when we get it',
     'Yes. <b>Usually faster.</b>',
     ["""Twenty-four hours from when the contract reaches us, and most come
        back sooner. Tell us your deadline when you pay and we work to it —
        the whole product exists because Roman landlords ask for answers by
        Friday."""]),
    ('c3', 'The language', 'What if the contract is in Italian?', 'IT→EN',
     'read there, reported here',
     'They almost always are.<br><b>That is the point.</b>',
     ["""We read it in Italian — the version that will actually bind you —
        and report back in clear English. Not a machine translation of the
        words: a human reading of what the words do."""]),
    ('c4', 'The ladder', 'How is this different from Deal Assistance?',
     '€249', 'the full service',
     'Express is the <b>read</b>.<br>Deal Assistance is the <b>work</b>.',
     ["""Express gives you the verdict, fast. Deal Assistance (€249) adds
        landlord and ownership verification plus the negotiation done for
        you — and <b>your €49 is credited in full</b> if you upgrade. Start
        cheap, escalate only if the verdict says you should."""],
     '<a href="/deal-assistance.html">Deal Assistance — the full '
     'service <i>→</i></a>'),
    ('c5', 'The free one', 'How is this different from the free contract check?',
     '1', 'human, not a checklist',
     'The free check is a <b>checklist</b>.<br>This is a <b>person</b>.',
     ["""Our free check covers the basics anyone should look at. Express is
        a human reading <b>your</b> actual contract, clause by clause, with a
        written verdict in 24 hours — the difference between “these are the
        usual traps” and “this is what is in your document”."""]),
    ('c6', 'The trap', "It looks standard — what could go wrong?", '30gg',
     "to register — or it doesn't exist",
     'There is no such thing<br>as a <b>standard</b> contract.',
     ["""The expensive problems are never exotic: the wrong contract type for
        your stay, a registration that never happens, a deposit that quietly
        becomes “last month's rent”, repairs pushed onto you. All of it looks
        perfectly normal on the page."""],
     '<a href="/blog-scam-bible.html">The patterns we see most <i>→</i></a>',
     'What a Rome local checks', SALA),
  ])

# ══ 4 · DEPOSIT RECOVERY ════════════════════════════════════════════════
LEGGE = """<div class="clausola-box"><div class="verdetto">
      <div class="vd bene"><span class="vd-eti">Art. 1590 c.c.</span>
        <h4>What the law actually says</h4>
        <ul><li>The deposit must be returned at the end of the lease</li>
          <li>Deductions only for <b>documented</b> damage beyond normal
            wear, or unpaid rent</li>
          <li>Itemised and proven — silence and vague claims are
            <b>not legal grounds</b></li></ul></div>
      <div class="vd manca"><span class="vd-eti">What they usually say</span>
        <h4>The three lines we hear every week</h4>
        <ul><li>“There were damages” — with no list and no photos</li>
          <li>“It covers the cleaning” — with no invoice</li>
          <li>Nothing at all: they stop answering</li></ul></div>
      <div class="vd male"><span class="vd-eti">What decides it</span>
        <h4>Paper beats memory</h4>
        <ul><li>The handover record with meter readings and photos</li>
          <li>The contract clause on how the deposit comes back</li>
          <li>A formal demand citing the right article, sent properly</li></ul></div>
    </div></div>"""

SPEC['deposit-recovery'] = dict(
  base=BASE + 'dr-base.html', out='deposit-recovery.html', pref='r',
  piede_ancora=PIEDE,
  registro_eti='The deal, in one breath',
  registro=(lp('You pay <b>€99</b> to start.', '− €99')
    + lp('Case assessment and a <b>formal demand</b> under art. 1590 c.c.',
         'the letter')
    + lp('Negotiation with the landlord — and the escalation path if needed.',
         'the work')
    + lp('<b>20% only on what actually comes back.</b>', 'success fee')
    + lp('If nothing is recovered, <b>you never pay the 20%</b>.',
         'our interests, aligned', True)),
  registro_nota='Most cases resolve within 2–6 weeks of the formal demand · '
    'everything handled remotely',
  console_h2='They kept your money.<br><span>Ask us anything.</span>',
  console_sotto='Six questions from people who have already been told no. '
    '<b>Open the ones you care about.</b>',
  basta='Enough? <b>Let us send the demand.</b>',
  cta_basta=sheet('Start the recovery', 'pay now · €99 + 20% only on what comes back', '€99', 'console'),
  cta_hud="""<button class="hud-vai" onclick="openSheet('hud')">Start the recovery · €99</button>""",
  chiusa_h2='Your deposit is not a tip.<br><span>Ask for it properly.</span>',
  cta_chiusa=sheet('Start the recovery', 'pay now · success fee only on recovered money', '€99', 'close'),
  chiusa_nota='Card via Stripe to Egidi Immobiliare S.r.l. — the 20% applies '
    'only to money actually recovered.',
  righe=[
    ('r1', 'The law', 'Can a landlord in Italy keep my deposit?', '1590',
     'the article that answers',
     'Only for <b>documented</b> damage.<br>Not for silence.',
     ["""Under art. 1590 of the civil code the deposit goes back at the end
        of the lease. Deductions are allowed for damage beyond normal wear or
        unpaid rent — <b>itemised and proven</b>. “There were damages” with no
        list, no photos and no invoice is not a legal ground; it is a
        negotiating position."""],
     '', 'The law, what they say, and what decides it', LEGGE),
    ('r2', 'The work', 'What do you actually do?', '3',
     'demand · negotiation · escalation',
     'We put it <b>in writing</b>,<br>in the right words.',
     ["""We assess your position, send a formal demand — PEC or registered
        letter — citing the correct law, and negotiate with the landlord or
        the agency. If it does not settle, we prepare the file for a partner
        lawyer. <b>Most cases settle before that</b>, because a proper demand
        changes the conversation."""]),
    ('r3', 'The price', 'How does the €99 + 20% work?', '20%',
     'only on what comes back',
     '€99 starts it.<br>The rest <b>only if you win</b>.',
     ["""The €99 covers the assessment and the formal demand. The 20% success
        fee applies <b>only to money actually recovered</b> — if nothing comes
        back, you never pay it. That is the whole point: we get paid more only
        when you get paid."""]),
    ('r4', 'The clock', 'How long does recovery take?', '2–6',
     'weeks, most cases',
     'Most cases resolve in<br><b>two to six weeks</b>.',
     ["""Counted from the formal demand, not from your first email. Some
        landlords pay within days of receiving a letter that cites the right
        article; some need the negotiation. We will not promise you a date —
        we will tell you where your case stands, every step."""]),
    ('r5', 'The distance', 'I already left Italy — can you still help?', '0',
     'flights needed',
     'Yes. <b>All of it remotely.</b>',
     ["""Documents by email, we act in Italy on your behalf, recovered funds
        arrive by bank transfer. Being outside the country is the normal case
        here, not the exception — it is usually <b>why</b> the landlord
        thought the money would never be asked for."""]),
    ('r6', 'The counterclaim', 'The landlord says I damaged the flat.', '1',
     'document decides it',
     'Then it has to be<br><b>proven</b>, not stated.',
     ["""Damage beyond normal wear must be itemised, documented and costed —
        photos, an invoice, a comparison with the state of the flat when you
        moved in. That is exactly why the handover record matters: with a
        signed one, this argument ends quickly. Without it, it becomes your
        word against theirs — and we work with what exists."""],
     '', 'The rules that decide these cases', SALA),
  ])

# ══ 5 · REMOTE MOVE PACK ════════════════════════════════════════════════
DENTRO = """<div class="verdetto">
      <div class="vd bene"><span class="vd-eti">Included</span>
        <h4>Two live video viewings</h4>
        <ul><li>You direct each call, we walk the flat</li>
          <li>HD photos and an honest report for each</li>
          <li>Scheduled across your time zone</li></ul></div>
      <div class="vd bene"><span class="vd-eti">Included</span>
        <h4>Full Deal Assistance on the one you choose</h4>
        <ul><li>Clause-by-clause review in English</li>
          <li>Landlord and ownership verification</li>
          <li>Negotiation done for you</li></ul></div>
      <div class="vd bene"><span class="vd-eti">Included</span>
        <h4>Arrival setup</h4>
        <ul><li>Utilities in your name</li>
          <li>The paperwork chain that follows the contract</li>
          <li>A human answering until the keys are yours</li></ul></div>
    </div>"""

SPEC['remote-move-pack'] = dict(
  base=BASE + 'rmp-base.html', out='remote-move-pack.html', pref='m',
  piede_ancora=PIEDE,
  registro_eti='The deal, in one breath',
  registro=(lp('You pay <b>€299</b>, once.', '− €299')
    + lp('<b>Two live video viewings</b> — you direct them.', 'included')
    + lp('Full contract review, verification and <b>negotiation</b>.',
         'included')
    + lp('Arrival setup, so the flat works the day you land.', 'included')
    + lp('You land with <b>keys</b>, not with appointments.',
         'the risk you remove', True)),
  registro_nota='Book 4–8 weeks before you land · credited toward your agency '
    'fee if you rent a BOOM home',
  console_h2='You are not in Italy yet.<br><span>Ask us anything.</span>',
  console_sotto='Six questions from people closing a home from 2,000 km away. '
    '<b>Open the ones you care about.</b>',
  basta='Enough? <b>Send your dates.</b>',
  cta_basta=sheet('Get the pack', 'pay now · first viewing usually within 48h', '€299', 'console'),
  cta_hud="""<button class="hud-vai" onclick="openSheet('hud')">Get the pack · €299</button>""",
  chiusa_h2='Land on a Monday.<br><span>Sleep in your own place that night.</span>',
  cta_chiusa=sheet('Get the pack', 'pay now · two viewings + full contract work', '€299', 'close'),
  chiusa_nota='Card via Stripe to Egidi Immobiliare S.r.l. — never a bank '
    'transfer to an individual.',
  righe=[
    ('m1', 'The product', 'What exactly is included?', '3',
     'viewings · contract · arrival',
     'Two viewings, one contract,<br>and <b>the landing</b>.',
     ["""Two live video viewings with HD photos and an honest report each,
        then full Deal Assistance on the home you choose — clause-by-clause
        review in English, landlord and ownership verification, negotiation —
        plus arrival setup so the place works the day you get there."""],
     '', "What's in the pack", DENTRO),
    ('m2', 'The timing', 'When should I book the Remote Move Pack?', '4–8',
     'weeks before you land',
     'Four to eight weeks out.<br><b>September fills first.</b>',
     ["""Once you send a shortlist, the first live viewing is usually
        scheduled within 48 hours. Book earlier if you are arriving in
        September: that is when Rome's good supply disappears fastest, and no
        service can conjure a flat that is already gone."""]),
    ('m3', 'The start', "I haven't found apartments yet — can I still buy it?",
     'yes', 'we point you to live listings',
     'Yes. <b>Send budget, zones, dates.</b>',
     ["""We point you to live listings — from the portals and from BOOM's own
        verified homes — and the viewings and contract work then apply to
        whichever homes you pick. If you would rather we ran the whole hunt,
        that is Property Finding, and it is a different product."""],
     '<a href="/property-finding">Property Finding — we hunt for '
     'you <i>→</i></a>'),
    ('m4', 'The failure', 'What if the first apartment fails the check?', '2',
     'viewings — use them',
     'Then it <b>did its job</b>.',
     ["""You just avoided a bad deal from two thousand kilometres away. We
        tell you honestly, and the contract review moves to the next home:
        <b>the pack covers the one you actually sign for</b>, not the first
        one you liked."""]),
    ('m5', 'The audience', 'Is this for students?', '4',
     'JCU · LUISS · AUR · Sapienza',
     'Perfect for students —<br>and for <b>parents abroad</b>.',
     ["""We schedule viewings across time zones and copy your parents on the
        report if you want them to see what you saw. Most of the anxiety in a
        remote move is not the flat: it is the person paying the deposit not
        being able to look at it."""]),
    ('m6', 'The refund', 'What is the refund policy?', '100%',
     'on a viewing we cannot deliver',
     'A viewing we cannot deliver<br>is <b>refunded</b>.',
     ["""If an advertiser is unreachable and the visit cannot happen, that
        part comes back. And if you rent one of BOOM's own homes, the €299 is
        <b>credited toward your agency fee</b>."""],
     '<a href="/terms.html" target="_blank" rel="noopener">Our terms, '
     'in writing <i>→</i></a>', "Check us, don't trust us", VERIFICA),
  ])

# ══ 6 · CONCIERGE ═══════════════════════════════════════════════════════
LISTINO = """<div class="verdetto">
      <div class="vd bene"><span class="vd-eti">Single tasks</span>
        <h4>Pick exactly what you need</h4>
        <ul><li>SIM setup — <b>€40</b></li>
          <li>Healthcare enrollment — <b>€120</b></li>
          <li>Visa support — <b>€200</b></li>
          <li>Other tasks from <b>€15</b></li></ul></div>
      <div class="vd manca"><span class="vd-eti">Packs</span>
        <h4>The ones people take together</h4>
        <ul><li>Move-in Pack — <b>€149</b>: electricity, gas, internet,
            residency guide</li>
          <li>Cleaning Premium — <b>€119</b>: deep clean the day before
            move-in</li></ul></div>
      <div class="vd bene"><span class="vd-eti">Full landing</span>
        <h4>Everything, from abroad</h4>
        <ul><li>Codice fiscale, utilities, SIM, registrations</li>
          <li>Typically starts around <b>€390</b></li>
          <li>Quoted per move — you see the list before you pay</li></ul></div>
    </div>"""

WA_MSG = 'Hi!%20I%27d%20like%20a%20Concierge%20quote.'
SPEC['concierge'] = dict(
  base=BASE + 'con-base.html', out='concierge.html', pref='g',
  hud_eti='Your progress and the way to reach us',
  piede_ancora=PIEDE,
  registro_eti='How this works, in one breath',
  registro=(lp('You pay <b>per task or per move</b>.', 'no subscription')
    + lp('Single tasks from <b>€15</b> — SIM €40, healthcare €120.',
         'à la carte')
    + lp('A full landing — codice fiscale, utilities, SIM, registrations.',
         'from ~€390')
    + lp('Every appointment, form and phone call <b>translated</b>.',
         'included')
    + lp('You pay for <b>what you take</b>. Nothing else.', 'the whole rule',
         True)),
  registro_nota='A human answers on WhatsApp within 2 hours · dedicated '
    'contact for your first month',
  console_h2='Before you spend a month in queues,<br><span>ask us anything.</span>',
  console_sotto='Six questions about what this actually costs and covers. '
    '<b>Open the ones you care about.</b>',
  basta='Enough? <b>Tell us what you need.</b>',
  cta_basta=wa('Get a quote', WA_MSG, 'concierge'),
  cta_hud=wa('Get a quote', WA_MSG, 'concierge').replace('class="paybtn"', 'class="hud-vai"'),
  chiusa_h2='Land on Monday.<br><span>Live by Friday.</span>',
  cta_chiusa=wa('Get a quote', WA_MSG, 'concierge'),
  chiusa_nota='No subscription, no retainer — you pay per task or per move.',
  righe=[
    ('g1', 'The price', 'How does Concierge pricing work?', '€15',
     'the smallest task',
     'Per task or per move.<br>You pay for <b>what you use</b>.',
     ["""Single tasks start at €15; a typical full landing — codice fiscale,
        utilities, SIM, registrations — starts around €390. You see the list
        before you pay, and nothing renews: there is no subscription and no
        retainer."""],
     '', 'The menu, in the open', LISTINO),
    ('g2', 'The paperwork', 'Can you get my codice fiscale before I arrive?',
     '0', 'flights needed',
     'Yes — <b>before you land</b>.',
     ["""With a simple power of attorney we obtain it remotely, so the bank,
        the contract and the SIM are ready on day one. It is the single piece
        of paper that unlocks everything else in Italy, and the one that
        strands people for weeks when it is missing."""]),
    ('g3', 'The language', 'Do I need to speak Italian for any of this?', '0',
     'Italian required',
     'No. <b>That is the service.</b>',
     ["""We translate every appointment, every form and every phone call. Not
        the words on a page — the actual conversation at the counter, where a
        missing document sends you home and back again."""]),
    ('g4', 'The scope', 'What if I only need one thing?', '1',
     'task is enough',
     'Perfect. <b>Take one.</b>',
     ["""Every task on the menu is bookable alone: SIM setup €40, healthcare
        enrollment €120, visa support €200. Pick exactly what you need and
        nothing more — the packs exist because people often want several, not
        because you have to."""]),
    ('g5', 'The speed', 'How fast do you respond?', '2h',
     'on WhatsApp, every day',
     'A human, <b>within two hours</b>.',
     ["""On WhatsApp, every day. For your first month in Rome you have a
        dedicated contact — the same person, not a queue — because the first
        month is when everything breaks at once."""]),
    ('g6', 'The value', 'Is this a luxury or do I actually need it?', '6',
     'Rome rules behind the queues',
     'Depends on <b>one question</b>:<br>how much is your time worth?',
     ["""If you have weeks, patience and some Italian, you can do most of it
        yourself — we will even tell you how. If you have a job starting
        Monday, the maths is different. And some of it is not about time at
        all: the rules below decide whether your paperwork chain holds
        together."""],
     '', 'What a Rome local knows', SALA),
  ])


# ── esecuzione ───────────────────────────────────────────────────────────
if __name__ == '__main__':
    quali = sys.argv[1:] or list(SPEC)
    for slug in quali:
        spec = SPEC[slug]
        out = costruisci(spec, CSS, PIEDE_PROVE)
        open(spec['out'], 'w', encoding='utf-8').write(out)
        print(f"{spec['out']:32s} {len(out)//1024:4d} KB · "
              f"{len(spec['righe'])} obiezioni")
