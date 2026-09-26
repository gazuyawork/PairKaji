// src/lib/taskMappers.ts
import type { Task, FirestoreTask } from '@/types/Task';
import { dayNumberToName } from '@/lib/constants';
import { QueryDocumentSnapshot } from 'firebase/firestore';
import { parseCategoryForUI } from '@/lib/taskCategory';
import { burdenWeight } from '@/lib/burden';

/* ---------- type guards / helpers ---------- */

type WithToDate = { toDate: () => Date };
function hasToDate(v: unknown): v is WithToDate {
  return !!v && typeof v === 'object' && typeof (v as { toDate?: unknown }).toDate === 'function';
}

export const mapFirestoreDocToTask = (
  doc: QueryDocumentSnapshot<FirestoreTask>
): Task => {
  const data = doc.data();
  const user = data.users?.[0] ?? '未設定';
  const todos = Array.isArray((data as { todos?: unknown }).todos)
    ? ((data as { todos: unknown[] }).todos)
    : [];
  const looksLikeList = data.isTodo === true || todos.length > 0;

  // デバッグログ：category の読取状況を可視化（unknown 経由で安全に）
  try {
    // const rawCat: unknown = (data as { category?: unknown }).category;
    // const catUI = parseCategoryForUI(rawCat);
    // console.groupCollapsed('[taskMappers] mapFirestoreDocToTask');
    // console.log('doc.id:', doc.id);
    // console.log('data.category (raw):', rawCat, '| parsed(UI):', catUI);
    // console.groupEnd();
  } catch (e) {
    // ログはUIに影響しないように握りつぶす
    console.warn('[taskMappers] category logging failed:', e);
  }

  return {
    id: doc.id,
    title: data.title ?? data.name ?? '',
    name: data.name ?? '',
    period: data.period ?? '毎日',
    point: data.point ?? 0,
    burden: burdenWeight((data as { burden?: unknown }).burden),
    done: data.done ?? false,
    completedAt: data.completedAt ?? null,
    completedBy: data.completedBy ?? '',
    person: user,
    daysOfWeek: (data.daysOfWeek ?? []).map((code: string | number) => {
      if (typeof code === 'string') {
        const head = code.trim()[0];
        if (head && '日月火水木金土'.includes(head)) return head;
      }
      const key = String(code) as keyof typeof dayNumberToName;
      return dayNumberToName[key] ?? '';
    }).filter((name) => name.length > 0),
    dates: data.dates ?? [],
    isTodo: data.isTodo ?? false,
    users: data.users ?? [],
    scheduledDate: data.dates?.[0] ?? '',
    visible: typeof data.visible === 'boolean' ? data.visible : looksLikeList,
    userId: data.userId ?? '',
    private: typeof data.private === 'boolean' ? data.private : false,
    flagged: typeof data.flagged === 'boolean' ? data.flagged : false,
    userIds: data.userIds ?? [],
    time: data.time ?? '',
    calendarSync: (data as { calendarSync?: unknown }).calendarSync === true,
    calendarEventId:
      typeof (data as { calendarEventId?: unknown }).calendarEventId === 'string'
        ? ((data as { calendarEventId: string }).calendarEventId)
        : '',

    // 備考（note）は確実に文字列へ
    note: typeof data.note === 'string' ? data.note : '',

    // Timestamp 互換の toDate があれば Date へ
    createdAt: hasToDate((data as { createdAt?: unknown }).createdAt)
      ? (data as { createdAt: WithToDate }).createdAt.toDate()
      : null,

    // カテゴリ：Firestoreの '未設定' は UIでは null（未選択）に変換
    category: parseCategoryForUI((data as { category?: unknown }).category) as Task['category'],
    todos,
  };
};
