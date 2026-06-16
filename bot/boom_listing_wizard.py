#!/usr/bin/env python3
"""
BOOM Listing Wizard — Telegram Bot (Firebase REST API version)
No firebase-admin SDK, no gcloud, no expiring credentials.
Uses email/password auth like reminder-cron.js.

DEPLOY NOTE: the live copy runs on the Mac mini at
/Users/boomserver/boom-listing-wizard/boom_listing_wizard.py with a .env
alongside it (secrets — never committed). This file is the version-controlled
mirror. See bot/README.md.
"""

import os
import json
import logging
import time
import urllib.parse
import requests as http_requests
from datetime import datetime, timezone
from dotenv import load_dotenv

from telegram import (
    Update, InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardRemove
)
from telegram.ext import (
    Application, CommandHandler, MessageHandler, CallbackQueryHandler,
    ConversationHandler, filters
)

# ─── Config ───────────────────────────────────────────────────────────────────
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

TELEGRAM_TOKEN = os.environ['BOOM_TELEGRAM_BOT_TOKEN']
ADMIN_CHAT_ID = int(os.environ['BOOM_TELEGRAM_CHAT_ID'])
FIREBASE_API_KEY = os.environ['FIREBASE_API_KEY']
FIREBASE_EMAIL = os.environ['FIREBASE_ADMIN_EMAIL']
FIREBASE_PASS = os.environ['FIREBASE_ADMIN_PASS']
PROJECT_ID = os.environ.get('FIREBASE_PROJECT_ID', 'boom-property-dashboards')
STORAGE_BUCKET = os.environ.get('FIREBASE_BUCKET', 'boom-property-dashboards.firebasestorage.app')
SITE_URL = 'https://www.boomrome.com'

# BOOM wizard API (server-side endpoints, authed with a shared secret). Used for
# AI descriptions now, and for fault-tolerant publishing later. Optional: if the
# secret is unset every call returns None and the bot falls back to direct mode.
WIZARD_API_BASE = os.environ.get('WIZARD_API_BASE', 'https://www.boomrome.com')
WIZARD_SECRET = os.environ.get('WIZARD_SECRET') or os.environ.get('HOMIE_SECRET', '')

def wizard_post(path, payload, timeout=35):
    """POST to a BOOM wizard endpoint with the shared secret. Returns parsed
    JSON on success, or None on any failure so the caller can fall back."""
    if not WIZARD_SECRET:
        return None
    try:
        r = http_requests.post(
            f'{WIZARD_API_BASE}{path}',
            headers={'Content-Type': 'application/json', 'X-Wizard-Secret': WIZARD_SECRET},
            json=payload, timeout=timeout,
        )
        if r.status_code != 200:
            logger.warning(f'wizard api {path} -> {r.status_code}: {r.text[:200]}')
            return None
        return r.json()
    except Exception as e:
        logger.warning(f'wizard api {path} failed: {e}')
        return None

# ─── Firebase REST Auth ───────────────────────────────────────────────────────
_fb_token = None
_fb_token_exp = 0

def get_firebase_token():
    global _fb_token, _fb_token_exp
    if _fb_token and time.time() < _fb_token_exp - 60:
        return _fb_token
    r = http_requests.post(
        f'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_API_KEY}',
        json={'email': FIREBASE_EMAIL, 'password': FIREBASE_PASS, 'returnSecureToken': True}
    )
    r.raise_for_status()
    data = r.json()
    _fb_token = data['idToken']
    _fb_token_exp = time.time() + int(data.get('expiresIn', 3600))
    return _fb_token

def fs_headers():
    return {'Authorization': f'Bearer {get_firebase_token()}', 'Content-Type': 'application/json'}

def fs_base():
    return f'https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents'

# ─── Firestore REST Helpers ───────────────────────────────────────────────────

def python_to_firestore(val):
    if val is None: return {'nullValue': None}
    if isinstance(val, bool): return {'booleanValue': val}
    if isinstance(val, int): return {'integerValue': str(val)}
    if isinstance(val, float): return {'doubleValue': val}
    if isinstance(val, str): return {'stringValue': val}
    if isinstance(val, list): return {'arrayValue': {'values': [python_to_firestore(v) for v in val]}}
    if isinstance(val, dict): return {'mapValue': {'fields': {k: python_to_firestore(v) for k, v in val.items()}}}
    return {'stringValue': str(val)}

def firestore_to_python(val):
    if 'stringValue' in val: return val['stringValue']
    if 'integerValue' in val: return int(val['integerValue'])
    if 'doubleValue' in val: return float(val['doubleValue'])
    if 'booleanValue' in val: return val['booleanValue']
    if 'nullValue' in val: return None
    if 'arrayValue' in val: return [firestore_to_python(v) for v in val.get('arrayValue', {}).get('values', [])]
    if 'mapValue' in val: return {k: firestore_to_python(v) for k, v in val.get('mapValue', {}).get('fields', {}).items()}
    if 'timestampValue' in val: return val['timestampValue']
    return str(val)

