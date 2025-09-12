// src/components/.../FlaggedTaskAlertCard.tsx
'use client';

export const dynamic = 'force-dynamic';

import { Flag } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState, useCallback } from 'react'; // ▼ 変更: useCallback 追加
import { getViewedFlaggedTaskIds, markTaskAsViewed } from '@/utils/viewedTasks';
import type { Task } from '@/types/Task';
import { auth } from '@/lib/firebase';

// ▼ 追加: PWA（ホーム追加/インストール）判定ヘルパ
const isInstalledPWA = () => {
  try {
    if (typeof window === 'undefined') return false;
    // @ts-expect-error iOS legacy
    const iosStandalone = !!window.navigator.standalone;
    const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches ?? false;
    return iosStandalone || standalone;
  } catch {
    return false;
  }
};

// ▼ 追加: 通知権限を確保（許可済みなら何もしない）
const ensureNotificationPermission = async () => {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch {
      /* no-op */
    }
  }
};

type Props = {
  flaggedTasks?: Task[];
};

export default function FlaggedTaskAlertCard({ flaggedTasks = [] }: Props) {
  const router = useRouter();
  const [isNew, setIsNew] = useState(false);

  // ▼ 追加: デバッグ用（?debugBadge=1 のときだけボタン表示）
  const showBadgeDebug = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('debugBadge') === '1'
    : false;

  // ▼ 追加: 任意のタイミング（初回やユーザー操作の前後）で通知権限を確保
  useEffect(() => {
    if (isInstalledPWA()) {
      void ensureNotificationPermission();
    }
  }, []);

  // ▼ 変更: 未閲覧件数の計算
  const unviewedCount = useMemo(() => {
    const viewed = getViewedFlaggedTaskIds();
    const currentUserId = auth.currentUser?.uid;

    return flaggedTasks.reduce((acc, task) => {
      if (!task.flagged) return acc;
      const isPrivate = task.private === true;
      const isOwnTask = task.userId === currentUserId;
      const isUnviewed = !viewed.includes(task.id);
      if (isPrivate) {
        return acc + (isOwnTask && isUnviewed ? 1 : 0);
      } else {
        return acc + (isUnviewed ? 1 : 0);
      }
    }, 0);
  }, [flaggedTasks]);

  useEffect(() => {
    setIsNew(unviewedCount > 0);
  }, [unviewedCount]);

  // ▼ 変更: バッジ反映（PWA起動時のみ）
  useEffect(() => {
    if (!isInstalledPWA()) return;
    const navAny = navigator as any;
    if (unviewedCount > 0 && typeof navAny?.setAppBadge === 'function') {
      navAny.setAppBadge(unviewedCount).catch(() => {});
    } else if (typeof navAny?.clearAppBadge === 'function') {
      navAny.clearAppBadge().catch(() => {});
    }
  }, [unviewedCount]);

  const handleClick = useCallback(() => {
    flaggedTasks.forEach((task) => {
      if (task.flagged) markTaskAsViewed(task.id);
    });
    setIsNew(false);

    // ▼ 変更: 既読化後にバッジクリア
    if (isInstalledPWA()) {
      const navAny = navigator as any;
      if (typeof navAny?.clearAppBadge === 'function') {
        navAny.clearAppBadge().catch(() => {});
      }
    }

    const timestamp = new Date().getTime();
    router.push(`/main?view=task&index=2&flagged=true&_t=${timestamp}`);
  }, [flaggedTasks, router]);

  // ▼ 追加: デバッグUI（?debugBadge=1 で表示）
  const BadgeDebug = showBadgeDebug ? (
    <div className="mt-2 text-xs">
      <button
        onClick={() => (navigator as any).setAppBadge?.(99)}
        className="text-blue-600 underline"
      >
        setAppBadge(99)
      </button>
      <button
        onClick={() => (navigator as any).clearAppBadge?.()}
        className="ml-3 text-gray-600 underline"
      >
        clearAppBadge()
      </button>
      <span className="ml-3 text-gray-500">
        {'API:'} {String('setAppBadge' in navigator)} / PWA: {String(isInstalledPWA())}
      </span>
    </div>
  ) : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="mb-3 relative"
    >
      <div
        className="relative mx-auto w-full max-w-xl bg-white rounded-xl shadow-md border border-[#e5e5e5] px-6 py-5 cursor-pointer hover:shadow-lg transition overflow-hidden"
        onClick={handleClick}
      >
        {isNew && (
          <div className="absolute top-0 left-0 z-50 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-br-xl shadow">
            New
          </div>
        )}
        <div className="flex items-center gap-4">
          <Flag className="text-red-500 w-6 h-6 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-base font-semibold text-[#5E5E5E]">
              フラグ付きのタスクが {flaggedTasks.length ?? 0} 件あります
            </p>
            <p className="text-sm text-gray-500">タスク処理画面で確認しましょう</p>
          </div>
        </div>

        {/* ▼ 追加: デバッグUI */}
        {BadgeDebug}
      </div>
    </motion.div>
  );
}
