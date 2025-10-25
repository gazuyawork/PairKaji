// src/components/home/parts/TodoShortcutsCard.tsx
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Plus,
  X,
  Search,
  ShoppingCart,
  Utensils,
  Briefcase,
  Home,
  Tag,
  Plane,
  ListTodo, // ★ 追加：アイコンリンク用
} from 'lucide-react';
import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot as onColSnapshot,
  type QuerySnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import SlideUpModal from '@/components/common/modals/SlideUpModal';
import { toast } from 'sonner';
import { useView } from '@/context/ViewContext';
import HelpPopover from '@/components/common/HelpPopover';

/* =========================
   型
   ========================= */
type TodoOnlyTask = {
  id: string;
  name: string;
  userId?: string;
  visible?: boolean;
  private?: boolean;
  isTodo?: boolean;
  type?: string | null;
  category?: string | null;
  categoryName?: string | null;
  categoryLabel?: string | null;
  todos?: Array<{ id: string; text: string; done?: boolean }> | unknown[];
};

type Props = {
  uid: string;
  className?: string;
};

const MAX_SLOTS = 3;

/* =========================
   ユーティリティ
   ========================= */
function normalizeName(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}
const safeText = (v: unknown): string => {
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (v === null || v === undefined) return '';
  return '[invalid]';
};

/* =========================
   カテゴリメタ（参考コード準拠）
   ========================= */
function getCategoryMeta(raw?: unknown) {
  const normalized = String(raw ?? '').normalize('NFKC').trim();
  const category =
    normalized === '' ||
      !['買い物', '料理', '旅行', '仕事', '家事', '未分類'].includes(normalized)
      ? '未分類'
      : normalized;

  switch (category) {
    case '料理':
      return {
        Icon: Utensils,
        colorClass: 'text-emerald-500',
        label: '料理',
        chipActiveClass:
          'bg-gradient-to-b from-emerald-500 to-emerald-600 text-white border-emerald-600',
        activeBg: 'from-emerald-500 to-emerald-600',
      };
    case '買い物':
      return {
        Icon: ShoppingCart,
        colorClass: 'text-sky-500',
        label: '買い物',
        chipActiveClass:
          'bg-gradient-to-b from-sky-500 to-sky-600 text-white border-sky-600',
        activeBg: 'from-sky-500 to-sky-600',
      };
    case '旅行':
      return {
        Icon: Plane,
        colorClass: 'text-orange-500',
        label: '旅行',
        chipActiveClass:
          'bg-gradient-to-b from-orange-500 to-orange-600 text-white border-orange-600',
        activeBg: 'from-orange-500 to-orange-600',
      };
    case '仕事':
      return {
        Icon: Briefcase,
        colorClass: 'text-indigo-500',
        label: '仕事',
        chipActiveClass:
          'bg-gradient-to-b from-indigo-500 to-indigo-600 text-white border-indigo-600',
        activeBg: 'from-indigo-500 to-indigo-600',
      };
    case '家事':
      return {
        Icon: Home,
        colorClass: 'text-rose-500',
        label: '家事',
        chipActiveClass:
          'bg-gradient-to-b from-rose-500 to-rose-600 text-white border-rose-600',
        activeBg: 'from-rose-500 to-rose-600',
      };
    case '未分類':
    default:
      return {
        Icon: Tag,
        colorClass: 'text-gray-400',
        label: '未分類',
        chipActiveClass:
          'bg-gradient-to-b from-gray-500 to-gray-600 text-white border-gray-600',
        activeBg: 'from-gray-500 to-gray-600',
      };
  }
}

/* =========================
   スロット（小さいカード）
   ========================= */