def fs_create(collection, data):
    fields = {k: python_to_firestore(v) for k, v in data.items()}
    r = http_requests.post(f'{fs_base()}/{collection}', headers=fs_headers(), json={'fields': fields})
    r.raise_for_status()
    return r.json()['name'].split('/')[-1]

def fs_query_available(collection):
    body = {'structuredQuery': {'from': [{'collectionId': collection}], 'where': {'fieldFilter': {'field': {'fieldPath': 'status'}, 'op': 'EQUAL', 'value': {'stringValue': 'available'}}}}}
    r = http_requests.post(f'{fs_base()}:runQuery', headers=fs_headers(), json=body)
    r.raise_for_status()
    results = []
    for item in r.json():
        if 'document' in item:
            doc = item['document']
            doc_id = doc['name'].split('/')[-1]
            fields = {k: firestore_to_python(v) for k, v in doc.get('fields', {}).items()}
            results.append((doc_id, fields))
    return results

def fs_update(collection, doc_id, data):
    fields = {k: python_to_firestore(v) for k, v in data.items()}
    update_mask = '&'.join([f'updateMask.fieldPaths={k}' for k in data.keys()])
    r = http_requests.patch(f'{fs_base()}/{collection}/{doc_id}?{update_mask}', headers=fs_headers(), json={'fields': fields})
    r.raise_for_status()

def fs_delete(collection, doc_id):
    r = http_requests.delete(f'{fs_base()}/{collection}/{doc_id}', headers=fs_headers())
    r.raise_for_status()

# ─── Firebase Storage REST ────────────────────────────────────────────────────

def storage_upload(path, file_bytes, content_type='image/jpeg'):
    encoded_path = urllib.parse.quote(path, safe='')
    url = f'https://firebasestorage.googleapis.com/v0/b/{STORAGE_BUCKET}/o?name={path}'
    headers = {'Authorization': f'Bearer {get_firebase_token()}', 'Content-Type': content_type}
    r = http_requests.post(url, headers=headers, data=file_bytes)
    r.raise_for_status()
    return f'https://firebasestorage.googleapis.com/v0/b/{STORAGE_BUCKET}/o/{encoded_path}?alt=media'

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger('BoomWizard')

# ─── Conversation States ──────────────────────────────────────────────────────
(ZONE, ADDRESS, TYPE, SQM, FLOOR, BEDS, BATHROOMS, PRICE,
 FURNISHED, AVAILABLE, CONCORDATO, FEATURES, DESCRIPTION,
 PHOTOS, VIDEO, CONFIRM) = range(16)

# ─── Data ─────────────────────────────────────────────────────────────────────
ZONES = ['Prati', 'Centro', 'Trastevere', 'Testaccio', 'Monti', 'San Giovanni', 'Parioli', 'Flaminio', 'Ostiense', 'EUR', 'Monteverde', 'Balduina', 'Trieste', 'Nomentano', 'Trionfale', 'Aurelio', 'Tuscolano', 'Appio Latino', 'Esquilino', 'Altro']
APARTMENT_TYPES = [('🏠 Mono', 'monolocale'), ('🏠 Bilo', 'bilocale'), ('🏠 Trilo', 'trilocale'), ('🏠 Quadri+', 'quadrilocale+')]
SQM_OPTIONS = [('25mq','25'),('30mq','30'),('35mq','35'),('40mq','40'),('45mq','45'),('50mq','50'),('55mq','55'),('60mq','60'),('65mq','65'),('70mq','70'),('80mq','80'),('90mq','90'),('100mq','100'),('120mq','120'),('150mq+','150')]
FLOOR_OPTIONS = [('🔻 S/T','0'),('1°','1'),('2°','2'),('3°','3'),('4°','4'),('5°','5'),('6°+','6+'),('Attico','attico')]
BEDS_OPTIONS = [('1 letto','1'),('2 letti','2'),('3 letti','3'),('4 letti','4'),('5 letti','5'),('6+','6')]
BATHROOMS_OPTIONS = [('1 bagno','1'),('2 bagni','2'),('3 bagni','3')]
PRICE_QUICK = [('€700','700'),('€800','800'),('€900','900'),('€1.000','1000'),('€1.100','1100'),('€1.200','1200'),('€1.300','1300'),('€1.400','1400'),('€1.500','1500'),('€1.600','1600'),('€1.800','1800'),('€2.000','2000'),('€2.200','2200'),('€2.500','2500'),('€3.000+','3000')]
AVAILABLE_OPTIONS = [('📍 Subito','Subito'),('📅 1 Maggio','2026-05-01'),('📅 1 Giugno','2026-06-01'),('📅 1 Luglio','2026-07-01'),('📅 1 Agosto','2026-08-01'),('📅 1 Settembre','2026-09-01'),('✏️ Altra data','custom')]
FEATURES_LIST = [('🌡️ AC','ac'),('🏗️ Ascensore','elevator'),('🌿 Balcone','balcony'),('☀️ Terrazzo','terrace'),('👕 Lavatrice','washing_machine'),('🍽️ Lavastoviglie','dishwasher'),('🅿️ Posto auto','parking'),('📦 Cantina','storage'),('🐾 Animali OK','pets_allowed'),('📶 WiFi incl.','wifi'),('🪟 Doppi vetri','double_glazing'),('🔐 Portiere','doorman')]

