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
import type { TodoItem, TodoOnlyTask } from '@/types/TodoOnlyTask';
import { toast } from 'sonner';
import { useView } from '@/context/ViewContext';
import TodoNoteModal from '@/components/todo/parts/TodoNoteModal';
import { useHousehold } from '@/context/HouseholdContext';
import ConfirmModal from '@/components/common/modals/ConfirmModal';
import { jstYmd } from '@/lib/deviceCalendar';
import { createPortal } from 'react-dom';
import SlideUpModal from '@/components/common/modals/SlideUpModal';

const getOrderOrInf = (t: { order?: number } | TodoOnlyTask) =>
  typeof (t as { order?: number }).order === 'number'
    ? ((t as { order?: number }).order as number)
    : Number.POSITIVE_INFINITY;

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
  const tasksRef = useRef<TodoOnlyTask[]>([]);
  tasksRef.current = tasks;
  const todoWritesRef = useRef<Map<string, { todos: TodoItem[]; inflight: number }>>(new Map());
  const todoWriteTailRef = useRef<Map<string, Promise<void>>>(new Map());

  const commitTodos = useCallback((taskId: string, recipe: (current: TodoItem[]) => TodoItem[]) => {
    const pending = todoWritesRef.current.get(taskId)?.todos;
    const fromState = tasksRef.current.find((t) => t.id === taskId)?.todos ?? [];
    const next = recipe(pending ?? fromState);
    const prevInflight = todoWritesRef.current.get(taskId)?.inflight ?? 0;
    todoWritesRef.current.set(taskId, { todos: next, inflight: prevInflight + 1 });
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, todos: next } : t)));

    const tail = todoWriteTailRef.current.get(taskId) ?? Promise.resolve();
    const job = tail
      .catch(() => undefined)
      .then(async () => {
        const latest = todoWritesRef.current.get(taskId)?.todos ?? next;
        await updateDoc(doc(db, 'tasks', taskId), {
          todos: latest,
          updatedAt: serverTimestamp(),
        });
      })
      .catch((e) => {
        console.error(e);
        toast.error('保存に失敗しました');
      })
      .finally(() => {
        const cur = todoWritesRef.current.get(taskId);
        if (!cur) return;
        cur.inflight -= 1;
        if (cur.inflight <= 0) todoWritesRef.current.delete(taskId);
      });
    todoWriteTailRef.current.set(taskId, job);
  }, []);
  const [focusedTodoId, setFocusedTodoId] = useState<string | null>(null);
  const [activeTabs, setActiveTabs] = useState<Record<string, 'undone' | 'done'>>({});
  const todoRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
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
    }).map((t) => {
      const pending = todoWritesRef.current.get(t.id);
      if (pending && pending.inflight > 0) return { ...t, todos: pending.todos };
      return t;
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
                onAddTodo={(todoId, text) => {
                  commitTodos(selectedTask.id, (current) => [
                    { id: todoId, text, done: false },
                    ...current.filter((td) => td.id !== todoId),
                  ]);
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
                onToggleDone={(todoId) => {
                  commitTodos(selectedTask.id, (current) =>
                    current.map((td) => {
                      if (td.id !== todoId) return td;
                      if (td.done) {
                        const next = { ...td, done: false };
                        delete next.completedAt;
                        return next;
                      }
                      return { ...td, done: true, completedAt: jstYmd() };
                    })
                  );
                }}
                onBlurTodo={(todoId, text) => {
                  const trimmed = text.trim();
                  if (!trimmed) return;
                  commitTodos(selectedTask.id, (current) =>
                    current.map((td) => (td.id === todoId ? { ...td, text: trimmed } : td))
                  );
                }}
                onDeleteTodo={(todoId) => {
                  commitTodos(selectedTask.id, (current) => current.filter((td) => td.id !== todoId));
                }}
                todoRefs={todoRefs}
                focusedTodoId={focusedTodoId}
                onReorderTodos={(orderedIds) => {
                  commitTodos(selectedTask.id, (current) => {
                    const idToTodo = current.reduce<Record<string, TodoItem>>((acc, td) => {
                      acc[td.id] = td;
                      return acc;
                    }, {});
                    const ordered = orderedIds
                      .map((id) => idToTodo[id])
                      .filter((td): td is TodoItem => Boolean(td));
                    const rest = current.filter((td) => !orderedIds.includes(td.id));
                    return [...ordered, ...rest];
                  });
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
              <p>このリストを<strong>一覧から非表示</strong>にします。</p>
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
