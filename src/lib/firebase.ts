// src/lib/firebase.ts

'use client';

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
} from 'firebase/firestore';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getMessaging, isSupported, type Messaging } from 'firebase/messaging'; // ✅

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error('Auth persistence setting failed:', error);
});

const db = initializeFirestore(app, {
  localCache: persistentLocalCache(),
});

const storage = getStorage(app);

// ✅ messaging を Promise<Messaging | null> として安全に扱う
const messagingPromise: Promise<Messaging | null> =
  typeof window !== 'undefined'
    ? isSupported().then((supported) => (supported ? getMessaging(app) : null))
    : Promise.resolve(null);

export { auth, db, storage, app, messagingPromise as messaging };