# ─── Canone concordato (indicative) ───────────────────────────────────────────
# Fascia B €/mq bands from the Accordo Territoriale Roma 2023 (the same table
# the public /canone tool uses). Subset mapped to this wizard's zone list — the
# hint is indicative (mid "fascia B"); the certified value still needs the
# property's exact classification + asseverazione.
CANONE_BANDS = {  # code: (micro-zone label, B.min €/mq, B.max €/mq)
    'B1': ('Testaccio', 13.20, 15.30), 'B4': ('Monti', 13.20, 18.90),
    'B14': ('Trastevere', 15.40, 22.00), 'B18': ('Esquilino', 9.20, 13.10),
    'B31': ('Centro/Tridente', 18.30, 26.20), 'C1': ('Parioli', 13.80, 19.80),
    'C4': ('Nomentano', 13.80, 19.80), 'C8': ('Tuscolano/Appio', 7.90, 11.30),
    'C9': ('San Giovanni/Appio', 8.60, 12.30), 'C13': ('Monteverde', 8.20, 11.80),
    'C15': ('Aurelio', 8.40, 12.00), 'C17': ('Balduina', 8.20, 11.80),
    'C32': ('Ostiense', 7.70, 11.00), 'C40': ('Prati', 12.80, 18.40),
    'C43': ('Trionfale', 10.50, 15.00), 'C46': ('Trieste', 13.90, 19.90),
    'C49': ('Flaminio', 12.80, 18.40), 'C51': ('Appio Latino', 8.20, 11.80),
    'D29': ('EUR', 10.50, 15.10),
}
CANONE_ZONE_MAP = {
    'Prati': 'C40', 'Centro': 'B31', 'Trastevere': 'B14', 'Testaccio': 'B1',
    'Monti': 'B4', 'San Giovanni': 'C9', 'Parioli': 'C1', 'Flaminio': 'C49',
    'Ostiense': 'C32', 'EUR': 'D29', 'Monteverde': 'C13', 'Balduina': 'C17',
    'Trieste': 'C46', 'Nomentano': 'C4', 'Trionfale': 'C43', 'Aurelio': 'C15',
    'Tuscolano': 'C8', 'Appio Latino': 'C51', 'Esquilino': 'B18',
}

def canone_estimate(zone_name, sqm):
    """Indicative canone concordato monthly range (low, high, micro-zone label)
    for a wizard zone + sqm, or None if the zone isn't mapped / sqm missing."""
    code = CANONE_ZONE_MAP.get((zone_name or '').strip())
    band = CANONE_BANDS.get(code) if code else None
    if not band:
        return None
    try:
        calp = float(sqm)
    except (TypeError, ValueError):
        return None
    if calp <= 0:
        return None
    # superficie convenzionale: size coefficient (pertinenze unknown here)
    coeff = 1.30 if calp < 46 else 1.15 if calp < 70 else 1.00 if calp <= 120 else 0.85
    sup = calp * coeff
    label, b_min, b_max = band
    return (round(b_min * sup), round(b_max * sup), label)

# ─── Helpers ──────────────────────────────────────────────────────────────────
def is_admin(update: Update) -> bool:
    return update.effective_chat.id == ADMIN_CHAT_ID

def make_keyboard(items, cols=3, prefix=''):
    if items and isinstance(items[0], str): items = [(i, i) for i in items]
    buttons, row = [], []
    for label, value in items:
        row.append(InlineKeyboardButton(label, callback_data=f'{prefix}{value}'))
        if len(row) >= cols: buttons.append(row); row = []
    if row: buttons.append(row)
    return InlineKeyboardMarkup(buttons)

def progress_bar(step, total=14):
    filled = round(step / total * 10)
    return f"[{'▓' * filled}{'░' * (10 - filled)}] {step}/{total}"

