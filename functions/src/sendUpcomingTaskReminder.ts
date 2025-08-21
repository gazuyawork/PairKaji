// functions/src/index.ts
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { admin } from './lib/firebaseAdmin';

const db = admin.firestore();

// ✅ Firebase Secret（CLI: firebase functions:secrets:set LINE_CHANNEL_ACCESS_TOKEN）
const LINE_CHANNEL_ACCESS_TOKEN = defineSecret('LINE_CHANNEL_ACCESS_TOKEN');

/* =========================================================
 * JSTユーティリティ（タイムゾーンのズレを避ける）
 * =======================================================*/
const fmtYmdJst = (d = new Date()) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d); // 例: "2025-08-21"

const getJstHm = (d = new Date()) => {
  // "HH:mm" を返す（24時間制/JST）
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).format(d); // "HH:mm"
  return s;
};

const parseHmToMinutes = (hm: string) => {
  const [h, m] = String(hm).split(':').map((v) => parseInt(v, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m; // 0..1439
};

const getJstDayNumber = (ymd: string) => {
  // ymdは "YYYY-MM-DD"
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  // 曜日はタイムゾーンに依存しない（暦日単位で不変）
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0(日)〜6(土)
};

/**
 * 直近30分以内に予定時刻を迎える「本日・未完了」のタスクをユーザーごとにLINE通知します。
 * フォントは Flex Message を使用し、以下のスタイルで統一：
 *  - タイトル： 「リマインド」(bold, size: 'md')
 *  - 本文（タスク一覧）： size: 'sm'
 *  - 注記： size: 'xs', color: '#888888'
 *
 * ★仕様
 *  - 通知が成功（HTTP 2xx）するまでは「送信済みログに記録しない」。
 *  - 失敗時はログ未更新のため、次回（1分後/5分後など設定）に再度対象となる（再送）。
 *  - 「日付指定（dates）」または「曜日指定（daysOfWeek）」のどちらかが今日に一致すれば対象。
 *  - さらに「毎日（period === '毎日'）」のタスクも対象に加える。 // ★ 追加
 *  - daysOfWeek は number/文字列のどちらで保存されていても拾えるよう両方クエリ。
 */
export const sendUpcomingTaskReminder = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'Asia/Tokyo', // 実行スケジュールはJST基準
    secrets: [LINE_CHANNEL_ACCESS_TOKEN],
  },
  async () => {
    // ===== 現在のJST情報 =====
    const now = new Date();
    const todayJst = fmtYmdJst(now); // "YYYY-MM-DD"（JST）
    const nowHmJst = getJstHm(now);  // "HH:mm"（JST）
    const nowMinJst = parseHmToMinutes(nowHmJst)!; // 0..1439
    const todayDowJst = getJstDayNumber(todayJst); // 0..6

    // 参考: UTC表記
    const todayUtc = new Date().toISOString().split('T')[0];

    console.log(
      [
        '=== [START] sendUpcomingTaskReminder ===',
        `now(Local): ${new Date().toString()}`,
        `todayJst: ${todayJst}, todayDowJst: ${todayDowJst}`,
        `nowHmJst: ${nowHmJst} (${nowMinJst}min)`,
        `todayUtc(ref): ${todayUtc}`,
        `process.env.TZ: ${process.env.TZ || '(unset)'}`
      ].join(' | ')
    );

    try {
      /* =========================================================
       * 1) Firestore から「本日・未完了」の候補を3+1系統で取得
       *    - A: dates 配列に todayJst が含まれる
       *    - B1: daysOfWeek に number(0..6) として todayDowJst が含まれる
       *    - B2: daysOfWeek に string("0".."6") として todayDowJst が含まれる
       *    - C: period === "毎日" // ★ 追加
       * =======================================================*/
      console.log('[STEP] Query Firestore for candidates...');

      const qDates = db
        .collection('tasks')
        .where('dates', 'array-contains', todayJst)
        .where('done', '==', false);

      const qDowNumber = db
        .collection('tasks')
        .where('daysOfWeek', 'array-contains', todayDowJst)
        .where('done', '==', false);

      const qDowString = db
        .collection('tasks')
        .where('daysOfWeek', 'array-contains', String(todayDowJst))
        .where('done', '==', false);

      const qEveryday = db
        .collection('tasks')
        .where('period', '==', '毎日')  // ★ 追加: 「毎日」タスク
        .where('done', '==', false);    // ★ 追加

      // ★ 変更: Promise.all に everyday を追加
      const [snapshotDates, snapshotDowNum, snapshotDowStr, snapshotEveryday] = await Promise.all([
        qDates.get(),
        qDowNumber.get(),
        qDowString.get(),
        qEveryday.get(), // ★ 追加
      ]);

      console.log(
        `[INFO] Snapshot sizes | dates(today=${todayJst}): ${snapshotDates.size} | daysOfWeek(number=${todayDowJst}): ${snapshotDowNum.size} | daysOfWeek(string="${todayDowJst}"): ${snapshotDowStr.size} | everyday(period="毎日"): ${snapshotEveryday.size}` // ★ 変更
      );

      // 結合して重複排除（★ 変更: everyday を統合）
      const allDocs = [
        ...snapshotDates.docs,
        ...snapshotDowNum.docs,
        ...snapshotDowStr.docs,
        ...snapshotEveryday.docs, // ★ 追加
      ];
      const dedup = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
      for (const d of allDocs) dedup.set(d.id, d);
      const taskDocs = [...dedup.values()];

      console.log(`[INFO] Combined unique task docs: ${taskDocs.length}`);
      if (taskDocs.length === 0) {
        console.log('[END] 対象0件（dates/daysOfWeek/毎日ともに該当なし）\n---'); // ★ 変更
        return;
      }

      // デバッグ：先頭10件の概要
      taskDocs.slice(0, 10).forEach((doc, idx) => {
        const t: any = doc.data();
        const digests = [
          `id=${doc.id}`,
          `name=${t?.name ?? '(no-name)'}`,
          `userId=${t?.userId ?? '(no-userId)'}`,
          `time=${t?.time ?? '(no-time)'}`,
          `period=${t?.period ?? '(no-period)'}`,
          `daysOfWeek=[${Array.isArray(t?.daysOfWeek) ? t.daysOfWeek.join(',') : '(none)'}]`,
          `datesCount=${Array.isArray(t?.dates) ? t.dates.length : 0}`,
          `done=${t?.done}`,
        ].join(' | ');
        console.log(`[DEBUG] Candidate[${idx}] ${digests}`);
      });

      /* =========================================================
       * 2) 「30分以内に到来する」かをJSTの分ベースで判定
       *    - Dateのタイムゾーン解釈のブレを避け、"HH:mm" → 分 に落として比較
       * =======================================================*/
      type TaskData = { id: string; name: string; time: string; userId: string };
      const upcoming: TaskData[] = [];

      for (const doc of taskDocs) {
        const t: any = doc.data();

        if (!t?.time) {
          console.warn(`[WARN] time未設定のため除外: id=${doc.id}, name=${t?.name ?? '(no-name)'}`);
          continue;
        }
        if (!t?.name || !t?.userId) {
          console.warn(
            `[WARN] name/userId 不足のため除外: id=${doc.id}, name=${t?.name}, userId=${t?.userId}`
          );
          continue;
        }

        const taskMin = parseHmToMinutes(String(t.time));
        if (taskMin === null) {
          console.warn(`[WARN] 無効なtime形式のため除外: id=${doc.id}, time=${t.time}`);
          continue;
        }

        const diff = taskMin - nowMinJst; // JST分ベース
        // デバッグ詳細
        console.log(
          `[TRACE] time判定: id=${doc.id}, name=${t.name}, time=${t.time}(${taskMin}min), nowJst=${nowHmJst}(${nowMinJst}min), diff=${diff}min`
        );

        if (diff >= 0 && diff <= 30) {
          upcoming.push({ id: doc.id, name: t.name, time: t.time, userId: t.userId });
        }
      }

      console.log(`[INFO] 30分以内に到来する候補数: ${upcoming.length}`);
      if (upcoming.length === 0) {
        console.log('[END] 30分以内該当なし\n---');
        return;
      }

      /* =========================================================
       * 3) ユーザーごとにまとめ、送信済みログで重複抑止 → LINE送信
       * =======================================================*/
      const byUser: Record<string, TaskData[]> = {};
      for (const t of upcoming) {
        (byUser[t.userId] ??= []).push(t);
      }

      for (const [userId, list] of Object.entries(byUser)) {
        console.log(`---\n[USER] userId=${userId} | tasks=${list.length}`);
        const preview = list.map((t) => `${t.id}:${t.name}(${t.time})`).join(', ');
        console.log(`[USER] upcoming preview: ${preview}`);

        const userDoc = await db.collection('users').doc(userId).get();
        const user = userDoc.data() as any;

        if (!user?.lineUserId) {
          console.warn(`[WARN] userId=${userId} は lineUserId 未設定のためスキップ`);
          continue;
        }

        // 本日分の送信済みログ
        const logRef = db.collection('users').doc(userId).collection('notifyLogs').doc(todayJst);
        const logSnap = await logRef.get();
        const notified: string[] = logSnap.exists
          ? Array.isArray(logSnap.data()?.taskIds)
            ? (logSnap.data()!.taskIds as string[])
            : []
          : [];

        console.log(`[DEBUG] 既送 taskIds(${notified.length}): ${notified.join(',') || '(none)'}`);

        const toNotify = list.filter((t) => !notified.includes(t.id));
        console.log(
          `[DEBUG] 新規送信対象(${toNotify.length}): ${toNotify.map((t) => t.id).join(',') || '(none)'}`
        );

        // ★ 追加: 時刻（HH:mm）を分に変換して昇順ソート（早い→遅い）
        const sorted = [...toNotify].sort(
          (a, b) => (parseHmToMinutes(a.time) ?? 0) - (parseHmToMinutes(b.time) ?? 0)
        );

        // 1日20件のガード
        const remain = 20 - notified.length;
        if (remain <= 0) {
          console.log(`[INFO] userId=${userId} は本日の送信上限(20)に達したためスキップ`);
          continue;
        }
        const limited = sorted.slice(0, remain);
        if (limited.length === 0) {
          console.log(`[INFO] userId=${userId} に新規送信対象なし`);
          continue;
        }

        // ===== Flex Message 構築 =====
        const headerText = '🔔 リマインド\n';
        // const bodyText = limited.map((t) => `・ ${t.name} (${t.time})`).join('\n') || '（該当なし）';
        const bodyText = limited.map((t) => `・ ${t.time} ${t.name}`).join('\n') || '（該当なし）';
        const noteText = '\nℹ️ このリマインドは予定時刻の約30分前に送信されます。';

        const flexMessage = {
          type: 'flex',
          altText: headerText,
          contents: {
            type: 'bubble',
            body: {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#ffffffff',
              spacing: 'sm',
              contents: [
                { type: 'text', text: headerText, weight: 'bold', size: 'md', wrap: true },
                { type: 'text', text: bodyText, size: 'sm', wrap: true },
                { type: 'separator', margin: 'md' },
                { type: 'text', text: noteText, size: 'xs', color: '#888888', wrap: true, margin: 'xs' },
              ],
            },
          },
        };

        try {
          const token = LINE_CHANNEL_ACCESS_TOKEN.value();
          console.log(`[DEBUG] LINEトークン先頭5文字: ${token.substring(0, 5)}...`);

          const res = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              to: user.lineUserId,
              messages: [flexMessage],
            }),
          });

          const text = await res.text();
          console.log(`[INFO] LINE Push API status=${res.status} (${res.statusText})`);
          console.log(`[DEBUG] LINE Push API body=${text}`);

          if (!res.ok) {
            console.warn(`[WARN] LINE送信失敗(userId=${userId}) → ログ未更新（次回再送対象）`);
            continue;
          }
        } catch (e) {
          console.error(`[ERROR] LINE送信エラー(userId=${userId}):`, e);
          // 成功時のみ記録する方針なので、ここではログ更新しない
          continue;
        }

        // 成功時のみ送信済みログを更新
        const updated = [...new Set([...notified, ...limited.map((t) => t.id)])];
        console.log(`[DEBUG] 更新するtaskIds(${updated.length}): ${updated.join(',')}`);

        await logRef.set(
          {
            taskIds: updated,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        console.log(
          `✅ 送信: ${limited.length}件 → ${user.email || userId}（本日累計: ${updated.length}件）`
        );
      }

      console.log('[END] 通知処理正常終了\n---');
    } catch (err) {
      console.error('[FATAL] 通知処理 例外発生:', err);
    }
  }
);
