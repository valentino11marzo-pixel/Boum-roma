// ═══════════════════════════════════════════════════════════════════════════
// D1 · BOOM OS — js/portal-desktop.js
// La faccia DESKTOP del protocollo "un motore, due facce": M2 (portal-mobile)
// fa sentire il portale un'app in mano; questo lo fa sentire un cockpit da
// software globale sulla scrivania. Stessa disciplina, specchiata:
// attivo SOLO sopra i 920px (la stessa query di M2, negata: mai un pixel di
// terra di nessuno tra i due layer), tutto il visivo dietro body.pd-on.
//
// COSA FA:
//   1. COMMAND PALETTE (⌘K / Ctrl+K): un punto di comando per TUTTA la
//      macchina — le sezioni e le console della sidebar VERA (voci lette
//      dal DOM di buildNav: mai una seconda lista che diverge), le azioni
//      di creazione (Nuovo contratto/immobile/…, proxy di openModal) e la
//      ricerca entità che SOLLEVA i risultati del motore esistente
//      (handleSearch → #searchResults: si invoca il loro, si adottano le
//      righe già pronte con la loro onclick — il motore resta UNO).
//   2. SCORCIATOIE: g+lettera per navigare (g c = Contratti), n+lettera per
//      creare (n c = Nuovo contratto), / = ricerca, ? = il foglio dei tasti.
//   3. PEEK DRAWER: le schede di sola lettura (il fascicolo contratto, le
//      notifiche…) si aprono come pannello laterale destro invece che come
//      finestra centrata — il contesto resta sotto gli occhi, come nei
//      software che il fondatore vuole eguagliare.
//
// COSA NON FA MAI (identico a M2): non scrive dati, non duplica logica —
// ogni voce è un .click() sull'elemento originale o una chiamata alle
// globali già esposte; lo stato visivo vive in classi lette da regole
// `body.pd-on`, quindi scendere sotto i 920px spegne tutto da solo.
//
// Kill switch: ?deskclassic=1 (persistito) / ?deskapp=1 per riattivare.
// Test: node tests/desktop/run.mjs (sorgente) + tests/desktop/ui.mjs (browser).
// ═══════════════════════════════════════════════════════════════════════════
window.__pdLoaded = true;
(function () {
    'use strict';

    // ── Kill switch ─────────────────────────────────────────────────────
    try {
        var q = new URLSearchParams(location.search);
        if (q.get('deskclassic') === '1') localStorage.setItem('boom_classic_desktop', '1');
        if (q.get('deskapp') === '1') localStorage.removeItem('boom_classic_desktop');
        if (localStorage.getItem('boom_classic_desktop') === '1') {
            window.BOOM_DESKTOP = { off: true };
            return;
        }
    } catch (e) { /* Safari privato: si prosegue */ }

    var D = document;
    // LA STESSA query di M2, negata: i due layer sono complementari per
    // costruzione — nessun buco a larghezze frazionarie, nessuna zona doppia.
    var mqMobile = window.matchMedia('(max-width:920px)');

    // ── Config dichiarativa (asserita da tests/desktop/run.mjs) ─────────
    // Le creazioni rapide: proxy di openModal. Visibili solo quando la
    // sidebar del ruolo ha la voce Contratti (= admin), perché aprono
    // modali admin. Ogni type è pinnato sul sorgente di portal-app.js.
    var CREATES = [
        { t: 'addContract', icon: '📋', label: 'Nuovo contratto', chord: 'n c' },
        { t: 'addProperty', icon: '🏠', label: 'Nuovo immobile', chord: 'n i' },
        { t: 'addUser', icon: '👥', label: 'Nuovo utente (inquilino/proprietario)', chord: 'n u' },
        { t: 'addPayment', icon: '💳', label: 'Registra pagamento', chord: 'n p' },
        { t: 'addInvoice', icon: '🧾', label: 'Nuova fattura', chord: 'n f' },
        { t: 'addMaintenance', icon: '🔧', label: 'Nuova manutenzione', chord: '' },
        { t: 'addTask', icon: '✅', label: 'Nuovo task', chord: '' },
        { t: 'addDeadline', icon: '📅', label: 'Nuova scadenza', chord: '' },
        { t: 'addListing', icon: '🏢', label: 'Nuovo annuncio vetrina', chord: '' },
        { t: 'addClient', icon: '💼', label: 'Nuovo cliente CRM', chord: '' }
    ];
    // g + lettera → sezione (solo se la sidebar del ruolo la mostra).
    var GO_CHORDS = {
        d: 'dashboard', c: 'contracts', p: 'payments', v: 'viewings',
        l: 'leads', i: 'properties', f: 'invoices', s: 'settings'
    };
    var CREATE_CHORDS = { c: 'addContract', i: 'addProperty', u: 'addUser', p: 'addPayment', f: 'addInvoice' };

    var st = { active: false, palette: null, help: null, chord: null, chordAt: 0 };
    function $(s, r) { return (r || D).querySelector(s); }
    function $$(s, r) { return Array.prototype.slice.call((r || D).querySelectorAll(s)); }
    function el(tag, cls, html) {
        var n = D.createElement(tag);
        if (cls) n.className = cls;
        if (html != null) n.innerHTML = html;
        return n;
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function txt(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
    function norm(s) {
        try { return txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
        catch (e) { return txt(s).toLowerCase(); }
    }
    function appReady() {
        var app = $('#app');
        return !!(app && app.classList.contains('active'));
    }
    function isAdminSidebar() {
        return !!$('#sidebar .nav-item[onclick*="goTo(\'contracts\')"]');
    }

    // ═══ COMMAND PALETTE ════════════════════════════════════════════════
    // Le voci di navigazione vengono lette dalla sidebar VERA a ogni
    // apertura: ruolo, badge e console sempre allineati, zero drift.
    function navEntries() {
        return $$('#sidebar .nav-item').map(function (item) {
            var icon = txt((item.querySelector('.nav-icon') || {}).textContent) || '·';
            var label = txt(item.textContent);
            var badge = item.querySelector('.nav-badge');
            if (badge) {
                var bcut = label.lastIndexOf(txt(badge.textContent));
                if (bcut > 0) label = txt(label.slice(0, bcut));
            }
            var on = item.getAttribute('onclick') || '';
            var m = on.match(/goTo\('([^']+)'\)/);
            var chord = '';
            if (m) {
                for (var k in GO_CHORDS) if (GO_CHORDS[k] === m[1]) chord = 'g ' + k;
            }
            return {
                kind: on.indexOf('window.open') !== -1 ? 'console' : 'nav',
                icon: icon,
                label: label.replace(/^[^\s]+\s/, function (s) { return /\p{Extended_Pictographic}/u.test(s) ? '' : s; }),
                chord: chord,
                badge: badge ? txt(badge.textContent) : '',
                run: function () { item.click(); } // il proxy: la voce vera fa il lavoro
            };
        }).filter(function (e) { return e.label; });
    }
    function createEntries() {
        if (!isAdminSidebar()) return [];
        return CREATES.map(function (c) {
            return {
                kind: 'create', icon: c.icon, label: c.label, chord: c.chord, badge: '',
                run: function () { if (typeof window.openModal === 'function') window.openModal(c.t); }
            };
        });
    }
    // IL PRONTUARIO — le azioni sepolte (Documenti, Strumenti). La palette
    // legge il registro condiviso invece di una lista propria: la stessa che
    // usa il Menu del telefono, così le due facce non possono divergere.
    // Vai a / Console restano letti dalla sidebar VERA (che porta badge e
    // ruolo) — qui si prende solo ciò che la sidebar NON sa dare.
    var GROUP_KIND = { 'Documenti': 'doc', 'Strumenti': 'tool', 'Su un record': 'ctx' };
    function prontuarioEntries(qstr) {
        var P = window.BOOM_ACTIONS;
        if (!P || typeof P.search !== 'function') return [];   // registro assente: la palette resta quella di prima
        return P.search(qstr || '', { limit: 30 })
            .filter(function (a) { return GROUP_KIND[a.group]; })
            .map(function (a) {
                var kinds = (P.KINDS || {});
                return {
                    kind: GROUP_KIND[a.group],
                    icon: a.icon, label: a.label, chord: a.chord || '',
                    // Un'azione contestuale DICE che serve un record, prima di
                    // essere premuta: "Fascicolo ARPE · contratto" è la
                    // differenza fra una scorciatoia e una sorpresa.
                    badge: a.need && kinds[a.need] ? kinds[a.need].label : '',
                    keep: !!a.need,
                    run: a.need ? function () { openPicker(a); } : function () { P.run(a, window); }
                };
            });
    }

    // ═══ IL SELETTORE DEL RECORD ════════════════════════════════════════
    // La palette non si chiude: cambia domanda. "Fascicolo ARPE" → "Per
    // quale contratto?" e l'input torna vuoto. Esc torna indietro di un
    // passo (non chiude tutto): chi ha sbagliato azione non ricomincia.
    function openPicker(action) {
        var P = window.BOOM_ACTIONS, p = st.palette;
        if (!P || !p) return;
        var k = (P.KINDS || {})[action.need];
        if (!k) return;
        p.picker = action;
        p.input.value = '';
        p.input.placeholder = k.icon + ' ' + k.ask + ' — scrivi un nome, una via, un mese…';
        var top = p.input.parentNode;
        if (top && !$('.pd-cmd-crumb', top)) {
            var crumb = el('span', 'pd-cmd-crumb', esc(action.icon + ' ' + action.label));
            top.insertBefore(crumb, p.input);
        }
        renderPalette('');
        p.input.focus();
    }
    function closePicker() {
        var p = st.palette;
        if (!p || !p.picker) return false;
        p.picker = null;
        p.input.value = '';
        p.input.placeholder = 'Cerca o comanda — sezioni, clienti, contratti, azioni…';
        var crumb = $('.pd-cmd-crumb', p.input.parentNode);
        if (crumb) crumb.remove();
        renderPalette('');
        p.input.focus();
        return true;
    }
    function renderPicker(qstr) {
        var P = window.BOOM_ACTIONS, p = st.palette, list = p.list, a = p.picker;
        var k = (P.KINDS || {})[a.need] || {};
        list.innerHTML = '';
        list.appendChild(el('div', 'pd-cmd-sec', a.label + ' — ' + (k.ask || '')));
        var recs = P.findRecords(qstr, a.need, window);
        if (!recs.length) {
            list.appendChild(el('div', 'pd-cmd-empty',
                qstr.length < 2 ? 'Scrivi almeno due lettere per cercare il ' + (k.label || 'record') + '.'
                                : 'Nessun ' + (k.label || 'record') + ' per “' + esc(qstr) + '”.'));
        }
        recs.forEach(function (r) {
            list.appendChild(entryRow({
                icon: k.icon, label: r.label, badge: r.sub || '', chord: '',
                run: function () { P.run(a, window, r); }
            }));
        });
        st.palette.rows = $$('.pd-cmd-row', list);
        highlight(0);
    }

    // La ricerca entità: si invoca il motore ESISTENTE e si adottano le sue
    // righe (onclick già pronta). handleSearch pretende #globalSearch nel
    // DOM (ci appende il dropdown): senza, niente sezione — mai un throw.
    function liftSearch(qstr) {
        if (qstr.length < 2) return [];
        if (typeof window.handleSearch !== 'function' || !$('#globalSearch')) return [];
        var rows = [];
        try {
            window.handleSearch(qstr);
            var dd = $('#searchResults');
            if (dd) {
                rows = $$(':scope > div', dd).filter(function (n) { return n.getAttribute('onclick'); })
                    .map(function (n) {
                        var c = n.cloneNode(true);
                        c.removeAttribute('style');
                        c.removeAttribute('onmouseenter');
                        c.removeAttribute('onmouseleave');
                        c.classList.add('pd-cmd-row', 'pd-cmd-entity');
                        return c;
                    });
                dd.remove();
            }
        } catch (e) { /* la palette non deve mai rompersi per la ricerca */ }
        return rows;
    }
    function entryRow(e) {
        var row = el('button', 'pd-cmd-row');
        row.type = 'button';
        row.innerHTML = '<span class="pd-cmd-ico">' + esc(e.icon) + '</span>' +
            '<span class="pd-cmd-label">' + esc(e.label) + '</span>' +
            (e.badge ? '<span class="pd-cmd-badge">' + esc(e.badge) + '</span>' : '') +
            (e.chord ? '<span class="pd-cmd-kbd">' + esc(e.chord) + '</span>' : '');
        row.addEventListener('click', function () {
            // Un'azione che deve ancora CHIEDERE qualcosa (il selettore del
            // record) tiene la palette aperta: chiuderla e riaprirla farebbe
            // perdere il filo — e la domanda successiva.
            if (e.keep) { try { e.run(); } catch (err) { console.warn('[pd] comando', err); } return; }
            closePalette();
            setTimeout(function () { try { e.run(); } catch (err) { console.warn('[pd] comando', err); } }, 20);
        });
        return row;
    }
    function score(label, qn) {
        var ln = norm(label);
        if (!qn) return 1;
        if (ln.indexOf(qn) === 0) return 3;
        if (ln.indexOf(' ' + qn) !== -1) return 2;
        if (ln.indexOf(qn) !== -1) return 1;
        return 0;
    }
    function renderPalette(qstr) {
        if (st.palette.picker) return renderPicker(qstr || '');
        var list = st.palette.list;
        list.innerHTML = '';
        var qn = norm(qstr);
        function section(title, entries, preScored) {
            var scored = preScored
                ? entries.map(function (e) { return { e: e, s: 1 }; })
                : entries.map(function (e) { return { e: e, s: score(e.label, qn) }; })
                .filter(function (x) { return x.s > 0; })
                .sort(function (a, b) { return b.s - a.s; });
            if (!scored.length) return;
            list.appendChild(el('div', 'pd-cmd-sec', esc(title)));
            scored.slice(0, qn ? 7 : 6).forEach(function (x) { list.appendChild(entryRow(x.e)); });
        }
        var nav = navEntries();
        var pront = prontuarioEntries(qstr);
        section('Crea', createEntries());
        // I documenti al volo per primi quando si sta cercando: sono la cosa
        // più usata e la più sepolta (Contratti → Template → scorri).
        section('Documenti', pront.filter(function (e) { return e.kind === 'doc'; }), true);
        section('Strumenti', pront.filter(function (e) { return e.kind === 'tool'; }), true);
        section('Su un record', pront.filter(function (e) { return e.kind === 'ctx'; }), true);
        section('Vai a', nav.filter(function (e) { return e.kind === 'nav'; }));
        section('Console', nav.filter(function (e) { return e.kind === 'console'; }));
        var found = liftSearch(qstr);
        if (found.length) {
            list.appendChild(el('div', 'pd-cmd-sec', 'Risultati'));
            found.slice(0, 9).forEach(function (r) {
                r.addEventListener('click', function () { closePalette(); });
                list.appendChild(r);
            });
        }
        if (!list.children.length) {
            list.appendChild(el('div', 'pd-cmd-empty', 'Niente per “' + esc(qstr) + '” — prova con un nome, una via, un mese.'));
        }
        st.palette.rows = $$('.pd-cmd-row', list);
        highlight(0);
    }
    function highlight(i) {
        var rows = st.palette ? st.palette.rows : [];
        if (!rows.length) { if (st.palette) st.palette.idx = -1; return; }
        st.palette.idx = ((i % rows.length) + rows.length) % rows.length;
        rows.forEach(function (r, j) { r.classList.toggle('hot', j === st.palette.idx); });
        var hot = rows[st.palette.idx];
        if (hot && hot.scrollIntoView) hot.scrollIntoView({ block: 'nearest' });
    }
    function openPalette() {
        if (st.palette || !st.active || !appReady()) return;
        var backdrop = el('div', 'pd-cmd-backdrop');
        var panel = el('div', 'pd-cmd');
        panel.setAttribute('role', 'dialog');
        panel.innerHTML =
            '<div class="pd-cmd-top"><span class="pd-cmd-glass">⌘</span>' +
            '<input class="pd-cmd-input" type="text" placeholder="Cerca o comanda — sezioni, clienti, contratti, azioni…" ' +
            'autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></div>' +
            '<div class="pd-cmd-list"></div>' +
            '<div class="pd-cmd-foot"><span>↑↓ scegli</span><span>↵ apri</span><span>esc chiude</span>' +
            '<span class="pd-cmd-foot-right">g poi c = Contratti · ? = tutti i tasti</span></div>';
        backdrop.appendChild(panel);
        backdrop.addEventListener('mousedown', function (ev) { if (ev.target === backdrop) closePalette(); });
        D.body.appendChild(backdrop);
        var input = $('.pd-cmd-input', panel);
        st.palette = { backdrop: backdrop, input: input, list: $('.pd-cmd-list', panel), rows: [], idx: -1, picker: null };
        var deb = null;
        input.addEventListener('input', function () {
            clearTimeout(deb);
            deb = setTimeout(function () { renderPalette(input.value); }, 110);
        });
        input.addEventListener('keydown', function (ev) {
            if (ev.key === 'ArrowDown') { ev.preventDefault(); highlight(st.palette.idx + 1); }
            else if (ev.key === 'ArrowUp') { ev.preventDefault(); highlight(st.palette.idx - 1); }
            else if (ev.key === 'Enter') {
                ev.preventDefault();
                var hot = st.palette.rows[st.palette.idx];
                if (hot) hot.click();
            } else if (ev.key === 'Escape') {
                // stopPropagation, non solo preventDefault: senza, l'Esc
                // risale alla tastiera globale che lo gestisce UN'ALTRA
                // volta — e i due gradini della scala si scendono insieme.
                ev.preventDefault(); ev.stopPropagation();
                if (!closePicker()) closePalette();
            }
        });
        renderPalette('');
        requestAnimationFrame(function () { backdrop.classList.add('open'); input.focus(); });
    }
    function closePalette() {
        if (!st.palette) return;
        var p = st.palette; st.palette = null;
        p.backdrop.classList.remove('open');
        setTimeout(function () { p.backdrop.remove(); }, 180);
    }

    // ═══ IL FOGLIO DEI TASTI (?) ════════════════════════════════════════
    function openHelp() {
        if (st.help || !st.active) return;
        var rows = [
            ['⌘K / Ctrl+K', 'Command palette — cerca e comanda tutto'],
            ['g poi d·c·p·v·l·i·f·s', 'Vai a: Oggi · Contratti · Incassi · Visite · Lead · Immobili · Fatture · Impostazioni'],
            ['n poi c·i·u·p·f', 'Crea: Contratto · Immobile · Utente · Pagamento · Fattura'],
            ['/', 'Ricerca globale'],
            ['esc', 'Chiude palette e pannelli'],
            ['?', 'Questo foglio']
        ];
        var backdrop = el('div', 'pd-cmd-backdrop');
        var panel = el('div', 'pd-help');
        panel.innerHTML = '<div class="pd-help-title">La tastiera del portale</div>' +
            rows.map(function (r) {
                return '<div class="pd-help-row"><span class="pd-cmd-kbd">' + esc(r[0]) + '</span><span>' + esc(r[1]) + '</span></div>';
            }).join('') +
            '<div class="pd-help-hint">Le stesse azioni restano dove sono sempre state: i tasti sono una corsia in più, mai un obbligo.</div>';
        backdrop.appendChild(panel);
        backdrop.addEventListener('mousedown', function (ev) { if (ev.target === backdrop) closeHelp(); });
        D.body.appendChild(backdrop);
        requestAnimationFrame(function () { backdrop.classList.add('open'); });
        st.help = backdrop;
    }
    function closeHelp() {
        if (!st.help) return;
        var h = st.help; st.help = null;
        h.classList.remove('open');
        setTimeout(function () { h.remove(); }, 180);
    }

    // ═══ PEEK DRAWER (schede di sola lettura → pannello destro) ═════════
    function enhanceModal(overlay) {
        if (!st.active || !overlay || overlay.dataset.pdDone) return;
        overlay.dataset.pdDone = '1';
        var modal = overlay.querySelector('.modal') || overlay.firstElementChild;
        if (!modal) return;
        if (modal.classList.contains('ms-editor') || modal.classList.contains('ms-modal')) return;
        if (!modal.classList.contains('lg') && !modal.classList.contains('xl')) return;
        var body = modal.querySelector('.modal-body');
        if (!body) return;
        var fields = body.querySelectorAll('input:not([type="hidden"]),select,textarea').length;
        // solo le schede di LETTURA diventano drawer: un form resta una
        // finestra — cambiare cornice a metà compilazione è disorientante
        if (fields > 0) return;
        overlay.classList.add('pd-peek');
    }
    function onModalsChange() {
        if (!st.active) return;
        var overlay = $('#modals .modal-overlay');
        if (overlay) enhanceModal(overlay);
    }

    // ═══ TASTIERA GLOBALE ═══════════════════════════════════════════════
    function inEditor(t) {
        return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    }
    function onKeydown(e) {
        if (!st.active) return;
        var mod = e.metaKey || e.ctrlKey;
        if (mod && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            if (st.palette) closePalette(); else { closeHelp(); openPalette(); }
            return;
        }
        if (e.key === 'Escape') {
            // Esc scende UN gradino per volta: prima esce dal selettore del
            // record, poi chiude la palette. (Il fuoco è sull'input, quindi
            // il suo handler ha già gestito il caso: qui si arriva solo se
            // il fuoco è altrove — la scala dev'essere la stessa.)
            if (st.palette) { e.preventDefault(); if (!closePicker()) closePalette(); return; }
            if (st.help) { e.preventDefault(); closeHelp(); return; }
            return;
        }
        if (st.palette || st.help) return;         // la palette ha la sua tastiera
        if (inEditor(e.target)) return;            // mai rubare i tasti a chi scrive
        if (mod || e.altKey) return;
        if ($('#modals .modal-overlay')) return;   // dentro un modale niente chord
        if (!appReady()) return;

        var now = Date.now();
        if (st.chord && now - st.chordAt > 900) st.chord = null;
        if (st.chord === 'g') {
            st.chord = null;
            var target = GO_CHORDS[e.key.toLowerCase()];
            if (target) {
                var item = $('#sidebar .nav-item[onclick*="goTo(\'' + target + '\')"]');
                if (item) { e.preventDefault(); item.click(); }
            }
            return;
        }
        if (st.chord === 'n') {
            st.chord = null;
            var t = CREATE_CHORDS[e.key.toLowerCase()];
            if (t && isAdminSidebar() && typeof window.openModal === 'function') {
                e.preventDefault();
                window.openModal(t);
            }
            return;
        }
        if (e.key === 'g' || e.key === 'n') { st.chord = e.key; st.chordAt = now; return; }
        if (e.key === '/') {
            var gs = $('#globalSearch');
            if (gs) { e.preventDefault(); gs.focus(); }
            else { e.preventDefault(); openPalette(); }
            return;
        }
        if (e.key === '?') { e.preventDefault(); openHelp(); return; }
    }

    // ═══ ATTIVAZIONE ════════════════════════════════════════════════════
    function activate() {
        if (st.active) return;
        st.active = true;
        D.body.classList.add('pd-on');
        var overlay = $('#modals .modal-overlay');
        if (overlay && !overlay.dataset.pdDone) enhanceModal(overlay);
    }
    function deactivate() {
        if (!st.active) return;
        st.active = false;
        D.body.classList.remove('pd-on');
        closePalette();
        closeHelp();
    }
    function onViewportChange() { if (mqMobile.matches) deactivate(); else activate(); }

    function boot() {
        D.addEventListener('keydown', onKeydown);
        var modals = $('#modals');
        if (modals) new MutationObserver(onModalsChange).observe(modals, { childList: true });
        if (mqMobile.addEventListener) mqMobile.addEventListener('change', onViewportChange);
        else if (mqMobile.addListener) mqMobile.addListener(onViewportChange);
        onViewportChange();
    }
    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot);
    else boot();

    // Superficie pubblica: la leggono i test e la console, non il portale.
    window.BOOM_DESKTOP = {
        version: 'D1',
        CREATES: CREATES,
        GO_CHORDS: GO_CHORDS,
        CREATE_CHORDS: CREATE_CHORDS,
        active: function () { return st.active; },
        openPalette: openPalette,
        closePalette: closePalette,
        openHelp: openHelp,
        _enhanceModal: enhanceModal
    };
})();
