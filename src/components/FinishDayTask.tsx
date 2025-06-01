'use client';

import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { collection, getDocs, query, where, onSnapshot } from 'firebase/firestore'; // ⭐ onSnapshotをまとめてimport
import { parseISO, isSameDay } from 'date-fns';
import Image from 'next/image';
import type { Task } from '@/types/Task';
import { useProfileImages } from '@/hooks/useProfileImages';
import { fetchPairUserIds } from '@/lib/taskUtils'; // ⭐ 追加

interface CompletionLog {
  taskId: string;
  taskName?: string;
  date: string;
  point: number;
  userId: string;
  completedAt?: string;
  person?: string;
}

type Props = {
  tasks: Task[];
};

export default function FinishDayTask({ tasks }: Props) {
  const [logs, setLogs] = useState<CompletionLog[]>([]);
  const { profileImage, partnerImage } = useProfileImages();

  useEffect(() => {
    const fetchAndSubscribe = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      // 表示対象タスクのID一覧を作成
      const taskIds = tasks.map(task => task.id);
      if (taskIds.length === 0) return;

      // Firestoreの仕様で `in` クエリは最大10件までなので、分割処理も視野に（今はシンプルに対応）
      const q = query(
        collection(db, 'taskCompletions'),
        where('taskId', 'in', taskIds) // ⭐ ここをtaskIdベースに変更
      );

      const today = new Date();

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const todayLogs = snapshot.docs
          .map(doc => doc.data() as CompletionLog)
          .filter(log => isSameDay(parseISO(log.date), today))
          .sort((a, b) => b.date.localeCompare(a.date));

        setLogs(todayLogs);
      });

      return unsubscribe;
    };

    let unsubscribe: (() => void) | undefined;
    fetchAndSubscribe().then(unsub => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [tasks]); // ⭐ tasksを依存に追加


  useEffect(() => {
    const fetchLogs = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const partnerUids = await fetchPairUserIds(uid); // ⭐ ペアユーザーID取得
      if (!partnerUids.includes(uid)) partnerUids.push(uid); // ⭐ 自分も含める

      const q = query(
        collection(db, 'taskCompletions'),
        where('userId', 'in', partnerUids) // ⭐ 修正: 自分 + ペア相手
      );

      const snapshot = await getDocs(q);

      const today = new Date();
      const todayLogs = snapshot.docs
        .map(doc => doc.data() as CompletionLog)
        .filter(log => isSameDay(parseISO(log.date), today))
        .sort((a, b) => b.date.localeCompare(a.date));

      setLogs(todayLogs);
    };

    fetchLogs();
  }, [tasks]); // tasksが変わるたびに再取得

  return (
    <div className="flex flex-col bg-white rounded-xl shadow-md overflow-hidden max-h-[300px]">
      {/* 固定ヘッダー */}
      <div className="bg-white p-4 shadow sticky top-0 z-10 text-center border-b">
        <h2 className="text-lg font-bold text-[#5E5E5E]">本日の完了タスク</h2>
      </div>

      {/* スクロール可能エリア */}
      <div className="overflow-y-auto p-4">
        {logs.length === 0 ? (
          <p className="text-gray-400 mb-10">本日の履歴はありません</p>
        ) : (
          <ul className="space-y-2 text-left">
            {logs.map((log, idx) => (
              <li key={idx} className="flex items-center gap-4 border-b pb-1 text-[#5E5E5E]">
                <div className="w-[100px] truncate text-ellipsis overflow-hidden whitespace-nowrap">
                  {log.taskName ?? '（タスク名なし）'}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <div className="w-[60px] text-right text-gray-600 pr-4">{log.point}pt</div>
                  <div className="w-[36px] h-[36px] flex-shrink-0">
                    <Image
                      src={
                        log.person === '太郎'
                          ? profileImage
                          : log.person === '花子'
                            ? partnerImage
                            : '/images/default.png'
                      }
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
        )}
      </div>
    </div>
  );
}
