/**
 * Firebase Configuration
 *
 * Used for:
 * - Push notifications (FCM)
 * - Agent presence tracking (Realtime Database)
 */

import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyCobBPOk8vaFdFnlzzEzwp4VilFnxMfSKU",
  authDomain: "irisx-production.firebaseapp.com",
  databaseURL: "https://irisx-production-default-rtdb.firebaseio.com",
  projectId: "irisx-production",
  storageBucket: "irisx-production.firebasestorage.app",
  messagingSenderId: "395449318976",
  appId: "1:395449318976:web:7f275d92dbacb1bae229a5",
  measurementId: "G-TJ2GF6JZGW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Realtime Database
const database = getDatabase(app);

// Initialize Firebase Cloud Messaging
let messaging = null;
try {
  messaging = getMessaging(app);
} catch (error) {
  console.warn('[Firebase] Messaging not available:', error.message);
}

export { app, database, messaging, getToken, onMessage };
