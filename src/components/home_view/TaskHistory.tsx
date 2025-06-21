'use client';

import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  addWeeks,
  isWithinInterval
} from 'date-fns';
import Image from 'next/image';

interface CompletionLog {
  taskId: string;
  taskName?: string;
  date: string;
  point: number;
  userId: string;
  completedAt?: string;
  person?: string;
}

export default function TaskHistory() {
  const [logs, setLogs] = useState<CompletionLog[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);

  const today = new Date();
  const weekStart = startOfWeek(addWeeks(today, weekOffset), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(addWeeks(today, weekOffset), { weekStartsOn: 1 });

  useEffect(() => {
    const fetchLogs = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const q = query(collection(db, 'taskCompletions'), where('userId', '==', uid));
      const snapshot = await getDocs(q);

      const weeklyLogs = snapshot.docs
        .map(doc => doc.data() as CompletionLog)
        .filter(log => {
          const logDate = parseISO(log.date);
          return isWithinInterval(logDate, { start: weekStart, end: weekEnd });
        })
        .sort((a, b) => b.date.localeCompare(a.date));

      setLogs(weeklyLogs);
    };

    fetchLogs();
  }, [weekStart, weekEnd]);


  const getProfileImage = (person?: string) => {
    if (person === '太郎') return localStorage.getItem('profileImage') || '/images/taro.png';
    if (person === '花子') return localStorage.getItem('partnerImage') || '/images/hanako.png';
    return '/images/default.png';
  };

  const groupedByDate = logs.reduce<Record<string, CompletionLog[]>>((acc, log) => {
    const dateLabel = format(parseISO(log.date), 'yyyy-MM-dd');
    if (!acc[dateLabel]) acc[dateLabel] = [];
    acc[dateLabel].push(log);
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  const generateWeekOptions = () => {
    const options = [];
    for (let i = 0; i <= 12; i++) {
      const offset = -i;
      const start = startOfWeek(addWeeks(today, offset), { weekStartsOn: 1 });
      const end = endOfWeek(addWeeks(today, offset), { weekStartsOn: 1 });
      options.push({
        value: offset,
        label: `${format(start, 'yyyy年 M/dd')} ~ ${format(end, 'M/dd')}`,
      });
    }
    return options;
  };

  return (
    // <div className="bg-white p-4 rounded-xl shadow-md text-center mb-5 h-[calc(100vh-200px)] overflow-y-auto">
    <div className="h-full flex flex-col bg-white p-4 rounded-xl shadow-md text-center  overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <button
          className="text-sm text-gray-500 hover:bg-gray-200 px-2 py-1 rounded w-[60px] text-left"
          onClick={() => setWeekOffset(weekOffset - 1)}
        >
          {'<'} 先週
        </button>

        <h2 className="text-lg font-bold text-[#5E5E5E] flex items-center gap-2">
          完了履歴
        </h2>

        <div className="w-[60px] text-right">
          {weekOffset < 0 ? (
            <button
              className="text-sm text-gray-500 hover:bg-gray-200 px-2 py-1 rounded"
              onClick={() => setWeekOffset(weekOffset + 1)}
            >
              翌週 {'>'}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mb-6">
        <select
            value={weekOffset}
            onChange={(e) => setWeekOffset(Number(e.target.value))}
            className="ml-1 text-sm border-b border-gray-400 bg-transparent outline-none appearance-none"
            >
            {generateWeekOptions().map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
        </select>
    </div>


        {weekOffset < 0 && (
        <div
            className="text-sm bg-gray-500 text-white hover:bg-gray-600 px-4 py-2 rounded-full cursor-pointer inline-block mb-10 shadow"
            onClick={() => setWeekOffset(0)}
        >
            今週に戻る
        </div>
        )}


      {logs.length === 0 ? (
        <p className="text-gray-400 mb-10">この週の履歴はありません</p>
      ) : (
        <div className="text-left space-y-4">
          {sortedDates.map(date => (
            <div key={date}>
              <h3 className="font-semibold text-gray-600 mb-2">
                {format(parseISO(date), 'M/d (E)')}
              </h3>
              <ul className="space-y-2">
                {groupedByDate[date].map((log, idx) => (
                  <li
                    key={idx}
                    className="flex items-center gap-4 border-b pb-1 text-[#5E5E5E]"
                  >
                    <div className="w-[100px] truncate text-ellipsis overflow-hidden whitespace-nowrap">
                      {log.taskName ?? '（タスク名なし）'}
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <div className="w-[60px] text-right text-gray-600 pr-4-4">{log.point}pt</div>
                        <div className="w-[36px] h-[36px] flex-shrink-0">
                        <Image
                            src={getProfileImage(log.person)}
                            alt="icon"
                            width={38}
                            height={38}
                            className="rounded-full border border-gray-300 object-cover w-full h-full"
                            style={{ aspectRatio: '1 / 1' }}
                        />
                        </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
