# Marchio Valentino Egidi — tre territori (studio, 01/10/2026)

Tre direzioni di marca complete, provate a parità di condizioni: stessa frase,
stesso sito, stesse applicazioni (cartello vendesi, avatar WhatsApp, biglietto,
accanto a BOOM). Fuori dal deploy (`design/` è in `.vercelignore`).

| | Territorio | Idea | Logo | Carattere | Colore | Con BOOM |
|---|---|---|---|---|---|---|
| 1 | **Il Rione** (custode di Roma) | pianta di Nolli + targa di travertino | targa incisa, EGIDI in testa; simbolo = pianta del palazzo | Castoro Titling + Castoro + Hanken Grotesk | travertino, basalto, verderame | marchi separati |
| 2 | **La Fascia** (il perito) | modernismo italiano, una fascia che porta i dati veri | EGIDI su fascia arancio; simbolo = E | Anybody largo + Inter Tight + Martian Mono | calce, nero, arancio segnale | famiglia per contrasto |
| 3 | **La Porta** (la famiglia) | una casa, due porte: archi da una soglia, cerchi da un punto | archi annidati + "Valentino Egidi" | Inter Tight (anche per BOOM) + JetBrains Mono | calce, grafite; notte e oro solo BOOM | casa unica di marchi |

Regole comuni nate dalla ricerca: niente monogramma con la V (né "VE"), niente
rosso, "Valentino Egidi" sempre inseparabile o EGIDI in testa (rischio di
confusione con la Maison Valentino); prima del marchio definitivo serve una
ricerca di anteriorità nelle classi 35/36/37 con un consulente.

Rigenerare: `node getfont.mjs <famiglie…>` (scarica i font OFL in `fonts/`,
ignorata), poi `node build.mjs [1 2 3]` e `node confronto.mjs`. Le tavole
pubblicate sono in `tavole/`.
