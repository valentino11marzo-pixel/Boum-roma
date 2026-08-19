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
        const overdue = P.filter((p) => p.status === 'pending' && p.dueDate && new Date(p.dueDate).getTime() < now);
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

        out.sort((a, b) => b.score - a.score);

        // ── Il polso dei soldi (la striscia in testa) ───────────────────
        const paidMonth = P.filter((p) => p.status === 'paid' && (p.paidDate || '').slice(0, 7) === month)
            .reduce((s, p) => s + num(p.amount), 0);
        const dueMonth = P.filter((p) => p.status === 'pending' && (p.dueDate || '').slice(0, 7) === month)
            .reduce((s, p) => s + num(p.amount), 0);
        const overdueTot = overdue.reduce((s, p) => s + num(p.amount), 0);
        const next7 = P.filter((p) => {
            if (p.status !== 'pending' || !p.dueDate) return false;
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

    return { version: 'O1', build: build };
}));
