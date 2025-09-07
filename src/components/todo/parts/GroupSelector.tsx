'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { TodoOnlyTask } from '@/types/TodoOnlyTask';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, LayoutGrid } from 'lucide-react';
import { useUserUid } from '@/hooks/useUserUid';

/* =========================
   カテゴリ取得ヘルパー
   ========================= */
type TaskCategoryShape =
  | {
    categoryId?: string | null;
    categoryName?: string | null;
    categoryLabel?: string | null;
    category?: string | null;
  }
  | undefined;

/** カテゴリID（比較用） */
function getCategoryId(t: TodoOnlyTask): string | null {
  const c = t as TaskCategoryShape;
  return (c?.categoryId ?? c?.category ?? null) ?? null;
}

/** カテゴリ表示ラベル */
function getCategoryLabel(t: TodoOnlyTask): string {
  const c = t as TaskCategoryShape;
  return (c?.categoryName ?? c?.categoryLabel ?? c?.category ?? '未分類') ?? '未分類';
}

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
      tasks.filter((task) => task.visible && (task.userId === uid || task.private !== true)),
    [tasks, uid]
  );

  // ===== 展開シート =====
  const [sheetQuery, setSheetQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const totalCount = baseFilteredTasks.length;

  // カテゴリ一覧（ユニーク & ラベル昇順）
  const sheetCategories = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of baseFilteredTasks) {
      const id = getCategoryId(t);
      if (!id) continue;
      if (!map.has(id)) map.set(id, getCategoryLabel(t));
    }
    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ja'));
  }, [baseFilteredTasks]);

  // キーワード & カテゴリを反映した絞り込み
  const sheetFiltered: TodoOnlyTask[] = useMemo<TodoOnlyTask[]>(() => {
    const q = sheetQuery.trim().toLowerCase();
    return baseFilteredTasks.filter((t) => {
      const nameHit = q ? (t.name ?? '').toLowerCase().includes(q) : true;
      const catHit = selectedCategoryId ? getCategoryId(t) === selectedCategoryId : true;
      return nameHit && catHit;
    });
  }, [baseFilteredTasks, sheetQuery, selectedCategoryId]);

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

  return (
    <>
      {/* 上部バー：左は状態テキスト、右ボタンは条件で「展開」or「解除」に切替 */}
      <div className="mb-0 ml-3 flex items-center justify-between gap-2">
        {selectedGroupId === null ? (
          // まだフィルタ無し：展開シートオープンのボタン
          <button
            type="button"
            onClick={() => setIsSheetOpen(true)}
            className="h-15 px-3 py-3 mb-1 mr-2 rounded-full
bg-gradient-to-b from-white to-gray-50
border border-gray-200 text-[#5E5E5E] flex items-center gap-1
shadow-[0_8px_20px_rgba(0,0,0,0.12),0_1px_0_rgba(255,255,255,0.85)_inset]
hover:from-[#fff7ea] hover:to-[#ffe6bf] hover:border-[#FFCB7D]
hover:shadow-[0_12px_24px_rgba(0,0,0,0.16)]
active:translate-y-[1px]
focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200/60
transition"
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
              setSelectedCategoryId(null); // カテゴリ解除
            }}
            whileTap={{ scale: 1.05 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            className="h-12 px-3 py-4 mb-2 mr-2 rounded-full
bg-gradient-to-b from-[#fca5a5] to-[#ef4444]
border border-[#dc2626] text-white flex items-center gap-2
shadow-[0_10px_22px_rgba(239,68,68,0.35)]
before:content-[''] before:absolute before:inset-x-0 before:top-0 before:h-[30%] before:rounded-full before:bg-white/20 before:pointer-events-none
hover:opacity-95 active:translate-y-[1px]
focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200/60
transition relative overflow-hidden"
            title="フィルター解除（全件表示）"
            aria-label="フィルター解除（全件表示）"
          >
            <X className="w-6 h-6" />
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
                {/* 背景 */}
                <div
                  className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                  onClick={() => setIsSheetOpen(false)}
                />
                {/* 本体 */}
                <motion.div
                  className="relative mt-auto sm:mt-10 sm:mx-auto sm:max-w-2xl w-full
bg-gradient-to-b from-white to-gray-50
rounded-t-2xl sm:rounded-2xl border border-gray-200
shadow-[0_20px_40px_rgba(0,0,0,0.18)]
flex flex-col h-[70vh] sm:h-auto sm:max-h-[80vh]
pb-[max(env(safe-area-inset-bottom),16px)]"
                  initial={{ y: 48 }}
                  animate={{ y: 0 }}
                  exit={{ y: 48 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                >

                  {/* ハンドル */}
                  <div className="mx-auto mt-2 mb-1 h-1.5 w-12 rounded-full bg-gray-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]" />

                  {/* ヘッダー */}
                  <div
                    className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm
border-b border-gray-200 px-4 py-2 flex items-center gap-2
shadow-[0_6px_12px_rgba(0,0,0,0.06)]"
                  >
                    <button
                      className="p-2 rounded-full hover:bg-gray-100"
                      onClick={() => setIsSheetOpen(false)}
                      aria-label="閉じる"
                    >
                      <X className="w-5 h-5 text-red-600" />
                    </button>
                    <h2 className="text-base font-semibold text-[#5E5E5E]">Todoを探す</h2>
                    <span className="ml-auto text-xs text-gray-500">
                      {sheetQuery || selectedCategoryId ? `一致: ${filteredCount}件` : `全件: ${totalCount}件`}
                    </span>
                  </div>

                  {/* 検索 & カテゴリ */}
                  <div className="px-4 pt-3">
                    {/* キーワード検索 */}
                    <div
                      className="flex items-center gap-2 rounded-xl px-3 py-2
bg-gradient-to-b from-white to-gray-50
border border-gray-200
shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]"
                    >
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
                          type="button"
                        >
                          クリア
                        </button>
                      )}
                    </div>

                    {/* カテゴリチップ */}
                    <div className="mt-3">
                      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 -mx-1 px-1">
                        {/* すべて */}
                        <button
                          type="button"
                          onClick={() => setSelectedCategoryId(null)}
                          className={`shrink-0 px-3 py-1.5 rounded-full border text-xs transition
  ${selectedCategoryId === null
                              ? 'bg-gray-900 text-white border-gray-900 shadow-[0_2px_2px_rgba(0,0,0,0.1)]'
                              : 'bg-gradient-to-b from-white to-gray-50 text-gray-700 border-gray-300 shadow-[0_2px_2px_rgba(0,0,0,0.1)] hover:from-gray-50 hover:to-white hover:shadow-[0_2px_2px_rgba(0,0,0,0.1)]'}
  active:translate-y-[1px]`}
                          aria-pressed={selectedCategoryId === null}
                        >
                          すべて
                        </button>

                        {/* 動的カテゴリ */}
                        {sheetCategories.map((c) => {
                          const active = selectedCategoryId === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setSelectedCategoryId(c.id)}
                              className={`shrink-0 px-3 py-1.5 rounded-full border text-xs transition
  ${active
                                  ? 'bg-gradient-to-b from-orange-400 to-orange-500 text-white border-orange-500 shadow-[0_2px_2px_rgba(0,0,0,0.1)]'
                                  : 'bg-gradient-to-b from-white to-gray-50 text-gray-700 border-gray-300 shadow-[0_2px_2px_rgba(0,0,0,0.1)] hover:from-[#fff5eb] hover:to-white hover:shadow-[0_2px_2px_rgba(0,0,0,0.1)]'}
  active:translate-y-[1px]`}
                              aria-pressed={active}
                              title={c.label}
                            >
                              {c.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* 選択状態の補助表示（任意） */}
                      {/* <div className="mt-1 text-[11px] text-gray-500">
                        {selectedCategoryId
                          ? `カテゴリ: ${sheetCategories.find((s) => s.id === selectedCategoryId)?.label ?? '不明'}`
                          : 'カテゴリ: すべて'}
                      </div> */}

                      {/* 情報メッセージ（未指定時） */}
                      <div className="mt-2 flex items-center gap-2">
                        {!sheetQuery && selectedGroupId === null && selectedCategoryId === null && (
                          <span className="text-xs text-gray-500 ml-1">全件を表示中</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 一覧 */}
                  <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
                    {sheetFiltered.length === 0 ? (
                      <div className="text-center text-sm text-gray-500 py-10">一致するToDoが見つかりませんでした。</div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {sheetFiltered.map((task) => {
                          const isActive = selectedGroupId === task.id;
                          return (
                            <button
                              key={task.id}
                              onClick={() => handleSelectAndClose(task.id ?? null)}
                              className={`w-full px-3 py-3 rounded-xl border text-sm font-semibold transition-all text-left
  ${isActive
                                  ? 'bg-gradient-to-b from-[#ffd38a] to-[#f5b94f] text-white border-[#f0a93a] shadow-[0_2px_2px_rgba(0,0,0,0.1)]'
                                  : 'bg-gradient-to-b from-white to-gray-50 text-[#5E5E5E] border-gray-200 shadow-[0_2px_2px_rgba(0,0,0,0.1)] hover:shadow-[0_2px_2px_rgba(0,0,0,0.1)] hover:border-[#FFCB7D]'
                                }
  active:translate-y-[1px]`}
                              title={task.name ?? ''}
                              type="button"
                            >
                              <span className="line-clamp-2">{task.name}</span>
                              {/* 補助: カテゴリ名（任意表示。不要なら削除可） */}
                              {getCategoryId(task) && (
                                <span className="mt-1 block text-[11px] text-gray-500">
                                  {getCategoryLabel(task)}
                                </span>
                              )}
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
