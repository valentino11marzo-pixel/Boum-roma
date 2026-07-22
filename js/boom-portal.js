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
            navigator.serviceWorker.register('/sw.js').catch(function (err) {
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

    // ─── Auth guard ───────────────────────────────────────────────────────
    // Returns a Promise that resolves with {user, profile} when authenticated
    // and the user's role is allowed. `allowedRoles` accepts a string OR array
    // OR null (no role check). Otherwise redirects to loginUrl.
    BP.requireAuth = function (allowedRoles, opts) {
        opts = opts || {};
        var loginUrl = opts.loginUrl || '/login';
        // Round-trip: dopo il login si torna alla pagina richiesta (path+hash).
        // Usato solo per not_authenticated; su wrong_role/profile_missing si va
        // al login "pulito" (che porta a /portal, il quale si adatta al ruolo)
        // per non creare loop di redirect sulla pagina negata.
        var loginWithNext = loginUrl + (loginUrl.indexOf('?') >= 0 ? '&' : '?')
            + 'next=' + encodeURIComponent(location.pathname + location.search + location.hash);
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
            var unsub = auth.onAuthStateChanged(async function (user) {
                unsub();
                if (!user) {
                    if (opts.silentRedirect !== false) window.location.href = loginWithNext;
                    reject(new Error('not_authenticated'));
                    return;
                }
                try {
                    var doc = await db.collection('users').doc(user.uid).get();
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
                    BP.showError('Auth check failed: ' + (err.message || err));
                    reject(err);
                }
            });
        });
    };

    // ─── Firestore listener with auto-retry + exponential backoff ─────────
    // Returns an unsubscribe function. Use this instead of raw onSnapshot
    // when you need resilience to transient errors (offline, etc).
    BP.listen = function (queryRef, onData, onError) {
        var unsub = null;
        var retries = 0;
        var cancelled = false;

        function subscribe() {
            try {
                unsub = queryRef.onSnapshot(
                    function (snap) {
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
            if (unsub) unsub();
        };
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
