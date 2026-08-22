/* BOOM Portal Core — shared utilities for owner-dashboard, tenant, client-portal.
 * No build step. Load via <script src="/js/boom-portal.js" defer></script>.
 * Exposes window.BoomPortal.
 *
 * Provides:
 *   - registerServiceWorker()        offline + PWA install
 *   - requireAuth(role, opts)        Firebase auth + role guard, returns {user, profile}
 *   - listen(queryRef, onData, …)    Firestore listener with auto-retry + backoff
 *   - toast(msg, {type, duration})   non-blocking notifications (success/error/info/warning)
 *   - showLoader(msg) / hideLoader() full-screen blocking loader
 *   - skeleton(w, h)                 inline shimmer placeholder
 *   - confirm(msg, {danger,…})       promise-based confirm dialog (replaces native confirm())
 *   - showError(msg)                 toast + console.error
 *   - escapeHtml(str)                XSS-safe interpolation in innerHTML
 */
(function (global) {
    'use strict';

    var BP = {};

    // ─── Service Worker registration ──────────────────────────────────────
    BP.registerServiceWorker = function () {
        if (!('serviceWorker' in navigator)) return;
        // Skip on file:// or http://0.0.0.0 dev to avoid noisy errors
        var isProd = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (!isProd) return;
        var run = function () {
            navigator.serviceWorker.register('/sw.js').then(function (reg) {
                // Safari non ricontrolla sw.js con la stessa aggressività di
                // Chrome: senza questo, un service worker di un deploy vecchio
                // può continuare a servire una shell stantia per giorni.
                try { reg.update(); } catch (e) {}
            }).catch(function (err) {
                console.warn('[BoomPortal] SW registration failed:', err && err.message);
            });
        };
        if (document.readyState === 'complete') run();
        else window.addEventListener('load', run);
    };

    // ─── Toast notifications ──────────────────────────────────────────────
    var toastContainer = null;
    function getToastContainer() {
        if (toastContainer && document.body.contains(toastContainer)) return toastContainer;
        toastContainer = document.createElement('div');
        toastContainer.id = 'bp-toast-container';
        toastContainer.setAttribute('role', 'status');
        toastContainer.setAttribute('aria-live', 'polite');
        toastContainer.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;display:flex;flex-direction:column;gap:10px;pointer-events:none;max-width:calc(100vw - 48px);';
        document.body.appendChild(toastContainer);
        return toastContainer;
    }

    var TOAST_STYLES = {
        success: { border: '#00FF88', icon: '✓' },
        error:   { border: '#FF3B3B', icon: '✕' },
        info:    { border: '#FFD700', icon: 'ⓘ' },
        warning: { border: '#FF6B35', icon: '⚠' }
    };

    BP.toast = function (message, opts) {
        opts = opts || {};
        var type = opts.type || 'success';
        var duration = opts.duration || 3500;
        var style = TOAST_STYLES[type] || TOAST_STYLES.info;
        var container = getToastContainer();
        var el = document.createElement('div');
        el.className = 'bp-toast bp-toast-' + type;
        el.style.cssText = [
            'pointer-events:auto',
            'min-width:260px',
            'max-width:380px',
            'padding:14px 18px',
            'background:#0A0A0A',
            'color:#FAFAFA',
            'border:1px solid rgba(255,255,255,0.08)',
            'border-left:3px solid ' + style.border,
            'display:flex',
            'align-items:center',
            'gap:12px',
            "font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif",
            'font-size:13px',
            'font-weight:400',
            'line-height:1.5',
            'box-shadow:0 8px 28px rgba(0,0,0,0.55)',
            'animation:bp-slide-in 0.25s ease'
        ].join(';');
        el.innerHTML = '<span style="font-size:16px;color:' + style.border + ';flex-shrink:0">' + style.icon + '</span><span style="flex:1">' + escapeHtml(message) + '</span>';
        container.appendChild(el);
        setTimeout(function () {
            el.style.animation = 'bp-slide-out 0.25s ease forwards';
            setTimeout(function () { if (el.parentNode) el.remove(); }, 260);
        }, duration);
        return el;
    };

    // ─── Loader ───────────────────────────────────────────────────────────
    BP.showLoader = function (message) {
        var loader = document.getElementById('bp-loader');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'bp-loader';
            loader.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);z-index:99998;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;font-family:Inter,sans-serif;';
            loader.innerHTML = [
                '<div class="bp-spinner" style="width:48px;height:48px;border:3px solid rgba(255,215,0,0.15);border-top-color:#FFD700;border-radius:50%;animation:bp-spin 0.8s linear infinite"></div>',
                '<div id="bp-loader-msg" style="color:#888;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:500"></div>'
            ].join('');
            document.body.appendChild(loader);
        }
        document.getElementById('bp-loader-msg').textContent = message || 'Loading';
        loader.style.display = 'flex';
    };

    BP.hideLoader = function () {
        var loader = document.getElementById('bp-loader');
        if (loader) loader.style.display = 'none';
    };

    // ─── Skeleton placeholder ─────────────────────────────────────────────
    BP.skeleton = function (width, height) {
        return '<span class="bp-skeleton" style="display:inline-block;width:' + (width || '100%') + ';height:' + (height || '16px') + ';background:linear-gradient(90deg,rgba(255,255,255,0.04),rgba(255,255,255,0.12),rgba(255,255,255,0.04));background-size:200% 100%;animation:bp-shimmer 1.4s linear infinite;border-radius:4px;vertical-align:middle"></span>';
    };

    // ─── Error helper ─────────────────────────────────────────────────────
    BP.showError = function (message, opts) {
        opts = opts || {};
        BP.toast(message, { type: 'error', duration: opts.duration || 5000 });
        if (opts.console !== false) console.error('[BoomPortal]', message);
    };

    // ─── Confirm dialog (promise-based, replaces native confirm) ──────────
    BP.confirm = function (message, opts) {
        opts = opts || {};
        return new Promise(function (resolve) {
            var overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;font-family:Inter,sans-serif;animation:bp-fade-in 0.2s ease;';
            var dialog = document.createElement('div');
            dialog.style.cssText = 'background:#0A0A0A;border:1px solid rgba(255,215,0,0.2);max-width:440px;width:100%;padding:32px;animation:bp-slide-in 0.25s ease;';
            var btnConfirmBg = opts.danger ? '#FF3B3B' : '#FFD700';
            var btnConfirmColor = opts.danger ? '#fff' : '#000';
            dialog.innerHTML = [
                '<div style="font-size:18px;font-weight:400;color:#fff;margin-bottom:12px;letter-spacing:0.5px">' + escapeHtml(opts.title || 'Confirm') + '</div>',
                '<div style="font-size:14px;color:#999;line-height:1.6;margin-bottom:28px;white-space:pre-wrap">' + escapeHtml(message) + '</div>',
                '<div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">',
                '<button data-bp-action="cancel" style="padding:11px 22px;background:transparent;border:1px solid rgba(255,255,255,0.15);color:#999;font-family:inherit;font-size:11px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;transition:all 0.2s">' + escapeHtml(opts.cancelLabel || 'Cancel') + '</button>',
                '<button data-bp-action="confirm" style="padding:11px 22px;background:' + btnConfirmBg + ';border:none;color:' + btnConfirmColor + ';font-family:inherit;font-size:11px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;font-weight:700;transition:all 0.2s">' + escapeHtml(opts.confirmLabel || 'Confirm') + '</button>',
                '</div>'
            ].join('');
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            function cleanup(result) {
                document.removeEventListener('keydown', onKey);
                if (overlay.parentNode) overlay.remove();
                resolve(result);
            }
            function onKey(e) {
                if (e.key === 'Escape') cleanup(false);
                if (e.key === 'Enter') cleanup(true);
            }
            dialog.querySelector('[data-bp-action="cancel"]').onclick = function () { cleanup(false); };
            dialog.querySelector('[data-bp-action="confirm"]').onclick = function () { cleanup(true); };
            overlay.onclick = function (e) { if (e.target === overlay) cleanup(false); };
            document.addEventListener('keydown', onKey);
            dialog.querySelector('[data-bp-action="confirm"]').focus();
        });
    };

    // ─── Promise watchdog ─────────────────────────────────────────────────
    // Firestore reads can hang indefinitely (WebKit IndexedDB lock, blocked
    // WebChannel). A promise that never settles = a loader that never leaves.
    BP.withTimeout = function (promise, ms, label) {
        return new Promise(function (resolve, reject) {
            var done = false;
            var timer = setTimeout(function () {
                if (done) return;
                done = true;
                var e = new Error((label || 'operation') + '_timeout');
                e.code = 'boom/timeout';
                reject(e);
            }, ms || 8000);
            Promise.resolve(promise).then(
                function (v) { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
                function (e) { if (!done) { done = true; clearTimeout(timer); reject(e); } }
            );
        });
    };

    // ─── Stuck-boot recovery ──────────────────────────────────────────────
    // Last line of defence: instead of an eternal spinner, offer the two
    // moves that actually fix a wedged browser (hard reload without the
    // local cache/persistence, or sign out and start clean).
    BP.showRecovery = function (title, detail) {
        if (document.getElementById('bp-recovery')) return;
        var wrap = document.createElement('div');
        wrap.id = 'bp-recovery';
        wrap.setAttribute('role', 'alertdialog');
        wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;display:grid;place-items:center;'
            + 'background:rgba(4,4,6,.94);padding:22px;'
            + 'font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Inter,sans-serif';
        wrap.innerHTML =
            '<div style="max-width:420px;width:100%;text-align:center;color:#fff">'
            + '<div style="font-size:11px;letter-spacing:4px;color:#D4AF37;margin-bottom:18px">BOOM</div>'
            + '<div style="font-size:19px;font-weight:500;margin-bottom:10px">' + BP.escapeHtml(title || 'Connessione bloccata') + '</div>'
            + '<div style="font-size:13.5px;line-height:1.6;color:#9a9a9a;margin-bottom:24px">'
            + BP.escapeHtml(detail || 'Il browser non è riuscito a completare il controllo di accesso.') + '</div>'
            + '<button id="bp-rec-reload" style="width:100%;padding:14px;border:0;border-radius:12px;'
            + 'background:#D4AF37;color:#0a0a0a;font-size:14px;font-weight:600;cursor:pointer">Riprova pulendo la cache</button>'
            + '<button id="bp-rec-out" style="width:100%;margin-top:10px;padding:14px;border:1px solid rgba(255,255,255,.14);'
            + 'border-radius:12px;background:transparent;color:#ddd;font-size:13.5px;cursor:pointer">Esci e rientra</button>'
            + '</div>';
        document.body.appendChild(wrap);
        document.getElementById('bp-rec-reload').onclick = function () {
            BP.hardReset(false);
        };
        document.getElementById('bp-rec-out').onclick = function () {
            BP.hardReset(true);
        };
    };

    // Wipe every local layer that can wedge a session (SW caches, service
    // workers, Firestore IndexedDB), optionally sign out, then reload.
    BP.hardReset = function (signOut) {
        var jobs = [];
        try { localStorage.setItem('boom_no_persist', '1'); } catch (e) {}
        if (signOut && typeof firebase !== 'undefined' && firebase.auth) {
            try { jobs.push(firebase.auth().signOut().catch(function () {})); } catch (e) {}
        }
        if (window.caches && caches.keys) {
            jobs.push(caches.keys().then(function (ks) {
                return Promise.all(ks.map(function (k) { return caches.delete(k); }));
            }).catch(function () {}));
        }
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
            jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
                return Promise.all(rs.map(function (r) { return r.unregister(); }));
            }).catch(function () {}));
        }
        try {
            if (window.indexedDB && indexedDB.deleteDatabase) {
                ['firestore/[DEFAULT]/boom-property-dashboards/main', 'firebaseLocalStorageDb']
                    .forEach(function (n) { if (!signOut && n === 'firebaseLocalStorageDb') return; try { indexedDB.deleteDatabase(n); } catch (e) {} });
            }
        } catch (e) {}
        var go = function () {
            if (signOut) return window.location.replace('/login');
            // Conserva i parametri esistenti (un token nell'URL non va perso)
            // e aggiunge ?fresh= per bucare la cache HTTP del browser.
            var qs = location.search.replace(/[?&]fresh=\d+/g, '').replace(/^&/, '?');
            qs = qs && qs !== '?' ? qs + '&fresh=' + Date.now() : '?fresh=' + Date.now();
            window.location.replace(location.pathname + qs + location.hash);
        };
        BP.withTimeout(Promise.all(jobs), 3500).then(go, go);
    };

    // ─── Auth guard ───────────────────────────────────────────────────────
    // Returns a Promise that resolves with {user, profile} when authenticated
    // and the user's role is allowed. `allowedRoles` accepts a string OR array
    // OR null (no role check). Otherwise redirects to loginUrl.
    BP.requireAuth = function (allowedRoles, opts) {
        opts = opts || {};
        // Normalizza: alcune pagine passano '/login.html?next=…' — con
        // cleanUrls '/login.html' è un redirect 308 in più e il ?next=
        // preconfezionato si sommava al nostro (due parametri identici) e,
        // peggio, il ritorno su wrong_role puntava di nuovo alla pagina
        // negata → loop di redirect. La destinazione la calcoliamo qui.
        var loginUrl = String(opts.loginUrl || '/login').split('?')[0].replace(/\.html$/, '');
        // Round-trip: dopo il login si torna alla pagina richiesta (path+hash).
        // Usato solo per not_authenticated; su wrong_role/profile_missing si va
        // al login "pulito" (che porta a /portal, il quale si adatta al ruolo)
        // per non creare loop di redirect sulla pagina negata.
        // `b=1` = "rimbalzato da una pagina protetta": permette al login di
        // accorgersi di un ciclo login↔pagina (tipico quando Safari blocca
        // lo storage e la sessione non sopravvive al redirect).
        var loginWithNext = loginUrl + '?b=1&next='
            + encodeURIComponent(location.pathname + location.search + location.hash);
        var rolesArray = allowedRoles == null
            ? null
            : (Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]);
        return new Promise(function (resolve, reject) {
            if (typeof firebase === 'undefined' || !firebase.auth) {
                BP.showError('Firebase SDK not loaded');
                reject(new Error('Firebase not loaded'));
                return;
            }
            var auth = firebase.auth();
            var db = firebase.firestore();
            // Periodo di grazia sul primo `null`. Safari può emettere un null
            // spurio da onAuthStateChanged prima di aver risolto la sessione
            // persistita (IndexedDB lento): senza attesa la pagina rimbalza al
            // login pur essendo l'utente loggato — ed è esattamente il "non
            // accede bene" di Safari desktop. portal.html aveva già questa
            // difesa; il guard condiviso no. Il redirect parte dopo la grazia
            // e viene annullato se l'utente arriva nel frattempo.
            var isSafariUA = /^((?!chrome|android|crios|fxios|edgios).)*safari/i
                .test(navigator.userAgent || '');
            var grace = opts.graceMs != null ? opts.graceMs : (isSafariUA ? 3000 : 1000);
            var settled = false, bounceTimer = null, unsub = null;
            var stop = function () { if (unsub) { try { unsub(); } catch (e) {} unsub = null; } };

            unsub = auth.onAuthStateChanged(async function (user) {
                if (settled) return;
                if (!user) {
                    if (bounceTimer) return;                 // grazia già in corso
                    bounceTimer = setTimeout(function () {
                        if (settled) return;
                        settled = true; stop();
                        if (opts.silentRedirect !== false) window.location.href = loginWithNext;
                        reject(new Error('not_authenticated'));
                    }, grace);
                    return;
                }
                if (bounceTimer) { clearTimeout(bounceTimer); bounceTimer = null; }
                settled = true; stop();
                try {
                    // Lettura profilo con watchdog: se IndexedDB/WebChannel si
                    // impianta (capita su Safari desktop) la get() non rifiuta
                    // MAI e la pagina resterebbe sul loader per sempre. Dopo 7s
                    // riproviamo forzando il server; se anche quella si blocca,
                    // errore visibile e azionabile invece del limbo.
                    var doc = await BP.withTimeout(
                        db.collection('users').doc(user.uid).get(), 7000
                    ).catch(function () {
                        return BP.withTimeout(
                            db.collection('users').doc(user.uid).get({ source: 'server' }), 8000
                        );
                    });
                    if (!doc.exists) {
                        BP.showError('User profile not found.');
                        setTimeout(function () { window.location.href = loginUrl; }, 1500);
                        reject(new Error('profile_missing'));
                        return;
                    }
                    var profile = Object.assign({ id: user.uid }, doc.data());
                    if (rolesArray && rolesArray.indexOf(profile.role) === -1) {
                        BP.showError('Access denied. Required: ' + rolesArray.join('/') + ' · Your role: ' + (profile.role || 'unknown'));
                        setTimeout(function () { window.location.href = loginUrl; }, 2500);
                        reject(new Error('wrong_role'));
                        return;
                    }
                    resolve({ user: user, profile: profile });
                } catch (err) {
                    if (err && (err.code === 'boom/timeout' || err.code === 'unavailable')) {
                        BP.showRecovery(
                            'Connessione bloccata',
                            'Il browser non riesce a leggere i dati (cache locale o rete). '
                            + 'Un riavvio pulito di solito risolve — i tuoi dati non vengono toccati.'
                        );
                    } else {
                        BP.showError('Auth check failed: ' + (err.message || err));
                    }
                    reject(err);
                }
            });
        });
    };

    // ─── Firestore listener with auto-retry + exponential backoff ─────────
    // Returns an unsubscribe function. Use this instead of raw onSnapshot
    // when you need resilience to transient errors (offline, etc).
    BP.listen = function (queryRef, onData, onError, opts) {
        var unsub = null;
        var retries = 0;
        var cancelled = false;
        var gotFirst = false;

        // Il canale MUTO: su WebKit incastrato onSnapshot può non chiamare
        // NÉ onData NÉ l'errore — la pagina resta vuota per sempre, zero
        // segnali. La lezione watchPAs (console proposte), qui portata nella
        // copia condivisa così guarisce TUTTE le console in un colpo: dopo
        // 6s senza il primo snapshot si consegna una lettura one-shot; il
        // canale resta armato e quando finalmente apre prende il comando.
        var fallbackMs = (opts && opts.fallbackMs) || 6000;
        var fb = setTimeout(function () {
            if (cancelled || gotFirst || !queryRef || typeof queryRef.get !== 'function') return;
            queryRef.get().then(function (snap) {
                if (cancelled || gotFirst) return;
                try { onData(snap); }
                catch (e) { console.error('[BoomPortal] onData (fallback) threw:', e); }
            }).catch(function () { /* il canale ha ancora la sua occasione */ });
        }, fallbackMs);

        function subscribe() {
            try {
                unsub = queryRef.onSnapshot(
                    function (snap) {
                        gotFirst = true;
                        clearTimeout(fb);
                        retries = 0;
                        try { onData(snap); }
                        catch (e) { console.error('[BoomPortal] onData handler threw:', e); }
                    },
                    function (err) {
                        console.warn('[BoomPortal] listener error:', err && err.message);
                        if (onError) {
                            try { onError(err); } catch (e) { console.error(e); }
                        }
                        if (cancelled || retries >= 4) return;
                        retries++;
                        var backoff = Math.min(15000, 1000 * Math.pow(2, retries));
                        setTimeout(function () { if (!cancelled) subscribe(); }, backoff);
                    }
                );
            } catch (e) {
                if (onError) onError(e);
            }
        }
        subscribe();
        return function () {
            cancelled = true;
            clearTimeout(fb);
            if (unsub) unsub();
        };
    };

    // ─── La resurrezione delle schede vecchie ─────────────────────────────
    // Una scheda ripresa dopo un'ora è un'altra epoca: stato vecchio, canali
    // realtime morti, token scaduti, versione superata — la trappola vista il
    // 22/08 (modale outreach aperto su un annuncio ormai sparito, in una
    // scheda Safari di giorni prima, coi bottoni di una versione senza
    // uscite). Meglio una pagina fresca che una salma interattiva. Le pagine
    // con FORM lunghi (manuale, media-studio, console proposte, verbale) NON
    // la usano: un reload che butta il lavoro dell'operatore è peggio.
    BP.freshOnReturn = function (maxAwayMin) {
        var limit = (maxAwayMin || 60) * 60000;
        var hiddenAt = null;
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
            if (hiddenAt && Date.now() - hiddenAt > limit) location.reload();
        });
        // bfcache: Safari riesuma la pagina con lo stato JS congelato —
        // hiddenAt sopravvive, e se l'assenza supera il limite si riparte.
        window.addEventListener('pageshow', function (e) {
            if (e.persisted && hiddenAt && Date.now() - hiddenAt > limit) location.reload();
        });
    };

    // ─── 🐞 Segnala — il canale dei bug (STUDIO_ARSENALE_II) ──────────────
    // Un tap dell'operatore → doc `bugReports` con pagina, dispositivo e gli
    // ultimi errori client (l'anello di boom-err.js) allegati DA SOLI: la
    // segnalazione arriva già col contesto tecnico, mai più un "ha problemi"
    // senza indirizzo. La collection è admin-only nelle rules.
    BP.reportBug = function (opts) {
        opts = opts || {};
        if (document.getElementById('bp-bug-ov')) return;
        var errs = [];
        try { errs = (window.__boomErrs || []).slice(-5); } catch (e) { }
        var ov = document.createElement('div');
        ov.id = 'bp-bug-ov';
        ov.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.72);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:grid;place-items:center;padding:18px';
        ov.innerHTML =
            '<div style="background:#121214;border:1px solid rgba(255,255,255,.12);border-radius:12px;max-width:440px;width:100%;padding:20px" role="dialog" aria-label="Segnala un problema">' +
            '<div style="font-size:15px;font-weight:500;color:#F2F0EA;margin-bottom:4px">🐞 Segnala un problema</div>' +
            '<div style="font-size:12px;color:#9A968C;margin-bottom:12px;line-height:1.5">Cosa stavi facendo e cosa non ha funzionato? Pagina, dispositivo' + (errs.length ? ' e ' + errs.length + ' error' + (errs.length === 1 ? 'e' : 'i') + ' tecnici recenti' : '') + ' si allegano da soli.</div>' +
            '<textarea id="bp-bug-txt" rows="4" style="width:100%;box-sizing:border-box;background:#1A1A1C;border:1px solid rgba(255,255,255,.14);border-radius:8px;color:#F2F0EA;font:inherit;font-size:14px;padding:10px;resize:vertical" placeholder="Es.: tocco Conferma sulla visita di Sara e non succede niente"></textarea>' +
            '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">' +
            '<button id="bp-bug-x" type="button" style="background:none;border:1px solid rgba(255,255,255,.18);border-radius:8px;color:#9A968C;padding:8px 14px;font:inherit;cursor:pointer">Annulla</button>' +
            '<button id="bp-bug-go" type="button" style="background:#D4AF37;border:none;border-radius:8px;color:#0A0A0C;padding:8px 16px;font:inherit;font-weight:500;cursor:pointer">Invia</button>' +
            '</div></div>';
        document.body.appendChild(ov);
        var close = function () { ov.remove(); };
        document.getElementById('bp-bug-x').onclick = close;
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
        document.getElementById('bp-bug-go').onclick = function () {
            var msg = (document.getElementById('bp-bug-txt').value || '').trim();
            if (!msg) { document.getElementById('bp-bug-txt').focus(); return; }
            var user = (window.firebase && firebase.auth && firebase.auth().currentUser) || {};
            firebase.firestore().collection('bugReports').add({
                message: msg.slice(0, 1200),
                page: opts.page || (location.pathname + location.hash),
                ua: navigator.userAgent.slice(0, 200),
                screen: (window.innerWidth || 0) + 'x' + (window.innerHeight || 0),
                errs: errs,
                by: user.email || user.uid || null,
                status: 'open',
                createdAt: new Date().toISOString()
            }).then(function () {
                close();
                BP.toast('Segnalazione inviata 🐞 — grazie, arriva col contesto completo', { type: 'success' });
            }).catch(function (err) {
                BP.toast('Invio non riuscito: ' + ((err && err.message) || err), { type: 'error' });
            });
        };
        document.getElementById('bp-bug-txt').focus();
    };

    // ─── Helpers ──────────────────────────────────────────────────────────
    function escapeHtml(str) {
        if (str == null) return '';
        return String(str).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    BP.escapeHtml = escapeHtml;

    // ─── Inject keyframes / utility CSS once ──────────────────────────────
    if (!document.getElementById('bp-anim-style')) {
        var style = document.createElement('style');
        style.id = 'bp-anim-style';
        style.textContent = [
            '@keyframes bp-spin{to{transform:rotate(360deg)}}',
            '@keyframes bp-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}',
            '@keyframes bp-slide-in{from{transform:translateY(8px);opacity:0}to{transform:translateY(0);opacity:1}}',
            '@keyframes bp-slide-out{from{transform:translateY(0);opacity:1}to{transform:translateY(8px);opacity:0}}',
            '@keyframes bp-fade-in{from{opacity:0}to{opacity:1}}',
            '.bp-skeleton{color:transparent !important}',
            '@media (prefers-reduced-motion: reduce){.bp-spinner{animation-duration:1.6s}.bp-skeleton{animation:none}}'
        ].join('\n');
        document.head.appendChild(style);
    }

    global.BoomPortal = BP;
})(window);
