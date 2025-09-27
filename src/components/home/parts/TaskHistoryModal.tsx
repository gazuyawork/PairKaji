'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useState } from 'react';
import BaseModal from '@/components/common/modals/BaseModal';
import { auth, db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
  DocumentData,
} from 'firebase/firestore';
import { CheckCircle } from 'lucide-react';
import { getThisWeekRangeJST } from '@/lib/weeklyRange';

type TaskHistoryModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type TaskRow = {
  id: string;
  name: string;
  completedAt?: Date | null;
  completedBy?: string | null;
};

export default function TaskHistoryModal({ isOpen, onClose }: TaskHistoryModalProps) {
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [isSaving] = useState(false);
  const [saveComplete] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const user = auth.currentUser;
    if (!user) return;

    const { start, end } = getThisWeekRangeJST();

    // 今週の完了タスク（done == true かつ completedAt ∈ [start, end) かつ userIds に自分を含む）
    // ※ userIds が存在しない場合は userId == uid もフォールバック条件にしています
    const col = collection(db, 'tasks');

    const q = query(
      col,
      where('done', '==', true),
      where('completedAt', '>=', Timestamp.fromDate(start)),
      where('completedAt', '<', Timestamp.fromDate(end)),
      // 共有想定。片側のみ保持のデータにも対応
      // Firestore の 'array-contains' + '==' の複合はインデックスが必要な場合があります
      where('userIds', 'array-contains', user.uid),
      orderBy('completedAt', 'desc'),
    );

    // リアルタイム反映（週内で完了が増えると即時反映）
    const unSub = onSnapshot(
      q,
      (snap) => {
        const list: TaskRow[] = snap.docs.map((doc) => {
          const d = doc.data() as DocumentData;
          return {
            id: doc.id,
            name: (d.name as string) ?? '(名称未設定)',
            completedAt: d.completedAt ? (d.completedAt as Timestamp).toDate() : null,
            completedBy: (d.completedBy as string) ?? null,
          };
        });
        setRows(list);
      },
      (err) => {
        console.error('TaskHistoryModal onSnapshot error:', err);
      },
    );

    return () => {
      unSub();
    };
  }, [isOpen]);

  const grouped = useMemo(() => {
    // 日別にグルーピング（YYYY/MM/DD）
    const g = new Map<string, TaskRow[]>();
    rows.forEach((r) => {
      const key = r.completedAt
        ? `${r.completedAt.getFullYear()}/${String(r.completedAt.getMonth() + 1).padStart(2, '0')}/${String(
            r.completedAt.getDate(),
          ).padStart(2, '0')}`
        : '未設定';
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(r);
    });
    // 日付降順
    const sorted = Array.from(g.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
    return sorted;
  }, [rows]);

  return (
    <BaseModal
      isOpen={isOpen}
      isSaving={isSaving}
      saveComplete={saveComplete}
      onClose={onClose}
      disableCloseAnimation
    >
      <div className="min-w-[280px] max-w-md mx-auto">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          <h3 className="text-lg font-semibold text-gray-800">今週の完了タスク履歴</h3>
        </div>

        {grouped.length === 0 ? (
          <p className="text-sm text-gray-500">今週の完了タスクはまだありません。</p>
        ) : (
          <div className="space-y-4">
            {grouped.map(([date, items]) => (
              <div key={date}>
                <div className="text-xs text-gray-500 mb-2">{date}</div>
                <ul className="space-y-1">
                  {items.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 bg-white"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-sm text-gray-800">{r.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </BaseModal>
  );
}
