# -*- coding: utf-8 -*-
# LA TESTA DI PARITA — tutto cio che le pagine live possiedono e che il
# cablaggio non deve perdere: gtag, icone/manifest, robots, twitter, og
# completi e i JSON-LD (RealEstateAgent, WebSite+SearchAction,
# LocalBusiness, FAQPage, CollectionPage, Breadcrumb). Estratti dalle
# pagine live 2026-08-13; UNICA correzione: il telefono segnaposto
# +39 333 123 4567 / wa.me/393331234567 delle vecchie teste diventa il
# numero VERO usato in tutto il sito (wa.me/393313251961).
import json

GTAG = (
    '<script async src="https://www.googletagmanager.com/gtag/js?id=G-EYCD59RDVJ"></script>\n'
    '<script>window.dataLayer=window.dataLayer||[];'
    'function gtag(){dataLayer.push(arguments);}'
    "gtag('js', new Date());gtag('config','G-EYCD59RDVJ');</script>")

ICONE = (
    '<link rel="icon" href="/favicon.ico" sizes="any">\n'
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n'
    '<link rel="icon" href="/favicon-32x32.png" sizes="32x32" type="image/png">\n'
    '<link rel="icon" href="/favicon-16x16.png" sizes="16x16" type="image/png">\n'
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n'
    '<link rel="manifest" href="/site.webmanifest">')

ROBOTS = (
    '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">\n'
    '<meta name="googlebot" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">\n'
    '<meta name="author" content="BOOM Rome">\n'
    '<meta name="publisher" content="BOOM Rome">\n'
    '<meta name="theme-color" content="#030303">\n'
    '<meta name="color-scheme" content="dark">\n'
    '<meta name="format-detection" content="telephone=no">\n'
    '<meta name="application-name" content="BOOM Rome">\n'
    '<meta name="apple-mobile-web-app-title" content="BOOM">\n'
    '<meta name="msapplication-TileColor" content="#030303">\n'
    '<link rel="dns-prefetch" href="https://www.googletagmanager.com">\n'
    '<link rel="dns-prefetch" href="https://www.google-analytics.com">')

IMG_SOCIAL = 'https://www.boomrome.com/BOOMsocialprofile.png'

def _og(titolo, descr, url, immagine=IMG_SOCIAL):
    return (
        '<link rel="canonical" href="' + url + '">\n'
        '<meta property="og:type" content="website">\n'
        '<meta property="og:site_name" content="BOOM Rome">\n'
        '<meta property="og:locale" content="en_US">\n'
        '<meta property="og:locale:alternate" content="it_IT">\n'
        '<meta property="og:title" content="' + titolo + '">\n'
        '<meta property="og:description" content="' + descr + '">\n'
        '<meta property="og:url" content="' + url + '">\n'
        '<meta property="og:image" content="' + immagine + '">\n'
        '<meta property="og:image:secure_url" content="' + immagine + '">\n'
        '<meta property="og:image:type" content="image/png">\n'
        '<meta property="og:image:width" content="1200">\n'
        '<meta property="og:image:height" content="630">\n'
        '<meta property="og:image:alt" content="' + titolo + '">\n'
        '<meta name="twitter:card" content="summary_large_image">\n'
        '<meta name="twitter:site" content="@boomrome">\n'
        '<meta name="twitter:creator" content="@boomrome">\n'
        '<meta name="twitter:title" content="' + titolo + '">\n'
        '<meta name="twitter:description" content="' + descr + '">\n'
        '<meta name="twitter:image" content="' + immagine + '">\n'
        '<meta name="twitter:image:alt" content="' + titolo + '">')

def _ld(*oggetti):
    return '\n'.join(
        '<script type="application/ld+json">'
        + json.dumps(o, ensure_ascii=False).replace('<', '\\u003c')
        + '</script>' for o in oggetti)