def summary_text(data):
    features = ', '.join(data.get('features', [])) or 'Nessuna'
    photos_count = len(data.get('_photos', []))
    furn_map = {'yes': '✅ Arredato', 'partial': '🔄 Parziale', 'no': '❌ Non arredato'}
    conc_map = {True: '✅ Sì', False: '❌ No', 'tbd': '❓ Da verificare'}
    return (f"━━━━━━━━━━━━━━━━━━━━━━\n🏠 *RIEPILOGO LISTING*\n━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"📍 *{data.get('name', 'N/A')}*\n🗺 {data.get('address', 'N/A')}, {data.get('zone', 'N/A')}\n\n"
        f"💶 *€{data.get('price', 0):,}/mese*\n📐 {data.get('sqm', '?')}mq · Piano {data.get('floor', '?')}\n"
        f"🛏 {data.get('beds', '?')} letti · 🚿 {data.get('bathrooms', '?')} bagni\n🏷 {data.get('type', '?').title()}\n"
        f"🪑 {furn_map.get(data.get('furnished'), '?')}\n📅 Disponibile: {data.get('availableDate', 'Subito')}\n"
        f"📜 Concordato: {conc_map.get(data.get('concordato'), '?')}\n\n✨ *Features:* {features}\n\n"
        f"📝 _{data.get('description', 'Nessuna descrizione')}_\n\n📸 *{photos_count} foto* caricate\n\n━━━━━━━━━━━━━━━━━━━━━━")

# ─── Conversation Flow ────────────────────────────────────────────────────────
async def cmd_newlisting(update, context):
    if not is_admin(update): await update.message.reply_text("⛔ Non autorizzato."); return ConversationHandler.END
    context.user_data.clear(); context.user_data['_photos'] = []; context.user_data['features'] = []
    await update.message.reply_text(f"🏠 *Nuovo Listing BOOM*\n\n{progress_bar(1)}\n\n*1/14* — Zona?", parse_mode='Markdown', reply_markup=make_keyboard(ZONES, cols=3, prefix='z_'))
    return ZONE

async def zone_cb(update, context):
    q = update.callback_query; await q.answer(); zone = q.data.replace('z_', ''); context.user_data['zone'] = zone
    if zone == 'Altro': await q.edit_message_text(f"✅ Zona custom\n\n{progress_bar(1)}\n\nScrivi il nome della zona:", parse_mode='Markdown'); return ZONE
    await q.edit_message_text(f"✅ *{zone}*\n\n{progress_bar(2)}\n\n*2/14* — Indirizzo completo?", parse_mode='Markdown'); return ADDRESS

async def zone_text(update, context):
    if 'zone' not in context.user_data or context.user_data['zone'] == 'Altro': context.user_data['zone'] = update.message.text.strip()
    await update.message.reply_text(f"✅ *{context.user_data['zone']}*\n\n{progress_bar(2)}\n\n*2/14* — Indirizzo completo?", parse_mode='Markdown'); return ADDRESS

async def address_received(update, context):
    context.user_data['address'] = update.message.text.strip()
    await update.message.reply_text(f"✅ {context.user_data['address']}\n\n{progress_bar(3)}\n\n*3/14* — Tipo?", parse_mode='Markdown', reply_markup=make_keyboard(APARTMENT_TYPES, cols=2, prefix='t_')); return TYPE

async def type_cb(update, context):
    q = update.callback_query; await q.answer(); context.user_data['type'] = q.data.replace('t_', '')
    await q.edit_message_text(f"✅ {context.user_data['type'].title()}\n\n{progress_bar(4)}\n\n*4/14* — Metri quadri?\n_(tocca o scrivi)_", parse_mode='Markdown', reply_markup=make_keyboard(SQM_OPTIONS, cols=3, prefix='sqm_')); return SQM

async def sqm_cb(update, context):
    q = update.callback_query; await q.answer(); context.user_data['sqm'] = int(q.data.replace('sqm_', ''))
    await q.edit_message_text(f"✅ {context.user_data['sqm']}mq\n\n{progress_bar(5)}\n\n*5/14* — Piano?", parse_mode='Markdown', reply_markup=make_keyboard(FLOOR_OPTIONS, cols=4, prefix='fl_')); return FLOOR

async def sqm_text(update, context):
    try: context.user_data['sqm'] = int(update.message.text.replace('mq', '').replace('m2', '').strip())
    except ValueError: await update.message.reply_text("❌ Manda un numero (es: 65)"); return SQM
    await update.message.reply_text(f"✅ {context.user_data['sqm']}mq\n\n{progress_bar(5)}\n\n*5/14* — Piano?", parse_mode='Markdown', reply_markup=make_keyboard(FLOOR_OPTIONS, cols=4, prefix='fl_')); return FLOOR

async def floor_cb(update, context):
    q = update.callback_query; await q.answer(); context.user_data['floor'] = q.data.replace('fl_', '')
    await q.edit_message_text(f"✅ Piano {context.user_data['floor']}\n\n{progress_bar(6)}\n\n*6/14* — Posti letto?", parse_mode='Markdown', reply_markup=make_keyboard(BEDS_OPTIONS, cols=3, prefix='bed_')); return BEDS

