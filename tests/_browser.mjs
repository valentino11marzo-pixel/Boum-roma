// tests/_browser.mjs — COME SI APRE UN BROWSER NEI TEST, IN UNA COPIA SOLA.
//
// LA LEZIONE DEL 19 AGOSTO 2026. Il giorno in cui la CI ha iniziato a far
// girare davvero tutte le suite (prima ne eseguiva 6 su 61), tre sono
// cadute all'istante: `photoreal`, `desk`, `safari`. Non per un difetto del
// prodotto — per questa riga, ricopiata in cinque file:
//
//     const BROWSER = process.env.BOOM_CHROMIUM
//       || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
//
// Un percorso ASSOLUTO alla Chromium di UNA macchina, passato come
// `executablePath` senza chiedersi se esistesse. In locale funziona; su
// qualunque altro computer — un runner CI, il portatile di un collega —
// playwright non ripiega sul browser che ha installato: prova quel file,
// non lo trova, e muore. Quelle suite erano verdi su un solo schermo al
// mondo, e nessuno poteva accorgersene perché nessuno le lanciava altrove.
//
// La regola: un percorso cablato vale come SUGGERIMENTO, mai come
// dichiarazione. Se il file c'è lo si usa (è l'ambiente di sviluppo, dove
// evita un download); se non c'è, `undefined` — e il browser lo risolve
// playwright, che sa dove ha installato il proprio.
//
// `--no-sandbox` sta qui per lo stesso motivo: sui runner in container
// Chromium non parte senza, e in locale è innocuo.
import { existsSync } from 'node:fs';

// Il percorso dell'ambiente di sviluppo di BOOM (PLAYWRIGHT_BROWSERS_PATH).
const DEV_PATHS = [
    process.env.BOOM_CHROMIUM,
    process.env.BOOM_CHROME,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
    '/opt/pw-browsers/chromium'
];

// Un eseguibile INDICATO A MANO (env) si onora anche se non esiste: se
// l'operatore lo scrive, vuole quello, e un errore chiaro è meglio di un
// ripiego silenzioso su un browser diverso da quello che voleva testare.
export function chromePath() {
    if (process.env.BOOM_CHROMIUM) return process.env.BOOM_CHROMIUM;
    if (process.env.BOOM_CHROME) return process.env.BOOM_CHROME;
    return DEV_PATHS.find((p) => p && existsSync(p)) || undefined;
}

// Le opzioni di lancio: `executablePath` solo se ha senso, sandbox off.
export function launchOptions(extra = {}) {
    const exe = chromePath();
    return { ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'], ...extra };
}

// Il MODULO playwright, cercato dove può stare. Torna null invece di
// lanciare: una suite browser senza browser si dichiara SKIP, non FAIL —
// `npm test` deve girare anche su una macchina senza playwright.
export async function loadChromium() {
    const tries = [
        ...(process.env.BOOM_PLAYWRIGHT ? [process.env.BOOM_PLAYWRIGHT] : []),
        'playwright-core', 'playwright',
        '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js'
    ];
    for (const t of tries) {
        try {
            const m = await import(t);
            const c = m.chromium || (m.default && m.default.chromium);
            if (c) return c;
        } catch { /* si prova il prossimo */ }
    }
    return null;
}
