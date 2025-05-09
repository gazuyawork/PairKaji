import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Circle, Trash2, Plus } from 'lucide-react';
import clsx from 'clsx';
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
  onChangeTodo,
  onToggleDone,
  onBlurTodo,
  onDeleteTodo,
  onDeleteTask,
  todoRefs,
  focusedTodoId,
}: Props) {
  const filteredTodos = task.todos.filter(todo =>
    tab === 'done' ? todo.done : !todo.done
  );

  return (
    <div className="relative">
      <div className="bg-gray-100 rounded-t-xl pl-2 pr-2 border-t border-l border-r border-gray-300 flex justify-between items-center">
        <div className="flex space-x-0">
          {['undone', 'done'].map((type) => (
            <button
              key={type}
              onClick={() => setTab(type as 'undone' | 'done')}
              className={clsx(
                'px-4 py-1 text-sm font-bold border border-gray-300',
                'rounded-t-md w-24',
                type === tab
                  ? 'bg-white text-[#5E5E5E] border-b-transparent z-10'
                  : 'bg-gray-100 text-gray-400 z-0'
              )}
              type="button"
            >
              {type === 'undone' ? '未処理' : '完了'}
            </button>
          ))}
        </div>
        <button
          onClick={onDeleteTask}
          className="text-gray-400 hover:text-red-500 text-xl font-bold"
          type="button"
        >
          ×
        </button>
      </div>

      <div className="bg-white rounded-b-xl shadow-sm border border-gray-300 border-t-0 pt-3 px-4 pb-4 space-y-2">
        <h2 className="font-bold text-[#5E5E5E] text-lg py-2">{task.name}</h2>

        {filteredTodos.length === 0 && tab === 'done' && (
          <div className="text-sm text-gray-400 italic">完了したタスクはありません</div>
        )}

        <AnimatePresence>
          {filteredTodos.map(todo => (
            <motion.div
              key={todo.id}
              className="flex items-center gap-2 mb-4"
              initial={{ opacity: -20, y: 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
            >
              <div
                className="cursor-pointer"
                onClick={() => onToggleDone(todo.id)}
              >
                {todo.done ? (
                  <CheckCircle className="text-yellow-500" />
                ) : (
                  <Circle className="text-gray-400" />
                )}
              </div>
                <input
                type="text"
                value={todo.text}
                onChange={(e) => onChangeTodo(todo.id, e.target.value)}
                onBlur={() => onBlurTodo(todo.id, todo.text)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && todo.text.trim() !== '') {
                    e.preventDefault(); // スマホでも改行を防止
                    onAddTodo(crypto.randomUUID());
                    }
                }}
                ref={(el) => {
                    if (el) todoRefs.current[todo.id] = el;
                    if (focusedTodoId === todo.id) {
                    el?.focus();
                    }
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
            </motion.div>
          ))}
        </AnimatePresence>

        {tab === 'undone' && (
          <button
            onClick={() => onAddTodo(crypto.randomUUID())}
            className="flex items-center gap-2 text-gray-600 hover:text-[#FFCB7D]"
            type="button"
          >
            <Plus size={24} /> TODOを追加
          </button>
        )}
      </div>
    </div>
  );
}