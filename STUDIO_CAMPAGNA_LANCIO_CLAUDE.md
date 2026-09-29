# STUDIO — La campagna di lancio BOOM (versione Claude)

*28/09/2026 · branch `claude/boom-launch-marketing-dypu7a`. File separato
di proposito: la versione Codex/GPT non viene toccata. Il confronto riga per
riga sta in §8 e si compila quando arrivano il loro piano e il loro budget.*

---

## 0. Prima di spendere un euro: la misura è rotta

Il difetto più caro, e va chiuso prima di tutto il resto. Se non si chiude,
una campagna non si può giudicare, e quindi non si può nemmeno confrontare
con quella di GPT.

- `js/boom-track.js` legge le UTM e salva il canale d'origine (`boom_src`).
  Però **non è caricato** proprio sulle pagine dove atterrerebbe il traffico
  pagato: `index`, `apartments`, `apartment-detail` ed `executive`
  (verificato: zero occorrenze).
- `api/apply-lead.js` ed `api/executive-lead.js` **non salvano** il canale
  sul lead. L'unica porta che lo salva è `/api/leads/web`.

In pratica, un lead arrivato da un reel pagato oggi si legge `source:'web'`,
esattamente come uno organico. Ogni € speso andrebbe a finire nello stesso
calderone.

**P0 (mezza giornata, codice):** caricare boom-track.js sulle quattro
pagine; far scrivere a `apply-lead` ed `executive-lead` un campo
`attribution` (utm_source/medium/campaign + first touch); poi un report
settimanale lead → visita → firma per canale, costruito sui dati che già
esistono. Solo dopo si accende la spesa.

## 1. Il bersaglio: una cifra sola

BOOM non "lancia" da zero: ha già più di 15 contratti e una macchina che
funziona. Quello che va lanciato è la **domanda generata**, non la
reputazione. Proposta (da confermare):

> **Obiettivo a 30 giorni: 12 contratti firmati attribuibili alla campagna,
> con un costo di acquisizione per contratto ≤ 1 mese di provvigione media.**

Metriche di contorno: lead qualificati A/B dal Lead Brain, visite
confermate, tasso visita → firma. I like e le visualizzazioni non contano.

## 2. Il vantaggio che nessun concorrente può copiare

Non è "case belle a Roma": quelle le promettono tutti. È **la chiusura
legale da remoto, in inglese**: visita video, proposta firmata online,
contratto transitorio registrato, canone concordato attestato, Wallet pass,
pagamento SEPA. È la risposta alla paura numero uno dell'expat: mandare
3.000 € a uno sconosciuto. La dottrina delle risposte rapide lo dice già:
**si vende il non essere truffato**, non l'appartamento.

Linea di campagna (EN-first): **"Rent in Rome before you land. Legally."**

## 3. I pubblici, in ordine di valore

| # | Pubblico | Perché ora | Porta d'ingresso |
|---|---|---|---|
| 1 | **Executive / consulenti ONU** (FAO, WFP, IFAD, ambasciate) | date certe, budget alto, paga il datore | `/executive` |
| 2 | **Studenti internazionali — intake di gennaio** | la stagione di settembre è chiusa, quella di gennaio si decide ADESSO (ottobre–novembre) | `/apartments` + corsia pre-blocco |
| 3 | **Aziende / HR relocation** | un contratto B2B vale N inquilini | `/corporate` (canale diretto, niente ads) |
| 4 | **Proprietari** | l'offerta si alimenta da sola | `/owners`, calcolatore canone |

## 4. Si parte dalle mosse a costo zero (settimana 1, prima degli ads)

1. **Il Richiamo sull'archivio.** Ci sono 544 ultime parole di clienti
   rimaste senza risposta (Miniera). `/richiama recenti 120` con un tap
   raggiunge le persone che hanno GIÀ chiesto una casa. È il lead più
   economico che esista, ed è già costruito.
2. **Referral degli inquilini attivi**: il codice `BOOM-<uid6>` esiste già
   in `/casa`. Una WhatsApp personale a ciascuno dei 15+ inquilini, con un
   incentivo dichiarato (es. 1 Cleaning Premium da 119 € a referral firmato).
3. **Recensioni Google**: `/enrev` a chi ha firmato negli ultimi 6 mesi.
   L'ad pagato converte meglio se il profilo ha le stelle.
4. **Uffici internazionali delle università** (LUISS, John Cabot, AUR,
   Sapienza Erasmus) e liste consulenti delle agenzie ONU: email B2B
   personali da `/corporate`. Nessun budget, solo una voce.

