// src/lib/firebase.ts

'use client';

export const dynamic = 'force-dynamic';

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  memoryLocalCache,
  type Firestore,
} from 'firebase/firestore';
import {
  getAuth,
  setPersistence,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
} from 'firebase/auth';
import { getStorage } from 'firebase/storage';

// import { setLogLevel } from 'firebase/firestore';
// setLogLevel('debug');

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

/** 認証不要ページと同一（RequireAuth と揃える） */
const PUBLIC_PATHS = new Set<string>(['/login', '/signup', '/verify', '/terms', '/privacy']);

/* --------------------------- IndexedDB クリーナー --------------------------- */
/** 破損時に Firebase 関連の IndexedDB を可能な範囲で削除（非同期・失敗しても続行）
 *  ※ Auth の永続 DB は削除しない（リロードでログアウトを誘発するため）
 */

// IDBFactory に非標準の databases() が存在する実装向けの拡張型
type IDBFactoryWithDatabases = IDBFactory & {
  databases?: () => Promise<Array<{ name?: string }>>;
};

async function nukeCorruptedFirebaseIndexedDB(projectId?: string) {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return;

  // 同セッションでの多重削除を防止（再ログイン直後の連続ログアウト防止）
  try {
    const KEY = '__firebase_idb_nuked_v1__';
    if (sessionStorage.getItem(KEY) === '1') return;
    sessionStorage.setItem(KEY, '1');
  } catch {
    // sessionStorage が使えない環境はそのまま続行
  }

  const deleteDB = (name: string) =>
    new Promise<void>((resolve) => {
      try {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      } catch {
        resolve();
      }
    });

  try {
    // 非標準の databases() があれば利用する（型を拡張して安全に参照）
    const idb = indexedDB as IDBFactoryWithDatabases;
    if (typeof idb.databases === 'function') {
      const dbs = (await idb.databases()) ?? [];
      for (const db of dbs) {
        const name = db.name ?? '';
        // Firestore 系のみ削除。Auth 永続 DB は削除しない。
        const isFirestoreish =
          /firestore/i.test(name) ||
          name === 'firebase-firestore-database' ||
          (projectId && name.includes(projectId) && /firestore/i.test(name));
        if (isFirestoreish) {
          await deleteDB(name);
        }
      }
      return;
    }
  } catch {
    // 列挙失敗時は既知名を削除
  }

  // 既知名から Auth 関連は除外（firebaseLocalStorageDb / firebase-auth-database は削除しない）
  const knownNames = [
    // 'firebaseLocalStorageDb',         // ← 削除しない（Auth の永続 DB）
    'firebase-heartbeat-database',
    // 'firebase-auth-database',         // ← 削除しない（Auth 関連）
    'firebase-installations-database',
    'firebase-firestore-database',
    'firestore/[DEFAULT]/' + (firebaseConfig.projectId ?? ''),
  ];
  for (const name of knownNames) {
    await deleteDB(name);
  }
}

/* ------------------------------ Auth 永続化 ------------------------------ */
const auth = getAuth(app);
if (typeof window !== 'undefined') {
  // browserLocalPersistence を最優先にして、IndexedDB 依存を回避
  setPersistence(auth, browserLocalPersistence)
    .catch((e1) => {
      console.warn('[Auth] browserLocalPersistence failed. Fallback to indexedDBLocalPersistence.', e1);
      return setPersistence(auth, indexedDBLocalPersistence);
    })
    .catch((e2) => {
      console.warn('[Auth] indexedDBLocalPersistence failed. Fallback to inMemoryPersistence.', e2);
      return setPersistence(auth, inMemoryPersistence);
    })
    .catch((e3) => {
      console.warn('[Auth] inMemoryPersistence also failed (rare).', e3);
    });
}

/* --------------------------- Firestore 安全初期化 --------------------------- */
/**
 * - Public パスでは最初から memoryLocalCache()（IDB に触れず確実に起動）
 * - 通常は persistentLocalCache()、失敗/破損時はクリーナー→ memoryLocalCache() へ切替
 * - 非同期削除は「投げるだけ」。以降のクラッシュは防ぎ、Auth 判定・リダイレクトが必ず動く
 */
function isPublicPath(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return PUBLIC_PATHS.has(window.location.pathname);
  } catch {
    return false;
  }
}

let db: Firestore;
try {
  const useMemory = isPublicPath();
  db = initializeFirestore(app, {
    localCache: useMemory ? memoryLocalCache() : persistentLocalCache(),
  });
} catch (e) {
  console.warn('[Firestore] persistentLocalCache init failed. Cleaning & falling back to memory.', e);
  // 破損の可能性があるのでクリーンアップ（待たずに実行）
  if (typeof window !== 'undefined') {
    void nukeCorruptedFirebaseIndexedDB(firebaseConfig.projectId);
  }
  db = initializeFirestore(app, {
    localCache: memoryLocalCache(),
  });
}

const storage = getStorage(app);

export { auth, db, storage, app };
