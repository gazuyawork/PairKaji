'use client';

import { Flag } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

type Props = {
  flaggedCount: number;
};

export default function FlaggedTaskAlertCard({ flaggedCount }: Props) {
  const router = useRouter();

  const handleClick = () => {
    // ✅ `view=task` と `index=2` をクエリパラメータで指定してタスク処理画面に遷移
    router.push('/main?view=task&index=2');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="mb-3"
    >
      <div
        className="relative bg-white rounded-xl shadow-md border border-[#e5e5e5] px-6 py-5 cursor-pointer hover:shadow-lg transition overflow-hidden"
        onClick={handleClick}
      >
        <div className="flex items-center gap-4">
          <Flag className="text-red-500 w-6 h-6 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-base font-semibold text-[#5E5E5E]">
              フラグ付きのタスクが {flaggedCount} 件あります
            </p>
            <p className="text-sm text-gray-500">
              タスク処理画面で確認しましょう
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
