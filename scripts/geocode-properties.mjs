#!/usr/bin/env node
/*
 * geocode-properties.js — populate properties.coordinates via Nominatim (OSM)
 *
 * Usage (manual, one-shot):
 *   node scripts/geocode-properties.js
 *
 * What it does:
 *   - Reads `properties` collection from Firestore (anonymous client SDK,
 *     properties has `allow read: if true` per existing rules).
 *   - For every property with `address` but no `coordinates`, queries Nominatim
 *     (OSM, free, no API key) at 1 req/s and writes `coordinates: { lat, lng }`.
 *   - The 3 BOOM-known addresses are hardcoded (verified) so they bypass
 *     Nominatim entirely.
 *
 * Safety:
 *   - Idempotent: skips properties that already have coordinates.
 *   - Throttled to 1 req/s (Nominatim usage policy).
 *   - Identifies itself with a User-Agent (Nominatim requires this).
 *   - Logs every action; dry-run mode available via DRY_RUN=1.
 *
 * NOT auto-executed in this Phase 1 commit. Run it manually when you want
 * the geocodes populated.
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';

const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyDDb8UeSc8RhO_VxQrhLrupu1aPD4rwRso',
    authDomain: 'boom-property-dashboards.firebaseapp.com',
    projectId: 'boom-property-dashboards',
    storageBucket: 'boom-property-dashboards.firebasestorage.app',
    messagingSenderId: '937269017440',
    appId: '1:937269017440:web:41c1a0b1e1633c2f373c05',
};

// Verified via live Nominatim lookup 2026-04-29. Bypass online lookup at runtime.
// (Brief specs were close-but-not-exact; these are the actual Nominatim returns.)
const BOOM_KNOWN_COORDS = {
    'Via Levico 17/a, Roma':         { lat: 41.9167372, lng: 12.5043791 },
    'Via Levico 17a, Roma':          { lat: 41.9167372, lng: 12.5043791 },
    'Via di Tor di Quinto 39, Roma': { lat: 41.9581486, lng: 12.4543958 },
    'Via Calabria 29, Roma':         { lat: 41.9097570, lng: 12.4974320 },
};

const DRY_RUN = process.env.DRY_RUN === '1';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'BOOM-Rome-Geocoder/1.0 (valentino@boom-rome.com)';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function normalizeAddress(addr) {
    return (addr || '').trim().replace(/\s+/g, ' ');
}

async function geocodeViaNominatim(address) {
    const params = new URLSearchParams({
        q: address,
        format: 'json',
        limit: '1',
        addressdetails: '0',
    });
    const url = `${NOMINATIM_BASE}?${params.toString()}`;
    const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'it' },
    });
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const top = arr[0];
    return {
        lat: parseFloat(top.lat),
        lng: parseFloat(top.lon),
    };
}

async function main() {
    console.log('BOOM property geocoder');
    console.log(`  mode: ${DRY_RUN ? 'DRY RUN (no Firestore writes)' : 'LIVE (will write coordinates)'}`);
    console.log();

    const app = initializeApp(FIREBASE_CONFIG);
    const db = getFirestore(app);
    const snap = await getDocs(collection(db, 'properties'));
    console.log(`  Loaded ${snap.size} properties`);

    let skipped = 0;
    let known = 0;
    let geocoded = 0;
    let failed = 0;
    let i = 0;

    for (const propDoc of snap.docs) {
        i += 1;
        const data = propDoc.data();
        const id = propDoc.id;
        const addr = normalizeAddress(data.address);

        if (data.coordinates && typeof data.coordinates.lat === 'number') {
            console.log(`  [${i}/${snap.size}] ${id} → already has coordinates, skip`);
            skipped += 1;
            continue;
        }
        if (!addr) {
            console.log(`  [${i}/${snap.size}] ${id} → no address, skip`);
            skipped += 1;
            continue;
        }

        // Known-address fast path
        if (BOOM_KNOWN_COORDS[addr]) {
            const c = BOOM_KNOWN_COORDS[addr];
            console.log(`  [${i}/${snap.size}] ${id} ✓ known: ${addr} → ${c.lat}, ${c.lng}`);
            if (!DRY_RUN) {
                await updateDoc(doc(db, 'properties', id), { coordinates: c });
            }
            known += 1;
            continue;
        }

        // Online geocode (rate-limited 1 req/s per Nominatim policy)
        try {
            await sleep(1100);
            const c = await geocodeViaNominatim(addr);
            if (!c) {
                console.log(`  [${i}/${snap.size}] ${id} ✗ no result for "${addr}"`);
                failed += 1;
                continue;
            }
            console.log(`  [${i}/${snap.size}] ${id} ⊕ geocoded: ${addr} → ${c.lat}, ${c.lng}`);
            if (!DRY_RUN) {
                await updateDoc(doc(db, 'properties', id), { coordinates: c });
            }
            geocoded += 1;
        } catch (err) {
            console.error(`  [${i}/${snap.size}] ${id} ✗ error: ${err.message}`);
            failed += 1;
        }
    }

    console.log();
    console.log(`Summary:`);
    console.log(`  total:    ${snap.size}`);
    console.log(`  skipped:  ${skipped}`);
    console.log(`  known:    ${known}`);
    console.log(`  geocoded: ${geocoded}`);
    console.log(`  failed:   ${failed}`);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('FATAL:', err);
        process.exit(1);
    });
