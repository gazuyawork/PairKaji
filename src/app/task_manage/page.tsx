// src/app/todo/page.tsx

'use client';

import Header from '@/components/Header';
import FooterNav from '@/components/FooterNav';
import { Plus, ArrowLeft } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useSwipeable } from 'react-swipeable';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import SearchBox from '@/components/SearchBox';
import FilterControls from '@/components/FilterControls';
import type { Period } from '@/types/Task';

interface Task {
  id: number;
  name: string;
  frequency: '毎日' | '週次' | '不定期';
  point: number;
  users: string[];
  daysOfWeek: string[];
  dates: string[];
  isNew: boolean;
  isEdited: boolean;
  showDelete: boolean;
}

interface TaskCardProps {
  task: Task;
  onChange: (id: number, key: keyof Task, value: string | number | string[] | boolean) => void;
  onRemove: (id: number) => void;
  onToggleUser: (id: number, user: string) => void;
  onToggleDay: (id: number, day: string) => void;
  onToggleDelete: (id: number) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onChange,
  onRemove,
  onToggleUser,
  onToggleDay,
  onToggleDelete,
}) => {
  const days = ['月', '火', '水', '木', '金', '土', '日'];

  const handlers = useSwipeable({
    onSwipedLeft: () => onToggleDelete(task.id),
    onSwipedRight: () => onToggleDelete(task.id),
    delta: 50,
  });

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    onChange(task.id, 'dates', [newDate]);
  };

  return (
    <div
      {...handlers}
      onClick={() => task.showDelete && onToggleDelete(task.id)}
      className="relative bg-white shadow rounded-2xl px-4 py-3 space-y-2 flex flex-col"
    >
      {(task.isNew || task.isEdited) && (
        <div
          className={`absolute -top-2 -left-2 w-4 h-4 rounded-full ${
            task.isNew ? 'bg-red-400' : 'bg-blue-400'
          }`}
        />
      )}

      {task.showDelete && (
        <button
          className="absolute right-2 top-2 w-20 h-18 bg-[#ff6347] text-white font-bold rounded-xl shadow-md flex items-center justify-center z-10"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(task.id);
          }}
        >
          削除
        </button>
      )}

      <div className="flex justify-between items-start">
        <input
          type="text"
          value={task.name}
          placeholder="ここに家事を入力する"
          onChange={(e) => onChange(task.id, 'name', e.target.value)}
          className="flex-1 text-[#5E5E5E] placeholder-gray-300 outline-none bg-transparent border-b border-gray-300"
        />
      </div>

      <div className="flex items-center justify-between">
        <select
          value={task.frequency}
          onChange={(e) => onChange(task.id, 'frequency', e.target.value as Task['frequency'])}
          className="bg-transparent outline-none border-b border-gray-300"
        >
          {['毎日', '週次', '不定期'].map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>

        <div className="flex items-center w-20">
          <select
            value={task.point}
            onChange={(e) => onChange(task.id, 'point', Number(e.target.value))}
            className="w-20 bg-transparent outline-none border-b border-gray-300"
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((val) => (
              <option key={val} value={val}>{val}</option>
            ))}
          </select>
          <span className="ml-1">pt</span>
        </div>

        <div className="flex gap-2">
          {[{ name: '太郎', image: '/images/taro.png' }, { name: '花子', image: '/images/hanako.png' }].map(
            (user) => (
              <button
                key={user.name}
                onClick={() => onToggleUser(task.id, user.name)}
                className={`w-8.5 h-8.5 rounded-full border overflow-hidden ${
                  task.users.includes(user.name)
                    ? 'border-[#FFCB7D] opacity-100'
                    : 'border-gray-300 opacity-30'
                }`}
              >
                <Image 
                  src={user.image} 
                  alt={user.name} 
                  width={32} 
                  height={32} 
                  className="object-cover w-full h-full" 
                />
              </button>
            )
          )}
        </div>
      </div>

      {task.frequency === '週次' && (
        <div className="flex gap-2 pt-1">
          {days.map((day) => (
            <button
              key={day}
              onClick={() => onToggleDay(task.id, day)}
              className={`w-6 h-6 rounded-full text-xs font-bold ${
                task.daysOfWeek.includes(day)
                  ? 'bg-[#5E5E5E] text-white'
                  : 'bg-gray-200 text-gray-600'
              }`}
            >
              {day}
            </button>
          ))}
        </div>
      )}

      {task.frequency === '不定期' && (
        <div className="pt-1">
          <label className="text-sm text-gray-600">日付選択：</label>
          <input
            type="date"
            value={task.dates[0] || ''}
            onChange={handleDateChange}
            className="ml-2 border-b border-gray-300 px-2 py-1 text-sm bg-transparent focus:outline-none"
          />
        </div>
      )}
    </div>
  );
};

TaskCard.displayName = 'TaskCard';

