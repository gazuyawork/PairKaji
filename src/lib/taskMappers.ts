// src/lib/taskMappers.ts
import type { Task, FirestoreTask, TaskCategory } from '@/types/Task';
import { dayNumberToName } from '@/lib/constants';
import { QueryDocumentSnapshot } from 'firebase/firestore';

/* ---------- type guards / helpers ---------- */

type WithToDate = { toDate: () => Date };
function hasToDate(v: unknown): v is WithToDate {
  return !!v && typeof v === 'object' && typeof (v as { toDate?: unknown }).toDate === 'function';
}

// 最小のカテゴリ正規化（'料理' / '買い物' のみ採用）
 // カテゴリ正規化（'料理' / '買い物' / '旅行' を許可。ゆらぎも吸収）
 const normalizeCategory = (v: unknown): TaskCategory | undefined => {
   if (typeof v !== 'string') return undefined;
   const s = v.normalize('NFKC').trim().toLowerCase();
   if (['料理', 'りょうり', 'cooking', 'cook', 'meal'].includes(s)) return '料理';
   if (['買い物', '買物', 'かいもの', 'shopping', 'purchase', 'groceries'].includes(s)) return '買い物';
   if (['旅行', 'りょこう', 'travel', 'trip', 'journey', 'tour'].includes(s)) return '旅行';
   return undefined;
 };

export const mapFirestoreDocToTask = (
  doc: QueryDocumentSnapshot<FirestoreTask>
): Task => {
  const data = doc.data();
  const user = data.users?.[0] ?? '未設定';

  // デバッグログ：category の読取状況を可視化（unknown 経由で安全に）
  try {
    const rawCat: unknown = (data as { category?: unknown }).category;
    const cat = normalizeCategory(rawCat);
    console.groupCollapsed('[taskMappers] mapFirestoreDocToTask');
    console.log('doc.id:', doc.id);
    console.log('data.category (raw):', rawCat, '| normalized:', cat);
    console.groupEnd();
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
    done: data.done ?? false,
    skipped: data.skipped ?? false,
    completedAt: data.completedAt ?? null,
    completedBy: data.completedBy ?? '',
    person: user,
    daysOfWeek: (data.daysOfWeek ?? []).map((code: string | number) => {
      // Firestore 側が number の可能性もあるので文字列キーに寄せる
      const key = String(code) as keyof typeof dayNumberToName;
      return dayNumberToName[key] ?? '';
    }),
    dates: data.dates ?? [],
    isTodo: data.isTodo ?? false,
    users: data.users ?? [],
    scheduledDate: data.dates?.[0] ?? '',
    visible: data.visible ?? false,
    userId: data.userId ?? '',
    private: typeof data.private === 'boolean' ? data.private : false,
    flagged: typeof data.flagged === 'boolean' ? data.flagged : false,
    userIds: data.userIds ?? [],
    time: data.time ?? '',

    // 備考（note）は確実に文字列へ
    note: typeof data.note === 'string' ? data.note : '',

    // Timestamp 互換の toDate があれば Date へ
    createdAt: hasToDate((data as { createdAt?: unknown }).createdAt)
      ? (data as { createdAt: WithToDate }).createdAt.toDate()
      : null,

    // カテゴリ（unknown 経由で正規化）
    category: normalizeCategory((data as { category?: unknown }).category),
  };
};