// 【変更①】SlotButton 外側のメイン押下エリアを <button> → <div role="button"> に変更
// 【変更②】右上の削除トリガを <button> → <span role="button"> に変更（赤丸・白×）
function SlotButton(props: {
  filled: boolean;
  label?: string;
  onClick: (e?: React.MouseEvent | React.KeyboardEvent) => void;
  onRemove?: () => void;
}) {
  const { filled, label, onClick, onRemove } = props;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(e);
        }
      }}
      className={[
        'group relative flex flex-col items-center justify-center',
        'h-20 w-full flex-1 min-w-0 rounded-xl border',
        'bg-white/80 dark:bg-white/[0.06] backdrop-blur',
        'hover:shadow-md transition-all duration-200',
        filled
          ? 'border-gray-300 dark:border-white/15'
          : 'border-dashed border-gray-300 dark:border-white/15',
      ].join(' ')}
    >
      {filled ? (
        <>
          <span
            className="px-3 text-sm leading-tight text-gray-800 dark:text-gray-100
                       text-center line-clamp-2 break-words"
          >
            {label}
          </span>

          {/* 【変更②】削除トリガを span[role=button] にし、赤丸・白×で右上固定 */}
          {onRemove && (
            <span
              role="button"
              tabIndex={0}
              aria-label="ショートカットを削除"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onRemove();
                }
              }}
              className="absolute top-[-5px] right-[-5px] z-10 inline-flex items-center justify-center
                         w-6 h-6 rounded-full bg-gray-400 text-white
                         shadow ring-1 ring-white/70
                         hover:bg-gray-500 active:scale-95
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2.5} />
            </span>
          )}
        </>
      ) : (
        <span className="flex items-center gap-1 text-gray-500 dark:text-gray-300 text-sm">
          <Plus size={18} />
          追加
        </span>
      )}
    </div>
  );
}

/* =========================
   本体
   ========================= */
