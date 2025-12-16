/* BOOM Platform – Firebase Configuration */

const firebaseConfig = {
    apiKey: "AIzaSyBsqRUEF34FVYvw9NR1gqmm-Lgk3NmFRqY",
    authDomain: "boomrome-b5c4a.firebaseapp.com",
    projectId: "boomrome-b5c4a",
    storageBucket: "boomrome-b5c4a.firebasestorage.app",
    messagingSenderId: "421264669348",
    appId: "1:421264669348:web:a934b1d7e0667451440431",
    measurementId: "G-B6D01F4N98"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    console.log('Persistence error:', err.code);
});

console.log('🔥 Firebase initialized for BOOM Platform');