export default function TaskManagePage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([
    { id: 1, name: '', frequency: '毎日', point: 100, users: ['太郎'], daysOfWeek: [], dates: [], isNew: false, isEdited: false, showDelete: false },
    { id: 2, name: '', frequency: '毎日', point: 100, users: ['花子'], daysOfWeek: [], dates: [], isNew: false, isEdited: false, showDelete: false },
    { id: 3, name: '', frequency: '毎日', point: 100, users: ['太郎', '花子'], daysOfWeek: [], dates: [], isNew: false, isEdited: false, showDelete: false },
    { id: 4, name: '', frequency: '毎日', point: 100, users: ['太郎', '花子'], daysOfWeek: [], dates: [], isNew: false, isEdited: false, showDelete: false },
  ]);

  const [filter, setFilter] = useState<Period | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const addTask = () => {
    const newId = tasks.length + 1;
    setTasks([
      {
        id: newId,
        name: '',
        frequency: '毎日',
        point: 100,
        users: ['太郎', '花子'],
        daysOfWeek: [],
        dates: [],
        isNew: true,
        isEdited: false,
        showDelete: false,
      },
      ...tasks,
    ]);
  };
  

  const updateTask = (
    id: number,
    key: keyof Task,
    value: string | number | string[] | boolean
  ) => {  
    setTasks(prev =>
      prev.map(task =>
        task.id === id ? { ...task, [key]: value, isEdited: !task.isNew ? true : task.isEdited } : task
      )
    );
  };

  const removeTask = (id: number) => {
    setTasks(prev => prev.filter(task => task.id !== id));
  };

  const toggleFilter = (period: Period | null) => {
    setFilter(prev => (prev === period ? null : period));
  };
  
  const togglePerson = (person: string | null) => {
    setPersonFilter(prev => (prev === person ? null : person));
  };
  
  const handleUserToggle = (id: number, user: string) => {
    setTasks(prev =>
      prev.map(task => {
        if (task.id === id) {
          const newUsers = task.users.includes(user)
            ? task.users.filter(u => u !== user)
            : [...task.users, user];
          return { ...task, users: newUsers, isEdited: !task.isNew ? true : task.isEdited };
        }
        return task;
      })
    );
  };

  const toggleDay = (id: number, day: string) => {
    setTasks(prev =>
      prev.map(task => {
        if (task.id === id) {
          const newDays = task.daysOfWeek.includes(day)
            ? task.daysOfWeek.filter(d => d !== day)
            : [...task.daysOfWeek, day];
          return { ...task, daysOfWeek: newDays, isEdited: !task.isNew ? true : task.isEdited };
        }
        return task;
      })
    );
  };

  const toggleShowDelete = (id: number) => {
    setTasks(prev =>
      prev.map(task => ({
        ...task,
        showDelete: task.id === id ? !task.showDelete : false,
      }))
    );
  };

  const confirmTasks = () => {
    setTasks(prev =>
      prev.map(task => ({ ...task, isNew: false, isEdited: false, showDelete: false }))
    );
  };

  const clearFilters = () => {
    setFilter(null);
    setPersonFilter(null);
    setSearchTerm('');
  };


  useEffect(() => {
    const handleClickOutside = () => {
      setTasks(prev =>
        prev.map(task =>
          task.showDelete ? { ...task, showDelete: false } : task
        )
      );
    };
  
    window.addEventListener('click', handleClickOutside);
  
    return () => {
      window.removeEventListener('click', handleClickOutside);
    };
  }, []);
  
  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]">
      <Header title="Edit" />

      <main className="flex-1 px-4 py-6 space-y-4 overflow-y-auto">

      <SearchBox value={searchTerm} onChange={setSearchTerm} />

      <FilterControls
        periodFilter={filter}
        personFilter={personFilter}
        onTogglePeriod={toggleFilter}
        onTogglePerson={togglePerson}
        extraButton={
          <button
            onClick={() => router.push('/task')}
            className="text-sm text-gray-600 hover:text-[#FFCB7D] flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            タスク一覧へ
          </button>
        }
      />

        {(filter || personFilter || searchTerm) && (
          <div className="flex justify-center mt-2">
            <button
              onClick={clearFilters}
              className="text-xs px-3 py-1 bg-gray-200 text-gray-600 rounded-full hover:bg-gray-300 transition"
            >
              フィルター解除
            </button>
          </div>
        )}

        <hr className="border-t border-gray-300 opacity-50 my-4" />

        <div className="space-y-2.5 pb-30">
          {tasks
            .filter(task => !filter || task.frequency === filter)
            .filter(task => !personFilter || task.users.includes(personFilter))
            .filter(task => task.name.toLowerCase().includes(searchTerm.toLowerCase()))
            .map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onChange={updateTask}
                onRemove={removeTask}
                onToggleUser={handleUserToggle}
                onToggleDay={toggleDay}
                onToggleDelete={toggleShowDelete}
              />
            ))}
        </div>
      </main>

      <div className="fixed bottom-20 left-0 w-full flex justify-center items-center mb-1">
        <button
          onClick={confirmTasks}
          className="w-[300px] bg-[#FFCB7D] text-white font-bold py-3 rounded-xl shadow-lg"
        >
          OK
        </button>
        <button
          onClick={addTask}
          className="ml-4 w-12 h-12 bg-[#FFCB7D] text-white rounded-full flex items-center justify-center shadow-lg"
        >
          <Plus size={24} />
        </button>
      </div>

      <FooterNav />
    </div>
  );
}
