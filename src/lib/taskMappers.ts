// src/lib/taskMappers.ts
import type { Task, FirestoreTask, TaskCategory } from '@/types/Task';
import { dayNumberToName } from '@/lib/constants';
import { QueryDocumentSnapshot } from 'firebase/firestore';

/* ---------- type guards / helpers ---------- */

type WithToDate = { toDate: () => Date };
function hasToDate(v: unknown): v is WithToDate {
  return !!v && typeof v === 'object' && typeof (v as { toDate?: unknown }).toDate === 'function';
}

/* =========================================================
 * カテゴリ正規化（UI表示用）
 *  - Firestore の '未設定' / 空文字 / 未定義 → UIでは未選択(null)
 *  - '料理' | '買い物' | '旅行' の揺らぎも吸収して正規化
 * =======================================================*/
const parseCategoryForUI = (
  v: unknown
): TaskCategory | null => {
  if (typeof v !== 'string') return null;
  const s = v.normalize('NFKC').trim().toLowerCase();

  // 「未設定」や未選択を表す表記は UI では null にする
  if (s === '' || s === '未設定' || s === 'みせってい' || s === 'unset' || s === 'unselected') {
    return null;
  }

  if (['料理', 'りょうり', 'cooking', 'cook', 'meal'].includes(s)) return '料理';
  if (['買い物', '買物', 'かいもの', 'shopping', 'purchase', 'groceries'].includes(s)) return '買い物';
  if (['旅行', 'りょこう', 'travel', 'trip', 'journey', 'tour'].includes(s)) return '旅行';

  // それ以外（未知の値）は UI 上は未選択扱い
  return null;
};

export const mapFirestoreDocToTask = (
  doc: QueryDocumentSnapshot<FirestoreTask>
): Task => {
  const data = doc.data();
  const user = data.users?.[0] ?? '未設定';

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

    // カテゴリ：Firestoreの '未設定' は UIでは null（未選択）に変換
    category: parseCategoryForUI((data as { category?: unknown }).category) as Task['category'],
  };
};
