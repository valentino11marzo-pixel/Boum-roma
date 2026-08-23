/* ════════════════════════════════════════════════════════════════════════
   OGGI — la coda delle decisioni (motore puro, 2026-08-19)

   La tesi, in due righe: la macchina BOOM lavora da sola (cron, agenti,
   journey, radar) e all'operatore restano le DECISIONI. Oggi arrivano su
   Telegram una card alla volta — e Telegram scorre via: ciò che non tocchi
   entro un'ora affoga sotto le card successive. Questa coda PERSISTE:
   apri il portale e vedi cosa aspetta la tua firma, ordinato per quanto
   costa rimandarlo, con l'azione dentro la riga.

   Regole della casa:
   · PURO: niente Firestore, niente window, niente Date.now() — riceve lo
     snapshot S e l'ora, restituisce dati. Si testa in node.
   · Le azioni sono {fn, args} come nel Prontuario: DICHIARANO una funzione
     globale del portale, mai una stringa di codice. Il test pretende che
     ogni fn dichiarata esista in portal-app.js.
   · Il punteggio è il COSTO DEL RITARDO, non l'importanza astratta: una
     risposta AI ferma perde il lead in ore; una rata a 40 giorni è già
     persa da 39 — pesa meno di una a 6, dove il sollecito morde.
   Test: node tests/oggi/run.mjs
   ════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.BOOM_OGGI = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const DAY = 86400000;
    const num = (v) => (typeof v === 'number' && isFinite(v) ? v : parseFloat(v) || 0);
    const days = (fromISO, now) => {
        if (!fromISO) return 0;
        const t = new Date(fromISO).getTime();
        return isFinite(t) ? Math.max(0, (now - t) / DAY) : 0;
    };
    // L'età spinge in alto, ma con un TETTO: un lead di ieri deve battere
    // una scadenza di fra tre settimane, non una rata da mille euro.
    const ageBoost = (d, perDay, cap) => Math.min(cap, d * perDay);

    function build(S, nowISO) {
        const now = new Date(nowISO || 0).getTime();
        const month = (nowISO || '').slice(0, 7);
        const out = [];
        const P = S.payments || [], C = S.contracts || [], U = S.users || [];
        const props = S.properties || [], V = S.viewingRequests || [];
        const L = S.leads || [], M = S.maintenance || [], Q = S.actionQueue || [];
        const propName = (id) => (props.find((p) => p.id === id) || {}).name || '';
        // IL DIFETTO DEL 23 AGOSTO 2026. Il portale, al boot, RIETICHETTA in
        // memoria le rate scadute (pending -> 'overdue') per non scrivere N
        // volte su Firestore a ogni apertura. Questo motore filtrava il solo
        // 'pending': in produzione la specie piu' cara della coda — i soldi —
        // non scattava MAI, e la striscia diceva "0 in ritardo" con le rate
        // scadute a sistema. Il test non lo vedeva perche' alimenta il motore
        // con dati grezzi, saltando il boot: verde e cieco. Una rata non
        // pagata e' non pagata, comunque il portale la chiami.
        const unpaid = (p) => p.status === 'pending' || p.status === 'overdue';
        const byC = (id) => C.find((c) => c.id === id);

        // ── 1. Risposte AI in attesa di approvazione (action_queue) ──────
        // La firma dell'operatore È il prodotto: un'ora di attesa qui è
        // un lead che scrive a qualcun altro.
        Q.filter((a) => (a.status || '') === 'pending' || (a.status || '') === 'pending_approval')
            .forEach((a) => out.push({
                id: 'aq_' + a.id, kind: 'approvazione', icon: '🤖', tint: 'gold',
                title: a.title || a.actionType || 'Proposta della Squadra',
                sub: (a.summary || a.preview || a.description || '').slice(0, 120),
                score: 90 + ageBoost(days(a.createdAt, now), 8, 15),
                actions: [
                    { label: '✓ Approva', fn: 'approveAgentAction', args: [a.id], primary: true },
                    { label: 'Modifica', fn: 'editAgentAction', args: [a.id] },
                    { label: 'Scarta', fn: 'rejectAgentAction', args: [a.id] }
                ]
            }));

        // ── 2. Visite da confermare ──────────────────────────────────────
        V.filter((v) => v.status === 'pending' || v.status === 'rescheduled')
            .forEach((v) => out.push({
                id: 'vw_' + v.id, kind: 'visita', icon: '👁', tint: 'gold',
                title: `Visita da confermare — ${v.propertyName || propName(v.propertyId || v.listingId) || 'immobile'}`,
                sub: [v.clientName || v.name, v.proposedDate ? `propone ${v.proposedDate} ${v.proposedTime || ''}` : ''].filter(Boolean).join(' · '),
                score: 85 + ageBoost(days(v.createdAt, now), 10, 15),
                actions: [
                    { label: '✓ Conferma', fn: 'confirmViewingModal', args: [v.id], primary: true },
                    { label: '↩ Sposta', fn: 'rescheduleViewingModal', args: [v.id] },
                    { label: 'Annulla', fn: 'cancelViewing', args: [v.id] }
                ]
            }));

        // ── 3. I soldi in ritardo ────────────────────────────────────────
        // UNA card di quadro + le tre peggiori per nome: l'aggregato dà la
        // misura, il nome dà l'azione. Il sollecito morde nei primi giorni.
        const overdue = P.filter((p) => unpaid(p) && p.dueDate && new Date(p.dueDate).getTime() < now);
        if (overdue.length) {
            const tot = overdue.reduce((s, p) => s + num(p.amount), 0);
            out.push({
                id: 'pay_all', kind: 'incassi', icon: '💰', tint: 'red',
                title: `${overdue.length} rat${overdue.length === 1 ? 'a' : 'e'} in ritardo · €${Math.round(tot).toLocaleString('it-IT')}`,
                sub: 'Il quadro completo, coi solleciti a scala, è in Incassi.',
                score: 80 + Math.min(15, tot / 400),
                actions: [{ label: 'Apri Incassi', fn: 'goTo', args: ['payments'], primary: true }]
            });
            overdue
                .map((p) => ({ p, late: days(p.dueDate, now) }))
                .sort((a, b) => (b.late * num(b.p.amount)) - (a.late * num(a.p.amount)))
                .slice(0, 3)
                .forEach(({ p, late }) => {
                    const c = byC(p.contractId);
                    const t = c ? U.find((u) => u.id === c.tenantId) : null;
                    out.push({
                        id: 'pay_' + p.id, kind: 'incassi', icon: '⚠️', tint: 'red',
                        title: `€${num(p.amount).toLocaleString('it-IT')} — ${t ? t.name : propName(c && c.propertyId) || p.month || 'rata'}`,
                        sub: `${p.month || ''} · ${Math.round(late)}gg di ritardo`,
                        score: 74 + ageBoost(late, 1.5, 12) + Math.min(8, num(p.amount) / 300),
                        actions: [
                            { label: '📧 Sollecito', fn: 'sendPaymentReminder', args: [p.id], primary: true },
                            { label: '💳 Link carta', fn: 'showPaymentLink', args: ['pay', p.id] },
                            { label: '✓ Pagata', fn: 'markPaymentPaid', args: [p.id] }
                        ]
                    });
                });
        }

        // ── 4. Lead caldi senza risposta ─────────────────────────────────
        const gradeRank = { A: 3, B: 2, C: 1 };
        L.filter((l) => (l.status || 'new') === 'new' && l.grade !== 'dead')
            .map((l) => ({ l, g: gradeRank[l.grade] || 0, age: days(l.createdAt, now) }))
            .sort((a, b) => (b.g - a.g) || (b.age - a.age))
            .slice(0, 5)
            .forEach(({ l, g, age }) => out.push({
                id: 'lead_' + l.id, kind: 'lead', icon: g === 3 ? '🔥' : '🔔', tint: g === 3 ? 'red' : 'gold',
                title: `Lead ${l.grade ? l.grade + ' ' : ''}senza risposta — ${l.name || l.leadName || 'sconosciuto'}`,
                sub: [(l.propertyTitle || l.listingName), l.budget ? `€${l.budget}/m` : '', l.zone].filter(Boolean).join(' · ').slice(0, 110),
                score: (g === 3 ? 78 : g === 2 ? 62 : 48) + ageBoost(age, 6, 14),
                actions: [{ label: 'Apri il lead', fn: 'viewLead', args: [l.id], primary: true }]
            }));

        // ── 5. Manutenzioni urgenti aperte ──────────────────────────────
        M.filter((m) => m.priority === 'urgent' && m.status !== 'resolved')
            .forEach((m) => out.push({
                id: 'mnt_' + m.id, kind: 'manutenzione', icon: '🚨', tint: 'red',
                title: `Urgente — ${m.title || 'manutenzione'}`,
                sub: [propName(m.propertyId), `${Math.round(days(m.createdAt, now))}gg aperta`].filter(Boolean).join(' · '),
                score: 70 + ageBoost(days(m.createdAt, now), 4, 15),
                actions: [
                    { label: 'Apri', fn: 'viewMaintenance', args: [m.id], primary: true },
                    { label: '▶ In corso', fn: 'updateMaintenanceStatus', args: [m.id, 'in_progress'] }
                ]
            }));

        // ── 6. Firme a metà ──────────────────────────────────────────────
        // Il watchdog server-side re-invita da solo; qui sta la DECISIONE:
        // un contratto mezzo firmato è un immobile bloccato.
        C.filter((c) => c.signatureStatus === 'partial')
            .forEach((c) => out.push({
                id: 'sig_' + c.id, kind: 'firme', icon: '🖊', tint: 'orange',
                title: `Firma a metà — ${propName(c.propertyId) || 'contratto'}`,
                sub: (U.find((u) => u.id === c.tenantId) || {}).name || '',
                score: 65 + ageBoost(days(c.tenantSignedAt || c.updatedAt || c.createdAt, now), 3, 12),
                actions: [
                    { label: 'Stato firme', fn: 'viewContractSignatures', args: [c.id], primary: true },
                    { label: 'Apri contratto', fn: 'viewContract', args: [c.id] }
                ]
            }));

        // ── 7. Rinnovi: contratti attivi entro 30 giorni dalla fine ─────
        C.filter((c) => {
            if (c.status !== 'active' || !c.endDate) return false;
            const d = (new Date(c.endDate).getTime() - now) / DAY;
            return d >= 0 && d <= 30;
        }).forEach((c) => {
            const left = Math.ceil((new Date(c.endDate).getTime() - now) / DAY);
            out.push({
                id: 'exp_' + c.id, kind: 'rinnovi', icon: '📋', tint: 'orange',
                title: `Scade tra ${left}gg — ${propName(c.propertyId) || 'contratto'}`,
                sub: `${(U.find((u) => u.id === c.tenantId) || {}).name || ''} · rinnovare o rimettere in vetrina?`,
                score: 50 + (30 - left),
                actions: [{ label: 'Apri contratto', fn: 'viewContract', args: [c.id], primary: true }]
            });
        });

        // ── 8. Proposte: il deal chiuso che aspetta il contratto ────────
        // Vivono nella console separata (/pre-agreement-admin) e su Telegram
        // scorrono via: un'accettazione — peggio, un INCASSO — senza
        // contratto è il ritardo più caro di tutti. Un PA con contractId è
        // già a posto (l'auto-convert lo mette da solo); qui restano i
        // bloccati. S.preAgreements arriva lazy alla prima apertura di Oggi.
        const PA = S.preAgreements || [];
        const paPaid = (pa) => pa.status === 'paid' || !!(pa.paidAt || pa.paidSessionId || pa.paidEur);
        const paName = (pa) => ((pa.tenant || {}).fullName || (pa.property || {}).address || 'proposta');
        PA.filter((pa) => !pa.contractId && pa.status !== 'revoked' && (pa.status === 'accepted' || paPaid(pa)))
            .forEach((pa) => {
                const paid = paPaid(pa);
                out.push({
                    id: 'pa_' + pa.id, kind: 'proposte', icon: paid ? '💶' : '🤝', tint: paid ? 'red' : 'gold',
                    title: (paid ? 'Incassata, manca il contratto — ' : 'Accettata, manca il contratto — ') + paName(pa),
                    sub: [pa.ref, (pa.property || {}).address, paid && pa.paidEur ? '€' + Math.round(num(pa.paidEur)).toLocaleString('it-IT') + ' incassati' : '']
                        .filter(Boolean).join(' · ').slice(0, 110),
                    score: (paid ? 88 : 76) + ageBoost(days(pa.paidAt || pa.acceptedAt, now), 5, 10),
                    actions: [{ label: 'Apri in console', fn: 'oggiOpenPa', args: [pa.ref || ''], primary: true }]
                });
            });
        // Riserva = un candidato tenuto in coda su un immobile conteso: va
        // sciolta (sbloccare o dirgli di no), non lasciata a marcire.
        PA.filter((pa) => pa.status === 'reserve').forEach((pa) => out.push({
            id: 'par_' + pa.id, kind: 'proposte', icon: '⏳', tint: 'orange',
            title: 'Riserva da sciogliere — ' + paName(pa),
            sub: [pa.ref, 'immobile conteso: verifica il lucchetto in console'].filter(Boolean).join(' · '),
            score: 56 + ageBoost(days(pa.acceptedAt || pa.updatedAt || pa.createdAt, now), 3, 10),
            actions: [{ label: 'Apri in console', fn: 'oggiOpenPa', args: [pa.ref || ''], primary: true }]
        }));

        // ── 9. Contratti firmati DA REGISTRARE (RLI: 30 giorni) ─────────
        // L'unico ritardo di questa coda con un PREZZO scritto in legge:
        // oltre i 30 giorni dalla stipula la registrazione e' tardiva
        // (sanzione, e l'opzione cedolare secca a rischio). Per questo il
        // punteggio non e' fisso — cresce col calendario e SCAVALCA tutto
        // quando il termine e' passato: la' ogni giorno costa di piu'.
        // Due stati, una regola sola: se la pratica e' gia' dal referente
        // si TACE per una settimana (sta lavorando lui, non e' una
        // decisione) e poi torna come sollecito, con l'azione che chiude
        // il giro — la conferma della registrazione.
        const RLI_DAYS = 30;
        C.filter((c) => {
            const signed = c.signatureStatus === 'complete' || !!(c.tenantSignature && c.landlordSignature);
            const done = c.registrationStatus === 'registered' || !!c.rliRegisteredAt;
            return signed && !done;
        }).forEach((c) => {
            const el = days(c.fullySignedAt || c.landlordSignedAt || c.tenantSignedAt || c.startDate, now);
            const left = Math.ceil(RLI_DAYS - el);
            const over = Math.max(0, Math.round(el - RLI_DAYS));
            const late = left <= 0;
            const sent = !!c.aspiRequestedAt;
            const waited = sent ? days(c.aspiRequestedAt, now) : 0;
            if (sent && waited < 7 && !late && left > 3) return;   // il referente ha la pratica: silenzio
            const term = late ? (over ? `RLI SCADUTA da ${over}gg` : 'RLI scade OGGI') : `RLI tra ${left}gg`;
            out.push({
                id: 'rli_' + c.id, kind: 'registrazioni', icon: late ? '🏛' : '📝',
                tint: late ? 'red' : (left <= 7 ? 'orange' : 'gold'),
                title: (sent ? `In attesa di ASPI da ${Math.round(waited)}gg — ` : 'Da registrare — ')
                    + (propName(c.propertyId) || 'contratto'),
                sub: [
                    (U.find((u) => u.id === c.tenantId) || {}).name || c.tenantName || '',
                    term,
                    sent ? (c.aspiRequestKind === 'registrazione' ? 'inviata: solo registrazione' : 'inviata: registrazione + attestazione') : ''
                ].filter(Boolean).join(' · '),
                score: (late ? 84 + ageBoost(over, 1.2, 12) : 46 + el) - (sent ? 14 : 0),
                actions: sent
                    ? [
                        { label: '\u2713 RLI registrato', fn: 'markRliRegistered', args: [c.id], primary: true },
                        { label: '\ud83c\udfdb Re-invia', fn: 'openAspi', args: [c.id] }
                    ]
                    : [
                        { label: '\ud83c\udfdb Invia ad ASPI', fn: 'openAspi', args: [c.id], primary: true },
                        { label: 'Apri contratto', fn: 'viewContract', args: [c.id] }
                    ]
            });
        });

        out.sort((a, b) => b.score - a.score);

        // ── Il polso dei soldi (la striscia in testa) ───────────────────
        const paidMonth = P.filter((p) => p.status === 'paid' && (p.paidDate || '').slice(0, 7) === month)
            .reduce((s, p) => s + num(p.amount), 0);
        const dueMonth = P.filter((p) => unpaid(p) && (p.dueDate || '').slice(0, 7) === month)
            .reduce((s, p) => s + num(p.amount), 0);
        const overdueTot = overdue.reduce((s, p) => s + num(p.amount), 0);
        const next7 = P.filter((p) => {
            if (!unpaid(p) || !p.dueDate) return false;
            const d = (new Date(p.dueDate).getTime() - now) / DAY;
            return d >= 0 && d <= 7;
        }).reduce((s, p) => s + num(p.amount), 0);

        return {
            decisions: out,
            cash: {
                paidMonth: Math.round(paidMonth),
                dueMonth: Math.round(dueMonth),
                overdueTotal: Math.round(overdueTot),
                overdueCount: overdue.length,
                next7: Math.round(next7)
            }
        };
    }

    return { version: 'O2', build: build };
}));
