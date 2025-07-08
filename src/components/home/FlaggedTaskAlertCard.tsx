'use client';

import { Flag } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { getViewedFlaggedTaskIds, markTaskAsViewed } from '@/utils/viewedTasks';
import type { Task } from '@/types/Task';

type Props = {
  flaggedTasks?: Task[]; // フラグ付きの全タスクを受け取る
};

export default function FlaggedTaskAlertCard({ flaggedTasks = [] }: Props) {
  const router = useRouter();
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    const viewed = getViewedFlaggedTaskIds();
    const hasUnviewed = flaggedTasks.some(
      (task) => task.flagged && !viewed.includes(task.id)
    );
    setIsNew(hasUnviewed);
  }, [flaggedTasks]);


  const handleClick = () => {
    flaggedTasks.forEach((task) => {
      if (task.flagged) {
        markTaskAsViewed(task.id);
      }
    });
    setIsNew(false);

    const timestamp = new Date().getTime();
    router.push(`/main?view=task&index=2&flagged=true&_t=${timestamp}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="mb-3 relative"
    >
      {/* ✅ バッジを最上部に表示 */}
      {isNew && (
        <div className="absolute top-0 left-0 z-50 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-br-xl shadow">
          New
        </div>
      )}

      <div
        className="relative mx-auto w-full max-w-xl bg-white rounded-xl shadow-md border border-[#e5e5e5] px-6 py-5 cursor-pointer hover:shadow-lg transition overflow-hidden"
        onClick={handleClick}
      >
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
