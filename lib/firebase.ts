import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, push, serverTimestamp, get, remove, update, query, orderByChild, limitToLast, type Database } from 'firebase/database';

/*
  Firebase paths:
  /signal/emergency          — boolean
  /ambulances/{id}           — { name, lat, lng, status, destination, lastUpdate, zone }
  /trafficSignals/{id}       — { name, lat, lng, state, zone }
  /hospitals/{id}            — { name, lat, lng, beds, er, phone, zone }
  /zones/{id}                — { name, color, active, signalCount }
  /incidents/{id}            — { title, description, zone, severity, status, createdAt, closedAt, ambulanceId, hospitalId }
  /iot/{id}                  — { name, type, status, lat, lng, zone, lastPing, firmware }
  /stats                     — { totalActivations, avgResponseTime }
  /logs/{pushId}             — { time, message, type }
  /comms/{unitId}            — { from, text, ts }
*/

// Firebase client config (public — security enforced by Firebase Rules, not by hiding these)
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyCl73noQmRdBtkQFwwjQebsRB6HCClu50Y';
const FIREBASE_DB_URL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || 'https://ambulance-d3adc-default-rtdb.asia-southeast1.firebasedatabase.app';
const isConfigured = !!(FIREBASE_API_KEY && FIREBASE_DB_URL);

// Lazy singleton — only initializes when first accessed at runtime
let _app: FirebaseApp | null = null;
let _database: Database | null = null;

function getApp(): FirebaseApp {
  if (!_app) {
    if (!isConfigured) {
      throw new Error('Firebase is not configured. Set NEXT_PUBLIC_FIREBASE_API_KEY and NEXT_PUBLIC_FIREBASE_DATABASE_URL environment variables.');
    }
    _app = getApps().length === 0
      ? initializeApp({ apiKey: FIREBASE_API_KEY, databaseURL: FIREBASE_DB_URL })
      : getApps()[0];
  }
  return _app;
}

function getDb(): Database {
  if (!_database) {
    _database = getDatabase(getApp());
  }
  return _database;
}

// Proxy object so existing `database` imports keep working without changes
const database: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

const app: FirebaseApp = new Proxy({} as FirebaseApp, {
  get(_target, prop, receiver) {
    return Reflect.get(getApp(), prop, receiver);
  },
});

export { app, database, ref, set, onValue, push, serverTimestamp, get, remove, update, query, orderByChild, limitToLast, isConfigured };
