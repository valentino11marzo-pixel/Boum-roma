# LA PAGINA VERA COME ANTEPRIMA.
# Due trappole gia' pagate, entrambe scritte qui perche' non tornino:
# 1. Il guscio dell'artifact fornisce doctype/head/body, quindi il corpo
#    va consegnato senza <head> — ma l'<head> di una pagina BOOM contiene
#    TUTTO il vestito. Buttarlo via produceva HTML nudo, illeggibile sul
#    telefono. Gli stili si portano dentro (<style> in body e' valido).
# 2. I riferimenti locali vanno riscritti sul sito vero, ma quella
#    riscrittura NON deve entrare nel codice: una regex letterale come
#    (/fonts\./) diventava (https://boomrome.com/fonts\./) e lo script
#    non compilava piu'. Percio' cio' che si inlina esce di scena dietro
#    un segnaposto, si riscrivono gli URL, e poi rientra intatto.
import re, sys, os
R = '/home/user/Boum-roma/'
src, out = sys.argv[1], sys.argv[2]
orig = open(R + src, encoding='utf-8').read()
s = orig
cassa = []


def _serba(testo):
    cassa.append(testo)
    return f'\x00SEGNAPOSTO{len(cassa) - 1}\x00'


# il foglio del marchio e ogni script locale scendono inline (host esterni
# bloccati dalla CSP dell'artifact) e restano fuori dalla riscrittura
css = open(R + 'css/boom-2026.css', encoding='utf-8').read()
s = s.replace('<link rel="stylesheet" href="/css/boom-2026.css">',
              _serba('<style>\n' + css + '\n</style>'))


def _inline(m):
    f = R + m.group(1).lstrip('/')
    if not os.path.exists(f):
        return m.group(0)
    return _serba('<script>\n' + open(f, encoding='utf-8').read() + '\n</script>')


s = re.sub(r'<script[^>]*\bsrc="(/js/[^"]+\.js)"[^>]*></script>', _inline, s)
# anche gli script GIA' in pagina restano intoccati
s = re.sub(r'<script\b(?![^>]*\bsrc=)[^>]*>.*?</script>',
           lambda m: _serba(m.group(0)), s, flags=re.S)

# ora, e solo ora, i riferimenti locali puntano al sito vero
s = re.sub(r'(?<=["\'(])/(?!/)', lambda _m: 'https://boomrome.com/', s)

# testa e corpo
mb = re.search(r'<body[^>]*>', s)
testa, corpo = s[:mb.start()], s[mb.end():]
corpo = corpo.replace('</body>', '').replace('</html>', '')

# Dalla testa si salva cio' che VESTE la pagina, NELL'ORDINE DEL
# DOCUMENTO: raccoglierlo per tipo invertiva la cascata — gli stili della
# pagina finivano prima del foglio del marchio, che quindi li sovrascriveva
# (la striscia dei servizi risaliva sotto la nav, di 60px esatti).
vestito = [m.group(0) for m in re.finditer(
    r'<style\b[^>]*>.*?</style>|\x00SEGNAPOSTO\d+\x00'
    r'|<link[^>]+fonts\.googleapis[^>]*>', testa, re.S)]

tit = re.search(r'<title>(.*?)</title>', orig, re.S)
fin = (('<title>' + tit.group(1).strip() + '</title>\n') if tit else '') \
    + '\n'.join(vestito) + '\n' + corpo
fin = re.sub(r'\x00SEGNAPOSTO(\d+)\x00', lambda m: cassa[int(m.group(1))], fin)
assert '<style' in fin, out + ': nessuno stile salvato dalla testa'
open(out, 'w', encoding='utf-8').write(fin)
print(out, os.path.getsize(out) // 1024, 'KB')
