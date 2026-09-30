# La scena 3D del metodo (egidimmobiliare.it)

Sorgenti della scena WebGL della sezione «Il metodo» di `egidi/index.html`: un appartamento tipo del
centro storico (nessun indirizzo, nessun edificio reale, nessun prezzo) che recita i cinque atti guidati
dallo scroll. Da qui escono **solo** file generati:

| File | Cos'è |
|---|---|
| `egidi/js/metodo3d.js` | il pacchetto: esm minificato, three 0.186.1 incluso e potato, una riga di intestazione con licenza e `sourceHash`. Nome FISSO: la pagina lo importa come `/js/metodo3d.js?v=<sha8>` |
| `egidi/js/metodo3d.manifest.json` | `{bundle, versione, sha256, sha8, bytes, gzip, brotli, sourceHash, sorgenti, three, posters, pose, posterT}` — `sha8` è il `V3D` della pagina |
| `egidi/js/LICENSE-three.txt` | la licenza MIT di three |
| `egidi/img/metodo-1..5.webp` | i poster (ripiego, movimento ridotto, senza JS): 1200×900, opachi, ≤ 90 KB |

Niente di questa cartella va in produzione (è fuori dalla Root Directory `egidi`).

## Rifare tutto

```sh
cd design/egidi-3d
npm ci                      # three 0.186.1, esbuild 0.24.2, versioni esatte
node build.mjs              # pacchetto + manifest + licenza; fallisce se > 600 KB min o > 130 KB brotli
node shoot.mjs --solo=poster          # rigenera i 5 poster (vanno nel repo)
node shoot.mjs --out=/tmp/fotogrammi  # fotogrammi desktop/mobile a tutte le T + poster + misure
```

Dopo ogni build **si rifanno i poster** (devono corrispondere al pacchetto) e si aggiorna `V3D` nella pagina
con il `sha8` del manifest (`tests/egidi/run.mjs` lo verifica). `shoot.mjs` usa il Chromium dei test
(`tests/_browser.mjs`) con SwiftShader: lento ma fedele. Opzioni: `--solo=desktop|mobile|poster|misura`,
`--T=0.85,2.48`, `--out=<cartella>`.

`harness.html` è la pagina di prova (servita dalla root del repo): `?T=2.48&layout=desktop|mobile|poster`,
`&ui=1` aggiunge velature, etichette, pin e mirino come la pagina, `&profilo=leggero`. Espone
`window.__h = { pronto, imposta(T), info(), proietta(id), poster(T, n), scena() }`.

## I file

- `plan.js` — i dati in metri: muri, aperture (portefinestre con parapetto, porta doppia), stanze, palette,
  e gli arredi come primitive (394 pezzi, ~17k triangoli). `superfici()` calcola netta (85,61 m², sulle
  stanze in cm² interi), lorda e commerciale (107 m², DPR 138/98 all. C). La pagina stampa i metri da qui.
- `textures.js` — tutte le texture disegnate su canvas con seme fisso: spina, cotto (OKLCH h 58–70°,
  C ≤ 0,08: niente che tiri al rosso), marmo, intonaco, travertino, legno, tessuto, occlusione, finestre
  accese, quadri/libri/pieghe, cifre delle quote, i quattro fogli (visura, planimetria, lucido, APE,
  conformità: solo barre, nessuna cifra, APE senza classe).
- `scena.js` — `monta()` e la coreografia. `imposta(T)` è pura e deterministica e disegna SUBITO.
- `build.mjs` — esbuild con three dai sorgenti: GLSL asciugato (commenti e indentazione), `WebXRManager`
  sostituito da un guscio vuoto (−13 KB: niente realtà virtuale nel sito).

## Il contratto con la pagina

```js
const M = await import('/js/metodo3d.js?v=' + V3D);
const scena = await M.monta(tela, { token, layout: 'desktop'|'mobile'|'poster', profilo: 'pieno'|'leggero',
  dpr, larghezza, altezza, esigente, onPerso, onRipristino });
scena.imposta(T)        // rende nello stesso giro: la pagina fa drawImage subito (niente preserveDrawingBuffer)
scena.proietta(id)      // { x, y, visibile } px CSS rispetto alla tela; id = stanza | 'noncombacia' | 'rogito' | 'boom'
scena.dimensiona(w, h, dpr, layout) · scena.qualita(1..3) · scena.info() · scena.distruggi()
M.VERSIONE = '4.0.0' · M.POSE = [0.85, 1.70, 2.48, 3.85, 4.85]
M.SCATTI = [[2.44, 2.52], [2.655, 2.72], [2.875, 2.95]] · M.PIANTA · M.rilievoX(T)
```

`info()` → `{ dpr, profilo, qualita, programs, calls, tris, layout }`. `qualita(n)` scende soltanto:
1 = DPR ×0,8 (minimo 1), 2 = ombra 1024 radius 1,5, 3 = niente ombre. Il ripiego ai poster lo decide la pagina.