async def beds_cb(update, context):
    q = update.callback_query; await q.answer(); context.user_data['beds'] = int(q.data.replace('bed_', ''))
    await q.edit_message_text(f"✅ {context.user_data['beds']} letti\n\n{progress_bar(7)}\n\n*7/14* — Bagni?", parse_mode='Markdown', reply_markup=make_keyboard(BATHROOMS_OPTIONS, cols=3, prefix='bath_')); return BATHROOMS

async def bathrooms_cb(update, context):
    q = update.callback_query; await q.answer(); context.user_data['bathrooms'] = int(q.data.replace('bath_', ''))
    hint = ''
    try:
        est = canone_estimate(context.user_data.get('zone', ''), context.user_data.get('sqm'))
        if est:
            hint = f"💡 _Canone concordato indicativo ({est[2]}): €{est[0]:,}–€{est[1]:,}/mese (fascia B)_\n\n"
    except Exception as e:
        logger.warning(f'canone hint: {e}')
    await q.edit_message_text(f"✅ {context.user_data['bathrooms']} bagni\n\n{progress_bar(8)}\n\n{hint}*8/14* — Prezzo mensile?\n_(tocca o scrivi)_", parse_mode='Markdown', reply_markup=make_keyboard(PRICE_QUICK, cols=3, prefix='pr_')); return PRICE

async def price_cb(update, context):
    q = update.callback_query; await q.answer(); context.user_data['price'] = int(q.data.replace('pr_', ''))
    await q.edit_message_text(f"✅ €{context.user_data['price']:,}/mese\n\n{progress_bar(9)}\n\n*9/14* — Arredato?", parse_mode='Markdown', reply_markup=make_keyboard([('✅ Sì','yes'),('🔄 Parziale','partial'),('❌ No','no')], cols=3, prefix='furn_')); return FURNISHED

async def price_text(update, context):
    try: context.user_data['price'] = int(update.message.text.replace('€','').replace('.','').replace(',','').strip())
    except ValueError: await update.message.reply_text("❌ Solo il numero, es: 1200"); return PRICE
    await update.message.reply_text(f"✅ €{context.user_data['price']:,}/mese\n\n{progress_bar(9)}\n\n*9/14* — Arredato?", parse_mode='Markdown', reply_markup=make_keyboard([('✅ Sì','yes'),('🔄 Parziale','partial'),('❌ No','no')], cols=3, prefix='furn_')); return FURNISHED

async def furnished_cb(update, context):
    q = update.callback_query; await q.answer(); context.user_data['furnished'] = q.data.replace('furn_', '')
    furn_text = {'yes': 'Arredato', 'partial': 'Parziale', 'no': 'Non arredato'}
    await q.edit_message_text(f"✅ {furn_text[context.user_data['furnished']]}\n\n{progress_bar(10)}\n\n*10/14* — Disponibile da?", parse_mode='Markdown', reply_markup=make_keyboard(AVAILABLE_OPTIONS, cols=2, prefix='av_')); return AVAILABLE

async def available_cb(update, context):
    q = update.callback_query; await q.answer(); val = q.data.replace('av_', '')
    if val == 'custom': await q.edit_message_text(f"{progress_bar(10)}\n\n*10/14* — Scrivi la data (es: 15 maggio):", parse_mode='Markdown'); return AVAILABLE
    context.user_data['availableDate'] = val
    await q.edit_message_text(f"✅ {val}\n\n{progress_bar(11)}\n\n*11/14* — Canone concordato?", parse_mode='Markdown', reply_markup=make_keyboard([('✅ Sì','yes'),('❌ No','no'),('❓ Da verificare','tbd')], cols=3, prefix='conc_')); return CONCORDATO

async def available_text(update, context):
    context.user_data['availableDate'] = update.message.text.strip()
    await update.message.reply_text(f"✅ {context.user_data['availableDate']}\n\n{progress_bar(11)}\n\n*11/14* — Canone concordato?", parse_mode='Markdown', reply_markup=make_keyboard([('✅ Sì','yes'),('❌ No','no'),('❓ Da verificare','tbd')], cols=3, prefix='conc_')); return CONCORDATO

async def concordato_cb(update, context):
    q = update.callback_query; await q.answer(); val = q.data.replace('conc_', '')
    context.user_data['concordato'] = True if val == 'yes' else False if val == 'no' else 'tbd'
    conc_text = {True: 'Sì', False: 'No', 'tbd': 'Da verificare'}
    await q.edit_message_text(f"✅ Concordato: {conc_text[context.user_data['concordato']]}\n\n{progress_bar(12)}\n\n*12/14* — Features?\n_(tocca per selezionare, ✅ Fine quando ok)_", parse_mode='Markdown', reply_markup=_features_keyboard([])); return FEATURES

