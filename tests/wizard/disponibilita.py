"""The actual Telegram writer routes availability through the canonical handler."""
import ast
from pathlib import Path
source = Path(__file__).resolve().parents[2] / 'bot/boom_listing_wizard.py'
tree = ast.parse(source.read_text())
fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == '_edit_listing')
calls = []
reply = {'ok': True}
ns = {'_now_iso': lambda: 'now',
      'wizard_post': lambda *a: calls.append(('api', a)) or reply,
      'fs_update': lambda *a: calls.append(('firestore', a))}
exec(compile(ast.Module(body=[fn], type_ignores=[]), str(source), 'exec'), ns)
edit = ns['_edit_listing']
original = {'availableDate': '2027-01-01'}
edit('casa', original)
assert len(calls) == 1 and calls[0][0] == 'api'
assert calls[0][1][0] == '/api/listings-availability'
assert calls[0][1][1]['updates'] == [{'id': 'casa', 'value': '2027-01-01'}]
assert original == {'availableDate': '2027-01-01'}
calls.clear()
edit('casa', {'status': 'rented', 'name': 'Nome corretto'})
assert [c[0] for c in calls] == ['api', 'firestore']
assert 'status' not in calls[1][1][2]
calls.clear()
reply = {'ok': False, 'failed': [{'error':'changed_since_preview'}]}
try:
    edit('casa', {'availableDate':'Subito', 'price':1500})
    raise AssertionError('must reject failed availability before writing other fields')
except ValueError:
    pass
assert len(calls) == 1 and calls[0][0] == 'api'
reply = None
try:
    edit('casa', {'availableDate':'Subito'})
    raise AssertionError('missing response must be uncertain')
except ValueError as e:
    assert 'non verificato' in str(e)
print('Disponibilità bot: endpoint unico, fallimenti espliciti, nessuna scrittura alternativa — passed')
