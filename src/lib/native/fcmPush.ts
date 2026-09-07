'use client';

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { arrayRemove, arrayUnion, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { isNativeAppPlatform, readNativeNotifyPref } from '@/lib/timer/nativeNotifications';

export const FCM_CHANNEL_ID = 'pairkaji_alerts_v3';

let listenersReady = false;
let lastToken: string | null = null;
const tokenWaiters: Array<(token: string) => void> = [];

function notifyToken(token: string) {
  lastToken = token;
  const waiters = tokenWaiters.splice(0);
  for (const fn of waiters) fn(token);
}

export async function saveFcmToken(uid: string, token: string): Promise<void> {
  await setDoc(
    doc(db, 'users', uid),
    {
      fcmEnabled: true,
      fcmToken: token,
      fcmTokens: arrayUnion(token),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function disableFcmForUser(uid: string): Promise<void> {
  await setDoc(
    doc(db, 'users', uid),
    {
      fcmEnabled: false,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function removeFcmToken(uid: string, token: string): Promise<void> {
  await setDoc(
    doc(db, 'users', uid),
    {
      fcmTokens: arrayRemove(token),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

async function ensureReminderChannel(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    await PushNotifications.createChannel({
      id: FCM_CHANNEL_ID,
      name: '家事リマインド',
      description: '家事の時間前やフラグのお知らせ',
      importance: 5,
      visibility: 1,
      vibration: true,
    });
    try {
      await PushNotifications.deleteChannel({ id: 'pairkaji_reminders' });
      await PushNotifications.deleteChannel({ id: 'pairkaji_alerts_v2' });
    } catch {
      // 旧チャネルが無い場合は無視
    }
  } catch {
    // 既存チャネルでも続行
  }
}

export async function initFcmListeners(): Promise<void> {
  if (!isNativeAppPlatform() || listenersReady) return;
  listenersReady = true;

  await PushNotifications.addListener('registration', (event) => {
    const token = event.value;
    notifyToken(token);
    const uid = auth.currentUser?.uid;
    if (!uid || !readNativeNotifyPref()) return;
    void saveFcmToken(uid, token);
  });

  await PushNotifications.addListener('registrationError', (event) => {
    console.warn('[fcm] registrationError', event.error);
  });

  await PushNotifications.addListener('pushNotificationReceived', () => {
    // フォアグラウンド。表示は OS / プラグインに任せる
  });

  await PushNotifications.addListener('pushNotificationActionPerformed', () => {
    try {
      if (window.location.pathname !== '/main') {
        window.location.assign('/main');
      }
    } catch {
      // noop
    }
  });
}

function waitForToken(timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('FCM_TIMEOUT'));
    }, timeoutMs);
    tokenWaiters.push((token) => {
      clearTimeout(timer);
      resolve(token);
    });
  });
}

export async function enableFcmForUser(uid: string): Promise<boolean> {
  if (!isNativeAppPlatform()) return false;
  await initFcmListeners();
  await ensureReminderChannel();

  const current = await PushNotifications.checkPermissions();
  const perm =
    current.receive === 'granted'
      ? current
      : await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return false;

  if (lastToken) {
    await PushNotifications.register();
    await saveFcmToken(uid, lastToken);
    return true;
  }

  const tokenPromise = waitForToken(15000);
  await PushNotifications.register();
  const token = lastToken ?? (await tokenPromise);
  await saveFcmToken(uid, token);
  return true;
}

export async function refreshFcmIfEnabled(uid: string): Promise<void> {
  if (!isNativeAppPlatform() || !readNativeNotifyPref()) return;
  try {
    await enableFcmForUser(uid);
  } catch {
    // 起動時の再登録失敗は設定画面で再試行
  }
}
