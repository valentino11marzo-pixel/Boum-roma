// api/_modeljson.js — LEGGERE UN JSON SCRITTO DA UN MODELLO, IN UNA COPIA SOLA.
//
// LA LEZIONE DEL 28 AGOSTO 2026 (trovata nei log di produzione il 31/08).
// L'Innesto è morto due volte su documenti VERI dell'operatore — due contratti
// con dentro proprietari reali — con l'errore `ai_bad_json`. La lettura era
// questa, ricopiata in OTTO file:
//
//     JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
//
// Sembra prudente e non lo è:
//  · `lastIndexOf('}')` non cerca la fine dell'oggetto, cerca l'ULTIMA graffa
//    del testo. Una riga di commento del modello dopo il JSON — «Nota: il
//    deposito {non indicato}» — e si taglia in un punto qualsiasi.
//  · una risposta TRONCATA (il modello ha finito i token) non si distingue da
//    una malformata: stesso errore opaco, e l'operatore legge «ai_bad_json»
//    su un contratto che voleva registrare.
//  · le sbavature vere dei modelli — la virgola in coda, il `// dedotto`
//    accanto a un campo, un a capo dentro una stringa — fanno cadere tutto,
//    anche quando il dato c'è ed è integro.
//
// Qui la lettura è UNA, e le regole sono scritte:
//
//  1. SI SISTEMA SOLO CIÒ CHE NON PUÒ CAMBIARE IL SIGNIFICATO — il recinto
//     ```json, la prosa fuori dall'oggetto, la virgola in coda, i commenti,
//     un a capo dentro una stringa. Sono errori di FORMA.
//  2. UNA RISPOSTA TRONCATA NON SI RIPARA MAI. Chiudere le graffe che mancano
//     è facile e sarebbe il difetto peggiore di tutti: l'ultimo valore letto è
//     a metà («Roma, Via Crem») e verrebbe consegnato all'operatore come se
//     fosse quello che c'è scritto nel documento. Un dato mezzo letto è più
//     pericoloso di un dato mancante, perché non si vede. Si dice: troncata.
//  3. LA DIAGNOSI NON PORTA CONTENUTO. Il vecchio codice stampava nei log
//     `raw.slice(0, 200)` — cioè, in chiaro dentro i log di Vercel, il codice
//     fiscale e l'IBAN di persone reali (ci sono finiti davvero: si leggono
//     ancora nel rapporto errori). Per capire un guasto bastano la forma e la
//     misura: perché è fallita, quanto era lunga, se era in un recinto.

const CTRL = { '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' };

// Il confine VERO dell'oggetto: si cammina nel testo rispettando stringhe ed
// escape, così una graffa dentro un valore ("via Garibaldi 12/B }") o nella
// prosa dopo il JSON non sposta la fine. Torna -1 se l'oggetto non si chiude
// mai — che è esattamente la firma di una risposta troncata.
function matchingBrace(s, start) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
        const c = s[i];
        if (inStr) {
            if (esc) { esc = false; continue; }
            if (c === '\\') { esc = true; continue; }
            if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') { inStr = true; continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return i; }
    }
    return -1;
}

// Le tre sbavature di forma, tolte SOLO fuori dalle stringhe (dentro una
// stringa `//` è un indirizzo web e una virgola è una virgola).
function tidy(s) {
    let out = '', inStr = false, esc = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (inStr) {
            if (esc) { out += c; esc = false; continue; }
            if (c === '\\') { out += c; esc = true; continue; }
            if (c === '"') { out += c; inStr = false; continue; }
            // un a capo VERO dentro una stringa è illegale in JSON ma è ciò
            // che i modelli scrivono nelle note: si scrive come escape, che è
            // la stessa cosa detta in modo valido.
            out += (CTRL[c] !== undefined ? CTRL[c] : (c < ' ' ? '' : c));
            continue;
        }
        if (c === '"') { out += c; inStr = true; continue; }
        if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
        if (c === '/' && s[i + 1] === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++; i++; continue; }
        out += c;
    }
    // virgola in coda, prima di } o ]
    return out.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Legge il JSON che un modello ha scritto.
 * @returns {{ok:true, value:object}|{ok:false, why:'empty'|'no_object'|'truncated'|'invalid'}}
 * `why` è già la spiegazione: 'truncated' vuol dire che la risposta è stata
 * tagliata (chiedere meno testo o alzare max_tokens), 'invalid' che è
 * illeggibile anche dopo le correzioni di forma.
 */
export function parseModelJson(raw) {
    const s = String(raw == null ? '' : raw);
    if (!s.trim()) return { ok: false, why: 'empty' };
    const a = s.indexOf('{');
    if (a < 0) return { ok: false, why: 'no_object' };
    const b = matchingBrace(s, a);
    if (b < 0) return { ok: false, why: 'truncated' };
    const body = s.slice(a, b + 1);
    try { return { ok: true, value: JSON.parse(body) }; } catch (_) { /* si prova a ripulire */ }
    try { return { ok: true, value: JSON.parse(tidy(body)) }; } catch (_) { return { ok: false, why: 'invalid' }; }
}

/** Comodo dove il chiamante vuole solo il valore o null (com'era prima). */
export function modelJson(raw) {
    const r = parseModelJson(raw);
    return r.ok ? r.value : null;
}

/**
 * La riga da mettere nei log: FORMA e MISURA, mai contenuto. Il materiale
 * letto qui dentro sono contratti e documenti d'identità.
 * `stopReason` è quello di Anthropic: 'max_tokens' conferma il taglio.
 */
export function jsonFailureLine(raw, why, stopReason) {
    const s = String(raw == null ? '' : raw);
    return `why=${why} len=${s.length} fenced=${/^\s*```/.test(s) ? 1 : 0}`
        + (stopReason ? ` stop=${stopReason}` : '');
}

/** Il messaggio per l'operatore: dice cosa fare, non come si chiama il guasto. */
export function jsonFailureHint(why) {
    return why === 'truncated'
        ? 'Il documento è troppo lungo: la lettura si è interrotta a metà. Prova con le pagine che contano (le prime due di un contratto bastano quasi sempre).'
        : why === 'no_object' || why === 'empty'
            ? 'Dal documento non è uscito nulla di leggibile — se è una scansione storta o molto scura, rifai la foto.'
            : 'La lettura è arrivata incompleta. Riprova: se ricapita sullo stesso file, incolla il testo invece del PDF.';
}
