// src/components/home/parts/TodoShortcutsCard.tsx
'use client';

import { useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
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
  todos?: Array<{ id: string; text: string; done?: boolean }> | unknown[];
};

type Props = {
  /** 明示的に渡す場合。未指定なら auth コンテキスト等の Hook を使う実装に差し替えてください */
  uid: string;
  className?: string;
};

const MAX_SLOTS = 3;

/* =========================
   ユーティリティ
   ========================= */
function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="ml-2 inline-flex items-center rounded-full border px-2 text-xs text-gray-600 bg-white/60 dark:bg-white/10 dark:text-gray-200">
      {children}
    </span>
  );
}

function normalizeName(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

/* =========================
   スロット（小さいカード）
   ========================= */
function SlotButton(props: {
  filled: boolean;
  label?: string;
  onClick: () => void;
  onRemove?: () => void;
}) {
  const { filled, label, onClick, onRemove } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group relative flex h-20 flex-1 items-center justify-center rounded-xl border',
        'bg-white/80 dark:bg-white/[0.06] backdrop-blur',
        'hover:shadow-md transition-shadow',
        filled
          ? 'border-gray-300 dark:border-white/15'
          : 'border-dashed border-gray-300 dark:border-white/15',
      ].join(' ')}
    >
      {filled ? (
        <>
          <span className="max-w-[90%] truncate px-3 text-sm text-gray-800 dark:text-gray-100">
            {label}
          </span>
          {onRemove && (
            <span className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                aria-label="ショートカットを削除"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="inline-flex items-center rounded-full p-1 text-gray-500 hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X size={14} />
              </button>
            </span>
          )}
        </>
      ) : (
        <span className="flex items-center gap-1 text-gray-500 dark:text-gray-300">
          <Plus size={18} />
          追加
        </span>
      )}
    </button>
  );
}

/* =========================
   モーダル内の候補行
   ========================= */
function TodoPickRow({ task, onPick }: { task: TodoOnlyTask; onPick: (t: TodoOnlyTask) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(task)}
      className="flex w-full items-center justify-between rounded-lg border border-transparent px-3 py-2 text-left hover:border-gray-200 hover:bg-black/5 dark:hover:bg-white/[0.06]"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{task.name}</div>
        <div className="mt-0.5 text-xs text-gray-500">
          {task.category ? <>カテゴリ: {task.category}</> : <>カテゴリ: 未設定</>}
          {Array.isArray(task.todos) ? <Badge>Todo数: {task.todos.length}</Badge> : null}
        </div>
      </div>
    </button>
  );
}

/* =========================
   本体
   ========================= */
export default function TodoShortcutsCard({ uid, className = '' }: Props) {
  const router = useRouter();

  // ショートカット（taskIdの配列）
  const [shortcuts, setShortcuts] = useState<string[]>([]);
  // 候補タスク
  const [candidateTodos, setCandidateTodos] = useState<TodoOnlyTask[]>([]);
  const [candidateLoading, setCandidateLoading] = useState<boolean>(true);

  // モーダル制御（命名衝突回避）
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [targetSlot, setTargetSlot] = useState<number | null>(null);

  /* ---------------------------
   * Firestore: user_settings/{uid} 監視
   * -------------------------- */
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

  /* ---------------------------
   * Firestore: ペア確定ユーザーIDの収集 → tasks を購読
   * 参考コードのロジックに準拠（pairs から confirmed を取得し userId in で tasks を購読）
   * -------------------------- */
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

      // 1) confirmed ペアに含まれる userId を収集
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

      // Firestore の in 演算子は最大10件まで
      const ids = Array.from(userIds).slice(0, 10);

      // 2) tasks を購読（userId in ids）
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
              todos: Array.isArray(raw.todos) ? (raw.todos as any[]) : [],
            };

            // 参考実装に準拠：表示対象は
            // - visible === true（一覧に出ている ToDo グループ）
            // - 自分のタスク or private でない共有タスク
            const ownerOk = task.userId === uid || task.private !== true;
            const visibleOk = task.visible !== false; // undefined は true とみなす
            const hasTodos = Array.isArray(task.todos) && task.todos.length > 0;
            const markedTodo = task.isTodo === true || task.type === 'todo';

            if (ownerOk && visibleOk && (hasTodos || markedTodo)) {
              list.push(task);
            }
          });

          // 名前でソート
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

  /* ---------------------------
   * スロット操作
   * -------------------------- */
  const handleOpenPicker = (slotIndex: number) => {
    setTargetSlot(slotIndex);
    setIsPickerOpen(true);
  };

  const toCompact = (arr: string[]) => arr.filter((s): s is string => !!s);

  const handlePick = async (task: TodoOnlyTask) => {
    if (targetSlot == null) return;

    const next = [...Array(MAX_SLOTS)].map((_, i) => shortcuts[i] ?? '');
    next[targetSlot] = task.id;

    // 重複回避：他スロットに同一IDがあれば空にする
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

  const handleRemove = async (slotIndex: number) => {
    const next = [...Array(MAX_SLOTS)].map((_, i) => shortcuts[i] ?? '');
    next[slotIndex] = '';
    const compact = toCompact(next);
    try {
      const settingsRef = doc(db, 'user_settings', uid);
      const exists = (await getDoc(settingsRef)).exists();
      if (!exists) {
        await setDoc(settingsRef, { todoShortcuts: compact });
      } else {
        await updateDoc(settingsRef, { todoShortcuts: compact });
      }
      toast.success('ショートカットを削除しました');
    } catch (e) {
      toast.error('削除に失敗しました');
      console.error(e);
    }
  };

  const goTodo = useCallback(
    (taskId?: string) => {
      const qs = taskId ? `?focusTask=${encodeURIComponent(taskId)}` : '';
      router.push(`/todo${qs}`);
    },
    [router],
  );

  // 3スロット配列へ整形
  const slots = useMemo(() => {
    return [...Array(MAX_SLOTS)].map((_, i) => shortcuts[i] ?? '');
  }, [shortcuts]);

  /* ---------------------------
   * レンダリング
   * -------------------------- */
  return (
    <div
      className={[
        'rounded-2xl border border-gray-200 bg-white p-4 shadow-sm',
        'dark:border-white/10 dark:bg-white/[0.05]',
        className,
      ].join(' ')}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="text-base font-semibold">TODOショートカット</div>
        <button
          type="button"
          className="text-xs text-gray-500 underline decoration-dotted underline-offset-4 hover:text-gray-700 dark:text-gray-300"
          onClick={() => goTodo()}
        >
          TODO画面を開く
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

      {/* モーダル（スロットタップで開く） */}
      <SlideUpModal isOpen={isPickerOpen} onClose={() => setIsPickerOpen(false)} title="TODOを選択">
        <div className="space-y-2">
          {candidateLoading ? (
            <div className="py-8 text-center text-sm text-gray-500">読み込み中...</div>
          ) : candidateTodos.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              選択可能なTODOがありません
            </div>
          ) : (
            candidateTodos.map((t) => <TodoPickRow key={t.id} task={t} onPick={handlePick} />)
          )}
        </div>
      </SlideUpModal>
    </div>
  );
}
