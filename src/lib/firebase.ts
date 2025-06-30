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
import { getMessaging, type Messaging } from 'firebase/messaging'; // ✅ 追加

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

// ✅ messaging はクライアントでのみ取得（SSR対策）
const messaging: Messaging | undefined =
  typeof window !== 'undefined' ? getMessaging(app) : undefined;

export { auth, db, storage, app, messaging };
