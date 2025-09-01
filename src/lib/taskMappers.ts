// src/lib/taskMappers.ts
import type { Task, FirestoreTask } from '@/types/Task';
import { dayNumberToName } from '@/lib/constants';
import { QueryDocumentSnapshot } from 'firebase/firestore';

// ★ 最小のカテゴリ正規化（'料理' / '買い物' のみ採用）
const normalizeCategory = (v: any): '料理' | '買い物' | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.normalize('NFKC').trim();
  return s === '料理' ? '料理' : s === '買い物' ? '買い物' : undefined;
};

export const mapFirestoreDocToTask = (
  doc: QueryDocumentSnapshot<FirestoreTask>
): Task => {
  const data = doc.data();
  const user = data.users?.[0] ?? '未設定';

  // ★ デバッグログ：category の読取状況を可視化
  try {
    const rawCat = (data as any)?.category;
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
    daysOfWeek: (data.daysOfWeek ?? []).map(
      (code: string) => dayNumberToName[code] ?? ''
    ),
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

    // ✅ 追加：備考（note）を必ず文字列で詰める
    note: typeof data.note === 'string' ? data.note : '',

    // ✅ Timestamp → Date 変換（既存）
    createdAt: (data as any).createdAt?.toDate?.() ?? null,

    // ★ 追加：カテゴリ（'料理' | '買い物'｜その他は undefined に落とす）
    category: normalizeCategory((data as any)?.category),
  };
};
