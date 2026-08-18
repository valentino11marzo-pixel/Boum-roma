// ═══════════════════════════════════════════════════════════════════════════
// M2 · PORTAL APP — js/portal-mobile.js
// Il layer che fa sentire portal.html come un'APP quando sta in una mano.
//
// COSA FA (solo ≤920px, solo se acceso):
//   1. Tab bar in basso (4 sezioni pinnate + Menu) che specchia la sidebar
//      VERA — voci, icone e badge vengono dal DOM di buildNav(), mai da una
//      seconda lista che potrebbe divergere (disciplina "una copia sola").
//   2. Bottom sheet generico: il Menu (la sidebar intera, a schede), le
//      azioni di riga e i footer-modale da 15 bottoni diventano righe da
//      52px con l'etichetta VERA — mai icone nude da 25px.
//   3. Liste `.list-item` → card respirabili; le 6 <table> vere → card con
//      data-label (adminflats, landlords…).
//   4. Modali lunghe → full-screen; footer ≥4 bottoni → primaria + ⋯.
//   5. IL WIZARD SERENO: il modal contratto (che È GIÀ un wizard a 4 passi,
//      #cPage0..3) viene ristrutturato — progress sottile, un passo per
//      schermata, barra Avanti/Indietro fissa in basso che PROXY-a i bottoni
//      originali (la loro validazione resta l'unica autorità). I modali
//      PIATTI da 15-22 campi (editContract, add/editProperty, add/editUser)
//      diventano wizard a capitoli con riepilogo finale, spostando i nodi
//      DENTRO #mForm (saveContract legge new FormData(#mForm): un campo
//      fuori dal form sparisce dai dati in silenzio — vincolo assoluto).
//
// COSA NON FA MAI:
//   - Non scrive dati, non chiama Firestore, non duplica logica: ogni
//     azione è un .click() sul bottone originale (validazioni comprese).
//   - Non tocca il desktop: ogni cambiamento VISIVO vive dietro body.pm-on
//     nella CSS gemella. Anche lo stato dei wizard (pagina corrente, righe
//     nav nascoste, footer nascosto) è espresso SOLO con classi lette da
//      regole `body.pm-on …`: ruotando un iPad oltre i 920px il layer si
//     spegne e il modale torna ESATTAMENTE il desktop originale, senza
//     alcun ripristino da orchestrare.
//   - Non clona i campi: i nodi si SPOSTANO (listener e valori intatti) e
//     ogni apertura riparte pulita perché openModal ri-renderizza #modals.
//
// Kill switch: ?classic=1 (persistito) o localStorage boom_classic_mobile='1';
// si riattiva con ?app=1. Se questo file non parte, il portale è IDENTICO
// a prima: la CSS gemella è tutta dietro body.pm-on.
//
// Test: node tests/mobile/run.mjs (sorgente) + tests/mobile/ui.mjs (browser).
// ═══════════════════════════════════════════════════════════════════════════
window.__pmLoaded = true;
(function () {
    'use strict';

    // ── Kill switch ─────────────────────────────────────────────────────
    try {
        var q = new URLSearchParams(location.search);
        if (q.get('classic') === '1') localStorage.setItem('boom_classic_mobile', '1');
        if (q.get('app') === '1') localStorage.removeItem('boom_classic_mobile');
        if (localStorage.getItem('boom_classic_mobile') === '1') {
            window.BOOM_MOBILE = { off: true };
            return;
        }
    } catch (e) { /* Safari privato: localStorage può lanciare — si prosegue */ }

    var BP = 920;
    var D = document;
    var mq = window.matchMedia('(max-width:' + BP + 'px)');

    // ── Config dichiarativa (asserita da tests/mobile/run.mjs) ──────────
    // Tab preferite in ordine: si pinnano le prime 4 PRESENTI nella sidebar
    // del ruolo corrente — così admin, landlord e tenant hanno ciascuno le
    // proprie senza una riga di codice per ruolo.
    var PREF_TABS = ['dashboard', 'contracts', 'payments', 'viewings', 'leads', 'clienti',
        'my-contract', 'my-contracts', 'my-payments', 'my-maintenance', 'my-properties', 'my-documents'];
    var TAB_LABELS = {
        dashboard: 'Oggi', contracts: 'Contratti', payments: 'Incassi', viewings: 'Visite',
        leads: 'Lead', clienti: 'Clienti', properties: 'Immobili',
        'my-contract': 'Contratto', 'my-contracts': 'Contratti', 'my-payments': 'Pagamenti',
        'my-maintenance': 'Guasti', 'my-properties': 'Immobili', 'my-documents': 'Documenti'
    };
    // Sezioni le cui righe .list-item diventano card con corsia azioni.
    var LIST_SECTIONS = ['contracts', 'payments', 'invoices', 'users', 'maintenance', 'documents',
        'rules', 'leads', 'properties', 'my-payments', 'my-contracts', 'my-maintenance',
        'my-documents', 'my-properties'];

    // Capitoli semantici dei modali PIATTI (nomi campo VERI di portal-app.js;
    // un campo non elencato finisce nel capitolo "Altro" — mai perso).
    // 'studenti_*' è un prefisso jolly.
    var WIZ = {
        editContract: [
            { t: 'Immobile e inquilino', f: ['propertyId', 'tenantId'] },
            { t: 'Date e stato', f: ['startDate', 'endDate', 'status'] },
            { t: 'Canone e deposito', f: ['rent', 'deposit', 'canoneTotal', 'canoneInstallments'] },
            { t: 'Studenti (Allegato C)', f: ['studenti_*'] },
            { t: 'Note', f: ['notes'] }
        ],
        addProperty: [
            { t: "L'essenziale", f: ['name', 'ownerId', 'address', 'rent'] },
            { t: 'Spazi e piano', f: ['sqm', 'rooms', 'bathrooms', 'floor', 'scala', 'interno'] },
            { t: 'Caratteristiche', f: ['propertyType', 'furnished', 'yearBuilt', 'accessories', 'youtubeUrl'] },
            { t: 'Disponibilità', f: ['availabilityStatus', 'availableSince'] },
            { t: 'Catasto ed energia', f: ['cadastralData', 'energyClass', 'energyCert', 'safetyImplants'] },
            { t: 'Note', f: ['notes'] }
        ],
        addUser: [
            { t: 'Identità e accesso', f: ['name', 'email', 'role', 'password'] },
            { t: 'Contatti e CF', f: ['phone', 'codiceFiscale', 'address'] },
            { t: 'Nascita e documento', f: ['birthDate', 'birthPlace', 'idDocType', 'idDocNumber'] },
            { t: 'Banca e impianti', f: ['iban', 'impiantiStato', 'condoMode'] },
            { t: 'Note', f: ['notes'] }
        ]
    };
    WIZ.editProperty = WIZ.addProperty;
    WIZ.editUser = WIZ.addUser;

    // Soglia oltre la quale un modale piatto senza mappa viene comunque
    // spezzato in capitoli automatici (per heading, altrimenti a gruppi).
    var AUTO_WIZ_MIN_FIELDS = 12;
    var FULL_MIN_FIELDS = 6;
    var NATIVE_STEP_TITLES = ['Tipo e parti', 'Termini e canone', 'Dettagli del contratto', 'Riepilogo e crea'];

    // ── Stato + helpers ─────────────────────────────────────────────────
    var st = { active: false, section: null, lastModalType: null, lastModalAt: 0, tabsBuilt: false };
    function $(s, r) { return (r || D).querySelector(s); }
    function $$(s, r) { return Array.prototype.slice.call((r || D).querySelectorAll(s)); }
    function el(tag, cls, html) {
        var n = D.createElement(tag);
        if (cls) n.className = cls;
        if (html != null) n.innerHTML = html;
        return n;
    }
    function debounce(fn, ms) {
        var t = null;
        return function () { clearTimeout(t); t = setTimeout(fn, ms); };
    }
    function txt(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
    // Etichetta VERA di un bottone: title > aria-label > testo.
    function btnLabel(b) {
        return txt(b.getAttribute('title')) || txt(b.getAttribute('aria-label')) || txt(b.textContent) || 'Azione';
    }
    function btnIcon(b) {
        var m = txt(b.textContent).match(/^(\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*)/u);
        return m ? m[1] : '·';
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function safeToast(type, title, msg) {
        try { if (typeof window.toast === 'function') { window.toast(type, title, msg || ''); return; } } catch (e) {}
        try { alert(title + (msg ? '\n' + msg : '')); } catch (e2) {}
    }

    // ═══ BOTTOM SHEET (uno alla volta) ══════════════════════════════════
    var sheetState = null;
    function closeSheet() {
        if (!sheetState) return;
        var s = sheetState; sheetState = null;
        s.panel.classList.remove('open');
        s.backdrop.classList.remove('open');
        setTimeout(function () { s.panel.remove(); s.backdrop.remove(); }, 320);
    }
    function openSheet(opts) {
        closeSheet();
        var backdrop = el('div', 'pm-sheet-backdrop');
        var panel = el('div', 'pm-sheet');
        panel.setAttribute('role', 'dialog');
        panel.appendChild(el('div', 'pm-sheet-grab'));
        if (opts.title) {
            var head = el('div', 'pm-sheet-head');
            head.appendChild(el('div', 'pm-sheet-title', esc(opts.title)));
            if (opts.sub) head.appendChild(el('div', 'pm-sheet-sub', esc(opts.sub)));
            panel.appendChild(head);
        }
        var body = el('div', 'pm-sheet-body');
        if (opts.node) body.appendChild(opts.node);
        (opts.items || []).forEach(function (it) {
            if (it === '-') { body.appendChild(el('div', 'pm-sheet-sep')); return; }
            var row = el('button', 'pm-sheet-item' + (it.kind ? ' ' + it.kind : ''));
            row.type = 'button';
            row.innerHTML = '<span class="ico">' + esc(it.icon || '·') + '</span><span>' + esc(it.label) + '</span>';
            row.addEventListener('click', function (e) {
                e.stopPropagation();
                closeSheet();
                // prima si chiude lo sheet, POI si esegue: se l'azione apre
                // un altro overlay non deve trovarsi lo sheet ancora sopra
                setTimeout(function () { try { it.onTap(); } catch (err) { console.warn('[pm] azione sheet', err); } }, 30);
            });
            body.appendChild(row);
        });
        panel.appendChild(body);
        backdrop.addEventListener('click', closeSheet);
        // swipe-down per chiudere (il gesto che ci si aspetta da uno sheet)
        var y0 = null;
        panel.addEventListener('touchstart', function (e) {
            if (e.target.closest('.pm-sheet-body') && body.scrollTop > 0) { y0 = null; return; }
            y0 = e.touches[0].clientY;
        }, { passive: true });
        panel.addEventListener('touchmove', function (e) {
            if (y0 == null) return;
            var dy = e.touches[0].clientY - y0;
            if (dy > 0) panel.style.transform = 'translateY(' + dy + 'px)';
        }, { passive: true });
        panel.addEventListener('touchend', function (e) {
            if (y0 == null) return;
            var dy = e.changedTouches[0].clientY - y0;
            panel.style.transform = '';
            if (dy > 84) closeSheet();
            y0 = null;
        });
        D.body.appendChild(backdrop);
        D.body.appendChild(panel);
        requestAnimationFrame(function () {
            backdrop.classList.add('open');
            panel.classList.add('open');
        });
        sheetState = { panel: panel, backdrop: backdrop };
        return closeSheet;
    }

    // ═══ TAB BAR ════════════════════════════════════════════════════════
    var tabbar = null;
    function currentSection() {
        return st.section || (location.hash || '').slice(1) || null;
    }
    function sidebarItemFor(target) {
        return $('#sidebar .nav-item[onclick*="goTo(\'' + target + '\')"]');
    }
    function resolveTabs() {
        var out = [];
        PREF_TABS.forEach(function (t) {
            if (out.length >= 4) return;
            var item = sidebarItemFor(t);
            if (!item) return;
            var icon = txt((item.querySelector('.nav-icon') || {}).textContent) || '·';
            var label = TAB_LABELS[t] || txt(item.textContent).split(' ')[0];
            out.push({ target: t, icon: icon, label: label });
        });
        return out;
    }
    function buildTabbar() {
        var tabs = resolveTabs();
        if (!tabs.length) return; // la sidebar non è ancora renderizzata: l'observer riproverà
        if (!tabbar) {
            tabbar = el('nav', 'pm-tabbar');
            tabbar.setAttribute('aria-label', 'Sezioni principali');
            D.body.appendChild(tabbar);
        }
        tabbar.innerHTML = '';
        tabs.forEach(function (t) {
            var b = el('button', 'pm-tab');
            b.type = 'button';
            b.dataset.target = t.target;
            b.innerHTML = '<span class="pm-tab-ico">' + esc(t.icon) + '</span>' +
                '<span class="pm-tab-lab">' + esc(t.label) + '</span>' +
                '<span class="pm-tab-badge" hidden></span>';
            b.addEventListener('click', function () {
                closeSheet();
                if (typeof window.goTo === 'function') window.goTo(t.target);
            });
            tabbar.appendChild(b);
        });
        var menu = el('button', 'pm-tab pm-tab-menu');
        menu.type = 'button';
        menu.innerHTML = '<span class="pm-tab-ico">☰</span><span class="pm-tab-lab">Menu</span>' +
            '<span class="pm-tab-badge" hidden></span>';
        menu.addEventListener('click', openMenu);
        tabbar.appendChild(menu);
        st.tabsBuilt = true;
        syncTabbar();
    }
    function syncTabbar() {
        if (!tabbar) return;
        var cur = currentSection();
        var pinned = {};
        var extraBadge = 0;
        $$('.pm-tab', tabbar).forEach(function (b) {
            var t = b.dataset.target;
            if (!t) return; // la tab Menu
            pinned[t] = true;
            b.classList.toggle('active', t === cur);
            var item = sidebarItemFor(t);
            var srcBadge = item && item.querySelector('.nav-badge');
            var badge = b.querySelector('.pm-tab-badge');
            if (srcBadge && txt(srcBadge.textContent)) {
                badge.textContent = txt(srcBadge.textContent);
                badge.classList.toggle('gold', /gold|orange/.test(srcBadge.className));
                badge.hidden = false;
            } else badge.hidden = true;
        });
        // il Menu somma i badge delle sezioni NON pinnate: niente sparisce
        $$('#sidebar .nav-item').forEach(function (item) {
            var m = (item.getAttribute('onclick') || '').match(/goTo\('([^']+)'\)/);
            if (!m || pinned[m[1]]) return;
            var bd = item.querySelector('.nav-badge');
            var n = bd ? parseInt(txt(bd.textContent), 10) : 0;
            if (n > 0) extraBadge += n;
        });
        var menuBtn = $('.pm-tab-menu', tabbar);
        if (menuBtn) {
            var mb = menuBtn.querySelector('.pm-tab-badge');
            if (extraBadge > 0) { mb.textContent = extraBadge > 99 ? '99+' : String(extraBadge); mb.hidden = false; }
            else mb.hidden = true;
            menuBtn.classList.toggle('active', !pinned[cur] && !!cur && !!sidebarItemFor(cur));
        }
        syncTabbarVisibility();
    }
    function syncTabbarVisibility() {
        if (!tabbar) return;
        var app = $('#app');
        var visible = st.active && app && app.classList.contains('active');
        tabbar.hidden = !visible;
    }

    // ═══ MENU (la sidebar + IL PRONTUARIO, come sheet a schede) ═════════
    // Su telefono il Menu era solo la sidebar clonata: le capacità sepolte
    // (i 22 documenti al volo, gli strumenti) restavano irraggiungibili senza
    // sapere in quale pagina vivono. Ora in cima c'è una riga di ricerca che
    // pesca dal registro condiviso — lo STESSO che alimenta ⌘K sul desktop.
    function menuSearchRow(wrap, clone) {
        var P = window.BOOM_ACTIONS;
        if (!P || typeof P.search !== 'function') return null;   // registro assente: Menu com'era
        var box = el('div', 'pm-menu-search');
        box.innerHTML = '<input type="search" class="pm-menu-input" ' +
            'placeholder="Cerca: ricevuta, contratto, banca…" ' +
            'autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">';
        var res = el('div', 'pm-menu-res');
        var input = box.querySelector('.pm-menu-input');
        var deb = null;
        function render() {
            var q = txt(input.value);
            if (!q) { res.innerHTML = ''; res.hidden = true; clone.hidden = false; return; }
            var hits = P.search(q, { limit: 14 });
            clone.hidden = true; res.hidden = false;
            res.innerHTML = '';
            if (!hits.length) {
                res.appendChild(el('div', 'pm-menu-empty', 'Niente per “' + esc(q) + '”'));
                return;
            }
            hits.forEach(function (a) {
                var row = el('button', 'pm-sheet-item');
                row.type = 'button';
                row.innerHTML = '<span class="ico">' + esc(a.icon || '·') + '</span>' +
                    '<span>' + esc(a.label) + '<span class="pm-menu-grp">' + esc(a.group) + '</span></span>';
                row.addEventListener('click', function () {
                    closeSheet();
                    setTimeout(function () { try { P.run(a, window); } catch (e) { console.warn('[pm] azione', e); } }, 30);
                });
                res.appendChild(row);
            });
        }
        input.addEventListener('input', function () { clearTimeout(deb); deb = setTimeout(render, 110); });
        wrap.appendChild(box);
        wrap.appendChild(res);
        res.hidden = true;
        return input;
    }

    function openMenu() {
        var sb = $('#sidebar');
        if (!sb || !sb.children.length) return;
        var wrap = el('div', 'pm-menu');
        // scheda utente in testa (dagli stessi nodi dell'header)
        var name = txt(($('#headerName') || {}).textContent);
        var role = txt(($('#headerRole') || {}).textContent);
        var avatar = txt(($('#headerAvatar') || {}).textContent) || 'B';
        wrap.appendChild(el('div', 'pm-menu-user',
            '<div class="user-avatar">' + esc(avatar) + '</div>' +
            '<div><div class="pm-menu-user-name">' + esc(name || 'BOOM') + '</div>' +
            '<div class="pm-menu-user-role">' + esc(role || '') + '</div></div>'));
        // la sidebar VERA, clonata: gli onclick inline sopravvivono al clone,
        // quindi goTo/window.open/logout funzionano senza ricablare nulla
        var clone = sb.cloneNode(true);
        clone.removeAttribute('id');
        clone.removeAttribute('class');
        menuSearchRow(wrap, clone);   // la ricerca sta sopra le sezioni
        wrap.appendChild(clone);
        wrap.addEventListener('click', function (e) {
            if (e.target.closest('.nav-item')) setTimeout(closeSheet, 60);
        });
        openSheet({ title: 'Menu', sub: name || '', node: wrap });
    }

    // ═══ LISTE → CARD (le .list-item delle sezioni operative) ═══════════
    function proxyButtonsBar(btns, contextLabel) {
        var bar = el('div', 'pm-card-actions');
        bar.addEventListener('click', function (e) { e.stopPropagation(); });
        function mkProxy(b, cls) {
            var p = el('button', cls);
            p.type = 'button';
            p.innerHTML = esc(btnIcon(b)) + ' <span>' + esc(btnLabel(b)) + '</span>';
            p.addEventListener('click', function (e) {
                e.stopPropagation();
                b.click(); // il bottone ORIGINALE fa il lavoro: validazioni comprese
            });
            return p;
        }
        if (btns.length <= 2) {
            btns.forEach(function (b) { bar.appendChild(mkProxy(b, 'pm-act-primary')); });
            return bar;
        }
        var primary = btns.find(function (b) {
            return /(^|\s)btn(\s|$)/.test(b.className) && !/btn-secondary|btn-danger/.test(b.className);
        }) || btns[0];
        bar.appendChild(mkProxy(primary, 'pm-act-primary'));
        var more = el('button', 'pm-act-more', '⋯');
        more.type = 'button';
        more.addEventListener('click', function (e) {
            e.stopPropagation();
            openSheet({
                title: 'Azioni',
                sub: contextLabel || '',
                items: btns.map(function (b) {
                    return {
                        icon: btnIcon(b),
                        label: btnLabel(b),
                        kind: /btn-danger/.test(b.className) || /elimina|cancella|termina/i.test(btnLabel(b)) ? 'danger'
                            : (b === primary ? 'primary' : ''),
                        onTap: function () { b.click(); }
                    };
                })
            });
        });
        bar.appendChild(more);
        return bar;
    }
    function listifyRow(row) {
        if (row.dataset.pmDone) return;
        row.dataset.pmDone = '1';
        row.classList.add('pm-li');
        var btns = $$('button', row).filter(function (b) { return !b.closest('.pm-card-actions'); });
        if (!btns.length) return;
        btns.forEach(function (b) { b.classList.add('pm-src-btn'); });
        var title = txt((row.querySelector('.list-title') || row).textContent).slice(0, 60);
        row.appendChild(proxyButtonsBar(btns, title));
    }

    // ═══ TABELLE VERE → CARD (adminflats, landlords…) ═══════════════════
    function cardifyTable(table) {
        if (table.dataset.pmDone) return;
        var head = table.tHead;
        var body = table.tBodies && table.tBodies[0];
        if (!head || !body || !head.rows.length) return;
        var labels = Array.prototype.map.call(head.rows[0].cells, function (th) { return txt(th.textContent); });
        if (labels.length < 3) return;
        table.dataset.pmDone = '1';
        table.classList.add('pm-cards');
        Array.prototype.forEach.call(body.rows, function (tr) {
            var tds = tr.cells;
            if (tds.length < 2 || Array.prototype.some.call(tds, function (td) { return td.colSpan > 1; })) {
                tr.classList.add('pm-row-plain');
                return;
            }
            Array.prototype.forEach.call(tds, function (td, i) {
                td.setAttribute('data-label', labels[i] || '');
            });
            tds[0].classList.add('pm-td-main');
            var last = tds[tds.length - 1];
            var btns = $$('button', last);
            if (btns.length) {
                last.classList.add('pm-td-actions');
                btns.forEach(function (b) { b.classList.add('pm-src-btn'); });
                last.appendChild(proxyButtonsBar(btns, txt(tds[0].textContent).slice(0, 60)));
            }
        });
    }

    function applyMain() {
        if (!st.active) return;
        var cur = currentSection();
        if (cur && LIST_SECTIONS.indexOf(cur) !== -1) {
            $$('#main .list-item').forEach(listifyRow);
        }
        $$('#main table').forEach(cardifyTable);
    }

    // ═══ ERGONOMIA INPUT (la tastiera giusta al primo tap) ══════════════
    function stampInputModes(root) {
        $$('input', root).forEach(function (i) {
            var n = (i.name || i.id || '').toLowerCase();
            if (i.type === 'number' || /rent|deposit|amount|price|total|sqm|charges|adjustment|months/.test(n)) {
                if (!i.getAttribute('inputmode')) i.setAttribute('inputmode', 'decimal');
            }
            if (/phone|telefono/.test(n)) { i.setAttribute('inputmode', 'tel'); i.setAttribute('autocomplete', 'tel'); }
            if (/email/.test(n)) { i.setAttribute('inputmode', 'email'); i.setAttribute('autocomplete', 'email'); }
            if (/codicefiscale|^cf$/.test(n)) { i.setAttribute('autocapitalize', 'characters'); i.setAttribute('autocomplete', 'off'); }
            if (/^name$|nome/.test(n)) i.setAttribute('autocapitalize', 'words');
        });
    }

    // ═══ WIZARD — chrome condiviso (progress + barra nav fissa) ═════════
    function wizChrome(modal, titles) {
        var prog = el('div', 'pm-wiz-progress');
        prog.innerHTML =
            '<div class="pm-wiz-bar"><i style="width:0%"></i></div>' +
            '<div class="pm-wiz-count"></div>' +
            '<div class="pm-wiz-step-title"></div>' +
            '<div class="pm-wiz-dots">' + titles.map(function (t, i) {
                return '<button type="button" class="pm-wiz-dot" data-i="' + i + '" title="' + esc(t) + '">' + (i + 1) + '</button>';
            }).join('') + '</div>';
        var nav = el('div', 'pm-wiz-footer');
        nav.innerHTML =
            '<div class="pm-wiz-nav">' +
            '<button type="button" class="pm-wiz-back">Indietro</button>' +
            '<button type="button" class="pm-wiz-next">Avanti →</button>' +
            '</div>';
        var header = modal.querySelector('.modal-header');
        if (header && header.nextSibling) modal.insertBefore(prog, header.nextSibling);
        else modal.insertBefore(prog, modal.firstChild);
        modal.appendChild(nav);
        return {
            prog: prog, nav: nav,
            back: nav.querySelector('.pm-wiz-back'),
            next: nav.querySelector('.pm-wiz-next'),
            update: function (i, total, opts) {
                opts = opts || {};
                prog.querySelector('.pm-wiz-bar i').style.width = Math.round(((i + 1) / total) * 100) + '%';
                prog.querySelector('.pm-wiz-count').textContent = 'Passo ' + (i + 1) + ' di ' + total;
                prog.querySelector('.pm-wiz-step-title').textContent = titles[i] || '';
                $$('.pm-wiz-dot', prog).forEach(function (d, j) {
                    d.classList.toggle('active', j === i);
                    d.classList.toggle('done', j < i);
                });
                this.back.textContent = i === 0 ? (opts.cancelLabel || 'Annulla') : 'Indietro';
                this.next.innerHTML = i === total - 1 ? (opts.lastLabel || 'Fine') : 'Avanti →';
            }
        };
    }
    function scrollModalTop(modal) {
        var b = modal.querySelector('.modal-body');
        if (b) b.scrollTop = 0;
    }
    function requiredOk(pane) {
        var need = $$('[required]', pane);
        for (var i = 0; i < need.length; i++) {
            var f = need[i];
            if (f.offsetParent === null) continue; // campo in un blocco nascosto (es. studenti spento)
            if (!f.value) {
                f.classList.add('error');
                try { f.focus(); } catch (e) {}
                var lab = f.closest('.form-group');
                safeToast('warning', 'Campo obbligatorio', txt(lab && lab.querySelector('.form-label') ? lab.querySelector('.form-label').textContent : ''));
                return false;
            }
            f.classList.remove('error');
        }
        return true;
    }

    // ═══ WIZARD NATIVO addContract (#cPage0..3) — si ristruttura ════════
    function enhanceContractWizard(overlay, modal) {
        overlay.classList.add('pm-full', 'pm-natwiz');
        var pages = [0, 1, 2, 3].map(function (i) { return $('#cPage' + i, modal); });
        if (pages.some(function (p) { return !p; })) return;
        // il loro stepper a 4 celle (quello che sfora): lo nasconde una
        // regola gated `body.pm-on` — su desktop resta identico
        var pill = $('#cStep0', modal);
        if (pill && pill.parentElement) pill.parentElement.classList.add('pm-natpill');
        // le loro righe-nav restano nel DOM e restano l'AUTORITÀ (validazione,
        // buildContractReview, submit): la barra fissa le proxy-a. Nascoste
        // via CSS gated, mai via style inline (rotazione tablet = ripristino
        // automatico).
        pages.forEach(function (p) {
            $$('button', p).forEach(function (b) {
                var on = b.getAttribute('onclick') || '';
                if (/contractWizardNav\(/.test(on) || b.type === 'submit') {
                    var row = b.parentElement;
                    if (row && row !== p) row.setAttribute('data-pm-nav', '1');
                }
            });
        });
        var ui = wizChrome(modal, NATIVE_STEP_TITLES);
        function visibleIdx() {
            for (var i = 0; i < 4; i++) if (pages[i].style.display !== 'none') return i;
            return 0;
        }
        function nativeBtn(page, toStep) {
            return $('button[onclick*="contractWizardNav(' + toStep + ')"]', page);
        }
        function sync() {
            var i = visibleIdx();
            ui.update(i, 4, { lastLabel: '📋 Crea contratto', cancelLabel: 'Annulla' });
            scrollModalTop(modal);
        }
        ui.back.addEventListener('click', function () {
            var i = visibleIdx();
            if (i === 0) { if (typeof window.closeModal === 'function') window.closeModal(); return; }
            var b = nativeBtn(pages[i], i - 1);
            if (b) b.click(); else if (typeof window.contractWizardNav === 'function') window.contractWizardNav(i - 1);
        });
        ui.next.addEventListener('click', function () {
            var i = visibleIdx();
            if (i === 3) {
                var submit = $('button[type="submit"]', pages[3]);
                if (submit) submit.click();
                return;
            }
            var b = nativeBtn(pages[i], i + 1);
            if (b) b.click(); else if (typeof window.contractWizardNav === 'function') window.contractWizardNav(i + 1);
        });
        $$('.pm-wiz-dot', ui.prog).forEach(function (d) {
            d.addEventListener('click', function () {
                if (typeof window.contractWizardNav === 'function') window.contractWizardNav(parseInt(d.dataset.i, 10));
            });
        });
        // il loro nav scrive display inline sulle pagine: il chrome si tiene
        // in sincrono OSSERVANDO, così qualunque strada (dot, proxy, il BOOM
        // Bridge che salta allo step 2) porta allo stesso stato disegnato
        var mo = new MutationObserver(sync);
        pages.forEach(function (p) { mo.observe(p, { attributes: true, attributeFilter: ['style'] }); });
        // contractWizardStep è una variabile del modulo che NON viene azzerata
        // alla riapertura (bug latente a monte): ripartire dal passo 0 riallinea
        try { if (typeof window.contractWizardNav === 'function') window.contractWizardNav(0); } catch (e) {}
        sync();
    }

    // ═══ AUTO-WIZARD per i modali PIATTI (editContract, property, user…) ═
    function fieldsOf(node) {
        return $$('input:not([type="hidden"]),select,textarea', node);
    }
    function chapterFor(map, names) {
        for (var i = 0; i < names.length; i++) {
            for (var c = 0; c < map.length; c++) {
                var hit = map[c].f.some(function (f) {
                    return f.slice(-1) === '*' ? names[i].indexOf(f.slice(0, -1)) === 0 : names[i] === f;
                });
                if (hit) return c;
            }
        }
        return -1;
    }
    function autoWizard(overlay, modal, map) {
        var body = modal.querySelector('.modal-body');
        if (!body) return false;
        var form = body.querySelector('form') || body;
        if (form.id === 'tplForm') return false;      // il modale template si ri-renderizza da solo
        if (form.querySelector('table')) return false; // un form-tabella non è un flusso lineare
        var blocks = $$(':scope > *', form).filter(function (b) { return b.tagName !== 'SCRIPT'; });
        if (blocks.length < 3) return false;

        var titles = [];
        var buckets = [];
        function bucket(title) {
            var i = titles.indexOf(title);
            if (i === -1) { titles.push(title); buckets.push([]); i = titles.length - 1; }
            return buckets[i];
        }
        if (map) {
            map.forEach(function (ch) { bucket(ch.t); });
            var pending = null; // blocchi senza campi seguono il capitolo del vicino di sopra
            blocks.forEach(function (b) {
                var names = fieldsOf(b).map(function (f) { return f.name || f.id || ''; });
                if (!names.length) {
                    (pending || bucket(map[0].t)).push(b);
                    return;
                }
                var c = chapterFor(map, names);
                var arr = c === -1 ? bucket('Altro') : bucket(map[c].t);
                arr.push(b);
                pending = arr;
            });
        } else {
            // spezzatura generica: nuovo capitolo sugli heading, altrimenti ogni ~5 gruppi
            var cur = null, count = 0, n = 1;
            blocks.forEach(function (b) {
                var h = b.matches('h3,h4') ? b : b.querySelector(':scope > h3,:scope > h4');
                if (!cur || h || count >= 5) {
                    cur = bucket(h ? txt(h.textContent).slice(0, 34) : 'Parte ' + n++);
                    count = 0;
                }
                cur.push(b);
                count += fieldsOf(b).length ? 1 : 0;
            });
        }
        // i capitoli vuoti (es. "Studenti" su un transitorio, che non viene
        // proprio renderizzato) spariscono dal percorso
        var panes = [];
        var keptTitles = [];
        titles.forEach(function (t, i) {
            if (!buckets[i].length) return;
            keptTitles.push(t);
            var pane = el('div', 'pm-wiz-pane');
            buckets[i].forEach(function (b) { pane.appendChild(b); }); // MOVE, mai clone
            panes.push(pane);
        });
        if (panes.length < 2) return false;
        keptTitles.push('Riepilogo');
        var recap = el('div', 'pm-wiz-pane pm-wiz-recappane');
        recap.appendChild(el('div', 'pm-wiz-recap'));
        panes.push(recap);
        panes.forEach(function (p) { form.appendChild(p); });

        overlay.classList.add('pm-full', 'pm-autowiz');
        var footer = modal.querySelector('.modal-footer');
        var saveBtn = footer ? ($$('.btn', footer).find(function (b) { return !/btn-secondary/.test(b.className); }) || null) : null;
        var ui = wizChrome(modal, keptTitles);
        var cur = 0;
        function buildRecap() {
            var box = recap.querySelector('.pm-wiz-recap');
            var html = '';
            panes.forEach(function (p, i) {
                if (p === recap) return;
                var rows = '';
                fieldsOf(p).forEach(function (f) {
                    var g = f.closest('.form-group');
                    var lab = g && g.querySelector('.form-label') ? txt(g.querySelector('.form-label').textContent) : (f.name || '');
                    if (!lab) return;
                    var v;
                    if (f.tagName === 'SELECT') v = f.selectedOptions && f.selectedOptions.length ? txt(f.selectedOptions[0].textContent) : '';
                    else if (f.type === 'checkbox') v = f.checked ? 'Sì' : 'No';
                    else v = txt(f.value);
                    rows += '<div class="pm-wiz-recap-row"><span class="k">' + esc(lab) + '</span>' +
                        '<span class="v' + (v ? '' : ' empty') + '">' + (v ? esc(v) : '—') +
                        '<button type="button" class="pm-wiz-recap-edit" data-i="' + i + '">Modifica</button></span></div>';
                });
                if (rows) html += '<div class="pm-wiz-recap-sec">' + esc(keptTitles[i]) + '</div>' + rows;
            });
            box.innerHTML = html || '<div class="pm-wiz-recap-row"><span class="k">Nessun campo compilato</span></div>';
            $$('.pm-wiz-recap-edit', box).forEach(function (b) {
                b.addEventListener('click', function () { show(parseInt(b.dataset.i, 10)); });
            });
        }
        function show(i) {
            cur = Math.max(0, Math.min(panes.length - 1, i));
            panes.forEach(function (p, j) { p.classList.toggle('pm-cur', j === cur); });
            if (panes[cur] === recap) buildRecap();
            ui.update(cur, panes.length, { lastLabel: '💾 Salva', cancelLabel: 'Annulla' });
            scrollModalTop(modal);
        }
        ui.back.addEventListener('click', function () {
            if (cur === 0) { if (typeof window.closeModal === 'function') window.closeModal(); return; }
            show(cur - 1);
        });
        ui.next.addEventListener('click', function () {
            if (cur === panes.length - 1) {
                if (saveBtn) saveBtn.click();
                else if (form.requestSubmit) form.requestSubmit();
                else if (form.submit) form.submit();
                return;
            }
            if (!requiredOk(panes[cur])) return;
            show(cur + 1);
        });
        $$('.pm-wiz-dot', ui.prog).forEach(function (d) {
            d.addEventListener('click', function () {
                var i = parseInt(d.dataset.i, 10);
                if (i > cur && !requiredOk(panes[cur])) return;
                show(i);
            });
        });
        show(0);
        return true;
    }

    // ═══ FOOTER ≥4 BOTTONI → primaria + ⋯ (viewContract e famiglia) ═════
    function collapseFooter(modal) {
        var footer = modal.querySelector('.modal-footer');
        if (!footer) return;
        var btns = $$('.btn', footer);
        if (btns.length < 4) return;
        footer.classList.add('pm-collapsed');
        var primary = btns.find(function (b) { return !/btn-secondary|btn-danger/.test(b.className); }) || btns[0];
        var close = btns.find(function (b) { return /chiudi|annulla|close/i.test(btnLabel(b)); });
        primary.classList.add('pm-keep');
        if (close && close !== primary) close.classList.add('pm-keep');
        var title = txt((modal.querySelector('.modal-title') || {}).textContent);
        var more = el('button', 'pm-more-btn', '⋯');
        more.type = 'button';
        more.title = 'Tutte le azioni';
        more.addEventListener('click', function () {
            openSheet({
                title: 'Azioni',
                sub: title,
                items: btns.filter(function (b) { return b !== close; }).map(function (b) {
                    return {
                        icon: btnIcon(b),
                        label: btnLabel(b),
                        kind: /btn-danger/.test(b.className) || /elimina|termina|🗑/i.test(btnLabel(b)) ? 'danger'
                            : (b === primary ? 'primary' : ''),
                        onTap: function () { b.click(); }
                    };
                })
            });
        });
        footer.appendChild(more);
    }

    // ═══ INGRESSO UNICO DEI MODALI (observer su #modals) ════════════════
    // ~60 modali scrivono #modals.innerHTML direttamente senza passare da
    // openModal: l'unico punto comune è la mutazione del contenitore.
    function enhanceModal(overlay) {
        if (!st.active || !overlay || overlay.dataset.pmDone) return;
        overlay.dataset.pmDone = '1';
        var modal = overlay.querySelector('.modal') || overlay.firstElementChild;
        if (!modal) return;
        // le superfici Magic Sign hanno già il loro design mobile dedicato
        if (modal.classList.contains('ms-editor') || modal.classList.contains('ms-modal')) return;
        // il wizard Deal Link ha già stepper e footer suoi: solo full-screen
        if (overlay.querySelector('[id^="wz"]')) { overlay.classList.add('pm-full'); return; }
        stampInputModes(modal);
        if ($('#cPage0', modal)) { enhanceContractWizard(overlay, modal); return; }
        var type = (Date.now() - st.lastModalAt < 2000) ? st.lastModalType : null;
        var map = type && WIZ[type] ? WIZ[type] : null;
        var nFields = fieldsOf(modal.querySelector('.modal-body') || modal).length;
        var wizarded = false;
        if (map || nFields >= AUTO_WIZ_MIN_FIELDS) {
            try { wizarded = autoWizard(overlay, modal, map); }
            catch (e) { console.warn('[pm] auto-wizard fallito, si degrada a full-screen', e); }
        }
        if (!wizarded) {
            if (nFields >= FULL_MIN_FIELDS || modal.classList.contains('lg') || modal.classList.contains('xl')) {
                overlay.classList.add('pm-full');
            }
            collapseFooter(modal);
        }
    }
    function onModalsChange() {
        if (!st.active) return;
        var overlay = $('#modals .modal-overlay');
        if (overlay) enhanceModal(overlay);
        else closeSheet(); // il modale è sparito: nessuno sheet orfano sopra il nulla
    }

    // ═══ ATTIVAZIONE ════════════════════════════════════════════════════
    function activate() {
        if (st.active) return;
        st.active = true;
        D.body.classList.add('pm-on');
        buildTabbar();
        applyMain();
        var overlay = $('#modals .modal-overlay');
        if (overlay && !overlay.dataset.pmDone) enhanceModal(overlay);
        syncTabbarVisibility();
    }
    function deactivate() {
        if (!st.active) return;
        st.active = false;
        D.body.classList.remove('pm-on');
        closeSheet();
        if (tabbar) tabbar.hidden = true;
    }
    function onViewportChange() { if (mq.matches) activate(); else deactivate(); }

    function boot() {
        st.section = (location.hash || '').slice(1) || null;
        // wrap di goTo: la tab bar si aggiorna a ogni navigazione, da
        // QUALUNQUE strada (tab, sidebar, ricerca, deep link)
        if (typeof window.goTo === 'function' && !window.goTo.__pm) {
            var g = window.goTo;
            window.goTo = function (p, a) {
                var r = g.apply(this, arguments);
                st.section = p;
                if (st.active) syncTabbar();
                return r;
            };
            window.goTo.__pm = true;
        }
        // wrap di openModal: serve SOLO a conoscere il type (per la mappa
        // WIZ); l'aggancio vero è l'observer su #modals qui sotto
        if (typeof window.openModal === 'function' && !window.openModal.__pm) {
            var om = window.openModal;
            window.openModal = function (t, d) {
                st.lastModalType = t;
                st.lastModalAt = Date.now();
                return om.apply(this, arguments);
            };
            window.openModal.__pm = true;
        }
        window.addEventListener('hashchange', function () {
            st.section = (location.hash || '').slice(1) || st.section;
            if (st.active) syncTabbar();
        });
        var main = $('#main');
        if (main) new MutationObserver(debounce(function () {
            if (!st.active) return;
            applyMain();
            syncTabbar();
        }, 70)).observe(main, { childList: true, subtree: true });
        var modals = $('#modals');
        if (modals) new MutationObserver(onModalsChange).observe(modals, { childList: true });
        var sidebar = $('#sidebar');
        if (sidebar) new MutationObserver(debounce(function () {
            if (!st.active) return;
            if (!st.tabsBuilt) buildTabbar(); else syncTabbar();
        }, 90)).observe(sidebar, { childList: true });
        var app = $('#app');
        if (app) new MutationObserver(syncTabbarVisibility).observe(app, { attributes: true, attributeFilter: ['class'] });
        // tastiera aperta → la tab bar si toglie di mezzo (Android la farebbe
        // galleggiare sopra la tastiera; mentre si scrive non serve a nulla)
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', function () {
                var kb = (window.innerHeight - window.visualViewport.height) > 140;
                D.body.classList.toggle('pm-kb', kb);
            });
        }
        // il campo che prende il focus si porta in vista sopra la tastiera
        D.addEventListener('focusin', function (e) {
            if (!st.active) return;
            var f = e.target;
            if (!f.matches || !f.matches('input,select,textarea')) return;
            if (!f.closest('.pm-full')) return;
            setTimeout(function () {
                try { f.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (err) {}
            }, 260);
        });
        if (mq.addEventListener) mq.addEventListener('change', onViewportChange);
        else if (mq.addListener) mq.addListener(onViewportChange);
        onViewportChange();
    }

    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot);
    else boot();

    // Superficie pubblica: la leggono i test e la console, non il portale.
    window.BOOM_MOBILE = {
        version: 'M2.1',
        BP: BP,
        PREF_TABS: PREF_TABS,
        TAB_LABELS: TAB_LABELS,
        LIST_SECTIONS: LIST_SECTIONS,
        WIZ: WIZ,
        active: function () { return st.active; },
        section: function () { return currentSection(); },
        openSheet: openSheet,
        closeSheet: closeSheet,
        refresh: applyMain,
        _enhanceModal: enhanceModal
    };
})();
