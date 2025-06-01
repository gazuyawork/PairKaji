'use client';

import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { parseISO, isSameDay } from 'date-fns';
import Image from 'next/image';
import type { Task } from '@/types/Task';
import { useProfileImages } from '@/hooks/useProfileImages';

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

      // ✅ 表示対象タスクのID一覧を作成
      // 本日の完了タスク取得用。タスク作成者や完了者に関係なく表示するため、taskIdベースで取得
      const taskIds = tasks.map(task => task.id);
      if (taskIds.length === 0) return;

      // ✅ taskCompletionsコレクションから、対象タスクの完了履歴を取得（リアルタイム更新）
      // Firestoreのinクエリは最大10件までのため、今後は分割対応を検討する
      const q = query(
        collection(db, 'taskCompletions'),
        where('taskId', 'in', taskIds)
      );

      const today = new Date();

      const unsubscribe = onSnapshot(q, (snapshot) => {
        // 今日の日付に該当する完了ログのみをフィルタリングし、日時順にソート
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

    // ✅ クリーンアップ処理（コンポーネントアンマウント時にonSnapshot購読解除）
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [tasks]); // 🔄 タスクリストが変更されるたびに再取得

  return (
    <div className="flex flex-col bg-white rounded-xl shadow-md overflow-hidden max-h-[300px]">
      {/* ✅ 固定ヘッダー */}
      <div className="bg-white p-4 shadow sticky top-0 z-10 text-center border-b">
        <h2 className="text-lg font-bold text-[#5E5E5E]">本日の完了タスク</h2>
      </div>

      {/* ✅ 完了タスク表示リスト（スクロール可能） */}
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
