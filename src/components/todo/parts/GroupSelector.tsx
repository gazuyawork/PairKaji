'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { TodoOnlyTask } from '@/types/TodoOnlyTask';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, LayoutGrid } from 'lucide-react';
import { useUserUid } from '@/hooks/useUserUid';

type Props = {
  tasks: TodoOnlyTask[];
  selectedGroupId: string | null;
  onSelectGroup: (id: string | null) => void;
};

export default function GroupSelector({ tasks, selectedGroupId, onSelectGroup }: Props) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [mounted, setMounted] = useState(false); // Portal用（SSR対策）
  const uid = useUserUid();

  useEffect(() => {
    setMounted(true);
  }, []);

  // 可視 & （自分のタスク or 非private）
  const baseFilteredTasks: TodoOnlyTask[] = useMemo(
    () =>
      tasks.filter(
        (task) => task.visible && (task.userId === uid || task.private !== true)
      ),
    [tasks, uid]
  );

  // ===== 展開シート =====
  const [sheetQuery, setSheetQuery] = useState('');
  const totalCount = baseFilteredTasks.length;

  const sheetFiltered: TodoOnlyTask[] = useMemo<TodoOnlyTask[]>(() => {
    const q = sheetQuery.trim().toLowerCase();
    if (!q) return baseFilteredTasks;
    return baseFilteredTasks.filter((t) => (t.name ?? '').toLowerCase().includes(q));
  }, [baseFilteredTasks, sheetQuery]);

  const filteredCount = sheetFiltered.length;

  // Escで閉じる
  useEffect(() => {
    if (!isSheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSheetOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSheetOpen]);

  // シート表示中は背景スクロールロック
  useEffect(() => {
    if (!mounted) return;
    const original = document.body.style.overflow;
    if (isSheetOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = original || '';
    }
    return () => {
      document.body.style.overflow = original || '';
    };
  }, [isSheetOpen, mounted]);

  // 個別選択 → シートを閉じる
  const handleSelectAndClose = (id: string | null) => {
    onSelectGroup(id);
    setIsSheetOpen(false);
  };

  // フィルター解除
  // const handleClearFilterInSheet = () => {
  //   onSelectGroup(null);
  //   setSheetQuery('');
  // };

  return (
    <>
      {/* // 上部バー：左は状態テキスト、右ボタンは条件で「展開」or「解除」に切替 */}
      <div className="mb-0 ml-3 flex items-center justify-between gap-2">
        {/* <div className="flex items-center gap-2">
          {selectedGroupId === null ? (
            <span className="text-xs text-white bg-gray-400 px-3 py-2 rounded-sm">全件を表示中</span>
          ) : (
            <span className="text-xs text-white bg-orange-300 px-3 py-2 rounded-sm">フィルター適用中</span>
          )}
        </div> */}

        {selectedGroupId === null ? (
          // まだフィルタ無し：展開シートオープンのボタン
          <button
            type="button"
            onClick={() => setIsSheetOpen(true)}
            className="h-15 px-3 py-3 mb-1 mr-2 rounded-full bg-white border border-gray-300 text-[#5E5E5E] flex items-center gap-1 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_6px_rgba(0,0,0,0.2)] hover:bg-[#FFCB7D] hover:text-white hover:border-[#FFCB7D]"
            aria-haspopup="dialog"
            aria-expanded={isSheetOpen}
            aria-controls="group-selector-sheet"
            title="すべて表示"
          >
            <LayoutGrid className="w-9 h-9" />
          </button>
        ) : (
          // フィルタ適用中：このボタン自体が解除（×）になる
          <motion.button
            type="button"
            onClick={() => {
              onSelectGroup(null);
              setSheetQuery('');
            }}
            whileTap={{ scale: 1.05 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            className="h-12 px-3 py-4 mb-1 mr-2 rounded-full bg-gradient-to-b from-[#fca5a5] to-[#ef4444] border border-[#dc2626] text-white flex items-center gap-2 shadow-inner hover:opacity-95"
            title="フィルター解除（全件表示）"
            aria-label="フィルター解除（全件表示）"
          >
            <X className="w-6 h-6" />
            {/* <span className="text-sm font-semibold">解除</span> */}
          </motion.button>
        )}
      </div>

      {/* ===== 展開シート ===== */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {isSheetOpen && (
              <motion.div
                id="group-selector-sheet"
                role="dialog"
                aria-modal="true"
                className="fixed inset-0 z-[1200] flex flex-col"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >

                <div
                  className="absolute inset-0 bg-black/40"
                  onClick={() => setIsSheetOpen(false)}
                />
                <motion.div
                  className="relative mt-auto sm:mt-10 sm:mx-auto sm:max-w-2xl w-full bg-white rounded-t-2xl sm:rounded-2xl shadow-xl
             flex flex-col h-[70vh] sm:h-auto sm:max-h-[80vh] pb-[max(env(safe-area-inset-bottom),16px)]"
                  initial={{ y: 48 }}
                  animate={{ y: 0 }}
                  exit={{ y: 48 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                >

                  <div className="sticky top-0 z-10 bg-white border-b px-4 py-2 flex items-center gap-2">
                    <button
                      className="p-2 rounded-full hover:bg-gray-100"
                      onClick={() => setIsSheetOpen(false)}
                      aria-label="閉じる"
                    >
                      <X className="w-5 h-5 text-red-600" />
                    </button>
                    <h2 className="text-base font-semibold text-[#5E5E5E]">
                      Todoを探す
                    </h2>
                    <span className="ml-auto text-xs text-gray-500">
                      {sheetQuery ? `一致: ${filteredCount}件` : `全件: ${totalCount}件`}
                    </span>
                  </div>

                  <div className="px-4 pt-3">
                    <div className="flex items-center gap-2 border rounded-lg px-3 py-2">
                      <Search className="w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={sheetQuery}
                        onChange={(e) => setSheetQuery(e.target.value)}
                        placeholder="キーワードで検索"
                        className="flex-1 outline-none text-[#5E5E5E] placeholder:text-gray-400"
                        autoFocus
                      />
                      {sheetQuery && (
                        <button
                          className="text-sm text-gray-500 hover:text-gray-700"
                          onClick={() => setSheetQuery('')}
                        >
                          クリア
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {/* <button
                        onClick={handleClearFilterInSheet}
                        className="text-sm underline text-gray-600 hover:text-gray-800"
                      >
                        すべて表示する
                      </button> */}
                      {!sheetQuery && selectedGroupId === null && (
                        <span className="text-xs text-gray-500 ml-1">全件を表示中</span>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
                    {sheetFiltered.length === 0 ? (
                      <div className="text-center text-sm text-gray-500 py-10">
                        一致するToDoが見つかりませんでした。
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {sheetFiltered.map((task) => {
                          const isActive = selectedGroupId === task.id;
                          return (
                            <button
                              key={task.id}
                              onClick={() => handleSelectAndClose(task.id ?? null)}
                              className={`w-full px-3 py-3 rounded-lg border text-sm font-semibold transition-all text-left
                                ${isActive
                                  ? 'bg-gradient-to-b from-[#ffd38a] to-[#f5b94f] text-white border-[#f0a93a] shadow-inner'
                                  : 'bg-white text-[#5E5E5E] border-gray-300 hover:bg-[#FFCB7D] hover:text-white hover:border-[#FFCB7D] hover:shadow-[0_4px_6px_rgba(0,0,0,0.2)]'
                                }`}
                              title={task.name}
                            >
                              <span className="line-clamp-2">{task.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
