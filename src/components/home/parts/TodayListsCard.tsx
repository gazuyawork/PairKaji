'use client';

import { useMemo } from 'react';
import { ListTodo, ChevronRight } from 'lucide-react';
import { useHousehold } from '@/context/HouseholdContext';
import { useView } from '@/context/ViewContext';
import { countUndoneTodos, taskShowsOnTodoTab } from '@/lib/checklistTask';
import { isTaskScheduledToday, readLastListTaskId } from '@/lib/todayTask';
import type { Task } from '@/types/Task';

function listLabel(task: Task): string {
  const leftover = countUndoneTodos(task.todos);
  if (leftover <= 0) return 'リストを開く';
  return `残り ${leftover} 件`;
}

export default function TodayListsCard() {
  const { uid, tasks, tasksReady } = useHousehold();
  const { openTaskList } = useView();

  const lastId = typeof window !== 'undefined' ? readLastListTaskId() : null;
  const rows = useMemo(() => {
    if (!uid) return [];
    const mine = tasks.filter(
      (t) =>
        (t.userId === uid || (t.userIds ?? []).includes(uid)) &&
        taskShowsOnTodoTab(t) &&
        !t.done &&
        isTaskScheduledToday(t)
    );
    return [...mine].sort((a, b) => {
      if (lastId && a.id === lastId) return -1;
      if (lastId && b.id === lastId) return 1;
      return (a.name ?? '').localeCompare(b.name ?? '', 'ja');
    });
  }, [tasks, uid, lastId]);

  if (!tasksReady || rows.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-md">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <h2 className="text-sm font-semibold text-gray-800">今日のリスト</h2>
        <span className="text-xs text-gray-500">{rows.length} 件</span>
      </div>
      <ul>
        {rows.map((task) => (
          <li key={task.id} className="border-t border-gray-100 first:border-t-0">
            <button
              type="button"
              onClick={() => openTaskList(task.id)}
              className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-gray-50"
            >
              <ListTodo className="h-5 w-5 shrink-0 text-blue-600" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[#5E5E5E]">{task.name}</span>
                <span className="block text-xs text-gray-500">{listLabel(task)}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