AGENZIA = {
    '@context': 'https://schema.org', '@type': 'RealEstateAgent',
    '@id': 'https://www.boomrome.com/#organization',
    'name': 'BOOM Rome', 'legalName': 'Egidi Immobiliare S.r.l.',
    'url': 'https://www.boomrome.com',
    'logo': {'@type': 'ImageObject',
             'url': 'https://www.boomrome.com/android-chrome-512x512.png',
             'width': 512, 'height': 512},
    'image': IMG_SOCIAL,
    'description': 'Premium mid-term apartment rentals in Rome with full '
                   'property management, legal contracts, and 48-hour move-in.',
    'sameAs': ['https://www.instagram.com/boomrome',
               'https://www.linkedin.com/company/boomrome',
               'https://wa.me/393313251961'],
    'address': {'@type': 'PostalAddress', 'addressLocality': 'Rome',
                'addressRegion': 'Lazio', 'addressCountry': 'IT'},
    'areaServed': {'@type': 'City', 'name': 'Rome'},
    'priceRange': '€€-€€€',
}

SITO_WEB = {
    '@context': 'https://schema.org', '@type': 'WebSite',
    '@id': 'https://www.boomrome.com/#website',
    'url': 'https://www.boomrome.com', 'name': 'BOOM Rome',
    'publisher': {'@id': 'https://www.boomrome.com/#organization'},
    'potentialAction': {
        '@type': 'SearchAction',
        'target': {'@type': 'EntryPoint',
                   'urlTemplate': 'https://www.boomrome.com/apartments?q={search_term_string}'},
        'query-input': 'required name=search_term_string'},
    'inLanguage': ['en', 'it'],
}

NEGOZIO = {
    '@context': 'https://schema.org', '@type': 'LocalBusiness',
    '@id': 'https://www.boomrome.com/#localbusiness',
    'name': 'BOOM Rome', 'image': IMG_SOCIAL,
    'url': 'https://www.boomrome.com', 'telephone': '+39 331 325 1961',
    'priceRange': '€€-€€€',
    'address': {'@type': 'PostalAddress', 'addressLocality': 'Rome',
                'addressRegion': 'Lazio', 'addressCountry': 'IT'},
    'geo': {'@type': 'GeoCoordinates', 'latitude': 41.9028,
            'longitude': 12.4964},
    'openingHoursSpecification': [
        {'@type': 'OpeningHoursSpecification',
         'dayOfWeek': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
         'opens': '09:00', 'closes': '19:00'},
        {'@type': 'OpeningHoursSpecification', 'dayOfWeek': ['Saturday'],
         'opens': '10:00', 'closes': '14:00'}],
    'aggregateRating': {'@type': 'AggregateRating',
                        'ratingValue': '4.9', 'reviewCount': '127'},
}

FAQ_HOME = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    'mainEntity': [
        {'@type': 'Question',
         'name': 'How fast can I move into a BOOM apartment in Rome?',
         'acceptedAnswer': {'@type': 'Answer', 'text':
            'Most BOOM tenants move in within 48 hours of signing. Some '
            'apartments are available same-day; complex cases (visa, '
            'multi-document onboarding) average 7 days.'}},
        {'@type': 'Question', 'name': 'Does BOOM charge broker fees?',
         'acceptedAnswer': {'@type': 'Answer', 'text':
            'BOOM charges one flat agency fee, written into your '
            'pre-agreement before a single euro moves — no hidden extras. '
            'The optional Property Finding Service is a flat €350, deducted '
            'from the agency fee on success and refunded if we don\'t '
            'deliver.'}},
        {'@type': 'Question', 'name': 'What contracts does BOOM use in Rome?',
         'acceptedAnswer': {'@type': 'Answer', 'text':
            'Fully legal Italian contracts — transitorio (1–18 months), '
            'rent-controlled 3+2 and student formats. Every contract is '
            'registered with the Agenzia delle Entrate.'}},
        {'@type': 'Question',
         'name': 'Can I view a Rome apartment remotely before signing?',
         'acceptedAnswer': {'@type': 'Answer', 'text':
            'Yes. Live video viewings of BOOM homes are free — you ask the '
            'questions, we walk the flat. You can sign remotely from your '
            'phone with the Magic Sign system.'}},
        {'@type': 'Question',
         'name': 'Do I need a codice fiscale to rent in Rome?',
         'acceptedAnswer': {'@type': 'Answer', 'text':
            'Yes — every legal rental contract in Italy requires a codice '
            'fiscale. BOOM helps tenants obtain one in 24–48 hours as part '
            'of onboarding.'}}],
}

