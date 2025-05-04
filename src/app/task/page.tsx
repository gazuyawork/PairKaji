// src/app/task/page.tsx

'use client';

import Header from '@/components/Header';
import FooterNav from '@/components/FooterNav';
import { CheckCircle, Circle, Search, Calendar } from 'lucide-react';
import { useState, useEffect, memo } from 'react';
import { motion } from 'framer-motion';
import { useSwipeable } from 'react-swipeable';

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

const periods: Period[] = ['毎日', '週次', '不定期'];

export default function TaskPage() {
  // 初期タスクグループ（必ず３キーすべてを定義）
  const initialTaskGroups: Record<Period, Task[]> = {
    '毎日': [
      { title: '食器洗い', point: 10, done: false, skipped: false, person: '太郎', image: '/images/taro.png' },
      { title: '夕食準備', point: 15, done: false, skipped: false, person: '太郎', image: '/images/taro.png' },
      { title: '風呂掃除', point: 10, done: true,  skipped: false, person: '花子', image: '/images/hanako.png' },
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

  const [tasksState, setTasksState] = useState<Record<Period, Task[]>>(initialTaskGroups);
  const [periodFilter, setPeriodFilter] = useState<Period | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [confirmSkip, setConfirmSkip] = useState<{ period: Period; index: number } | null>(null);

  // 画面外クリックでスキップ確認を閉じる
  useEffect(() => {
    const handler = () => setConfirmSkip(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // フィルタートグル
  const togglePeriod = (p: Period) => setPeriodFilter(prev => (prev === p ? null : p));
  const togglePerson = (name: string) => setPersonFilter(prev => (prev === name ? null : name));

  // タスクの SKIP 処理
  const skipTask = (period: Period, index: number) => {
    setTasksState(prev => {
      const updated = [...prev[period]];
      updated[index] = { ...updated[index], done: true, skipped: true };
      return { ...prev, [period]: updated };
    });
    setConfirmSkip(null);
  };

  // タスクの完了/未完了トグル
  const toggleDone = (period: Period, index: number) => {
    setTasksState(prev => {
      const updated = [...prev[period]];
      const wasSkipped = updated[index].skipped;
      updated[index] = {
        ...updated[index],
        done: !updated[index].done,
        skipped: wasSkipped ? false : updated[index].skipped,
      };
      return { ...prev, [period]: updated };
    });
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] pb-20">
      <Header title="Task" />

      <main className="flex-1 px-4 py-6 space-y-6">
        {/* 検索ボックス（機能未実装） */}
        <div className="flex items-center border border-[#ccc] rounded-xl px-3 py-2 bg-white">
          <Search className="text-gray-400 mr-2" size={20} />
          <input
            type="text"
            placeholder="検索する家事の名前を入力"
            className="flex-1 outline-none text-sm text-[#5E5E5E] font-sans"
          />
        </div>

        {/* フィルター */}
        <div className="flex justify-center gap-4 flex-wrap">
          {periods.map(p => (
            <button
              key={p}
              onClick={() => togglePeriod(p)}
              className={`px-4 py-2 rounded-full text-sm font-sans border ${
                periodFilter === p ? 'bg-[#FFCB7D] text-white' : 'bg-white text-[#5E5E5E]'
              }`}
            >
              {p}
            </button>
          ))}

          {['太郎', '花子'].map(name => (
            <button
              key={name}
              onClick={() => togglePerson(name)}
              className={`w-10 h-10 rounded-full overflow-hidden border ${
                personFilter === name ? 'border-[#FFCB7D]' : 'border-gray-300'
              }`}
            >
              <img
                src={`/images/${name === '太郎' ? 'taro' : 'hanako'}.png`}
                alt={`${name}のフィルター`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>

        {/* フィルター解除 */}
        {(periodFilter || personFilter) && (
          <div className="flex justify-center mt-2">
            <button
              onClick={() => {
                setPeriodFilter(null);
                setPersonFilter(null);
              }}
              className="text-xs px-3 py-1 bg-gray-200 text-gray-600 rounded-full hover:bg-gray-300 transition"
            >
              フィルター解除
            </button>
          </div>
        )}

        <hr className="border-t border-gray-300 opacity-50 my-4" />

        {/* タスク一覧 */}
        {periods.map(period => {
          // 安全のため undefined ガード
          const rawTasks = tasksState[period] ?? [];
          const list = rawTasks.filter(task =>
            (!periodFilter || periodFilter === period) &&
            (!personFilter || task.person === personFilter)
          );

          if (list.length === 0) return null;

          const remaining = list.filter(task => !task.done).length;

          return (
            <div key={period}>
              <h2 className="text-lg font-bold text-[#5E5E5E] font-sans mb-2">
                {period}（残り {remaining} 件）
              </h2>
              <ul className="space-y-2">
                {list.map((task, idx) => (
                  <TaskItem
                    key={idx}
                    period={period}
                    index={idx}
                    task={task}
                    isConfirming={!!(confirmSkip?.period === period && confirmSkip.index === idx)}
                    onToggle={() => toggleDone(period, idx)}
                    onSkip={() => skipTask(period, idx)}
                    onRequestSkip={() => {
                      if (!task.done) setConfirmSkip({ period, index: idx });
                    }}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </main>

      <FooterNav />
    </div>
  );
}

// ── TaskItem コンポーネント ──
const TaskItem = memo((props: {
  period: Period;
  index: number;
  task: Task;
  isConfirming: boolean;
  onToggle: () => void;
  onSkip: () => void;
  onRequestSkip: () => void;
}) => {
  const { task, isConfirming, onToggle, onSkip, onRequestSkip } = props;
  const handlers = useSwipeable({
    onSwipedLeft: onRequestSkip,
    // preventDefaultTouchmoveEvent: true,
    trackTouch: true,
  });

  return (
    <motion.li
      {...handlers}
      onClick={e => { if (!isConfirming) onToggle(); e.stopPropagation(); }}
      initial={{ scale: 1 }}
      animate={{ scale: task.done ? 0.99 : 1, opacity: task.done ? 0.5 : 1 }}
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
        <span className="text-sm text-[#5E5E5E] font-medium font-sans">{task.title}</span>
        {task.scheduledDate && (
          <span className="ml-2 text-xs text-gray-400">
            <Calendar size={12} className="inline mr-1" />
            {task.scheduledDate.replace(/-/g, '/').slice(5)} 予定
          </span>
        )}
        {task.daysOfWeek && (
          <div className="flex gap-1 ml-2">
            {task.daysOfWeek.map((d, i) => (
              <div
                key={i}
                className="w-5 h-5 rounded-full bg-[#5E5E5E] text-white text-[10px] flex items-center justify-center"
              >
                {d}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        {isConfirming ? (
          <button
            onClick={e => { e.stopPropagation(); onSkip(); }}
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
});
