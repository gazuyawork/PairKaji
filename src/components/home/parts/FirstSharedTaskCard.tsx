'use client';

import { useEffect, useMemo, useState } from 'react';
import { ListTodo, X } from 'lucide-react';
import { useHousehold } from '@/context/HouseholdContext';
import { useView } from '@/context/ViewContext';
import {
  dismissFirstTaskCard,
  isFirstTaskCardDismissed,
  isSharedWithPartner,
} from '@/lib/pairActivation';

export default function FirstSharedTaskCard() {
  const { uid, tasks, hasPairConfirmed, partnerId } = useHousehold();
  const { setIndex } = useView();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(isFirstTaskCardDismissed(uid));
  }, [uid]);

  const hasShared = useMemo(() => {
    if (!uid || !partnerId) return false;
    return tasks.some((t) => isSharedWithPartner(t, uid, partnerId));
  }, [tasks, uid, partnerId]);

  if (!hasPairConfirmed || !uid || !partnerId || dismissed || hasShared) return null;

  const openNewTask = () => {
    setIndex(1);
    window.setTimeout(() => {
      window.dispatchEvent(new Event('open-new-task-modal'));
    }, 50);
  };

  return (
    <div className="relative mx-auto w-full max-w-xl bg-white border border-emerald-200 rounded-xl shadow-md py-5 px-5 mb-1.5">
      <button
        type="button"
        onClick={() => {
          dismissFirstTaskCard(uid);
          setDismissed(true);
        }}
        className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
        aria-label="閉じる"
      >
        <X className="w-5 h-5" />
      </button>
      <div className="flex items-center gap-2 mb-2">
        <ListTodo className="w-5 h-5 text-emerald-600" />
        <p className="font-semibold text-gray-800">最初の家事を追加しましょう</p>
      </div>
      <p className="text-sm text-gray-600 mb-4 leading-relaxed">
        つながった相手と、まずは1件だけ共有タスクを置くと、分担が始まります。
      </p>
      <button
        type="button"
        onClick={openNewTask}
        className="w-full min-h-11 bg-[#FFCB7D] text-white py-2 rounded-lg text-sm font-semibold"
      >
        家事を追加する
      </button>
    </div>
  );
}
