/* Read-only desk over already loaded Oggi signals and Segreteria cases.
 * This is a projection, not a new lifecycle or permission system. The caller
 * supplies the clock and reports loader coverage separately. No IO or effects.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.BOOM_OGGI_DESK = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const DAY = 86400000;
    const AREAS = Object.freeze([
        { id: 'contracts', label: 'Contratti e consegne' },
        { id: 'payments', label: 'Incassi' },
        { id: 'appointments', label: 'Appuntamenti' },
        { id: 'maintenance', label: 'Interventi' },
        { id: 'clients', label: 'Clienti e messaggi' }
    ].map(Object.freeze));
    const POOLS = { contract: 'contracts', payment: 'payments', proposal: 'preAgreements',
        maintenance: 'maintenance', lead: 'leads', pfsClient: 'pfsClients', viewing: 'viewingRequests' };
    const PREFIXES = { rli_: 'contract', sig_: 'contract', exp_: 'contract', pay_: 'payment',
        pa_: 'proposal', par_: 'proposal', mnt_: 'maintenance', lead_: 'lead', vw_: 'viewing' };
    const text = value => typeof value === 'string' ? value.trim() : '';
    const list = value => Array.isArray(value) ? value : [];
    const idOK = value => typeof value === 'string' && value.length > 0 && value.length <= 180
        && value === value.trim() && !/[\/\x00-\x1f\x7f]/.test(value) && value !== '.' && value !== '..';
    const caseOK = value => /^sg_[a-f0-9]{32}$/.test(value || '');
    function instant(value) {
        if (typeof value !== 'string') return null;
        const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
        if (!match || !day(match[1]) || +match[2] > 23 || +match[3] > 59 || +(match[4] || 0) > 59) return null;
        const ms = Date.parse(value);
        return Number.isFinite(ms) ? ms : null;
    }
    function day(value) {
        return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
            && Number.isFinite(Date.parse(value + 'T00:00:00Z'))
            && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value ? value : '';
    }
    // action_queue is loaded directly through the Firestore browser SDK;
    // its server Date fields arrive as Timestamp objects, unlike API rows.
    function recordInstant(value) {
        if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
        if (value && typeof value === 'object') {
            const seconds = value.seconds ?? value._seconds, nanos = value.nanoseconds ?? value._nanoseconds ?? 0;
            if (!Number.isSafeInteger(seconds) || !Number.isInteger(nanos) || nanos < 0 || nanos >= 1e9) return null;
            const ms = seconds * 1000 + nanos / 1e6;
            return Number.isFinite(new Date(ms).getTime()) ? ms : null;
        }
        return instant(value);
    }
    function romeDay(now) {
        const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome',
            year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now)).map(p => [p.type, p.value]));
        return p.year + '-' + p.month + '-' + p.day;
    }
    function unique(state, kind, id) {
        if (!idOK(id) || !Object.prototype.hasOwnProperty.call(POOLS, kind)) return null;
        const rows = list(state[POOLS[kind]]).filter(row => row && row.id === id);
        return rows.length === 1 ? rows[0] : null;
    }
    function reference(state, ref) {
        const match = /^(contracts|payments|preAgreements|maintenance|leads|pfsClients|viewingRequests)\/([^/]+)$/.exec(text(ref));
        if (!match) return null;
        const kind = Object.keys(POOLS).find(key => POOLS[key] === match[1]);
        return unique(state, kind, match[2]) ? { kind, id: match[2] } : null;
    }
    function areaFor(kind) {
        return ({ incassi: 'payments', visita: 'appointments', manutenzione: 'maintenance',
            firme: 'contracts', rinnovi: 'contracts', registrazioni: 'contracts', proposte: 'contracts',
            consegna: 'contracts', contract: 'contracts', proposal: 'contracts', payment: 'payments',
            viewing: 'appointments', maintenance: 'maintenance' })[kind] || 'clients';
    }
    function signalRecord(signal, state) {
        for (const prefix of Object.keys(PREFIXES)) {
            if (!text(signal.id).startsWith(prefix)) continue;
            const kind = PREFIXES[prefix], id = signal.id.slice(prefix.length);
            return unique(state, kind, id) ? { kind, id } : null;
        }
        return reference(state, signal.practiceRef);
    }
    // Only an explicit, unique contract link can combine different records.
    // A shared tenant/property/name is deliberately irrelevant.
    function canonical(record, state) {
        if (!record) return null;
        const row = unique(state, record.kind, record.id);
        if (!row) return null;
        // A proposal may have conflicting forward/reverse contract links. Its
        // console owns that repair; keep the proposal as the exact practice.
        if (!['payment', 'maintenance'].includes(record.kind) || !row.contractId) return record;
        const contract = unique(state, 'contract', row.contractId);
        if (!contract) return record;
        return { kind: 'contract', id: contract.id };
    }
    function navigation(record, state, kind, caseId) {
        if (caseId) return { label: 'Verifica seguito', fn: 'oggiSegretariaOpen', args: [caseId, '', 'review'] };
        // The caller can reveal the original signal in the full archive when
        // no exact record has a safe reader. Do not invent a navigation route.
        if (!record) return null;
        if (record.kind === 'contract') return { label: kind === 'firme' ? 'Stato firme' : 'Apri contratto', fn: kind === 'firme' ? 'viewContractSignatures' : 'viewContract', args: [record.id] };
        if (record.kind === 'maintenance') return { label: 'Apri intervento', fn: 'viewMaintenance', args: [record.id] };
        if (record.kind === 'lead') return { label: 'Apri richiesta', fn: 'viewLead', args: [record.id] };
        if (record.kind === 'proposal') return { label: 'Apri proposta', fn: 'oggiOpenPa', args: [text(unique(state, 'proposal', record.id)?.ref)] };
        return { label: record.kind === 'payment' ? 'Verifica incassi' : record.kind === 'viewing' ? 'Apri appuntamenti' : 'Apri clienti',
            fn: 'goTo', args: [record.kind === 'payment' ? 'payments' : record.kind === 'viewing' ? 'viewings' : 'crm'] };
    }
    function recordTitle(record, state) {
        const row = record && unique(state, record.kind, record.id);
        if (!row) return '';
        if (record.kind === 'contract') {
            const one = (pool, id) => { const matches = idOK(id) ? list(state[pool]).filter(x => x?.id === id) : []; return matches.length === 1 ? matches[0] : null; };
            const house = one('properties', row.propertyId), tenant = one('users', row.tenantId);
            const context = [text(house?.name) || text(house?.address), text(tenant?.name)].filter(Boolean).join(' · ');
            return 'Contratto · ' + (context || text(row.ref) || row.id.slice(-12));
        }
        const label = ({ proposal: 'Proposta', payment: 'Pagamento', lead: 'Richiesta', pfsClient: 'Ricerca cliente',
            maintenance: 'Intervento', viewing: 'Appuntamento' })[record.kind];
        const detail = record.kind === 'proposal' ? text(row.ref) || text(row.tenant?.fullName)
            : record.kind === 'payment' ? text(row.month)
            : record.kind === 'viewing' ? text(row.propertyName) || text(row.clientName)
            : text(row.name) || text(row.title);
        return label + ' · ' + (detail || row.id.slice(-12));
    }
    function signalUrgent(signal, record, state, now) {
        if (signal.needsVerification || signal.kind === 'archivio') return false;
        const row = record && unique(state, record.kind, record.id);
        if (signal.kind === 'manutenzione') return !!row && record.kind === 'maintenance'
            && row.priority === 'urgent' && !['resolved', 'done', 'cancelled'].includes(row.status);
        if (signal.kind === 'incassi') return !!row && record.kind === 'payment'
            && ['pending', 'overdue'].includes(row.status) && !!day(row.dueDate)
            && Date.parse(row.dueDate + 'T00:00:00Z') < now;
        // Consume Oggi's verified RLI calendar, never infer urgency from prose.
        return !!row && record.kind === 'contract' && signal.kind === 'registrazioni'
            && Number.isFinite(signal.daysLeft) && signal.daysLeft <= 7;
    }
    function receipt(task) {
        const p = task.preparation, a = p?.approval, r = task.deliveryResult;
        if (['delivery_state_unavailable', 'execution_state_unavailable'].includes(r?.error)) return 'unknown';
        if (!a && !r) return '';
        const current = a && p?.messageId === task.followUp?.lastMessageId
            && a.messageId === p.messageId && a.revision === p.revision
            && (task.contextRevision ?? 0) === (p.contextRevision ?? 0)
            && r?.confirmed === true && (!r.id || r.id === task.id)
            && (!r.messageId || r.messageId === p.messageId) && (!r.revision || r.revision === p.revision)
            && (a.actionId || null) === (r.actionId || null);
        if (!current) return 'unknown';
        if (r.delivery === 'needs_review') return ['whatsapp_delivery_needs_review', 'whatsapp_delivery_expired'].includes(r.error) ? 'failed' : 'unknown';
        return ['sent', 'queued', 'pending_execution', 'follow_up_only'].includes(r.delivery) ? r.delivery : 'unknown';
    }
    function signalContext(signal, source, state) {
        const row = source && unique(state, source.kind, source.id);
        let value = null, label = 'Ricontrollo';
        if (signal.kind === 'registrazioni' && instant(signal.deadlineAt) !== null) {
            value = signal.deadlineAt; label = signal.deadlineEstimated ? 'Termine stimato' : 'Scadenza';
        } else if (signal.kind === 'incassi' && source?.kind === 'payment' && day(row.dueDate)) {
            value = row.dueDate; label = 'Scadenza';
        } else if (signal.kind === 'rinnovi' && source?.kind === 'contract' && day(row.endDate)) {
            value = row.endDate; label = 'Fine contratto';
        }
        return { ownership: 'Da confermare', timing: { label, value }, sourceLabel: ({
            registrazioni: 'Registrazione contratto', firme: 'Stato firme', incassi: 'Incassi',
            visita: 'Richiesta visita', manutenzione: 'Intervento', rinnovi: 'Contratto',
            proposte: 'Proposta', approvazione: 'Proposta da approvare'
        })[signal.kind] || 'Segnale del portale' };
    }
    function build({ state = {}, signals = [], rows = [], conversations = [], allowNewRequests = true, pendingProposalIds = [], nowISO } = {}) {
        const now = instant(nowISO);
        if (now === null) throw new TypeError('build requires an explicit current ISO instant with timezone');
        // The caller uses the existing preparation validator. Raw preparation
        // content cannot promote a case or override the previous follow-up.
        const pendingProposals = new Set(list(pendingProposalIds).filter(caseOK));
        const entries = [], unknownCaseIds = [], newUnlinkedCaseIds = [], recordVerificationSignalIds = [], seenSignals = new Set(), seenCases = new Set();
        function push(entry) { entries.push(entry); }
        list(signals).forEach(signal => {
            if (!signal || !text(signal.id) || seenSignals.has(signal.id)) return;
            seenSignals.add(signal.id);
            if (signal.needsVerification === true) recordVerificationSignalIds.push(signal.id);
            const source = signalRecord(signal, state), record = canonical(source, state);
            const aggregate = signal.id === 'pay_all';
            const queueRows = signal.kind === 'approvazione' && text(signal.id).startsWith('aq_')
                ? list(state.actionQueue).filter(row => row?.id === signal.id.slice(3)) : [];
            const queued = queueRows.length === 1 ? queueRows[0] : null, created = recordInstant(queued?.createdAt);
            const recentApproval = !!queued && ['pending', 'pending_approval'].includes(queued.status)
                && created !== null && created <= now && now - created <= 7 * DAY;
            const oldApproval = signal.kind === 'approvazione' && !recentApproval;
            const history = signal.needsVerification === true || signal.kind === 'archivio' || oldApproval
                || (!source && !aggregate && signal.kind !== 'approvazione');
            const action = aggregate ? { label: 'Verifica incassi', fn: 'goTo', args: ['payments'] } : navigation(record, state, signal.kind);
            const proposalNext = queued ? (queued.kind === 'reply' ? 'Rivedi la risposta proposta prima di inviarla' : 'Rivedi la proposta prima di approvarla') : null;
            const proposalSummary = queued && text(queued.summary) !== text(signal.title) ? text(queued.summary) : '';
            const next = proposalNext || ({ viewContractSignatures: 'Verifica lo stato delle firme', viewContract: 'Apri la pratica e verifica il prossimo passo',
                viewMaintenance: 'Verifica e organizza l’intervento', viewLead: 'Apri la richiesta del cliente', oggiOpenPa: 'Verifica la proposta in console' })[action?.fn]
                || (signal.kind === 'incassi' ? 'Verifica gli incassi' : signal.kind === 'visita' ? 'Verifica l’appuntamento' : 'Apri il dettaglio');
            push({ key: record ? record.kind + ':' + record.id : 'signal:' + signal.id,
                area: source ? areaFor(signal.kind === 'archivio' ? source.kind : signal.kind) : areaFor(signal.kind),
                bucket: history ? 'history' : 'current', record, title: text(signal.title) || 'Segnale da verificare', nextAction: next, action,
                signal, original: true, caseId: null, reason: oldApproval ? 'Proposta precedente da verificare' : history ? text(signal.reason) || 'Dati da verificare'
                    : queued ? proposalSummary || 'Proposta da verificare prima dell’approvazione' : text(signal.title) || 'Segnale operativo da verificare',
                ...signalContext(signal, source, state),
                score: Number.isFinite(signal.score) ? signal.score : 0, urgent: !history && signalUrgent(signal, source, state, now) });
        });
        list(rows).forEach(task => {
            if (!task || !caseOK(task.id) || !task.followUp || task.status !== 'open' || seenCases.has(task.id)) return;
            seenCases.add(task.id);
            const f = task.followUp, delivery = receipt(task);
            if (delivery === 'unknown') unknownCaseIds.push(task.id);
            const confirmed = f.confirmed === true && f.needsReview !== true && f.ambiguous !== true;
            const source = confirmed ? reference(state, f.practiceRef) : null, record = canonical(source, state);
            const at = instant(f.checkAt), inbound = instant(f.lastInboundAt);
            if (!record && (text(f.practiceRef) || f.ambiguous === true || delivery === 'unknown') && inbound !== null && inbound <= now && now - inbound <= 7 * DAY) newUnlinkedCaseIds.push(task.id);
            const old = inbound === null || now - inbound > 7 * DAY;
            const pending = pendingProposals.has(task.id), recent = inbound !== null && inbound <= now && !old;
            let bucket, reason;
            if (!record && !text(f.practiceRef) && f.ambiguous !== true && delivery !== 'unknown' && recent) { bucket = 'current'; reason = 'Richiesta da esaminare'; }
            else if (!record) { bucket = 'history'; reason = delivery === 'unknown' ? 'Esito dell’invio non disponibile' : 'Collegamento da verificare'; }
            else if (delivery === 'failed' || (at !== null && at <= now)) { bucket = 'current'; reason = delivery === 'failed' ? 'Invio non completato' : 'Ricontrollo dovuto'; }
            else if (pending) {
                bucket = recent ? 'current' : 'history';
                reason = recent ? 'Proposta da rivedere' : inbound === null ? 'Data della fonte non disponibile'
                    : old ? 'Fonte oltre 7 giorni' : 'Data della fonte da verificare';
            }
            else if (delivery === 'unknown') { bucket = 'history'; reason = 'Esito dell’invio non disponibile'; }
            else if (at !== null && at > now) {
                if (['valentino', 'boom'].includes(f.waitingOn)) {
                    bucket = 'current'; reason = 'Azione affidata a ' + (f.waitingOn === 'valentino' ? 'Valentino' : 'BOOM');
                } else if (['client', 'collaborator'].includes(f.waitingOn)) { bucket = 'waiting'; reason = 'Ricontrollo futuro'; }
                else { bucket = 'current'; reason = 'Responsabile da confermare'; }
            }
            else if (old) { bucket = 'history'; reason = inbound === null ? 'Data della fonte non disponibile' : 'Fonte oltre 7 giorni'; }
            else { bucket = 'current'; reason = 'Ricontrollo da impostare'; }
            push({ key: record ? record.kind + ':' + record.id : 'case:' + task.id, area: areaFor(source?.kind),
                bucket, record, title: reason === 'Richiesta da esaminare' ? 'Richiesta da esaminare' : !record ? 'Seguito · collegamento da verificare' : 'Seguito della pratica',
                preview: reason === 'Richiesta da esaminare' ? text(f.preview).slice(0, 350) : '',
                nextAction: reason === 'Richiesta da esaminare' ? 'Esamina la richiesta' : !record ? 'Verifica il collegamento alla pratica'
                    : reason === 'Proposta da rivedere' ? 'Rivedi la proposta prima di confermare il seguito' : text(f.nextAction) || 'Verifica il prossimo passo',
                action: navigation(record, state, '', task.id), signal: null, caseId: task.id,
                reason,
                ownership: reason === 'Proposta da rivedere' ? 'Valentino' : record && confirmed && ['valentino', 'boom', 'client', 'collaborator'].includes(f.waitingOn)
                    ? text(f.waitingLabel) || ({ valentino: 'Valentino', boom: 'BOOM', client: 'Cliente', collaborator: 'Collaboratore' })[f.waitingOn] : 'Da confermare',
                timing: reason === 'Richiesta da esaminare' ? { label: 'Ricevuta', value: f.lastInboundAt } : { label: 'Ricontrollo', value: record && confirmed && reason !== 'Proposta da rivedere' && at !== null ? f.checkAt : null },
                sourceLabel: reason === 'Richiesta da esaminare' ? 'Messaggio ricevuto' : !record ? 'Collegamento da verificare' : reason === 'Proposta da rivedere' ? 'Proposta da rivedere' : 'Seguito confermato',
                score: reason === 'Richiesta da esaminare' ? 65 : delivery === 'failed' ? 96 : reason === 'Proposta da rivedere' ? 94 : reason.startsWith('Azione affidata a ') ? 45 : bucket === 'current' ? 90 : 20, urgent: false });
        });
        // Headers are an explicit input: this projection never reads messages,
        // invents a case, or equates people by name/address/phone. A closed case
        // covers only its recorded inbound, never a later request.
        const headers = list(conversations), tasks = list(rows).filter(task => task && caseOK(task.id)
            && task.source === 'segretaria' && task.followUp && ['open', 'done'].includes(task.status)
            && list(rows).filter(other => other?.id === task.id).length === 1);
        headers.forEach(conv => {
            if (!conv || !idOK(conv.id) || headers.filter(other => other?.id === conv.id).length !== 1
                || !['in', 'out'].includes(conv.lastDirection)
                || !['email', 'whatsapp', 'mixed'].includes(conv.channel)) return;
            const received = recordInstant(conv.lastMessageAt);
            if (received === null || received > now || now - received > 7 * DAY) return;
            const conflicted = !!conv.conversationBindingConflict || conv.conversationBindingStatus === 'unavailable';
            const lead = !conflicted && conv.contactType === 'lead' && conv.contactId === conv.leadId
                ? unique(state, 'lead', conv.leadId) : null;
            const linkedLead = lead?.conversationId === conv.id ? lead : null;
            const linked = tasks.filter(task => task.followUp.conversationId === conv.id);
            const newerThan = task => {
                const previous = instant(task.followUp.lastInboundAt);
                return previous === null || previous < received;
            };
            for (const entry of entries.filter(entry => linked.some(task => task.id === entry.caseId))) {
                entry.conversationIds = [conv.id];
                if (linked.some(task => {
                    if (task.id !== entry.caseId) return false;
                    if (conv.lastDirection === 'in') return newerThan(task);
                    // A reply can arrive before the task poll catches up. An
                    // AI reading made after that reply remains usable; a newer
                    // task outbound stamp cannot rescue an older preparation.
                    const seen = instant(task.preparation ? task.preparation.createdAt : task.lastOutboundAt);
                    return seen === null || seen > now || seen < received;
                })) entry.hasNewInbound = true;
            }
            // Missing closure coverage hides only newly projected requests;
            // newer headers must still invalidate readings on existing cases.
            if (!allowNewRequests || conv.status !== 'open' || conv.needsReply !== true || conv.lastDirection !== 'in') return;
            for (const entry of entries.filter(entry => linked.some(task => task.id === entry.caseId))) {
                if (linkedLead && !entry.record && entry.bucket === 'current') entry.key = 'lead:' + linkedLead.id;
            }
            const covered = !conflicted && linked.some(task => !newerThan(task)
                && instant(task.followUp.lastInboundAt) <= now
                && (task.status === 'done' || receipt(task) === 'unknown' || entries.some(entry => entry.caseId === task.id && ['current', 'waiting'].includes(entry.bucket))));
            if (covered) return;
            // Dedup a lead signal only on an unambiguous saved backlink in both
            // directions. A one-way hint, alias or shared identity is not proof.
            const unlinked = linked.filter(task => task.status === 'open' && !text(task.followUp.practiceRef));
            const sameCase = !conflicted && unlinked.length === 1 ? unlinked[0] : null;
            push({ key: linkedLead ? 'lead:' + linkedLead.id : sameCase ? 'case:' + sameCase.id : 'conversation:' + conv.id,
                area: 'clients', bucket: 'current', record: linkedLead ? { kind: 'lead', id: linkedLead.id } : null,
                title: conflicted ? 'Richiesta · identità da verificare' : 'Richiesta da esaminare' + (text(conv.contactName) ? ' · ' + text(conv.contactName) : ''),
                nextAction: 'Esamina la richiesta', action: { label: 'Apri conversazione', fn: 'oggiDeskConversation', args: [conv.id] },
                signal: null, caseId: null, conversationIds: [conv.id], request: true,
                preview: conflicted ? '' : text(conv.lastMessagePreview).slice(0, 350),
                hasNewInbound: linked.some(newerThan),
                reason: conflicted ? 'Identità da verificare prima di procedere' : 'Messaggio ricevuto da esaminare',
                ownership: 'Da confermare', timing: { label: 'Ricevuta', value: new Date(received).toISOString() },
                sourceLabel: conv.channel === 'email' ? 'Email' : conv.channel === 'whatsapp' ? 'WhatsApp' : 'Conversazione',
                score: 65, urgent: false });
        });
        // The financial total remains reachable as a summary, but cannot take
        // another priority slot when individual overdue payments are represented.
        if (entries.some(entry => entry.bucket === 'current' && entry.signal?.kind === 'incassi'
            && entry.signal.id !== 'pay_all' && signalRecord(entry.signal, state)?.kind === 'payment')) {
            for (const entry of entries) if (entry.signal?.id === 'pay_all') entry.bucket = 'summary';
        }
        const today = romeDay(now), last = new Date(Date.parse(today + 'T00:00:00Z') + 6 * DAY).toISOString().slice(0, 10);
        list(state.contracts).forEach(contract => {
            if (!contract || unique(state, 'contract', contract.id) !== contract || contract.status !== 'active') return;
            const date = day(contract.startDate);
            if (!date || date < today || date > last) return;
            const handover = contract.verbaleConsegna, handedAt = instant(handover?.at);
            let hasProof = false;
            try { const url = new URL(handover?.url); hasProof = handedAt !== null && handedAt <= now && url.protocol === 'https:' && !url.username && !url.password; } catch (_) {}
            if (hasProof) return;
            const record = { kind: 'contract', id: contract.id }, id = 'start_' + contract.id;
            if (seenSignals.has(id)) return;
            push({ key: 'contract:' + contract.id, area: 'contracts', bucket: 'current', record,
                title: 'Decorrenza contratto · ' + date,
                nextAction: ['complete', 'completed'].includes(contract.signatureStatus) ? 'Verifica e prepara la consegna della casa' : 'Verifica le firme e la preparazione della consegna',
                action: navigation(record, state, 'consegna'), signal: { id, kind: 'consegna', date, contractId: contract.id,
                    title: 'Decorrenza contratto · ' + date, basis: 'contract.startDate' }, caseId: null,
                reason: 'La decorrenza non prova la consegna delle chiavi', ownership: 'Da confermare',
                timing: { label: 'Decorrenza', value: date }, sourceLabel: 'Contratto', score: 60, urgent: false });
        });
        const groups = new Map();
        entries.forEach(entry => {
            const key = entry.bucket + ':' + entry.key;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(entry);
        });
        const items = [...groups.entries()].map(([id, group]) => {
            group.sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.score - a.score || text(a.signal?.id || a.caseId).localeCompare(text(b.signal?.id || b.caseId)));
            const first = group[0], request = group.find(entry => entry.request), allSignals = group.filter(x => x.signal).map(x => x.signal), caseIds = group.map(x => x.caseId).filter(Boolean);
            return { id, area: first.area, bucket: first.bucket, record: first.record, title: recordTitle(first.record, state) || first.title,
                nextAction: request?.nextAction || first.nextAction, action: request?.action || first.action, signals: allSignals, signalIds: group.filter(x => x.original).map(x => x.signal.id), caseIds,
                reason: request?.reason || first.reason, ownership: request?.ownership || first.ownership, timing: request?.timing || first.timing, sourceLabel: request?.sourceLabel || first.sourceLabel,
                preview: request?.preview ?? first.preview ?? '', conversationIds: [...new Set(group.flatMap(entry => entry.conversationIds || []))],
                hasNewInbound: group.some(entry => entry.hasNewInbound === true),
                score: first.score, urgent: group.some(x => x.urgent) };
        }).sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.score - a.score || a.id.localeCompare(b.id));
        const currentItems = items.filter(x => x.bucket === 'current'), history = items.filter(x => x.bucket === 'history'), waiting = items.filter(x => x.bucket === 'waiting');
        return { areas: AREAS.map(area => { const group = currentItems.filter(x => x.area === area.id); return { ...area, items: group, count: group.length }; }),
            currentItems, history, waiting, summaryItems: items.filter(x => x.bucket === 'summary'), coverage: { unknownDeliveryCount: unknownCaseIds.length, unknownCaseIds,
                newUnlinkedCount: newUnlinkedCaseIds.length, newUnlinkedCaseIds,
                recordVerificationCount: recordVerificationSignalIds.length, recordVerificationSignalIds },
            counts: { total: items.length, current: currentItems.length, history: history.length, waiting: waiting.length,
                unknown: unknownCaseIds.length, urgent: currentItems.filter(x => x.urgent).length } };
    }
    return Object.freeze({ AREAS, build });
}));
