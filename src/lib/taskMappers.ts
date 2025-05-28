// src/lib/taskMappers.ts
import { DocumentData } from 'firebase/firestore';
import { getProfileImage } from '@/hooks/useProfileImages';
import type { Task, FirestoreTask } from '@/types/Task';
import { dayNumberToName } from '@/lib/constants'; 

export const mapFirestoreDocToTask = (doc: DocumentData): Task => {
  const data = doc.data() as FirestoreTask;
  const user = data.users?.[0] ?? '未設定';

  return {
    id: doc.id,
    title: data.title ?? data.name ?? '',
    name: data.name ?? '',
    period: data.period ?? '毎日',
    point: data.point ?? 0,
    done: data.done ?? false,
    skipped: data.skipped ?? false,
    completedAt: data.completedAt ?? '',
    completedBy: data.completedBy ?? '',
    person: user,
    image: getProfileImage(user),
    daysOfWeek: (data.daysOfWeek ?? []).map((code: string) => dayNumberToName[code] ?? ''), // ← 変換追加
    dates: data.dates ?? [],
    isTodo: data.isTodo ?? false,
    users: data.users ?? [],
    scheduledDate: data.dates?.[0] ?? '',
    visible: data.visible ?? false,
    userId: data.userId ?? '',
  };
};