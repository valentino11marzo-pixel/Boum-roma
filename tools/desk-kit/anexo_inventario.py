#!/usr/bin/env python3
"""The handover inventory (Anexo I) of a lease, one A4 page.

    python3 tools/desk-kit/anexo_inventario.py <case.json> <out.pdf>

The two parties fill it in together on the day of the keys: room by room,
with dated photos, the meter readings, the keys, the energy certificate and
who holds the utilities; both sign. Built from a small JSON (see
sample-case.json — fictitious). No personal data lives in this file or in
the repository: the case file stays in the session scratchpad.

Small and deterministic on purpose (compressed, no creation date): the PDF
travels as an email attachment, and the same input must give the same bytes.
Needs reportlab.
"""
import json
import sys

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

# One label set per language. To add a country, add a set here; the JSON
# picks it with "lang". Every string a party signs under is in this table.
LABELS = {
    'es': {
        'title': 'ANEXO I – INVENTARIO Y ESTADO DEL INMUEBLE A LA ENTREGA DE LLAVES',
        'lease': 'Contrato de arrendamiento de vivienda',
        'cadastral': 'Ref. catastral',
        'landlord': 'Propietario', 'tenant': 'Inquilino', 'represented': 'representada por',
        'handover': 'Fecha de entrega: {date} · Hora: ________ . {clauses}las Partes revisan juntas el Inmueble y firman '
                    'este inventario. Las fotografías fechadas y numeradas, que ambas Partes comparten el mismo día, '
                    'forman parte de él.',
        'clauses': 'Conforme a {c} del Contrato, ',
        'room': 'Estancia', 'state': 'Equipamiento y estado, incluidos los defectos existentes', 'photos': 'Fotografías n.º',
        'rooms': ['Entrada y salón', 'Cocina: muebles, encimera, placa, horno y campana extractora',
                  'Electrodomésticos: lavadora, lavavajillas, frigorífico (¿funcionan?)', 'Dormitorio 1', 'Dormitorio 2',
                  'Baño', 'Ventanas, estores, radiadores y calefacción (tipo: __________)',
                  'Paredes, suelos, puertas y cerraduras'],
        'meters': 'Contadores', 'meter_no': 'N.º de contador', 'reading': 'Lectura',
        'meter_rows': ['Luz', 'Agua', 'Gas'],
        'lines': ['Llaves entregadas: {keys} juegos completos — vivienda [  ]  portal [  ]  buzón [  ] — probadas [  ]',
                  '{furnished}',
                  'Certificado de eficiencia energética entregado: sí [  ]  no [  ] — calificación: ______',
                  'Suministros{supply}, titular actual: luz ________________ agua ________________ gas ________________'],
        'unfurnished': 'La vivienda se entrega vacía, sin muebles ni enseres de ocupantes anteriores: sí [  ]  no [  ]',
        'furnished': 'La vivienda se entrega amueblada; los muebles y su estado constan arriba, estancia por estancia: sí [  ]  no [  ]',
        'notes': 'Observaciones:', 'sign': 'Firma: ______________________________',
        'landlord_cap': 'EL PROPIETARIO', 'tenant_cap': 'EL INQUILINO', 'pp': 'p.p.',
    },
    'en': {
        'title': 'ANNEX I – INVENTORY AND CONDITION OF THE HOME AT THE HANDOVER OF KEYS',
        'lease': 'Residential lease',
        'cadastral': 'Property reference',
        'landlord': 'Landlord', 'tenant': 'Tenant', 'represented': 'represented by',
        'handover': 'Handover date: {date} · Time: ________ . {clauses}the Parties inspect the home together and sign '
                    'this inventory. The dated, numbered photographs both Parties share on the same day are part of it.',
        'clauses': 'Under {c} of the Lease, ',
        'room': 'Room', 'state': 'Equipment and condition, including existing defects', 'photos': 'Photo no.',
        'rooms': ['Hall and living room', 'Kitchen: units, worktop, hob, oven and extractor',
                  'Appliances: washing machine, dishwasher, fridge (working?)', 'Bedroom 1', 'Bedroom 2', 'Bathroom',
                  'Windows, blinds, radiators and heating (type: __________)', 'Walls, floors, doors and locks'],
        'meters': 'Meters', 'meter_no': 'Meter no.', 'reading': 'Reading',
        'meter_rows': ['Electricity', 'Water', 'Gas'],
        'lines': ['Keys handed over: {keys} full sets — home [  ]  building [  ]  mailbox [  ] — tested [  ]',
                  '{furnished}',
                  'Energy performance certificate handed over: yes [  ]  no [  ] — rating: ______',
                  'Utilities{supply}, current holder: electricity ________________ water ________________ gas ________________'],
        'unfurnished': 'The home is handed over empty, with no furniture or belongings of earlier occupants: yes [  ]  no [  ]',
        'furnished': 'The home is handed over furnished; the furniture and its condition are listed above, room by room: yes [  ]  no [  ]',
        'notes': 'Notes:', 'sign': 'Signature: ______________________________',
        'landlord_cap': 'THE LANDLORD', 'tenant_cap': 'THE TENANT', 'pp': 'p.p.',
    },
}

REQUIRED = ('address', 'landlord', 'tenant', 'handover_date')


def esc(x):
    """Text for a reportlab Paragraph: the three XML characters, nothing else."""
    return str(x).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def party(p, L):
    """'Name (ID), represented by X' — every part optional but the name."""
    if isinstance(p, str):
        return esc(p), esc(p)
    name = esc(p.get('name', ''))
    line = name + (f" ({esc(p['id'])})" if p.get('id') else '')
    short = name
    if p.get('represented_by'):
        line += f", {L['represented']} {esc(p['represented_by'])}"
        short += f", {L['pp']} {esc(p['represented_by'])}"
    return line, short


