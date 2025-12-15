'use client';

import { Capacitor } from '@capacitor/core';

type ScheduleArgs = {
  timerId: string;
  title: string;
  body: string;
  fireAt: Date;
};

function isNativeCapacitor() {
  return Capacitor.isNativePlatform?.() ?? false;
}

function hashToInt32(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  if (h === 0) h = 1;
  return Math.abs(h);
}

async function getLocalNotifications() {
  const mod = await import('@capacitor/local-notifications');
  return mod.LocalNotifications;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isNativeCapacitor()) return false;

  const LocalNotifications = await getLocalNotifications();
  const perm = await LocalNotifications.checkPermissions();
  if (perm.display === 'granted') return true;

  const req = await LocalNotifications.requestPermissions();
  return req.display === 'granted';
}

export async function scheduleTimerNotification(args: ScheduleArgs): Promise<boolean> {
  if (!isNativeCapacitor()) return false;

  const ok = await ensureNotificationPermission();
  if (!ok) return false;

  const LocalNotifications = await getLocalNotifications();
  const id = hashToInt32(args.timerId);

  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch {}

  await LocalNotifications.schedule({
    notifications: [
      {
        id,
        title: args.title,
        body: args.body,
        schedule: { at: args.fireAt },
      },
    ],
  });

  return true;
}

export async function cancelTimerNotification(timerId: string): Promise<void> {
  if (!isNativeCapacitor()) return;

  const LocalNotifications = await getLocalNotifications();
  const id = hashToInt32(timerId);

  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch {}
}
