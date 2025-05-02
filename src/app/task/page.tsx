// src/app/task/page.tsx

'use client';

import Header from '@/components/Header';
import FooterNav from '@/components/FooterNav';
import { CheckCircle, Circle, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useState } from 'react';

export default function TaskPage() {
  const taskGroups = {
    '毎日': [
      { title: '食器洗い', point: 10, done: false, person: '太郎', image: '/images/taro.png' },
      { title: '夕食準備', point: 15, done: false, person: '太郎', image: '/images/taro.png' },
      { title: '風呂掃除', point: 10, done: true, person: '花子', image: '/images/hanako.png' },
    ],
    '毎週': [
      { title: '風呂掃除', point: 10, done: false, person: '未設定', image: '/images/default.png' },
      { title: '************', point: 10, done: false, person: '未設定', image: '/images/default.png' },
    ],
    '毎月': [
      { title: '************', point: 10, done: false, person: '未設定', image: '/images/default.png' },
      { title: '************', point: 10, done: false, person: '未設定', image: '/images/default.png' },
    ],
  };

  type Period = '毎日' | '毎週' | '毎月';

  type Task = {
    title: string;
    point: number;
    done: boolean;
    person: string;
    image: string;
  };

  const [visibleGroups, setVisibleGroups] = useState<Record<Period, boolean>>({
    毎日: true,
    毎週: true,
    毎月: true,
  });

  const [filter, setFilter] = useState<string | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);

  const toggleGroup = (group: Period) => {
    setVisibleGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };
  
  const toggleFilter = (period: Period) => {
    setFilter((prev) => (prev === period ? null : period));
  };

  const togglePerson = (person: string) => {
    setPersonFilter((prev) => (prev === person ? null : person));
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]">
      <Header title="Task" />

      <main className="flex-1 px-4 py-6 space-y-6">
        {/* 検索エリア */}
        <div className="flex items-center border border-[#ccc] rounded-xl px-3 py-2 bg-white">
          <Search className="text-gray-400 mr-2" size={20} />
          <input
            type="text"
            placeholder="検索する家事の名前を入力"
            className="flex-1 outline-none text-sm text-[#5E5E5E] font-sans"
          />
        </div>

        {/* フィルターボタン */}
        <div className="flex justify-center gap-4 flex-wrap">
          {['毎日', '毎週', '毎月'].map((period) => (
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

        {/* 区切り線 */}
        <hr className="border-t border-gray-300 opacity-50 my-4" />

        {/* タスクリスト */}
        {Object.entries(taskGroups).map(([period, tasks], idx) => {
          const typedPeriod = period as Period;

          if (filter && filter !== period) return null;

          return (
            <div key={idx}>
              <button
                onClick={() => toggleGroup(period)}
                className="flex items-center gap-1 text-lg font-bold text-[#5E5E5E] font-sans mb-2"
              >
                {visibleGroups[period] ? (
                  <ChevronDown size={18} className="text-[#5E5E5E]" />
                ) : (
                  <ChevronRight size={18} className="text-[#5E5E5E]" />
                )}
                {period}
              </button>
              {visibleGroups[period] && (
                <ul className="space-y-4">
                  {tasks
                    .filter((task) => !personFilter || task.person === personFilter)
                    .map((task, index) => (
                      <li
                        key={index}
                        className={`flex justify-between items-center px-4 py-3 rounded-2xl shadow-sm bg-white border border-[#e5e5e5] hover:shadow-md cursor-pointer ${task.done ? 'opacity-50' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          {task.done ? (
                            <CheckCircle className="text-yellow-500" />
                          ) : (
                            <Circle className="text-gray-400" />
                          )}
                          <span className="text-sm text-[#5E5E5E] font-medium font-sans">
                            {task.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="text-sm font-bold text-[#5E5E5E] font-sans">
                            {task.point} pt
                          </p>
                          <img
                            src={task.image}
                            alt={`${task.person}のアイコン`}
                            className="w-8 h-8 rounded-full border border-gray-300 object-cover"
                          />
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          );
        })}
      </main>

      <FooterNav />
    </div>
  );
}
