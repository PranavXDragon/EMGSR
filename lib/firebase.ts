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

// Lazy singleton — only initializes when first accessed at runtime (not during SSR prerender)
let _app: FirebaseApp | null = null;
let _database: Database | null = null;

function getApp(): FirebaseApp {
  if (!_app) {
    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    };
    _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
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

export { app, database, ref, set, onValue, push, serverTimestamp, get, remove, update, query, orderByChild, limitToLast };