export default function TodoShortcutsCard({ uid, className = '' }: Props) {
  // setIndex が型に無い環境でも安全に呼べるよう any 経由
  const view = useView() as any;

  // ショートカット（taskIdの配列）
  const [shortcuts, setShortcuts] = useState<string[]>([]);
  // 候補タスク
  const [candidateTodos, setCandidateTodos] = useState<TodoOnlyTask[]>([]);
  const [candidateLoading, setCandidateLoading] = useState<boolean>(true);

  // モーダル制御
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [targetSlot, setTargetSlot] = useState<number | null>(null);

  // モーダル内フィルタUI
  const [modalQuery, setModalQuery] = useState('');
  const [modalSelectedCategoryId, setModalSelectedCategoryId] = useState<string | null>(null);

  /* user_settings 監視（ショートカット） */
  useEffect(() => {
    if (!uid) return;
    const ref = doc(db, 'user_settings', uid);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data() || {};
      const arr = Array.isArray((data as any).todoShortcuts)
        ? ((data as any).todoShortcuts as string[])
        : [];
      setShortcuts(arr.slice(0, MAX_SLOTS));
    });
    return () => unsub();
  }, [uid]);

  /* pairs→tasks 購読（参考コード準拠） */
  useEffect(() => {
    if (!uid) {
      setCandidateTodos([]);
      setCandidateLoading(false);
      return;
    }

    let unsubscribeTasks: (() => void) | null = null;
    let isAlive = true;

    (async () => {
      setCandidateLoading(true);

      // confirmed ペアに含まれる userId を収集
      const pairsSnap = await getDocs(
        query(
          collection(db, 'pairs'),
          where('userIds', 'array-contains', uid),
          where('status', '==', 'confirmed'),
        ),
      );

      const userIds = new Set<string>([uid]);
      pairsSnap.forEach((docSnap) => {
        const data = docSnap.data() as { userIds?: unknown };
        if (Array.isArray(data.userIds)) {
          (data.userIds as unknown[])
            .filter((x): x is string => typeof x === 'string')
            .forEach((id) => userIds.add(id));
        }
      });

      const ids = Array.from(userIds).slice(0, 10);

      // tasks を購読（userId in ids）
      const tasksQ = query(collection(db, 'tasks'), where('userId', 'in', ids));
      unsubscribeTasks = onColSnapshot(
        tasksQ,
        (qs: QuerySnapshot<DocumentData>) => {
          if (!isAlive) return;

          const list: TodoOnlyTask[] = [];
          qs.forEach((d) => {
            const raw = d.data() as Record<string, unknown>;
            const task: TodoOnlyTask = {
              id: d.id,
              name: normalizeName(raw.name),
              userId: typeof raw.userId === 'string' ? (raw.userId as string) : undefined,
              visible: typeof raw.visible === 'boolean' ? (raw.visible as boolean) : undefined,
              private: typeof raw.private === 'boolean' ? (raw.private as boolean) : undefined,
              isTodo: (raw.isTodo as boolean) ?? undefined,
              type: (raw.type as string | null) ?? null,
              category: (raw.category as string | null) ?? null,
              categoryName: (raw as any).categoryName ?? null,
              categoryLabel: (raw as any).categoryLabel ?? null,
              todos: Array.isArray(raw.todos) ? (raw.todos as any[]) : [],
            };

            // 表示対象条件（参考実装に準拠）
            const ownerOk = task.userId === uid || task.private !== true;
            const visibleOk = task.visible !== false; // undefined は true とみなす
            const hasTodos = Array.isArray(task.todos) && task.todos.length > 0;
            const markedTodo = task.isTodo === true || task.type === 'todo';

            if (ownerOk && visibleOk && (hasTodos || markedTodo)) {
              list.push(task);
            }
          });

          list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'ja'));
          setCandidateTodos(list);
          setCandidateLoading(false);
        },
        (err) => {
          console.warn('[TodoShortcutsCard] tasks snapshot error:', err);
          setCandidateTodos([]);
          setCandidateLoading(false);
        },
      );
    })().catch((e) => {
      console.error('[TodoShortcutsCard] init error:', e);
      setCandidateTodos([]);
      setCandidateLoading(false);
    });

    return () => {
      isAlive = false;
      if (unsubscribeTasks) unsubscribeTasks();
    };
  }, [uid]);

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of candidateTodos) map.set(t.id, t.name);
    return map;
  }, [candidateTodos]);

  /* --- モーダル候補は「ショートカット登録済みを除外」 --- */
  const availableCandidates = useMemo(() => {
    const selected = new Set(shortcuts.filter(Boolean));
    return candidateTodos.filter((t) => !selected.has(t.id));
  }, [candidateTodos, shortcuts]);

  type TaskCategoryShape = {
    categoryId?: string | null;
    category?: string | null;
    categoryName?: string | null;
    categoryLabel?: string | null;
  };

  const categoryOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of availableCandidates) {
      const c = t as TaskCategoryShape;
      const id = (c?.categoryId ?? c?.category ?? null) ?? null;
      const label =
        (c?.categoryName ?? c?.categoryLabel ?? c?.category ?? '未分類') ?? '未分類';
      if (id && !m.has(id)) m.set(id, String(label));
    }
    return Array.from(m.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => String(a.label ?? '').localeCompare(String(b.label ?? ''), 'ja'));
  }, [availableCandidates]);

  const filteredCandidates = useMemo(() => {
    const q = modalQuery.trim().toLowerCase();
    return availableCandidates.filter((t) => {
      const textOk = q ? (t.name ?? '').toLowerCase().includes(q) : true;

      const c = t as TaskCategoryShape;
      const catId = (c?.categoryId ?? c?.category ?? null) ?? null;
      const catOk = modalSelectedCategoryId === null ? true : catId === modalSelectedCategoryId;

      return textOk && catOk;
    });
  }, [availableCandidates, modalQuery, modalSelectedCategoryId]);

  /* スロット操作 */
  const handleOpenPicker = (slotIndex: number) => {
    setTargetSlot(slotIndex);
    setModalQuery('');
    setModalSelectedCategoryId(null);
    setIsPickerOpen(true);
  };

  const toCompact = (arr: string[]) => arr.filter((s): s is string => !!s);

  const handlePick = async (task: TodoOnlyTask) => {
    if (targetSlot == null) return;

    const next = [...Array(MAX_SLOTS)].map((_, i) => shortcuts[i] ?? '');
    next[targetSlot] = task.id;

    // 重複回避
    for (let i = 0; i < next.length; i++) {
      if (i !== targetSlot && next[i] === task.id) next[i] = '';
    }

    const compact = toCompact(next);

    try {
      const settingsRef = doc(db, 'user_settings', uid);
      const exists = (await getDoc(settingsRef)).exists();
      if (!exists) {
        await setDoc(settingsRef, { todoShortcuts: compact });
      } else {
        await updateDoc(settingsRef, { todoShortcuts: compact });
      }
      toast.success('ショートカットを設定しました');
    } catch (e) {
      toast.error('ショートカットの保存に失敗しました');
      console.error(e);
    } finally {
      setIsPickerOpen(false);
      setTargetSlot(null);
    }
  };

  // ショートカット削除
  const handleRemove = async (slotIndex: number) => {
    try {
      const next = [...shortcuts];
      next[slotIndex] = '';
      const compact = next.filter((s) => !!s);

      const settingsRef = doc(db, 'user_settings', uid);
      const exists = (await getDoc(settingsRef)).exists();
      if (!exists) {
        await setDoc(settingsRef, { todoShortcuts: compact });
      } else {
        await updateDoc(settingsRef, { todoShortcuts: compact });
      }

      toast.success('ショートカットを削除しました');
    } catch (e) {
      console.error('handleRemove error:', e);
      toast.error('削除に失敗しました');
    }
  };

  // タップで TODO タブへ切替＆対象タスクを選択（URL遷移なし）
  const goTodo = useCallback(
    (taskId?: string) => {
      if (taskId) {
        try {
          (view?.setSelectedTaskName)?.(taskId);
        } catch { }
      }
      try {
        (view?.setIndex)?.(2); // 仕様：index=2 が TODO
      } catch { }
    },
    [view],
  );

  // 3スロット配列へ整形
  const slots = useMemo(() => {
    return [...Array(MAX_SLOTS)].map((_, i) => shortcuts[i] ?? '');
  }, [shortcuts]);

  /* レンダリング */
  return (
    <div
      className={[
        'rounded-2xl border border-gray-200 bg-white p-4 shadow-sm',
        'dark:border-white/10 dark:bg-white/[0.05]',
        className,
      ].join(' ')}
    >
      {/* ヘッダ：3カラムで中央揃え（左はダミー、右にアイコンボタン） */}
      <div className="ml-8 mb-3 flex items-center justify-between">
        <div className="flex-1 text-center">
          {/* ▼タイトル右横に？アイコンを追加 */}
          <span className="inline-flex items-center gap-1 text-base font-semibold">
            TODOショートカット
            <HelpPopover
              className="ml-1"
              preferredSide="top"  // 上に出す
              align="center"          // 右寄せで出す（タイトル右端から右側に沿わせるイメージ）
              sideOffset={6}       // タイトルと吹き出しの距離
              offsetX={-30}          // 必要に応じて ± で微調整
              content={
                <div className="space-y-2 text-sm">
                  <p>
                    よく使うTODOを<strong>{MAX_SLOTS}</strong>件まで登録できます。
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>登録したショートカットをタップするとTODOへ移動します。</li>
                  </ul>
                </div>
              }
            />
          </span>
        </div>
        <button
          type="button"
          onClick={() => goTodo()}
          aria-label="TODOタブを開く"
          title="TODOタブを開く"
          className="ml-2 inline-flex items-center justify-center w-8 h-8 rounded-full
                     text-gray-600 hover:text-gray-800
                     hover:bg-black/5 dark:hover:bg:white/10
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <ListTodo className="w-5 h-5" />
        </button>
      </div>

      <div className="flex gap-2">
        {slots.map((taskId, idx) => {
          const filled = !!taskId;
          const label = taskId ? nameById.get(taskId) ?? '(読み込み中...)' : undefined;
          return (
            <SlotButton
              key={idx}
              filled={filled}
              label={label}
              onClick={() => (filled ? goTodo(taskId) : handleOpenPicker(idx))}
              onRemove={filled ? () => handleRemove(idx) : undefined}
            />
          );
        })}
      </div>

      {/* モーダル（登録済みは非表示） */}
      <SlideUpModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        title="TODOを選択"
        rightInfo={
          (() => {
            if (candidateLoading) return '読み込み中';
            const all = availableCandidates.length;
            const shown = filteredCandidates.length;
            return modalQuery || modalSelectedCategoryId !== null ? `一致: ${shown}件` : `候補: ${all}件`;
          })()
        }
      >
        {/* 検索ボックス */}
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2
                      bg-gradient-to-b from-white to-gray-50
                      border border-gray-200
                      shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]"
        >
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={modalQuery}
            onChange={(e) => setModalQuery(e.target.value)}
            placeholder="キーワードで検索"
            className="flex-1 outline-none text-[#5E5E5E] placeholder:text-gray-400 bg-transparent"
            autoFocus
          />
          {modalQuery && (
            <button
              type="button"
              className="text-sm text-gray-600 hover:text-gray-800"
              onClick={() => setModalQuery('')}
            >
              クリア
            </button>
          )}
        </div>

        {/* カテゴリチップ（availableCandidates ベース） */}
        <div className="mt-3">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 -mx-1 px-1">
            <button
              type="button"
              onClick={() => setModalSelectedCategoryId(null)}
              className={`shrink-0 px-3 py-1.5 rounded-full border text-xs transition
                ${modalSelectedCategoryId === null
                  ? 'bg-gradient-to-b from-gray-700 to-gray-900 text-white border-gray-800 shadow-[0_6px_14px_rgba(0,0,0,0.25)]'
                  : 'bg-white text-[#5E5E5E] border-gray-300 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)] hover:bg-gray-50'}
                active:translate-y-[1px]`}
              aria-pressed={modalSelectedCategoryId === null}
              title="すべて"
            >
              すべて
            </button>

            {categoryOptions.map((c, idx) => {
              const active = modalSelectedCategoryId === c.id;
              const { Icon, colorClass, activeBg } = getCategoryMeta(c.label);
              const key =
                typeof c?.id === 'string' || typeof c?.id === 'number'
                  ? String(c.id)
                  : `${c.label}-${idx}`;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setModalSelectedCategoryId(c.id)}
                  className={[
                    'shrink-0 px-3 py-1.5 rounded-full border text-xs transition inline-flex items-center gap-1',
                    active
                      ? `bg-gradient-to-b ${activeBg} text-white border-2 border-transparent shadow-[0_6px_14px_rgba(0,0,0,0.18)]`
                      : 'bg-white text-[#5E5E5E] border-gray-300 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)] hover:bg-gray-50',
                    'active:translate-y-[1px]',
                  ].join(' ')}
                  aria-pressed={active}
                  title={safeText(c.label)}
                >
                  <Icon className={`w-3.5 h-3.5 ${active ? 'text-white' : colorClass}`} />
                  <span>{safeText(c.label)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 一覧グリッド（登録済みは非表示） */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
          {candidateLoading ? (
            <div className="col-span-full text-center text-sm text-gray-500 py-10">読み込み中...</div>
          ) : filteredCandidates.length === 0 ? (
            <div className="col-span-full text-center text-sm text-gray-500 py-10">
              選択可能なTODOがありません
            </div>
          ) : (
            filteredCandidates.map((t) => {
              const catLabel =
                (t.categoryName ?? t.categoryLabel ?? t.category ?? '未分類') ?? '未分類';
              const { Icon, colorClass, label } = getCategoryMeta(catLabel);

              return (
                <button
                  key={t.id}
                  onClick={() => handlePick(t)}
                  className="w-full px-3 py-3 rounded-xl border text-sm font-semibold text-left transition
                             bg-gradient-to-b from-white to-gray-50 text-[#5E5E5E] border-gray-200
                             shadow-[0_2px_1px_rgba(0,0,0,0.1)]
                             hover:shadow-[0_14px_28px_rgba(0,0,0,0.16)]
                             hover:border-[#FFCB7D] active:translate-y-[1px]"
                  title={safeText(t.name)}
                >
                  <span className="line-clamp-2">{safeText(t.name)}</span>
                  <span className="mt-1 block text-[11px] text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <Icon className={`w-3.5 h-3.5 ${colorClass}`} />
                      <span>{label}</span>
                    </span>
                  </span>
                  {Array.isArray(t.todos) ? (
                    <span className="mt-1 block text-[11px] text-gray-500">ToDo数: {t.todos.length}</span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </SlideUpModal>
    </div>
  );
}
