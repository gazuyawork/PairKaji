// src/lib/server/firebaseAdmin.ts
import * as admin from 'firebase-admin';

let app: admin.app.App | null = null;

function initAdminApp(): admin.app.App {
  if (app) return app;
  if (admin.apps.length > 0) {
    app = admin.app();
    return app;
  }

  // 1) JSON 文字列でサービスアカウント一式を渡すケース
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson && serviceAccountJson.trim() !== '') {
    const parsed = JSON.parse(serviceAccountJson);
    if (parsed.private_key && typeof parsed.private_key === 'string') {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    app = admin.initializeApp({
      credential: admin.credential.cert(parsed as admin.ServiceAccount),
    });
    return app;
  }

  // 2) 個別指定（projectId / clientEmail / privateKey）
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKeyRaw) {
    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
    app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    return app;
  }

  // 3) それ以外は ADC（GOOGLE_APPLICATION_CREDENTIALS 等）
  app = admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
  return app;
}

/** 既存の API 互換 */
export function getAdminApp(): admin.app.App {
  return initAdminApp();
}

/** 非同期取得（Promise 返却） */
export async function getAdminDb(): Promise<admin.firestore.Firestore> {
  return initAdminApp().firestore();
}

/** 同期で扱える Firestore 参照 */
export const adminDb: admin.firestore.Firestore = initAdminApp().firestore();

/** ✅ default export: admin 名前空間（FieldValue などで使用） */
export default admin;
