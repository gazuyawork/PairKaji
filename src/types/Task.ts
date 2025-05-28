// /src/types/Task.ts

export type Period = '毎日' | '週次' | '不定期';

// Firestore保存用の型（DB用）
export type FirestoreTask = {
  title?: string;
  name?: string;
  users?: string[];
  userIds?: string[];
  period?: Period;
  point?: number;
  daysOfWeek?: string[];
  dates?: string[];
  isTodo?: boolean;
  done?: boolean;
  skipped?: boolean;
  completedAt?: string | null;
  completedBy?: string;
  visible?: boolean;
  groupId?: string | null;
  todos?: string[];
  userId?: string; // ← 追加！
};

// アプリ共通で使うTask型（画面表示用ベース型）
export type Task = {
  id: string;
  title: string;
  name: string;
  point: number;
  users: string[];
  daysOfWeek: string[];
  dates: string[];
  isTodo: boolean;
  done?: boolean;
  skipped?: boolean;
  person?: string;
  image?: string;
  groupId?: string | null;
  period?: Period;
  scheduledDate?: string;
  visible?: boolean;
  userIds?: string[];
  completedAt?: string | null;
  completedBy?: string;
};


// タスク管理画面専用の型（Task + 管理画面用の一時フラグ）
export type TaskManageTask = Task & {
  isNew?: boolean; // 新規作成フラグ
  isEdited?: boolean; // 編集済みフラグ
  showDelete?: boolean; // 削除ボタン表示フラグ
  nameError?: boolean; // 名前未入力エラー
};
