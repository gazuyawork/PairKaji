// src/lib/server/firebaseAdmin.ts
import * as admin from 'firebase-admin';

let app: admin.app.App | null = null;

export function getAdminApp(): admin.app.App {
  if (app) return app;

  // 環境変数からサービスアカウントJSONを受け取る方式
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error('ENV FIREBASE_SERVICE_ACCOUNT_JSON is required for server-side Firestore access');
  }

  const credential = admin.credential.cert(JSON.parse(serviceAccountJson));
  app = admin.initializeApp({ credential });
  return app;
}

export async function getAdminDb(): Promise<admin.firestore.Firestore> {
  const a = getAdminApp();
  return a.firestore();
}
