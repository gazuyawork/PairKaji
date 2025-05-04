// src/app/task/page.tsx

'use client';

import Header from '@/components/Header';
import FooterNav from '@/components/FooterNav';
import { CheckCircle, Circle, Search, Calendar } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSwipeable } from 'react-swipeable';

export default function TaskPage() {
  const taskGroups = {
    '毎日': [
      { title: '食器洗い', point: 10, done: false, skipped: false, person: '太郎', image: '/images/taro.png' },
      { title: '夕食準備', point: 15, done: false, skipped: false, person: '太郎', image: '/images/taro.png' },
      { title: '風呂掃除', point: 10, done: true, skipped: false, person: '花子', image: '/images/hanako.png' },
    ],
    '週次': [
      { title: '風呂掃除', point: 10, done: false, skipped: false, person: '未設定', image: '/images/default.png', daysOfWeek: ['火', '木'] },
      { title: '掃除機がけ', point: 10, done: false, skipped: false, person: '未設定', image: '/images/default.png', daysOfWeek: ['土'] },
    ],
    '不定期': [
      { title: '粗大ごみ出し', point: 20, done: false, skipped: false, person: '花子', image: '/images/hanako.png', scheduledDate: '2025-05-10' },
      { title: '家電修理立ち合い', point: 30, done: false, skipped: false, person: '太郎', image: '/images/taro.png', scheduledDate: '2025-05-15' },
    ],
  };

  type Period = '毎日' | '週次' | '不定期';

  type Task = {
    title: string;
    point: number;
    done: boolean;
    skipped: boolean;
    person: string;
    image: string;
    scheduledDate?: string;
    daysOfWeek?: string[];
  };

  const [filter, setFilter] = useState<string | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [tasksState, setTasksState] = useState(taskGroups);
  const [confirmSkip, setConfirmSkip] = useState<{ period: Period; index: number } | null>(null);

  useEffect(() => {
    const handleClickOutside = () => {
      setConfirmSkip(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  const toggleFilter = (period: Period) => {
    setFilter((prev) => (prev === period ? null : period));
  };

  const togglePerson = (person: string) => {
    setPersonFilter((prev) => (prev === person ? null : person));
  };

  const skipTask = (period: Period, index: number) => {
    setTasksState((prev) => {
      const updatedGroup = [...prev[period]];
      updatedGroup[index] = {
        ...updatedGroup[index],
        done: true,
        skipped: true,
      };
      return {
        ...prev,
        [period]: updatedGroup,
      };
    });
    setConfirmSkip(null);
  };

  const toggleDone = (period: Period, index: number) => {
    setTasksState((prev) => {
      const updatedGroup = [...prev[period]];
      const wasSkipped = updatedGroup[index].skipped;
      updatedGroup[index] = {
        ...updatedGroup[index],
        done: !updatedGroup[index].done,
        skipped: wasSkipped ? false : updatedGroup[index].skipped,
      };
      return {
        ...prev,
        [period]: updatedGroup,
      };
    });
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] pb-20">
      <Header title="Task" />

      <main className="flex-1 px-4 py-6 space-y-6">
        <div className="flex items-center border border-[#ccc] rounded-xl px-3 py-2 bg-white">
          <Search className="text-gray-400 mr-2" size={20} />
          <input
            type="text"
            placeholder="検索する家事の名前を入力"
            className="flex-1 outline-none text-sm text-[#5E5E5E] font-sans"
          />
        </div>

        <div className="flex justify-center gap-4 flex-wrap">
          {['毎日', '週次', '不定期'].map((period) => (
            <button
              key={period}
              onClick={() => toggleFilter(period as Period)}
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

        {(filter || personFilter) && (
          <div className="flex justify-center mt-2">
            <button
              onClick={() => {
                setFilter(null);
                setPersonFilter(null);
              }}
              className="text-xs px-3 py-1 bg-gray-200 text-gray-600 rounded-full hover:bg-gray-300 transition"
            >
              フィルター解除
            </button>
          </div>
        )}

        <hr className="border-t border-gray-300 opacity-50 my-4" />

        {Object.entries(tasksState).map(([period, tasks], idx) => {
          const typedPeriod = period as Period;

          if (filter && filter !== period) return null;

          const remainingCount = tasks.filter((task) => !task.done && (!personFilter || task.person === personFilter)).length;

          return (
            <div key={idx}>
              <h2 className="text-lg font-bold text-[#5E5E5E] font-sans mb-2">
                {period}（残り {remainingCount} 件）
              </h2>
              <ul className="space-y-2">
                {tasks
                  .filter((task) => !personFilter || task.person === personFilter)
                  .map((task, index) => {
                    const handlers = useSwipeable({
                      onSwipedLeft: () => {
                        if (!task.done) {
                          setConfirmSkip({ period: typedPeriod, index });
                        }
                      },
                      preventDefaultTouchmoveEvent: true,
                      trackTouch: true,
                    });

                    const isConfirming = confirmSkip?.period === typedPeriod && confirmSkip?.index === index;

                    return (
                      <motion.li
                        key={index}
                        {...handlers}
                        onClick={(e) => {
                          if (isConfirming) return;
                          toggleDone(typedPeriod, index);
                          e.stopPropagation();
                        }}
                        initial={{ scale: 1 }}
                        animate={{
                          scale: task.done ? 0.99 : 1.0,
                          opacity: task.done ? 0.5 : 1,
                        }}
                        transition={{ duration: 0.2 }}
                        className="relative flex justify-between items-center px-4 py-2 rounded-2xl shadow-sm bg-white border border-[#e5e5e5] hover:shadow-md cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          {task.skipped ? (
                            <CheckCircle className="text-red-500" />
                          ) : task.done ? (
                            <CheckCircle className="text-yellow-500" />
                          ) : (
                            <Circle className="text-gray-400" />
                          )}
                          <span className="text-sm text-[#5E5E5E] font-medium font-sans">
                            {task.title}
                          </span>
                          {task.scheduledDate && (
                            <span className="ml-2 text-xs text-gray-400">
                              <Calendar size={12} className="inline mr-1" />
                              {task.scheduledDate.replace(/-/g, '/').slice(5)} 予定
                            </span>
                          )}
                          {task.daysOfWeek && (
                            <div className="flex gap-1 ml-2">
                              {task.daysOfWeek.map((day, i) => (
                                <div
                                  key={i}
                                  className="w-5 h-5 rounded-full bg-[#5E5E5E] text-white text-[10px] flex items-center justify-center"
                                >
                                  {day}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {isConfirming ? (
                            // <button
                            //   onClick={(e) => {
                            //     e.stopPropagation();
                            //     skipTask(typedPeriod, index);
                            //   }}
                            //   className="absolute right-1 top-1 bottom-1 w-14 bg-[#ff6347] text-white font-bold rounded-xl shadow-md flex items-center justify-center z-10"
                            // >
                            //   SKIP
                            // </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                skipTask(typedPeriod, index);
                              }}
                              className="absolute right-1 top-1 bottom-1 w-14 bg-[#ff6347] text-white font-bold rounded-xl shadow-md flex items-center justify-center z-10"
                            >
                              SKIP
                            </button>

                          ) : (
                            <p className="text-sm font-bold text-[#5E5E5E] font-sans">
                              {task.skipped ? 'SKIP' : `${task.point} pt`}
                            </p>
                          )}
                          <img
                            src={task.image}
                            alt={`${task.person}のアイコン`}
                            className="w-8 h-8 rounded-full border border-gray-300 object-cover"
                          />
                        </div>
                      </motion.li>
                    );
                  })}
              </ul>
            </div>
          );
        })}
      </main>

      <FooterNav />
    </div>
  );
}
