# Prompt per GPT — definire (o bocciare) «l'integrazione con GPT»

*8 settembre 2026. Da incollare in ChatGPT così com'è. Non contiene chiavi,
numeri di telefono né dati di clienti: descrive l'architettura e le regole.
La risposta di GPT va confrontata con `STUDIO_CARICO_2026-09.md` §5-§6.*

---

Sei il consulente di architettura di BOOM Roma. Leggi TUTTO questo brief
prima di scrivere una parola, e rispondi SOLO nel formato obbligatorio in
fondo. Non lusingare, non proporre framework, non proporre di rifare il
sistema.

## 1. Chi sono e qual è il problema

Sono Valentino, fondatore e operatore unico di BOOM Roma (boomrome.com):
gestione affitti premium a Roma per expat, studenti e professionisti in
trasferta. Oggi: oltre 15 contratti attivi, appartamenti nuovi in entrata,
visite, registrazioni. Lavoro dalle 9 alle 18 come minimo. Non voglio
assumere personale e non voglio abbassare la qualità.

Il collo di bottiglia è misurato, non percepito: sono io. Circa 90 messaggi
WhatsApp entranti al giorno; su 29.255 miei messaggi in 180 giorni, metà
sta sotto i 17 caratteri (centinaia di micro-interruzioni, non ore di
scrittura); 544 ultime parole di clienti rimaste senza risposta.

## 2. Cosa esiste GIÀ (non proporre di ricostruirlo)

Stack: pagine HTML/JS statiche su Vercel; Firestore + Firebase Auth come
UNICA fonte di verità; Vercel Serverless Functions in Node; modelli
Anthropic chiamati solo dal server; un bot Telegram che è la «tasca»
dell'operatore; un Mac mini con IP residenziale («Homie») che esegue ciò
che il server decide su WhatsApp e sui portali immobiliari.

Superfici: portale admin (con la coda delle decisioni «Oggi» come prima
schermata), portali per inquilino, proprietario e cliente ricerca, console
specialistiche (ricerca casa, radar di mercato, banca, centralino), pagine
pubbliche, bot Telegram.

La Squadra: 26 agenti automatici su 28 cron. 21 agiscono da soli e
scrivono a inquilini, proprietari e lead senza approvazione; 3 passano
sempre dall'approvazione umana; 2 in parte. Fra loro: Commerciale (prima
risposta ai lead, da approvare), Gestore (solleciti e firme, da
approvare), Contabile, Regista (foglio di chiamata delle 07:30 con visite
e viaggi, task in linguaggio naturale), Segugio (alert sulle ricerche
salvate), Lead Brain (grading dei lead quasi gratis, regole prima del
modello), Perito e Radar (market intelligence con i canoni FIRMATI, che
nessun portale ha), Rendiconto mensile ai proprietari, Archivista,
Pubblicista verso i portali, Fotografo e Copywriter notturni, Centralino
(segreteria Twilio più una Receptionist vocale bilingue che in chiamata
legge il catalogo vero e gli slot visita veri).

Le rotaie: tutto ciò che esce verso un cliente passa da una coda
(`action_queue`) → card Telegram → tap dell'operatore → esecutore → outbox
WhatsApp sul Mac oppure email. Idempotenza per costruzione (id
deterministici, hash di contesto): un retry non manda mai due volte.

La scala della fiducia: le categorie di bozze con almeno 30 decisioni
storiche e almeno il 95% di approvazioni possono partire da sole, con 10
minuti di grazia e un tasto «Ferma». Default: tutto spento, si accende da
Telegram.

La Segretaria WhatsApp: prende in mano una conversazione quando
l'operatore gliela consegna con un tap, e la porta fino alla visita
prenotata o all'escalation. I binari sono nel codice, non nel prompt: mai
con inquilini o proprietari, mai link fuori dominio, tetti di turni,
escalation automatica su parole legali o rabbia, un messaggio manuale
dell'operatore la spegne.

Il resto: prenotazione visite istantanea su griglia reale (calendario
Google integrato), firma digitale con link magici, pre-accordo,
pagamenti carta e SEPA, registrazione contratti a un tap, fascicoli e
pack per il commercialista, inventario dal video, verbale chiavi.

