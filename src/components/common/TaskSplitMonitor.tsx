'use client';

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react';
import { onSnapshot, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase'; // Firestore 初期化済みのインスタンス
import { auth } from '@/lib/firebase'; // Firebase Auth

export default function TaskSplitMonitor() {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const ref = doc(db, 'task_split_logs', user.uid);

    const unsubscribe = onSnapshot(ref, (snap) => {
      const data = snap.data();
      if (data?.status === 'processing') {
        setLoading(true);
        setShowModal(false);
      } else if (data?.status === 'done') {
        setLoading(false);
        setShowModal(true);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <>
      {/* ローディング中のオーバーレイ */}
      {loading && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white px-6 py-4 rounded-lg shadow-lg text-center">
            <p className="text-lg font-semibold">タスク分割処理中です…</p>
          </div>
        </div>
      )}

      {/* 分割完了のモーダル */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white px-8 py-6 rounded-xl shadow-xl max-w-sm w-full text-center">
            <p className="text-lg font-semibold mb-4">タスクの分割が完了しました。</p>
            <button
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              onClick={() => setShowModal(false)}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </>
  );
}