def build(case, out):
    missing = [k for k in REQUIRED if not case.get(k)]
    if missing:
        raise SystemExit('missing in the case file: ' + ', '.join(missing))
    lang = case.get('lang', 'es')
    if lang not in LABELS:
        raise SystemExit(f'unknown lang "{lang}": add its labels to LABELS ({", ".join(LABELS)})')
    L = LABELS[lang]
    rooms = case.get('rooms') or L['rooms']
    if not 1 <= len(rooms) <= 10:
        raise SystemExit('rooms: 1 to 10 rows fit on the page')

    B = ParagraphStyle('b', fontName='Helvetica', fontSize=8.6, leading=11.2)
    Bb = ParagraphStyle('bb', parent=B, fontName='Helvetica-Bold')
    T = ParagraphStyle('t', fontName='Helvetica-Bold', fontSize=12.5, leading=15, spaceAfter=2)
    S2 = ParagraphStyle('s', parent=B, fontSize=8.2, leading=10.6, textColor=colors.HexColor('#333333'))
    grid = colors.HexColor('#555555')
    head = colors.HexColor('#EDEDED')

    # invariant=1: no creation date and a fixed ID, so the same case gives the same bytes
    doc = SimpleDocTemplate(out, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=13 * mm,
                            bottomMargin=12 * mm, title=L['title'].title(), author='', pageCompression=1, invariant=1)
    landlord_line, landlord_short = party(case['landlord'], L)
    tenant_line, tenant_short = party(case['tenant'], L)
    s = [Paragraph(L['title'], T)]
    s.append(Paragraph(f"{L['lease']} · {esc(case['address'])}"
                       + (f" · {L['cadastral']} {esc(case['cadastral_ref'])}" if case.get('cadastral_ref') else ''), S2))
    s.append(Paragraph(f"{L['landlord']}: {landlord_line} · {L['tenant']}: {tenant_line}", S2))
    s.append(Spacer(1, 2.5 * mm))
    clauses = L['clauses'].format(c=esc(case['clauses'])) if case.get('clauses') else ''
    text = L['handover'].format(date=esc(case['handover_date']), clauses=clauses)
    # without the clause reference the sentence starts with "las Partes" / "the Parties": capitalise it
    if not clauses:
        text = text.replace('________ . l', '________ . L').replace('________ . t', '________ . T')
    s.append(Paragraph(text, B))
    s.append(Spacer(1, 2.5 * mm))

    rows = [[Paragraph(L['room'], Bb), Paragraph(L['state'], Bb), Paragraph(L['photos'], Bb)]]
    rows += [[Paragraph(esc(r), B), '', ''] for r in rooms]
    # the eight default rows fill the page at 14.2 mm; more rooms get lower rows, fewer keep the height
    row_h = min(14.2, 113.6 / len(rooms))
    t = Table(rows, colWidths=[52 * mm, 98 * mm, 30 * mm], rowHeights=[8 * mm] + [row_h * mm] * len(rooms))
    t.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.6, grid), ('BACKGROUND', (0, 0), (-1, 0), head),
                           ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 2.5)]))
    s += [t, Spacer(1, 3 * mm)]

    meter_rows = case.get('meters') or L['meter_rows']
    m = Table([[Paragraph(L['meters'], Bb), Paragraph(L['meter_no'], Bb), Paragraph(L['reading'], Bb)]]
              + [[Paragraph(esc(x), B), '', ''] for x in meter_rows],
              colWidths=[52 * mm, 78 * mm, 50 * mm], rowHeights=[6.5 * mm] + [7.5 * mm] * len(meter_rows))
    m.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.6, grid), ('BACKGROUND', (0, 0), (-1, 0), head),
                           ('VALIGN', (0, 0), (-1, -1), 'MIDDLE')]))
    s += [m, Spacer(1, 2.5 * mm)]

    furnished = L['furnished'] if case.get('furnished') else L['unfurnished']
    supply = f" ({esc(case['utilities_clause'])})" if case.get('utilities_clause') else ''
    for line in L['lines']:
        s.append(Paragraph(line.format(keys=esc(case.get('key_sets', 2)), furnished=furnished, supply=supply), B))
        s.append(Spacer(1, 1.6 * mm))
    o = Table([[Paragraph(L['notes'], B)]], colWidths=[180 * mm], rowHeights=[13 * mm])
    o.setStyle(TableStyle([('BOX', (0, 0), (-1, -1), 0.6, grid), ('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    s += [o, Spacer(1, 4 * mm)]
    sig = Table([[Paragraph(f"{L['landlord_cap']}<br/>{landlord_short}", B), Paragraph(f"{L['tenant_cap']}<br/>{tenant_short}", B)],
                 [Paragraph(L['sign'], B), Paragraph(L['sign'], B)]],
                colWidths=[90 * mm, 90 * mm], rowHeights=[11 * mm, 13 * mm])
    sig.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'BOTTOM')]))
    s.append(sig)
    doc.build(s)
    return doc.page


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    with open(sys.argv[1], encoding='utf-8') as fh:
        pages = build(json.load(fh), sys.argv[2])
    if pages != 1:
        raise SystemExit(f'the inventory must fit ONE page (it took {pages}): shorten the room rows')
    print(f'{sys.argv[2]}: 1 page')