Il bot Telegram capisce il linguaggio naturale: l'85% dei messaggi si
risolve senza modello (regole più catalogo); comandi per fiducia,
segretaria, visite, richiamo dei lead, giornata; i documenti mandati al
bot vengono classificati e archiviati da soli; la disponibilità di più
case si aggiorna con una frase.

## 3. Le regole di casa (non negoziabili)

1. Mai inventare: un agente sa solo ciò che i dati e i tool gli dicono;
   ambiguo significa «non lo so», mai un fatto finto.
2. Una copia sola: ogni regola vive in un motore puro e testato; due copie
   divergono.
3. Si misura prima di costruire.
4. Il server pensa, il Mac esegue; un bot è solo trasporto.
5. Cambiare porta significa cambiare solo il trasporto: coda, stato e
   veti restano gli stessi.
6. Nessun secondo stato: Firestore è l'unica verità. Un modello non
   «ricorda» nulla fuori da lì.
7. Mai delegare prezzo e trattativa, né a umani né a modelli.
8. Approvazione umana su ciò che non è provato; auto-invio solo sul
   misurato.
9. Ogni autonomia ha un interruttore, un'escalation e l'idempotenza.

## 4. Stato reale all'8 settembre 2026

Ad agosto uno studio interno aveva già deciso: la segreteria è software,
l'unica assunzione sensata è un operativo di campo a task (visite,
chiavi, inventario), accendere la Receptionist, girare gli interruttori
della fiducia. Eseguito: quasi niente. La Receptionist è rimasta rotta 17
giorni per un redirect mai letto, il numero puntava a un agente vecchio,
la fiducia è ancora sui default. Diagnosi: si costruisce più di quanto si
attivi. Le leve esistono e sono spente perché richiedono un mio click.

Il lavoro che costa ancora ore è trascrivere ciò che arriva (WhatsApp,
PDF, email) dentro il portale; esiste già uno studio («Scrivano») per
farne una conferma invece di una trascrizione.

## 5. La domanda su cui devi aiutarmi

Voglio definire, o bocciare, una funzione chiamata provvisoriamente
«integrazione con GPT». Ho scartato un'idea precedente chiamata Astra.
Le idee vaghe che ho in testa: «doppio confronto», «infrastruttura più
semplificata», «identità globale interna». Non è ancora definita. Il tuo
compito NON è progettarla: è aiutarmi a definirla in un paragrafo, oppure
dirmi che non serve.

Le tre letture possibili:

A. GPT come superficie unica dell'operatore: parlo a ChatGPT e lui opera
   BOOM attraverso le API. Rischio: duplica il bot Telegram, che fa già
   questo.
B. «Doppio confronto»: due modelli che si controllano a vicenda. Rischio:
   costo doppio per un'opinione, quando in BOOM il controllo è un dato
   (tassi di approvazione, veti deterministici, test).
C. «Identità globale»: una voce sola invece di 26 mestieri con nome.
   Verso l'esterno è già la regola («noi di BOOM», mai la firma di una
   persona); sarebbe un cambio di presentazione, non di infrastruttura.

## 6. Formato obbligatorio della risposta (in italiano, massimo 900 parole)

1. Prima le obiezioni: cinque ragioni per cui NON costruire nulla di
   nuovo adesso, le più forti per prime.
2. Quale lettura (A, B, C o un'altra) ha senso per il MIO problema, il
   carico, in un solo paragrafo, con la condizione che la rende sensata.
3. Se ha senso: la mappa trasporto → rotaie esistenti. Per ogni funzione
   proposta, quale API, coda o veto già esistente la serve. Tutto ciò che
   richiederebbe uno stato nuovo va segnalato come violazione della
   regola 6.
4. Cosa NON deve fare, esplicitamente.
5. Il criterio di misura: quale numero deve muoversi in 30 giorni perché
   valga (messaggi manuali al giorno, ore di campo, decisioni in coda,
   altro), e come lo misuro con ciò che esiste.
6. Cinque domande che devi farmi prima di procedere.
