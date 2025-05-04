// src/app/task_manage/page.tsx

'use client';

import Header from '@/components/Header';
import FooterNav from '@/components/FooterNav';
import { Search, Plus, Calendar, Trash2 } from 'lucide-react';
import { useState } from 'react';
import TaskCard from '@/components/TaskCard';

export default function TaskManagePage() {
  const [tasks, setTasks] = useState([
    { id: 1, name: '', frequency: '毎日', point: 100, users: ['太郎', '花子'], scheduledDate: '', daysOfWeek: [], isNew: false, isEdited: false, showDelete: false },
    { id: 2, name: '', frequency: '毎日', point: 100, users: ['太郎'], scheduledDate: '', daysOfWeek: [], isNew: false, isEdited: false, showDelete: false },
    { id: 3, name: '', frequency: '毎日', point: 100, users: ['花子'], scheduledDate: '', daysOfWeek: [], isNew: false, isEdited: false, showDelete: false },
  ]);

  const [filter, setFilter] = useState<string | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const addTask = () => {
    const newId = tasks.length + 1;
    setTasks([
      { id: newId, name: '', frequency: '毎日', point: 100, users: ['太郎', '花子'], scheduledDate: '', daysOfWeek: [], isNew: true, isEdited: false, showDelete: false },
      ...tasks,
    ]);
  };

  const updateTask = (id: number, key: string, value: any) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, [key]: value, isEdited: !task.isNew ? true : task.isEdited } : task
      )
    );
  };

  const removeTask = (id: number) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
  };

  const toggleFilter = (period: string) => {
    setFilter((prev) => (prev === period ? null : period));
  };

  const togglePerson = (person: string) => {
    setPersonFilter((prev) => (prev === person ? null : person));
  };

  const handleUserToggle = (id: number, user: string) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id === id) {
          const hasUser = task.users.includes(user);
          const newUsers = hasUser ? task.users.filter((u) => u !== user) : [...task.users, user];
          return { ...task, users: newUsers, isEdited: !task.isNew ? true : task.isEdited };
        }
        return task;
      })
    );
  };

  const toggleDay = (id: number, day: string) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id === id) {
          const hasDay = task.daysOfWeek.includes(day);
          const newDays = hasDay ? task.daysOfWeek.filter((d) => d !== day) : [...task.daysOfWeek, day];
          return { ...task, daysOfWeek: newDays, isEdited: !task.isNew ? true : task.isEdited };
        }
        return task;
      })
    );
  };

  const toggleShowDelete = (id: number) => {
    setTasks((prev) =>
      prev.map((task) => ({ ...task, showDelete: task.id === id ? !task.showDelete : false }))
    );
  };

  const confirmTasks = () => {
    setTasks((prev) => prev.map((task) => ({ ...task, isNew: false, isEdited: false, showDelete: false })));
  };

  const generatePointOptions = () => {
    const options = [];
    for (let i = 0; i <= 100; i += 5) {
      options.push(
        <option key={i} value={i}>
          {i}
        </option>
      );
    }
    return options;
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]">
      <Header title="Edit" />

      <main className="flex-1 px-4 py-4 space-y-4">
        <div className="flex items-center border border-[#ccc] rounded-xl px-3 py-2 bg-white">
          <Search className="text-gray-400 mr-2" size={20} />
          <input
            type="text"
            placeholder="検索する家事の名前を入力"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 outline-none text-sm text-[#5E5E5E] font-sans"
          />
        </div>

        <div className="flex justify-center gap-4 flex-wrap">
          {['毎日', '週次', '不定期'].map((period) => (
            <button
              key={period}
              onClick={() => toggleFilter(period)}
              className={`px-4 py-2 rounded-full font-sans text-sm border ${
                filter === period ? 'bg-[#FFCB7D] text-white' : 'bg-white text-[#5E5E5E]'
              }`}
            >
              {period}
            </button>
          ))}

          {[{ name: '太郎', image: '/images/taro.png' }, { name: '花子', image: '/images/hanako.png' }].map((user) => (
            <button
              key={user.name}
              onClick={() => togglePerson(user.name)}
              className={`w-10 h-10 rounded-full overflow-hidden border ${
                personFilter === user.name ? 'border-[#FFCB7D]' : 'border-gray-300'
              }`}
            >
              <img
                src={user.image}
                alt={`${user.name}のフィルター`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>

        <hr className="border-t border-gray-300 opacity-50 my-4" />

        <div className="space-y-4 pb-34">
          {tasks
            .filter((task) => !filter || task.frequency === filter)
            .filter((task) => !personFilter || task.users.includes(personFilter))
            .filter((task) => task.name.toLowerCase().includes(searchTerm.toLowerCase()))
            .map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onChange={updateTask}
                onRemove={removeTask}
                onToggleUser={handleUserToggle}
                onToggleDay={toggleDay}
                onToggleDelete={toggleShowDelete}
                generatePointOptions={generatePointOptions}
              />
            ))}
        </div>
      </main>

      <div className="fixed bottom-20 left-0 w-full flex justify-center items-center mb-3">
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