def _features_keyboard(selected):
    kb, row = [], []
    for label, value in FEATURES_LIST:
        row.append(InlineKeyboardButton(f"{'✅ ' if value in selected else ''}{label}", callback_data=f'f_{value}'))
        if len(row) >= 2: kb.append(row); row = []
    if row: kb.append(row)
    kb.append([InlineKeyboardButton('✅ Fine features', callback_data='f_DONE'), InlineKeyboardButton('⏭ Salta', callback_data='f_SKIP')])
    return InlineKeyboardMarkup(kb)

async def feature_cb(update, context):
    q = update.callback_query; await q.answer(); feat = q.data.replace('f_', '')
    if feat in ('DONE', 'SKIP'):
        if feat == 'SKIP': context.user_data['features'] = []
        await q.edit_message_text(f"✅ Features: {', '.join(context.user_data['features']) or 'Nessuna'}\n\n{progress_bar(13)}\n\n*13/14* — Descrizione?\n\nScrivi il testo oppure tocca:", parse_mode='Markdown', reply_markup=make_keyboard([('🤖 Auto-genera','auto'),('⏭ Salta','skip')], cols=2, prefix='desc_')); return DESCRIPTION
    feats = context.user_data['features']
    if feat in feats: feats.remove(feat)
    else: feats.append(feat)
    await q.edit_message_text(f"✨ Selezionate: {', '.join(feats) or 'Nessuna'}\n\n{progress_bar(12)}\n\n*12/14* — Tocca per aggiungere/rimuovere:", parse_mode='Markdown', reply_markup=_features_keyboard(feats)); return FEATURES

async def description_cb(update, context):
    q = update.callback_query; await q.answer(); val = q.data.replace('desc_', ''); d = context.user_data
    label = '⏭ Senza descrizione'
    if val == 'auto':
        await q.edit_message_text("⏳ Genero la descrizione con l'AI…")
        ai = wizard_post('/api/wizard/describe', {
            'type': d.get('type'), 'zone': d.get('zone'), 'address': d.get('address'),
            'sqm': d.get('sqm'), 'floor': d.get('floor'), 'beds': d.get('beds'),
            'bathrooms': d.get('bathrooms'), 'furnished': d.get('furnished'),
            'price': d.get('price'), 'features': d.get('features', []),
            'availableDate': d.get('availableDate'), 'concordato': d.get('concordato'),
        })
        if ai and ai.get('ok') and ai.get('en'):
            d['description'] = ai['en'].strip()
            if ai.get('it'): d['descriptionIt'] = ai['it'].strip()
            label = '✅ Descrizione AI (IT/EN)'
        else:
            # Fallback: original built-in template (AI unavailable / no secret).
            furn_text = {'yes': 'fully furnished', 'partial': 'partially furnished', 'no': 'unfurnished'}
            feats = d.get('features', []); feat_text = f" Features include {', '.join(feats)}." if feats else ""
            d['description'] = f"Beautiful {d.get('type', 'apartment')} in {d.get('zone', 'Rome')}, {d.get('sqm', '')}sqm on floor {d.get('floor', 'N/A')}, {furn_text.get(d.get('furnished', 'no'), 'unfurnished')}. {d.get('beds', '')} beds, {d.get('bathrooms', '')} bathroom{'s' if d.get('bathrooms', 1) > 1 else ''}.{feat_text} €{d.get('price', 0):,}/month."
            label = '✅ Descrizione generata (modello base)'
    else:
        d['description'] = ''
    await q.edit_message_text(f"{label}\n\n{progress_bar(14)}\n\n*14/14* — 📸 *Manda le foto!*\n\nInvia foto una alla volta o in gruppo.\n/done quando hai finito · /skip per saltare", parse_mode='Markdown'); return PHOTOS

async def description_text(update, context):
    context.user_data['description'] = update.message.text.strip()
    await update.message.reply_text(f"✅ Descrizione salvata\n\n{progress_bar(14)}\n\n*14/14* — 📸 *Manda le foto!*\n\nInvia foto una alla volta o in gruppo.\n/done quando hai finito · /skip per saltare", parse_mode='Markdown'); return PHOTOS

async def photo_received(update, context):
    if update.message.photo:
        context.user_data['_photos'].append(update.message.photo[-1].file_id)
        await update.message.reply_text(f"📸 *{len(context.user_data['_photos'])}* foto! Manda altre o /done", parse_mode='Markdown')
    return PHOTOS

async def photos_done(update, context):
    d = context.user_data; d['name'] = f"{d.get('type', 'Appartamento').title()} {d.get('zone', 'Roma')}"
    await update.message.reply_text(
        f"📹 *Video YouTube?*\n\nIncolla il link YouTube oppure tocca Salta:",
        parse_mode='Markdown',
        reply_markup=make_keyboard([('⏭ Salta','skip')], cols=1, prefix='vid_')
    ); return VIDEO

async def video_cb(update, context):
    q = update.callback_query; await q.answer()
    context.user_data['videoUrl'] = ''
    d = context.user_data
    await q.edit_message_text(summary_text(d), parse_mode='Markdown', reply_markup=make_keyboard([('✅ Pubblica!','pub'),('🗑 Annulla','cancel')], cols=2, prefix='cfm_')); return CONFIRM

