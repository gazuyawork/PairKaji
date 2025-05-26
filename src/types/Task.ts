// /src/types/Task.ts

export type Period = '毎日' | '週次' | '不定期';

// Firestore保存用の型（DB用）
export type FirestoreTask = {
  userId: string;
  userIds: string[];
  name: string;
  frequency: Period;
  point: number;
  users: string[];
  daysOfWeek: string[]; // 数字形式（例: ["0", "1", "2"]）
  dates: string[];
  groupId?: string | null;
  isTodo: boolean;
  createdAt?: any; // FirestoreのTimestamp型
  updatedAt?: any;
  visible?: boolean;
};

// アプリでの共通表示用Task型（画面全体で使う基本の型）
export type Task = {
  id: string;
  name: string;
  frequency: Period;
  point: number;
  users: string[];
  daysOfWeek: string[]; // 曜日名で持つ（例: ["月", "火"]）
  dates: string[];
  isTodo: boolean;
  done?: boolean;
  skipped?: boolean;
  person?: string;
  image?: string;
  groupId?: string | null;
  period?: Period; // 表示用の補助
  scheduledDate?: string; // 不定期用
  visible?: boolean; // Firestoreから取得する値
  userIds?: string[];
  completedAt?: string;
  completedBy?: string;
  title?: string;
};

// Task管理画面専用（TaskManageTask）: Task + 管理用フラグ
export type TaskManageTask = Task & {
  isNew?: boolean;
  isEdited?: boolean;
  showDelete?: boolean;
  nameError?: boolean;
};

// Task表示画面専用（TaskViewTask）: Task + 完了情報
// export type TaskViewTask = Task & {
//   completedAt?: string;
//   completedBy?: string;
//   userIds?: string[];
// };
