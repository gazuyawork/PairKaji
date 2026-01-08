'use client';

import { Capacitor } from '@capacitor/core';
import {
  LocalNotifications,
  type LocalNotificationActionPerformed,
} from '@capacitor/local-notifications';

const OPEN_TIMER_ID_KEY = 'pairkaji_open_timer_id_from_notification_v1';

type ScheduleArgs = {
  timerId: string;
  title: string;
  body: string;
  fireAt: Date;
};

let listenersInitialized = false;

function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * 通知タップ時に、開くべき timerId を localStorage に保存するリスナーを登録
 * （アプリ起動トリガーになった場合でも、起動後に TimerProvider が拾えるようにする）
 */
export async function initTimerNotificationListeners(): Promise<void> {
  if (!isNativePlatform()) return;
  if (listenersInitialized) return;

  listenersInitialized = true;

  try {
    await LocalNotifications.addListener(
      'localNotificationActionPerformed',
      (event: LocalNotificationActionPerformed) => {
        try {
          const extra = event.notification?.extra as unknown;

          const timerId =
            typeof extra === 'object' && extra !== null
              ? typeof (extra as { timerId?: unknown }).timerId === 'string'
                ? (extra as { timerId?: string }).timerId
                : null
              : null;

          if (timerId) {
            localStorage.setItem(OPEN_TIMER_ID_KEY, timerId);
          } else {
            // timerId が取れない場合でも「タイマーを開く」だけはできるように空で保存
            localStorage.setItem(OPEN_TIMER_ID_KEY, '');
          }
        } catch {
          // noop
        }
      }
    );
  } catch {
    // noop
  }
}

/**
 * 通知タップで保存された timerId を一度だけ取り出す
 */
export function consumeOpenTimerIdFromNotification(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const v = localStorage.getItem(OPEN_TIMER_ID_KEY);
    if (v === null) return null;
    localStorage.removeItem(OPEN_TIMER_ID_KEY);
    // 空文字の場合は「特定できないがタイマーUIは開く」扱いにする
    return v;
  } catch {
    return null;
  }
}

export async function ensureNotificationPermission(): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display !== 'granted') {
      await LocalNotifications.requestPermissions();
    }
  } catch {
    // noop
  }
}

export async function scheduleTimerNotification(args: ScheduleArgs): Promise<boolean> {
  if (!isNativePlatform()) return false;

  try {
    // timerId から通知IDを安定生成（数値が必要）
    // 衝突リスクはゼロではないが、同一timerIdに対する上書きが目的なので十分
    const id = stableNotificationId(args.timerId);

    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: args.title,
          body: args.body,
          schedule: { at: args.fireAt },
          // ✅ これが通知タップ時に拾える
          extra: { timerId: args.timerId },
        },
      ],
    });

    return true;
  } catch {
    return false;
  }
}

export async function cancelTimerNotification(timerId: string): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    const id = stableNotificationId(timerId);
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch {
    // noop
  }
}

function stableNotificationId(timerId: string): number {
  // 32bitに収める簡易ハッシュ
  let hash = 0;
  for (let i = 0; i < timerId.length; i++) {
    hash = (hash * 31 + timerId.charCodeAt(i)) | 0;
  }
  // LocalNotificationsはidが正の数が扱いやすい
  return Math.abs(hash) || 1;
}
