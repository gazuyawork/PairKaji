'use client';

export const dynamic = 'force-dynamic';

import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import {
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import TodoTaskCard from '@/components/todo/parts/TodoTaskCard';
import type { TodoOnlyTask } from '@/types/TodoOnlyTask';
import { toast } from 'sonner';
import { useView } from '@/context/ViewContext';
import TodoNoteModal from '@/components/todo/parts/TodoNoteModal';
import { useHousehold } from '@/context/HouseholdContext';
import ConfirmModal from '@/components/common/modals/ConfirmModal';
import { updateTodoTextInTask } from '@/lib/taskUtils';
import { createPortal } from 'react-dom';
import SlideUpModal from '@/components/common/modals/SlideUpModal';

const getOrderOrInf = (t: { order?: number } | TodoOnlyTask) =>
  typeof (t as { order?: number }).order === 'number'
    ? ((t as { order?: number }).order as number)
    : Number.POSITIVE_INFINITY;

// error ガード
const hasCodeOrMessage = (e: unknown): e is { code?: unknown; message?: unknown } =>
  typeof e === 'object' && e !== null && ('code' in e || 'message' in e);

const normalizeName = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
};

function toTodoOnlyTask(t: {
  id: string;
  name?: unknown;
  period?: TodoOnlyTask['period'];
  todos?: unknown;
  visible?: boolean;
  isTodo?: boolean;
  groupId?: string | null;
  userId?: string;
  private?: boolean;
  order?: number;
  category?: unknown;
  categoryName?: unknown;
  categoryLabel?: unknown;
  categoryId?: unknown;
  type?: unknown;
}): TodoOnlyTask {
  return {
    id: t.id,
    name: normalizeName(t.name),
    period: t.period ?? '毎日',
    todos: Array.isArray(t.todos) ? (t.todos as TodoOnlyTask['todos']) : [],
    visible: t.visible ?? false,
    isTodo: t.isTodo ?? false,
    groupId: t.groupId ?? undefined,
    userId: t.userId ?? '',
    private: t.private,
    ...( {
      order: t.order,
      category: t.category,
      categoryName: t.categoryName,
      categoryLabel: t.categoryLabel,
      categoryId: t.categoryId,
      type: t.type,
    } as Record<string, unknown> ),
  } as TodoOnlyTask;
}

