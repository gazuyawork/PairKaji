// /src/types/Task.ts
export type Period = '毎日' | '週次' | '不定期';

export type Task = {
  id: number;
  name: string;
  title: string;
  frequency: Period;
  point: number;
  users: string[];
  daysOfWeek: string[];
  dates: string[];
  isTodo: boolean;
  done: boolean;
  skipped: boolean;
  person: string;
  image: string;
  scheduledDate?: string;
  period: Period;
  showDelete?: boolean;
};
