import { CheckCircle, Circle, Trash2, Plus } from 'lucide-react';
import clsx from 'clsx';
import { useRef, useState, useEffect } from 'react';
import type { TodoOnlyTask } from '@/types/TodoOnlyTask';

type Props = {
  task: TodoOnlyTask;
  tab: 'undone' | 'done';
  setTab: (tab: 'undone' | 'done') => void;
  onAddTodo: (todoId: string) => void;
  onChangeTodo: (todoId: string, value: string) => void;
  onToggleDone: (todoId: string) => void;
  onBlurTodo: (todoId: string, text: string) => void;
  onDeleteTodo: (todoId: string) => void;
  onDeleteTask: () => void;
  todoRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  focusedTodoId: string | null;
};

export default function TodoTaskCard({
  task,
  tab,
  setTab,
  onAddTodo,
  // onChangeTodo,
  onToggleDone,
  onBlurTodo,
  onDeleteTodo,
  onDeleteTask,
  todoRefs,
  focusedTodoId,
}: Props) {
  const todos = task.todos ?? [];
  const [isComposing, setIsComposing] = useState(false);
  const [localTexts, setLocalTexts] = useState<Record<string, string>>({});

  const undoneCount = todos.filter(todo => !todo.done).length;
  const doneCount = todos.filter(todo => todo.done).length;
  const filteredTodos = tab === 'done'
    ? todos.filter(todo => todo.done)
    : todos.filter(todo => !todo.done);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [isScrollable, setIsScrollable] = useState(false);

  // useEffect(() => {
  //   const initialTexts = todos.reduce((acc, todo) => {
  //     acc[todo.id] = todo.text;
  //     return acc;
  //   }, {} as Record<string, string>);
  //   setLocalTexts(initialTexts);
  // }, [todos]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      const checkScroll = () => {
        setIsScrollable(el.scrollHeight > el.clientHeight);
      };
      checkScroll();
      window.addEventListener('resize', checkScroll);
      return () => window.removeEventListener('resize', checkScroll);
    }
  }, [filteredTodos.length]);

  return (
    <div className="relative">
      {/* ヘッダー */}
      <div className="bg-gray-100 rounded-t-xl pl-2 pr-2 border-t border-l border-r border-gray-300 flex justify-between items-center">
        <h2 className="font-bold text-[#5E5E5E] pl-2 truncate whitespace-nowrap overflow-hidden max-w-[40%]">
          {task.name}
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex space-x-0">
            {['undone', 'done'].map((type) => {
              const count = type === 'undone' ? undoneCount : doneCount;
              return (
                <button
                  key={type}
                  onClick={() => setTab(type as 'undone' | 'done')}
                  className={clsx(
                    'relative pl-5 py-1 text-sm font-bold border border-gray-300',
                    'rounded-t-md w-22 flex items-center justify-center',
                    type === tab
                      ? 'bg-white text-[#5E5E5E] border-b-transparent z-10'
                      : 'bg-gray-100 text-gray-400 z-0'
                  )}
                  type="button"
                >
                  <span className="absolute left-2 inline-block min-w-[20px] h-[20px] text-xs leading-[20px] text-white bg-[#5E5E5E] rounded-full text-center">
                    {count}
                  </span>
                  {type === 'undone' ? '未処理' : '完了'}
                </button>
              );
            })}
          </div>
          <button
            onClick={onDeleteTask}
            className="text-gray-400 hover:text-red-500 text-xl font-bold"
            type="button"
          >
            ×
          </button>
        </div>
      </div>

      {/* 本体 */}
      <div className="bg-white rounded-b-xl shadow-sm border border-gray-300 border-t-0 pt-3 px-4 pb-4 space-y-2">
        <div
          ref={scrollRef}
          className={clsx(
            'max-h-[30vh] space-y-4 pr-2 scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100',
            isScrollable ? 'overflow-y-scroll' : 'overflow-y-auto'
          )}
        >
          {filteredTodos.length === 0 && tab === 'done' && (
            <div className="text-sm text-gray-400 italic">完了したタスクはありません</div>
          )}

          {filteredTodos.map(todo => (
            <div key={todo.id} className="flex items-center gap-2">
              <div className="cursor-pointer" onClick={() => onToggleDone(todo.id)}>
                {todo.done ? (
                  <CheckCircle className="text-yellow-500" />
                ) : (
                  <Circle className="text-gray-400" />
                )}
              </div>
              <input
                type="text"
                value={localTexts[todo.id] ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setLocalTexts((prev) => ({ ...prev, [todo.id]: val }));
                }}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => {
                  setIsComposing(false);
                  onBlurTodo(todo.id, localTexts[todo.id] ?? '');
                }}
                onBlur={() => {
                  if (!isComposing) {
                    onBlurTodo(todo.id, localTexts[todo.id] ?? '');
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && localTexts[todo.id]?.trim()) {
                    e.preventDefault();
                    onAddTodo(crypto.randomUUID());
                  }
                }}
                ref={(el) => {
                  if (el) todoRefs.current[todo.id] = el;
                  if (focusedTodoId === todo.id) el?.focus();
                }}
                className={clsx(
                  'flex-1 border-b bg-transparent outline-none border-gray-200',
                  todo.done ? 'text-gray-400 line-through' : 'text-black'
                )}
                placeholder="TODOを入力"
              />
              <button onClick={() => onDeleteTodo(todo.id)} type="button">
                <Trash2 size={18} className="text-gray-400 hover:text-red-500" />
              </button>
            </div>
          ))}
        </div>

        {/* 追加ボタン */}
        {tab === 'undone' && (
          <div className="relative flex items-center justify-between">
            <button
              onClick={() => onAddTodo(crypto.randomUUID())}
              className="flex items-center gap-2 text-gray-600 hover:text-[#FFCB7D]"
              type="button"
            >
              <Plus size={24} /> TODOを追加
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