export default function TodoView() {
  const { selectedTaskName, setSelectedTaskName, listOpen, listAddTaskId, closeTaskList, openTaskScreen } = useView();

  const [tasks, setTasks] = useState<TodoOnlyTask[]>([]);
  const [focusedTodoId, setFocusedTodoId] = useState<string | null>(null);
  const [activeTabs, setActiveTabs] = useState<Record<string, 'undone' | 'done'>>({});
  const todoRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteModalTask, setNoteModalTask] = useState<TodoOnlyTask | null>(null);
  const [noteModalTodo, setNoteModalTodo] = useState<{ id: string; text: string } | null>(null);
  const { uid, tasks: householdTasks, tasksReady } = useHousehold();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [, setIsLoading] = useState<boolean>(true);

  const [confirmHide, setConfirmHide] = useState<{ open: boolean; taskId: string | null; source: 'list' | 'detail' | null }>({
    open: false, taskId: null, source: null,
  });
  const [isConfirmProcessing, setIsConfirmProcessing] = useState(false);

  // メモモーダル
  const openNoteModal = (task: TodoOnlyTask, todo: { id: string; text: string }) => {
    setNoteModalTask(task);
    setNoteModalTodo(todo);
    setNoteModalOpen(true);
  };
  const closeNoteModal = () => {
    setNoteModalOpen(false);
    setNoteModalTask(null);
    setNoteModalTodo(null);
  };

  // 背景スクロール制御
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    if (selectedTaskId) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = prev || '';
    return () => { document.body.style.overflow = prev || ''; };
  }, [selectedTaskId, mounted]);

  const jumpToTaskByName = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    openTaskScreen({ search: trimmed });
    setSelectedTaskId(null);
  }, [openTaskScreen]);

  // 世帯タスクを Todo 画面用に整形
  useEffect(() => {
    if (!uid) {
      setTasks([]);
      setIsLoading(false);
      return;
    }
    if (!tasksReady) return;

    const newTasks = householdTasks
      .map((t) => toTodoOnlyTask(t))
      .slice()
      .sort((a, b) => {
      const ao = getOrderOrInf(a as { order?: number });
      const bo = getOrderOrInf(b as { order?: number });
      if (ao !== bo) return ao - bo;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });

    setTasks(newTasks);
    setIsLoading(false);
  }, [uid, householdTasks, tasksReady]);

  // フォーカス復帰
  useEffect(() => {
    if (focusedTodoId && todoRefs.current[focusedTodoId]) {
      requestAnimationFrame(() => { todoRefs.current[focusedTodoId]?.focus(); });
      setFocusedTodoId(null);
    }
  }, [focusedTodoId]);

  // 外部からの選択。Todo タブが初回マウントされた直後は tasks が空でも世帯データで開く
  useEffect(() => {
    if (!listOpen || !selectedTaskName) return;
    if (!tasksReady) return;

    const matchBy = (list: { id: string; name?: string }[]) =>
      list.find((t) => t.id === selectedTaskName) ?? list.find((t) => t.name === selectedTaskName);

    const matched = matchBy(tasks) ?? matchBy(householdTasks);
    if (!matched) {
      if (householdTasks.length > 0 && tasks.length === 0) return;
      setSelectedTaskName('');
      closeTaskList();
      return;
    }

    setSelectedTaskId(matched.id);
    setSelectedTaskName('');
  }, [listOpen, selectedTaskName, setSelectedTaskName, tasks, tasksReady, householdTasks, closeTaskList]);

  // 選択中
  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    const fromState = tasks.find((t) => t.id === selectedTaskId);
    if (fromState) return fromState;
    const fromHousehold = householdTasks.find((t) => t.id === selectedTaskId);
    return fromHousehold ? toTodoOnlyTask(fromHousehold) : null;
  }, [selectedTaskId, tasks, householdTasks]);

  return (
    <>
      {listOpen && noteModalTask && noteModalTodo && (
        <TodoNoteModal
          isOpen={noteModalOpen}
          onClose={closeNoteModal}
          todoText={noteModalTodo.text}
          todoId={noteModalTodo.id}
          taskId={noteModalTask.id}
        />
      )}

      {mounted && listOpen && (
        <SlideUpModal
          isOpen={!!selectedTask}
          onClose={() => {
            setSelectedTaskId(null);
            closeTaskList();
          }}
          title={
            selectedTask ? (
              <button
                type="button"
                onClick={() => jumpToTaskByName(selectedTask.name)}
                className="max-w-[min(60vw,18rem)] truncate text-left"
                title="タップしてタスク画面をこのタスク名で絞り込み表示"
              >
                {selectedTask.name}
              </button>
            ) : (
              'リスト'
            )
          }
          containerClassName="!h-[85vh]"
          bodyClassName="!px-0 !pt-0 !overflow-hidden flex min-h-0 flex-col"
        >
          {selectedTask ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <TodoTaskCard
                inSheet
                startAdding={listAddTaskId === selectedTask.id}
                task={selectedTask}
                tab={activeTabs[selectedTask.id] ?? 'undone'}
                setTab={(tab) => setActiveTabs((prev) => ({ ...prev, [selectedTask.id]: tab }))}
                onOpenNote={(text) => {
                  const todo = selectedTask.todos.find((t) => t.text === text);
                  if (todo) openNoteModal(selectedTask, todo);
                }}
                onAddTodo={async (todoId, text) => {
                  const newTodos = [...selectedTask.todos, { id: todoId, text, done: false }];
                  await updateDoc(doc(db, 'tasks', selectedTask.id), {
                    todos: newTodos,
                    updatedAt: serverTimestamp(),
                  });
                }}
                onChangeTodo={(todoId, value) => {
                  setTasks((prev) =>
                    prev.map((t) =>
                      t.id === selectedTask.id
                        ? {
                            ...t,
                            todos: t.todos.map((td) => (td.id === todoId ? { ...td, text: value } : td)),
                          }
                        : t
                    )
                  );
                }}
                onToggleDone={async (todoId) => {
                  const updatedTodos = selectedTask.todos.map((td) =>
                    td.id === todoId ? { ...td, done: !td.done } : td
                  );
                  await updateDoc(doc(db, 'tasks', selectedTask.id), {
                    todos: updatedTodos,
                    updatedAt: serverTimestamp(),
                  });
                }}
                onBlurTodo={async (todoId, text) => {
                  const trimmed = text.trim();
                  if (!trimmed) return;

                  try {
                    await updateTodoTextInTask(selectedTask.id, todoId, trimmed);
                  } catch (e: unknown) {
                    if (hasCodeOrMessage(e)) {
                      const code = typeof e.code === 'string' ? e.code : undefined;
                      const message = typeof e.message === 'string' ? e.message : undefined;
                      if (code === 'DUPLICATE_TODO' || message === 'DUPLICATE_TODO') {
                        toast.error('既に登録されています。'); return;
                      }
                    }
                    toast.error('保存に失敗しました');
                    console.error(e);
                  }
                }}
                onDeleteTodo={async (todoId) => {
                  const updatedTodos = selectedTask.todos.filter((td) => td.id !== todoId);
                  await updateDoc(doc(db, 'tasks', selectedTask.id), {
                    todos: updatedTodos,
                    updatedAt: serverTimestamp(),
                  });
                }}
                todoRefs={todoRefs}
                focusedTodoId={focusedTodoId}
                onReorderTodos={async (orderedIds) => {
                  const idToTodo = selectedTask.todos.reduce<Record<string, (typeof selectedTask.todos)[number]>>((acc, td) => {
                    acc[td.id] = td; return acc;
                  }, {});
                  const newTodos = orderedIds.map((id) => idToTodo[id]).filter((v): v is (typeof selectedTask.todos)[number] => Boolean(v));
                  setTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? { ...t, todos: newTodos } : t)));

                  try {
                    await updateDoc(doc(db, 'tasks', selectedTask.id), {
                      todos: newTodos, updatedAt: serverTimestamp(),
                    });
                  } catch (e) {
                    console.error('reorder update error:', e);
                    toast.error('並び替えの保存に失敗しました');
                  }
                }}
                onClose={() => {
                  setSelectedTaskId(null);
                  closeTaskList();
                }}
              />
            </div>
          ) : null}
        </SlideUpModal>
      )}

      {/* ConfirmModal */}
      {mounted && listOpen && createPortal(
        <ConfirmModal
          isOpen={confirmHide.open}
          title="確認"
          message={
            <div className="space-y-2 text-left">
              <p>このToDoグループを<strong>一覧から非表示</strong>にします。</p>
              <p className="text-xs text-gray-500">※ データは削除されません。再表示から戻すことができます。</p>
            </div>
          }
          confirmLabel="非表示にする"
          cancelLabel="キャンセル"
          isProcessing={isConfirmProcessing}
          onCancel={() => {
            if (isConfirmProcessing) return;
            setConfirmHide({ open: false, taskId: null, source: null });
          }}
          onConfirm={async () => {
            const taskId = confirmHide.taskId;
            if (!taskId) return;
            try {
              setIsConfirmProcessing(true);
              const payload =
                confirmHide.source === 'detail'
                  ? { visible: false, groupId: null, updatedAt: serverTimestamp() }
                  : { visible: false, updatedAt: serverTimestamp() };
              await updateDoc(doc(db, 'tasks', taskId), payload);
              if (confirmHide.source === 'detail') {
                setSelectedTaskId(null);
                closeTaskList();
              }
              toast.success('カードを非表示にしました。');
            } catch (err) {
              console.error(err);
              toast.error('非表示にできませんでした');
            } finally {
              setIsConfirmProcessing(false);
              setConfirmHide({ open: false, taskId: null, source: null });
            }
          }}
        />,
        document.body
      )}
    </>
  );
}
