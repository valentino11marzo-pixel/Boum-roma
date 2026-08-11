#!/usr/bin/env python3
# la banca delle gallerie: le foto vere, ridotte per stare in un'anteprima
import json, base64, io, urllib.request, os
from PIL import Image
d = json.load(open('case-full.json'))
banca = json.load(open('foto-galleria.json')) if os.path.exists('foto-galleria.json') else {}
MAX = 6
for r in d:
    if r.get('status') != 'available': continue
    ide = r.get('_id') or r.get('id')
    im = (r.get('images') or [])[:MAX]
    if not im or banca.get(ide): continue
    fatte = []
    for u in im:
        try:
            with urllib.request.urlopen(u, timeout=25) as f:
                dati = f.read()
            p = Image.open(io.BytesIO(dati)).convert('RGB')
            w = 640
            p = p.resize((w, round(p.height * w / p.width)), Image.LANCZOS)
            b = io.BytesIO(); p.save(b, 'JPEG', quality=64, optimize=True)
            fatte.append('data:image/jpeg;base64,'
                         + base64.b64encode(b.getvalue()).decode())
        except Exception as e:
            print('  saltata:', str(e)[:60])
    if fatte:
        banca[ide] = fatte
        print(f"{r['name'][:30]:32} {len(fatte)} foto")
json.dump(banca, open('foto-galleria.json', 'w'))
print('banca:', len(banca), 'case ·',
      sum(len(v) for v in banca.values()), 'foto ·',
      os.path.getsize('foto-galleria.json') // 1024, 'KB')
