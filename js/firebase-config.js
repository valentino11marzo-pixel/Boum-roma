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

db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    console.log('Persistence error:', err.code);
});

console.log('🔥 Firebase initialized for BOOM Platform');
