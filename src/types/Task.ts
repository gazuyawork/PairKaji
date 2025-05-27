// /src/types/Task.ts
import type { Timestamp } from 'firebase/firestore';

export type Period = '毎日' | '週次' | '不定期';

// Firestore保存用の型（DB用）
export type FirestoreTask = {
  userId: string;
  userIds: string[];
  name: string;
  period: Period;
  point: number;
  users: string[];
  daysOfWeek: string[]; // 数字形式（例: ["0", "1", "2"]）
  dates: string[];
  groupId?: string | null;
  isTodo: boolean;
  createdAt?: Timestamp; // FirestoreのTimestamp型
  updatedAt?: Timestamp;
  visible?: boolean;
};

// アプリ共通で使うTask型（画面表示用ベース型）
export type Task = {
  id: string;
  name: string;
  point: number;
  users: string[];
  daysOfWeek: string[]; // 日本語表記（例: ["月", "火"]）
  dates: string[];
  isTodo: boolean;
  done?: boolean; // 完了済みフラグ
  skipped?: boolean; // スキップ済みフラグ
  person?: string; // 割り当てユーザー（表示用）
  image?: string; // ユーザーアイコン（表示用）
  groupId?: string | null;
  period?: Period; // 表示用補助（必要なら）
  scheduledDate?: string; // 不定期用（必要なら）
  visible?: boolean; // Firestoreから取得する値
  userIds?: string[]; // FirestoreのuserIds（必要なら）
  completedAt?: string; // 完了日時（必要なら）
  completedBy?: string; // 完了者（必要なら）
  title?: string; // 表示用タイトル（必要なら）
};

// タスク管理画面専用の型（Task + 管理画面用の一時フラグ）
export type TaskManageTask = Task & {
  userIds?: string[]; // 🔥 保険で明示的に入れる
  isNew?: boolean;
  isEdited?: boolean;
  showDelete?: boolean;
  nameError?: boolean;
};
