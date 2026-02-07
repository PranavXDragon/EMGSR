import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, set, onValue, push, serverTimestamp, get, remove, update, query, orderByChild, limitToLast } from 'firebase/database';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const database = getDatabase(app);

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
*/

export { app, database, ref, set, onValue, push, serverTimestamp, get, remove, update, query, orderByChild, limitToLast };