Poster (layout `poster`, fondo opaco notte per 1–4 e boom per 5): T 0,85 · **1,635** (il momento del
«NON COMBACIA») · 2,48 · 3,85 · 4,85, con disegnate dentro le etichette delle stanze (atto 1) e i chip
«NON COMBACIA», «ROGITO» e «OPPURE LA AFFITTA BOOM» (in modalità poster la pagina non ha pin).

## Come sta nel budget (≤ 12 programmi, ≤ 50k triangoli)

Nove programmi in tutto. Tutte le mesh illuminate che non sono pavimento condividono **un solo programma**
(MeshStandard + taglio + map + colori per vertice + `onBeforeCompile`, chiave `boom-lit4`): i mobili di tutte
le stanze sono fusi per famiglia di materiale e la caduta «stanza per stanza» si fa nel vertex shader
(`attribute float aStanza` + `uniform float uCade[9], uAlza[9]`). L'ombra usa un `MeshDepthMaterial` con la
stessa iniezione. Gli altri: pavimenti con lo scan dell'atto 1, vetro, sezione dei muri (BackSide), basic
trasparente con mappa (fogli, occlusione, luci, quote), linee, ShadowMaterial.

Ombre **deterministiche**: `shadowMap.autoUpdate = false`; tre finestre ferme (pianta T < 1,76,
1,96–2,00, interni 2,42–3,02) calcolate una volta all'ingresso nello stato canonico del taglio, anche se la
vista ha un altro taglio; altrove ricalcolata a ogni fotogramma.

## Scostamenti dal piano §3 (scritti, come chiesto)

1. **Nome del pacchetto fisso** `metodo3d.js?v=<sha8>` (e poster senza hash): è il contratto del coordinatore, non `metodo3d.<hash8>.js`.
2. **Soggiorno 23,58 m², non 23,57.** 5,75 × 4,10 = 23,575 esatti: arrotondato a metà in su fa 23,58 (come la cucina, 13,475 → 13,48 nel piano stesso). Il 23,57 del piano veniva da `toFixed` su un numero binario. Il totale 85,61 non cambia; la somma delle etichette arrotondate fa 85,63 (differenza di arrotondamento, sotto la tolleranza di 0,05 del test).
3. **Luci ritarate sui fotogrammi**: ambiente 0,36 / 0,46 negli interni / 0,06 al tramonto (non 0,62/0,95/0,07), sole 3,0 → 5,2 dentro → 0,18, più una `HemisphereLight` cielo/pavimento (0,55/0,70/0,03) che schiarisce le ombre; SpotLight della cucina a 8 invece di 16, bilanciata con la luce emisferica. Con l'ambiente del piano i piani lucidi (tavolo, piano cucina) uscivano bianchi per il riflesso negli interni.
4. **Persiane**: 16 mesh con cardine (non InstancedMesh: un programma in più), aperte a 100° con sfasamento 0,012 da ovest a est come da piano.
5. **Atto 2**: la planimetria posata diventa un **lucido** (muri in `--accento-chiaro` su fondo velato, opacità 0,92) invece di sfumare a 0,55: si vede dove la carta combacia col costruito. La linea di M8 pulsa due volte fra 1,60 e 1,625 e poi resta accesa fino allo scivolamento (1,66–1,72), così il poster a 1,635 la mostra piena. Il muro non si sposta mai: si aggiorna la carta.
6. **Pianta**: target (5,40; 0; 5,25) invece di (5,60; 0; 5,05), per tenere pianta + quote nella parte libera anche su mobile.
7. **Assonometria** hfov 40° (42° a 2,18) invece di 30°: a 30° la casa usciva dal riquadro libero su desktop.
8. **Interni**: il fov verticale è limitato 40–80° sull'altezza VISIBILE (su mobile il foglio copre metà tela, vh 0,5), non su tutta la tela.
9. **Porta doppia** soggiorno–ingresso aperta a 115° verso il soggiorno: aperta verso l'ingresso chiudeva l'infilata di S1.
10. **Soffitto**: fa ombra solo dentro casa (T 2,28–3,04); fuori il sole entrerebbe dall'alto aperto con il taglio.
11. **Atto 4**: il piano d'ombra al suolo sparisce a T ≥ 3,12 (disegnava una barra sulla strada vista dal pedone).
12. **Quote** come nastri di 3 cm opachi invece di linee da 1 px a 0,85 (le linee a opacità ridotta non davano mai il colore esatto `#96C0FE`); **filo d'oro** rinforzato da nastri pieni `#FFD700` su cornicione, base e marcapiano, sopra le `LineSegments`.
13. **Finestre accese**: piano a fusione normale `#FFE3B8` a 0,9 più alone additivo a 0,34 separato (tutto additivo saturava al bianco).
14. **Arredi**: cadono da +0,25 m con scala Y 0,94 → 1 come da piano, ma su 8 stanze via uniform, non 8 gruppi di mesh.

Colori di marca verificati sui pixel: poché `#F2EFE8` e misure `#96C0FE` esatti a T 0,85; oro `#FFD700`
esatto a T 4,85; finestre accese calde (OKLCH h ≈ 78°), mai oro, mai rosso.
