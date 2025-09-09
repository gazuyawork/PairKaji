// 追加: 選択タスクの詳細を全画面で見せる器（中身は既存コンポを流用）
import { X } from 'lucide-react';
import type { TodoOnlyTask } from '@/types/TodoOnlyTask';

type Props = {
  task: TodoOnlyTask;
  onClose: () => void;
  // 既存ハンドラ郡を必要に応じて渡す（onAddTodo, onChangeTodo, ...）
};

export default function TodoDetailPanel({ task, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 bg-white flex flex-col"
      role="dialog"
      aria-modal="true"
    >
      <div className="h-12 flex items-center justify-between px-3 border-b">
        <h2 className="font-bold truncate">{task.name}</h2>
        <button type="button" onClick={onClose} aria-label="閉じる" className="p-1">
          <X />
        </button>
      </div>

      {/* ▼ここに、現在の TodoTaskCard の“body部分”を移植（スクロール領域・検索・D&D・追加入力など） */}
      <div className="flex-1 overflow-hidden">
        {/* <TodoTaskBody task={task} ...handlers /> ←分割した本体を入れる */}
      </div>
    </div>
  );
}
