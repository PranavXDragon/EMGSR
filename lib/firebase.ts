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
const firebaseConfig = {
  apiKey: 'AIzaSyCl73noQmRdBtkQFwwjQebsRB6HCClu50Y',
  databaseURL: 'https://ambulance-d3adc-default-rtdb.asia-southeast1.firebasedatabase.app',
};

const isConfigured = true;

// Initialize Firebase — singleton via getApps() check
const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const database: Database = getDatabase(app);

export { app, database, ref, set, onValue, push, serverTimestamp, get, remove, update, query, orderByChild, limitToLast, isConfigured };
