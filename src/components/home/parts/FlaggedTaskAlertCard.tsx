// src/components/.../FlaggedTaskAlertCard.tsx
'use client';

export const dynamic = 'force-dynamic';

import { Flag } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { getViewedFlaggedTaskIds, markTaskAsViewed } from '@/utils/viewedTasks';
import type { Task } from '@/types/Task';
import { auth } from '@/lib/firebase';

// Badgingユーティリティ（PWA判定・ローカル保持込み）
import {
  setAppBadgeSafe,
  clearAppBadgeSafe,
} from '@/utils/appBadge';

type Props = {
  flaggedTasks?: Task[]; // フラグ付きの全タスクを受け取る
};

export default function FlaggedTaskAlertCard({ flaggedTasks = [] }: Props) {
  const router = useRouter();
  const [isNew, setIsNew] = useState(false);

  // 未閲覧件数（=バッジ数）を算出
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

  // New表示の制御を未閲覧件数で行う
  useEffect(() => {
    setIsNew(unviewedCount > 0);
  }, [unviewedCount]);

  // バッジ反映（未読>0 → set、==0 → clear）
  useEffect(() => {
    if (unviewedCount > 0) {
      void setAppBadgeSafe(unviewedCount);
    } else {
      void clearAppBadgeSafe();
    }
  }, [unviewedCount]);

  const handleClick = useCallback(() => {
    // 既読化
    flaggedTasks.forEach((task) => {
      if (task.flagged) {
        markTaskAsViewed(task.id);
      }
    });
    setIsNew(false);

    // 既読化直後にバッジもクリア
    void clearAppBadgeSafe();

    const timestamp = new Date().getTime();
    router.push(`/main?view=task&index=2&flagged=true&_t=${timestamp}`);
  }, [flaggedTasks, router]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="relative"
    >
      <div
        className="relative mx-auto w-full max-w-xl bg-white rounded-xl border border-[#e5e5e5] px-6 py-5 cursor-pointer hover:shadow-lg transition overflow-hidden"
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
      </div>
    </motion.div>
  );
}