async def video_text(update, context):
    url = update.message.text.strip()
    if 'youtube.com' in url or 'youtu.be' in url:
        context.user_data['videoUrl'] = url
        await update.message.reply_text(f"✅ Video aggiunto!")
    else:
        context.user_data['videoUrl'] = url
        await update.message.reply_text(f"✅ URL salvato!")
    d = context.user_data
    await update.message.reply_text(summary_text(d), parse_mode='Markdown', reply_markup=make_keyboard([('✅ Pubblica!','pub'),('🗑 Annulla','cancel')], cols=2, prefix='cfm_')); return CONFIRM

async def photos_skip(update, context):
    context.user_data['_photos'] = []; return await photos_done(update, context)

async def confirm_cb(update, context):
    q = update.callback_query; await q.answer()
    if q.data.replace('cfm_', '') == 'cancel':
        await q.edit_message_text("🗑 Listing annullato."); context.user_data.clear(); return ConversationHandler.END
    await q.edit_message_text("⏳ *Caricamento in corso...*", parse_mode='Markdown')
    d = context.user_data; photo_ids = d.pop('_photos', []); image_urls = []
    for i, file_id in enumerate(photo_ids):
        try:
            tg_file = await context.bot.get_file(file_id); file_bytes = await tg_file.download_as_bytearray()
            ts = int(datetime.now(timezone.utc).timestamp() * 1000)
            url = storage_upload(f"listings/{ts}_photo_{i}.jpg", bytes(file_bytes))
            image_urls.append(url); logger.info(f"Uploaded {i+1}/{len(photo_ids)}")
        except Exception as e: logger.error(f"Photo upload error: {e}")
    now = datetime.now(timezone.utc).isoformat() + 'Z'
    listing = {'name': d.get('name',''), 'address': d.get('address',''), 'zone': d.get('zone',''), 'price': d.get('price',0), 'type': d.get('type',''), 'status': 'available', 'beds': d.get('beds',0), 'bedrooms': d.get('beds',0), 'sqm': d.get('sqm',0), 'size': d.get('sqm',0), 'floor': str(d.get('floor','')), 'bathrooms': d.get('bathrooms',0), 'furnished': d.get('furnished','no'), 'availableDate': d.get('availableDate','Subito'), 'concordato': d.get('concordato','tbd'), 'description': d.get('description',''), 'descriptionIt': d.get('descriptionIt',''), 'features': d.get('features',[]), 'tags': [t for t in [d.get('zone','').lower(), d.get('type','').lower(), 'concordato' if d.get('concordato') is True else '', 'furnished' if d.get('furnished') == 'yes' else ''] if t], 'image': image_urls[0] if image_urls else '', 'images': image_urls, 'videoUrl': '', 'createdAt': now, 'updatedAt': now, 'createdBy': 'homie'}
    try:
        doc_id = fs_create('listings', listing); detail_url = f"{SITE_URL}/apartment-detail?id={doc_id}"
        await context.bot.send_message(chat_id=ADMIN_CHAT_ID, text=f"━━━━━━━━━━━━━━━━━━━━━━\n✅ *LISTING PUBBLICATO!*\n━━━━━━━━━━━━━━━━━━━━━━\n\n🏠 *{listing['name']}*\n📍 {listing['address']}, {listing['zone']}\n💶 €{listing['price']:,}/mese\n📐 {listing['sqm']}mq · Piano {listing['floor']}\n📸 {len(image_urls)} foto\n\n🔗 *Link per il cliente:*\n`{detail_url}`\n\n☝️ Tocca per copiare", parse_mode='Markdown')
        logger.info(f"Listing created: {doc_id}")
    except Exception as e:
        logger.error(f"Firestore error: {e}"); await context.bot.send_message(chat_id=ADMIN_CHAT_ID, text=f"❌ Errore: {e}")
    context.user_data.clear(); return ConversationHandler.END

async def cancel(update, context):
    context.user_data.clear(); await update.message.reply_text("🗑 Annullato.", reply_markup=ReplyKeyboardRemove()); return ConversationHandler.END

# ─── Utility Commands ─────────────────────────────────────────────────────────
async def cmd_listings(update, context):
    if not is_admin(update): return
    try:
        results = fs_query_available('listings'); lines = []
        for doc_id, d in results:
            lines.append(f"• *{d.get('name','?')}* — €{d.get('price',0):,}\n  {d.get('zone','')} · {d.get('sqm','?')}mq\n  `{SITE_URL}/apartment-detail?id={doc_id}`")
        if lines: await update.message.reply_text(f"🏠 *{len(lines)} listing attivi:*\n\n" + '\n\n'.join(lines), parse_mode='Markdown')
        else: await update.message.reply_text("Nessun listing attivo.")
    except Exception as e: await update.message.reply_text(f"❌ Errore: {e}")

