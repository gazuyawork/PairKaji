'use client';

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import Image from 'next/image';
import type { Task } from '@/types/Task';
import { useProfileImages } from '@/hooks/useProfileImages';
import { useUserUid } from '@/hooks/useUserUid';

interface CompletionLog {
  taskId: string;
  taskName?: string;
  date: string;
  point: number;
  userId: string;
  completedAt?: string;
  person?: string;
  __docId?: string; // FirestoreのドキュメントID
}

type Props = {
  tasks: Task[];
};

export default function FinishDayTask({ tasks }: Props) {
  const [logs, setLogs] = useState<CompletionLog[]>([]);
  const { profileImage, partnerImage } = useProfileImages();
  const uid = useUserUid();

  useEffect(() => {
    const fetchAndSubscribe = async () => {
      if (!uid) return;

      const taskIds = tasks.map(task => task.id);
      if (taskIds.length === 0) return;

      const today = new Date().toISOString().split('T')[0];

      let logsBufferQ1: CompletionLog[] = [];
      let logsBufferQ2: CompletionLog[] = [];

      const updateLogs = () => {
        const combined = [...logsBufferQ1, ...logsBufferQ2];
        const uniqueLogs = Array.from(new Map(combined.map(log => [log.__docId, log])).values());
        setLogs(uniqueLogs.sort((a, b) => b.date.localeCompare(a.date)));
      };

      if (!taskIds || taskIds.length === 0) {
        console.warn('taskIds が空のため、taskCompletions クエリをスキップします');
        return;
      }

      const q1 = query(
        collection(db, 'taskCompletions'),
        where('taskId', 'in', taskIds),
        where('userId', '==', uid)
      );

      const q2 = query(
        collection(db, 'taskCompletions'),
        where('taskId', 'in', taskIds),
        where('userIds', 'array-contains', uid)
      );


      const unsubscribe1 = onSnapshot(q1, (snapshot1) => {
        snapshot1.docChanges().forEach(change => {
          const log = { ...(change.doc.data() as CompletionLog), __docId: change.doc.id };
          if (log.date === today) {
            if (change.type === 'removed') {
              logsBufferQ1 = logsBufferQ1.filter(l => l.__docId !== log.__docId);
            } else {
              logsBufferQ1 = logsBufferQ1.filter(l => l.__docId !== log.__docId);
              logsBufferQ1.push(log);
            }
          }
        });
        updateLogs();
      });

      const unsubscribe2 = onSnapshot(q2, (snapshot2) => {
        snapshot2.docChanges().forEach(change => {
          const log = { ...(change.doc.data() as CompletionLog), __docId: change.doc.id };
          if (log.date === today) {
            if (change.type === 'removed') {
              logsBufferQ2 = logsBufferQ2.filter(l => l.__docId !== log.__docId);
            } else {
              logsBufferQ2 = logsBufferQ2.filter(l => l.__docId !== log.__docId);
              logsBufferQ2.push(log);
            }
          }
        });
        updateLogs();
      });

      return () => {
        unsubscribe1();
        unsubscribe2();
      };
    };

    let unsubscribe: (() => void) | undefined;
    fetchAndSubscribe().then(unsub => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [tasks, uid]);

  return (
    <div className="flex flex-col bg-white rounded-xl shadow-md overflow-hidden max-h-[300px]">
      <div className="bg-white p-4 shadow sticky top-0 z-10 text-center border-b">
        <h2 className="text-lg font-bold text-[#5E5E5E]">本日の完了タスク</h2>
      </div>

      <div className="overflow-y-auto pt-4">
        {logs.length === 0 ? (
          <p className="text-gray-400 mb-10 text-center pt-6">本日の履歴はありません</p>
        ) : (
          <ul className="space-y-2 text-left">
            {logs.map((log) => (
              <li key={log.__docId} className="flex items-center gap-4 border-b px-4 pb-2 text-[#5E5E5E]">
                <div className="w-[100%] truncate text-ellipsis overflow-hidden whitespace-nowrap">
                  {log.taskName ?? '（タスク名なし）'}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <div className="w-[60px] text-right text-gray-600 pr-4">{log.point}pt</div>
                  {partnerImage && (
                    <div className="w-[36px] h-[36px] flex-shrink-0">
                      <Image
                        src={
                          log.userId === auth.currentUser?.uid
                            ? profileImage
                            : partnerImage
                        }
                        alt="icon"
                        width={38}
                        height={38}
                        className="rounded-full border border-gray-300 object-cover w-full h-full"
                        style={{ aspectRatio: '1 / 1' }}
                      />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
