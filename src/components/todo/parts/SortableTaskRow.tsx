'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical as Grip, EyeOff } from 'lucide-react';
import { getCategoryIconInfo } from './utils/categoryIcon';
import type { TodoOnlyTask } from '@/types/TodoOnlyTask';

type Props = {
  task: TodoOnlyTask;
  onClickTitle: (taskId: string) => void;
  onHide: (taskId: string) => void;
};

export default function SortableTaskRow({ task, onClickTitle, onHide }: Props) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: task.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const { Icon: RowIcon, colorClass: rowColor, label: rowLabel } =
    getCategoryIconInfo((task as { category?: string | null }).category ?? null);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition ${
        isDragging ? 'opacity-70' : ''
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2">
        {/* 左: 並び替え + カテゴリアイコン名 + タイトル */}
        <div className="flex items-center gap-2 min-w-0">
          {/* 並び替えハンドル */}
          <button
            type="button"
            title="ドラッグで並び替え"
            className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none"
            {...attributes}
            {...(listeners ?? {})}
          >
            <Grip size={18} />
          </button>

          {/* カテゴリ表示 */}
          <div className="flex items-center gap-1.5 shrink-0">
            <RowIcon size={16} className={rowColor} aria-label={`${rowLabel} カテゴリ`} />
            <span className="text-xs text-gray-500">{rowLabel}</span>
          </div>

          {/* タイトル */}
          <button
            type="button"
            onClick={() => onClickTitle(task.id)}
            className="text-left min-w-0"
            aria-label={`${task.name} を開く`}
          >
            <div className="font-bold text-[#5E5E5E] truncate">{task.name}</div>
          </button>
        </div>

        {/* 非表示ボタン（保存は親側で実行） */}
        <button
          type="button"
          aria-label="このToDoカードを非表示にする"
          title="非表示（データは残ります）"
          className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-red-600 transition"
          onClick={() => onHide(task.id)}
        >
          <EyeOff className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
