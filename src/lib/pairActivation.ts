'use client';

const firstTaskKey = (uid: string) => `pk_first_shared_task_dismissed:${uid}`;
const premiumHintKey = (uid: string) => `pk_first_shared_premium_hint:${uid}`;

export function isFirstTaskCardDismissed(uid: string | null): boolean {
  if (!uid) return false;
  try {
    return localStorage.getItem(firstTaskKey(uid)) === '1';
  } catch {
    return false;
  }
}

export function dismissFirstTaskCard(uid: string): void {
  try {
    localStorage.setItem(firstTaskKey(uid), '1');
  } catch {
    /* ignore */
  }
}

export function wasPremiumHintShown(uid: string | null): boolean {
  if (!uid) return true;
  try {
    return localStorage.getItem(premiumHintKey(uid)) === '1';
  } catch {
    return true;
  }
}

export function markPremiumHintShown(uid: string): void {
  try {
    localStorage.setItem(premiumHintKey(uid), '1');
  } catch {
    /* ignore */
  }
}

export function isSharedWithPartner(
  task: { private?: boolean; userIds?: string[]; users?: string[] },
  uid: string,
  partnerId: string
): boolean {
  if (task.private === true) return false;
  const ids = (task.userIds?.length ? task.userIds : task.users) ?? [];
  return ids.includes(uid) && ids.includes(partnerId);
}
