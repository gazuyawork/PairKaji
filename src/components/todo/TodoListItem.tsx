// タイトルだけの1行カード
import clsx from 'clsx';
import { GripVertical as Grip } from 'lucide-react';
import { useCategoryIcon } from './parts/hooks/useTodoSearchAndSort';
import type { TodoOnlyTask } from '@/types/TodoOnlyTask';

type Props = {
  task: TodoOnlyTask;
  undoneCount: number;
  doneCount: number;
  onSelect: (taskId: string) => void;
};

/** 任意プロパティ reader（any を使わずに安全に読む） */
function readStringProp(obj: unknown, key: string): string | null {
  if (typeof obj !== 'object' || obj === null) return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : null;
}

/** category を安全に取得（存在しない場合は null） */
function getCategory(task: TodoOnlyTask): string | null {
  return readStringProp(task, 'category');
}

/** id を安全に取得（id / taskId を順に見る） */
function getTaskId(task: TodoOnlyTask): string | null {
  return readStringProp(task, 'id') ?? readStringProp(task, 'taskId');
}

export default function TodoListItem({ task, undoneCount, doneCount, onSelect }: Props) {
  const category = getCategory(task);
  const { CatIcon, catColor } = useCategoryIcon(category);

  const taskId = getTaskId(task);
  const handleClick = () => {
    if (taskId) onSelect(taskId);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full text-left"
      aria-label={`${task.name} を開く`}
      // id が取れないケースでは押下できないように
      disabled={!taskId}
    >
      <div
        className={clsx(
          'flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 bg-white',
          'hover:bg-gray-50 active:scale-[0.99] transition',
          !taskId && 'opacity-60 cursor-not-allowed'
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Grip size={18} className="text-gray-300" />
          <CatIcon size={16} className={clsx('shrink-0', catColor)} />
          <span className="font-bold text-[#5E5E5E] truncate">{task.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={clsx(
              'inline-block min-w-[20px] text-center text-white rounded-full text-xs px-2 py-0.5',
              undoneCount === 0 ? 'bg-gray-300' : 'bg-red-500'
            )}
          >
            {undoneCount}
          </span>
          <span
            className={clsx(
              'inline-block min-w-[20px] text-center text-white rounded-full text-xs px-2 py-0.5',
              doneCount === 0 ? 'bg-gray-300' : 'bg-blue-500'
            )}
          >
            {doneCount}
          </span>
        </div>
      </div>
    </button>
  );
}