async def cmd_rent(update, context):
    if not is_admin(update): return
    if not context.args: await update.message.reply_text("Uso: `/rent LISTING_ID`", parse_mode='Markdown'); return
    try: fs_update('listings', context.args[0], {'status': 'rented', 'updatedAt': datetime.now(timezone.utc).isoformat()+'Z'}); await update.message.reply_text(f"✅ `{context.args[0]}` → affittato", parse_mode='Markdown')
    except Exception as e: await update.message.reply_text(f"❌ {e}")

async def cmd_reactivate(update, context):
    if not is_admin(update): return
    if not context.args: await update.message.reply_text("Uso: `/reactivate LISTING_ID`", parse_mode='Markdown'); return
    try: fs_update('listings', context.args[0], {'status': 'available', 'updatedAt': datetime.now(timezone.utc).isoformat()+'Z'}); await update.message.reply_text(f"✅ `{context.args[0]}` → riattivato", parse_mode='Markdown')
    except Exception as e: await update.message.reply_text(f"❌ {e}")

async def cmd_delete(update, context):
    if not is_admin(update): return
    if not context.args: await update.message.reply_text("Uso: `/delete LISTING_ID`", parse_mode='Markdown'); return
    try: fs_delete('listings', context.args[0]); await update.message.reply_text(f"🗑 `{context.args[0]}` eliminato", parse_mode='Markdown')
    except Exception as e: await update.message.reply_text(f"❌ {e}")

async def cmd_help(update, context):
    await update.message.reply_text("━━━━━━━━━━━━━━━━━━━━━━\n🏠 *BOOM Listing Commands*\n━━━━━━━━━━━━━━━━━━━━━━\n\n/nuovoflat — Crea nuovo listing\n/listings — Mostra attivi con link\n/rent `ID` — Segna affittato\n/reactivate `ID` — Rimetti disponibile\n/delete `ID` — Elimina listing\n/cancel — Annulla wizard\n/help — Questo messaggio", parse_mode='Markdown')

# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    app = Application.builder().token(TELEGRAM_TOKEN).build()
    wizard = ConversationHandler(
        entry_points=[CommandHandler('nuovoflat', cmd_newlisting)],
        states={
            ZONE: [CallbackQueryHandler(zone_cb, pattern='^z_'), MessageHandler(filters.TEXT & ~filters.COMMAND, zone_text)],
            ADDRESS: [MessageHandler(filters.TEXT & ~filters.COMMAND, address_received)],
            TYPE: [CallbackQueryHandler(type_cb, pattern='^t_')],
            SQM: [CallbackQueryHandler(sqm_cb, pattern='^sqm_'), MessageHandler(filters.TEXT & ~filters.COMMAND, sqm_text)],
            FLOOR: [CallbackQueryHandler(floor_cb, pattern='^fl_')],
            BEDS: [CallbackQueryHandler(beds_cb, pattern='^bed_')],
            BATHROOMS: [CallbackQueryHandler(bathrooms_cb, pattern='^bath_')],
            PRICE: [CallbackQueryHandler(price_cb, pattern='^pr_'), MessageHandler(filters.TEXT & ~filters.COMMAND, price_text)],
            FURNISHED: [CallbackQueryHandler(furnished_cb, pattern='^furn_')],
            AVAILABLE: [CallbackQueryHandler(available_cb, pattern='^av_'), MessageHandler(filters.TEXT & ~filters.COMMAND, available_text)],
            CONCORDATO: [CallbackQueryHandler(concordato_cb, pattern='^conc_')],
            FEATURES: [CallbackQueryHandler(feature_cb, pattern='^f_')],
            DESCRIPTION: [CallbackQueryHandler(description_cb, pattern='^desc_'), MessageHandler(filters.TEXT & ~filters.COMMAND, description_text)],
            PHOTOS: [MessageHandler(filters.PHOTO, photo_received), CommandHandler('done', photos_done), CommandHandler('skip', photos_skip)],
            VIDEO: [CallbackQueryHandler(video_cb, pattern='^vid_'), MessageHandler(filters.TEXT & ~filters.COMMAND, video_text)],
            CONFIRM: [CallbackQueryHandler(confirm_cb, pattern='^cfm_')],
        },
        fallbacks=[CommandHandler('cancel', cancel)],
    )
    app.add_handler(wizard)
    app.add_handler(CommandHandler('listings', cmd_listings))
    app.add_handler(CommandHandler('rent', cmd_rent))
    app.add_handler(CommandHandler('reactivate', cmd_reactivate))
    app.add_handler(CommandHandler('delete', cmd_delete))
    app.add_handler(CommandHandler('help', cmd_help))
    logger.info("🚀 BOOM Listing Wizard avviato!")
    app.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == '__main__':
    main()