## 5. Le creatività (Higgsfield via MCP)

Regole in vigore (dallo STUDIO_MARKETING_HIGGSFIELD): **mai un fatto
inventato, mai il prezzo dentro i pixel, solo foto NOSTRE, niente si
pubblica senza un tap.**

| Formato | Contenuto | Modello Higgsfield (da scegliere nel tool) | Q.tà |
|---|---|---|---|
| Reel 9:16, 15" | walkthrough di un annuncio vero dalle sue foto (image-to-video), chiusa sul marchio | image-to-video cinematografico | 6 (gli annunci top della Pagella) |
| Reel 9:16, 20" | "Before you land": telefono → video call → firma → chiavi (storyboard, nessun volto reale di clienti) | text/image-to-video | 2 |
| Statico 1:1 / 4:5 | "3.000 € to a stranger? No." + le 4 prove (registrato, video, firma online, ricevute) | image | 4 |
| Carosello LinkedIn | Executive: "Your Rome lease, closed before your posting starts" | image | 1 × 6 slide |

**Registro produzione** (crediti Higgsfield, piano Ultra, 85,38 all'inizio):

| Data | Annuncio | Modello | Formato | Crediti | Esito |
|---|---|---|---|---|---|
| 29/09 | Bilocale Ponte Milvio (`ttvrjazww9oe4tA0wHTf`, copertina) | `kling3_0` std, senza audio | 9:16 · 5" · 720×1280 | 6,25 | test — da verificare a occhio: la casa deve restare IDENTICA alla foto; job `08c66a0e-8ab7-42ae-9dbf-5f554036290f` |

Ogni creatività porta un link con UTM (`utm_source=meta|google|linkedin`,
`utm_campaign=lancio-2026-10`, `utm_content=<id creatività>`), così si sa
quale creatività ha prodotto una firma.

## 6. Il budget (percentuali: si innestano sulla cifra di GPT)

La cifra totale la dà il progetto GPT. Qui c'è la **ripartizione**, che
scala su qualsiasi totale:

| Voce | % | Perché |
|---|---|---|
| Google Search (query ad alta intenzione: "apartment rent Rome", "Rome rental for expats", "FAO housing Rome") | 40% | intenzione dichiarata = costo per firma più basso |
| Meta (IG/FB) retargeting + lookalike sui visitatori | 25% | i reel lavorano sul caldo, non sul freddo |
| LinkedIn (executive/HR, geo Roma + trasferimenti) | 15% | pochi click, ma valgono molto |
| Crediti Higgsfield (creatività) | 10% | tetto fisso, dichiarato |
| Riserva: si sposta al canale vincente a fine settimana 2 | 10% | si decide sui numeri, non sulle opinioni |

Regola di spesa: **a fine settimana 2** ogni canale con costo per lead
qualificato superiore al doppio della media si spegne, e la sua quota va a
quello migliore.

## 7. Calendario (30 giorni)

- **G1–3** — P0 della misura (§0). Richiamo, referral, recensioni (§4).
- **G4–7** — produzione creatività Higgsfield, approvazione una per una.
- **G8** — accensione di Google e LinkedIn. Meta solo in retargeting.
- **G15** — verifica: taglio e riallocazione (§6).
- **G30** — verdetto per canale: lead → visita → firma e costo per firma.
  Si decide la fase successiva.

## 8. Confronto con la versione Codex/GPT (da compilare)

| Criterio | Claude | Codex/GPT |
|---|---|---|
| Obiettivo misurabile | 12 firme/30gg, CAC ≤ 1 mese di provvigione | — |
| Misura prima della spesa | P0 obbligatorio (§0) | — |
| Mosse a costo zero prima degli ads | Richiamo, referral, recensioni, uffici | — |
| Pubblico primario | Executive + intake di gennaio | — |
| Messaggio | anti-truffa, chiusura legale da remoto | — |
| Budget totale | = quello GPT | — |
| Ripartizione | 40/25/15/10/10 | — |
| Regola di taglio | settimana 2, 2× la media | — |
| Rischio principale | tempo dell'operatore sulle visite (collo di bottiglia misurato) | — |

**Rischio dichiarato della mia versione:** se funziona, i lead
raddoppiano, e l'operatore è già il collo di bottiglia (90 WhatsApp al
giorno). Prima della settimana 2 la Segretaria e la scala della fiducia
devono essere accese sui follow-up, altrimenti la campagna compra lead che
poi restano senza risposta, come già succede ai 544 di adesso.
