// JSTの「今週（週の開始＝月曜 00:00、終了＝翌週月曜 00:00）」のDate範囲を返す
// Firestore Timestamp の where で使いやすいように Date を返します。
export function getThisWeekRangeJST(): { start: Date; end: Date } {
  const now = new Date();
  // UTC⇄JST 換算は Date で直接は不可なので、そのままローカル時刻（サーバ側でなくPWA想定）をJSTとして扱う前提
  // PWAは日本国内利用前提かつユーザーのTZが Asia/Tokyo のためローカル時刻でOK（要件より）
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  const today = new Date(y, m, d, 0, 0, 0, 0);
  // getDay(): 日0 月1 火2 … 土6
  const day = today.getDay();
  // 月曜始まり。月曜(1)なら差0、日曜(0)なら差6日戻る
  const diffFromMonday = (day + 6) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - diffFromMonday); // 月曜の0:00

  const end = new Date(start);
  end.setDate(start.getDate() + 7); // 翌週月曜0:00（[start, end) で使用）

  return { start, end };
}