def blocco_home(titolo, descr):
    return (_og(titolo, descr, 'https://www.boomrome.com/') + '\n'
            + ROBOTS + '\n' + ICONE + '\n' + GTAG + '\n'
            + _ld(AGENZIA, SITO_WEB, NEGOZIO, FAQ_HOME))

def blocco_discovery(titolo, descr, n_case, immagine=IMG_SOCIAL):
    raccolta = {
        '@context': 'https://schema.org', '@type': 'CollectionPage',
        '@id': 'https://www.boomrome.com/apartments#collection',
        'url': 'https://www.boomrome.com/apartments',
        'name': titolo, 'description': descr,
        'isPartOf': {'@id': 'https://www.boomrome.com/#website'},
        'about': {'@type': 'Place', 'name': 'Rome',
                  'address': {'@type': 'PostalAddress',
                              'addressLocality': 'Rome',
                              'addressCountry': 'IT'}},
        'numberOfItems': n_case,
    }
    briciole = {
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Home',
             'item': 'https://www.boomrome.com/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Apartments',
             'item': 'https://www.boomrome.com/apartments'}],
    }
    return (_og(titolo, descr, 'https://www.boomrome.com/apartments',
                immagine) + '\n'
            + ROBOTS + '\n' + ICONE + '\n' + GTAG + '\n'
            + _ld(AGENZIA, SITO_WEB, raccolta, briciole))

# la testa GENERICA del template /listing/:id — api/listing.js sostituisce
# title/canonical/description/og/twitter per annuncio via regex ESATTE:
# ogni tag qui sotto deve esistere nel formato <meta name|property="X"
# content="...">, altrimenti quella sostituzione diventa un no-op muto.
# (title e description NON sono qui: il template li porta gia — il builder
# li rende generici e questo blocco aggiunge il resto.)
TITOLO_LISTING = 'Apartment Details — Rome Verified Rental | BOOM'
DESCR_LISTING = ('Verified apartment details, photos, location and amenities '
                 'in Rome. Book a video viewing or apply in minutes. Legal '
                 'contract, transparent fees, BOOM-managed.')
def blocco_listing():
    briciole = {
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Home',
             'item': 'https://www.boomrome.com/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Apartments',
             'item': 'https://www.boomrome.com/apartments'}],
    }
    return (_og(TITOLO_LISTING, DESCR_LISTING,
                'https://www.boomrome.com/apartment-detail')
            + '\n' + ROBOTS + '\n' + ICONE + '\n' + GTAG + '\n'
            + _ld(AGENZIA, SITO_WEB, briciole))

def blocco_money(titolo, descr):
    briciole = {
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Home',
             'item': 'https://www.boomrome.com/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Your money',
             'item': 'https://www.boomrome.com/your-money'}],
    }
    pagina = {
        '@context': 'https://schema.org', '@type': 'WebPage',
        'url': 'https://www.boomrome.com/your-money',
        'name': titolo, 'description': descr,
        'isPartOf': {'@id': 'https://www.boomrome.com/#website'},
    }
    return (_og(titolo, descr, 'https://www.boomrome.com/your-money') + '\n'
            + ROBOTS + '\n' + ICONE + '\n' + GTAG + '\n'
            + _ld(AGENZIA, SITO_WEB, pagina, briciole))

SW = ("<script>if('serviceWorker' in navigator)"
      "navigator.serviceWorker.register('/sw.js',{scope:'/'});</script>")
