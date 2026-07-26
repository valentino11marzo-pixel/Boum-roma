/* BOOM Platform – Firebase Configuration */

const firebaseConfig = {
    apiKey: "AIzaSyDDb8UeSc8RhO_VxQrhLrupu1aPD4rwRso",
    authDomain: "boom-property-dashboards.firebaseapp.com",
    projectId: "boom-property-dashboards",
    storageBucket: "boom-property-dashboards.firebasestorage.app",
    messagingSenderId: "937269017440",
    appId: "1:937269017440:web:41c1a0b1e1633c2f373c05"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ─── Offline persistence — Safari-safe ────────────────────────────────────
// WebKit's IndexedDB is slow to open at cold start and `synchronizeTabs`
// adds a BroadcastChannel/WebLocks handshake that stalls Safari desktop for
// seconds *on the critical boot path* — long enough that the auth guard's
// first Firestore read appears to hang and the page sits on its loader.
// ITP also wipes the store every 7 days, so the benefit on Safari is close
// to zero. Same treatment portal-app.js already applies:
//   1) never on the critical path (idle callback / next tick)
//   2) never on iOS (3-5s stall)
//   3) no synchronizeTabs on Safari desktop
//   4) escape hatch: ?nopersist=1 or localStorage boom_no_persist=1
(function startPersistence() {
    var ua = (navigator.userAgent || '').toLowerCase();
    var isSafariUA = /^((?!chrome|android|crios|fxios|edgios).)*safari/.test(ua);
    var isIOS = /iphone|ipad|ipod/.test(ua)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var run = function () {
        try {
            if (location.search.indexOf('nopersist=1') >= 0) return;
            if (localStorage.getItem('boom_no_persist') === '1') return;
        } catch (e) { /* storage blocked (private mode) → skip persistence */ return; }
        if (isIOS) return;
        db.enablePersistence(isSafariUA ? {} : { synchronizeTabs: true })
          .catch(function (err) { console.warn('Persistence:', err && err.code); });
    };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 2000 });
    else setTimeout(run, 0);
})();

console.log('🔥 Firebase initialized for BOOM Platform');
