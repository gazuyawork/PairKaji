import { admin } from './lib/firebaseAdmin';
import { Timestamp, BulkWriter } from 'firebase-admin/firestore';

// JSTで「YYYY-MM-DD」を得るユーティリティ
const formatJstDate = (d: Date): string => {
  const dtf = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = dtf.formatToParts(d).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

// JSTの曜日番号（0=日, ... ,6=土）
const getJstDayIndex = (d: Date): number => {
  const fmt = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'short' });
  const w = fmt.format(d); // e.g. "月"
  const map: Record<string, number> = { '日':0, '月':1, '火':2, '水':3, '木':4, '金':5, '土':6 };
  return map[w] ?? new Date().getDay();
};

const isSameJstDate = (a: Date, b: Date): boolean =>
  formatJstDate(a) === formatJstDate(b);

// 文字列/Timestamp/Date などを Date に寄せる（安全変換）
const toDateSafe = (value: unknown): Date | null => {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'object' && value && typeof (value as any).toDate === 'function') {
    try { return (value as any).toDate(); } catch { return null; }
  }
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : new Date(t);
  }
  return null;
};

const normalizeDaysOfWeekToNumbers = (input: unknown): Set<number> | null => {
  if (!input || !Array.isArray(input)) return null;
  const eng: Record<string, number> = {
    sun:0, sunday:0, mon:1, monday:1, tue:2, tuesday:2, wed:3, wednesday:3,
    thu:4, thursday:4, fri:5, friday:5, sat:6, saturday:6,
  };
  const jp: Record<string, number> = { '日':0, '月':1, '火':2, '水':3, '木':4, '金':5, '土':6 };

  const set = new Set<number>();
  for (const v of input) {
    if (typeof v === 'number' && v >= 0 && v <= 6) { set.add(v); continue; }
    if (typeof v === 'string') {
      const trimmed = v.trim();
      const lower = trimmed.toLowerCase();
      if (/^[0-6]$/.test(lower)) { set.add(parseInt(lower, 10)); continue; }
      if (lower in eng) { set.add(eng[lower]); continue; }
      const head = trimmed[0];
      if (head && head in jp) { set.add(jp[head]); continue; }
    }
  }
  return set.size ? set : null;
};

/**
 * 当日のタスクリセットを実行（JST基準）。
 * - 5:30 と 5:45 から呼ばれる共通処理
 * - 1日1回のみ有効化するための「実行ログ」ドキュメントでロック
 */
export async function runDailyTaskReset(label: '05:30' | '05:45'): Promise<{ processed: number, skipped: boolean }> {
  const db = admin.firestore();

  const now = new Date();
  const todayId = formatJstDate(now); // e.g. "2025-09-05"
  const logRef = db.collection('system').doc('taskResets').collection('days').doc(todayId);

  // 既に成功済みならスキップ
  const snap = await logRef.get();
  if (snap.exists) {
    const data = snap.data() as any;
    if (data?.status === 'success') {
      await logRef.set({
        lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
        lastAttemptLabel: label,
      }, { merge: true });
      return { processed: 0, skipped: true };
    }
  }

  // ロック: 無ければ running で作成（既にあって success 以外でも続行可）
  await logRef.set({
    status: 'running',
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
    lastAttemptLabel: label,
  }, { merge: true });

  const todayIdx = getJstDayIndex(now);

  // 対象取得：（done=true）と（skipped=true）を OR 的に集約
  const tasksCol = db.collection('tasks');
  const [doneSnap, skippedSnap] = await Promise.all([
    tasksCol.where('done', '==', true).get(),
    tasksCol.where('skipped', '==', true).get(),
  ]);

  // 重複排除して1度ずつ処理
  const targets = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  doneSnap.forEach(d => targets.set(d.id, d));
  skippedSnap.forEach(d => targets.set(d.id, d));

  if (targets.size === 0) {
    await logRef.set({
      status: 'success',
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      processed: 0,
    }, { merge: true });
    return { processed: 0, skipped: false };
  }

  // BulkWriter で高速・安全に更新
  const writer: BulkWriter = db.bulkWriter();
  let processed = 0;

  for (const [, docSnap] of targets) {
    const raw = docSnap.data() as any;

    // 本日がスケジュール対象日か
    const period: string | undefined = raw?.period;
    let isScheduledToday = false;
    if (period === '毎日') {
      isScheduledToday = true;
    } else if (period === '週次') {
      const daysSet = normalizeDaysOfWeekToNumbers(raw?.daysOfWeek);
      // daysOfWeek 未設定の旧データは安全側で「本日対象」と解釈（後方互換）
      isScheduledToday = daysSet ? daysSet.has(todayIdx) : true;
    }

    if (!isScheduledToday) continue;

    const completedAtDate = toDateSafe(raw?.completedAt);
    const skippedAtDate   = toDateSafe(raw?.skippedAt);
    const updatedAtDate   = toDateSafe(raw?.updatedAt);

    const isDoneToday = !!(completedAtDate && isSameJstDate(completedAtDate, now));

    let isSkippedToday = false;
    if (raw?.skipped === true) {
      if (skippedAtDate) {
        isSkippedToday = isSameJstDate(skippedAtDate, now);
      } else if (updatedAtDate) {
        // skippedAt 無い旧データは updatedAt をフォールバック
        isSkippedToday = isSameJstDate(updatedAtDate, now);
      } else {
        // 最低限の安全策：即日の即時リセットを避ける
        isSkippedToday = true;
      }
    }

    let shouldReset = false;
    if (period === '毎日' || period === '週次') {
      if ((completedAtDate && !isDoneToday) || (raw?.skipped && !isSkippedToday)) {
        shouldReset = true;
      }
    }

    if (!shouldReset) continue;

    processed++;
    writer.update(docSnap.ref, {
      done: false,
      skipped: false,
      completedAt: null,
      completedBy: '',
      skippedAt: null,
      // 監査用：リセット印
      resetBySchedulerAt: admin.firestore.FieldValue.serverTimestamp(),
      resetBySchedulerLabel: label,
    });
  }

  await writer.close();

  await logRef.set({
    status: 'success',
    finishedAt: admin.firestore.FieldValue.serverTimestamp(),
    processed,
  }, { merge: true });

  return { processed, skipped: false };
}
