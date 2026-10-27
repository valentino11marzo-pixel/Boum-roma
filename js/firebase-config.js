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

// Firestore uses its default memory cache, as in portal-app.js. Opening the
// persistent IndexedDB cache can stall every read before auth finishes, even
// from an idle callback. Auth keeps its own persistence; do not delete old
// Firestore databases or pending writes as part of normal page startup.

console.log('🔥 Firebase initialized for BOOM Platform');
