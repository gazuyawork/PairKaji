// src/lib/taskMappers.ts
// import { useProfileImages } from '@/hooks/useProfileImages'; // ✅ 修正
import type { Task, FirestoreTask } from '@/types/Task';
import { dayNumberToName } from '@/lib/constants'; 
import { QueryDocumentSnapshot } from 'firebase/firestore';

export const mapFirestoreDocToTask = (doc: QueryDocumentSnapshot<FirestoreTask>): Task => {
  const data = doc.data();
  const user = data.users?.[0] ?? '未設定';

  return {
    id: doc.id,
    title: data.title ?? data.name ?? '',
    name: data.name ?? '',
    period: data.period ?? '毎日',
    point: data.point ?? 0,
    done: data.done ?? false,
    skipped: data.skipped ?? false,
    completedAt: data.completedAt ?? null, // ← ここも修正済みでOK
    completedBy: data.completedBy ?? '',
    person: user,
    // image: useProfileImages(user),
    daysOfWeek: (data.daysOfWeek ?? []).map((code: string) => dayNumberToName[code] ?? ''),
    dates: data.dates ?? [],
    isTodo: data.isTodo ?? false,
    users: data.users ?? [],
    scheduledDate: data.dates?.[0] ?? '',
    visible: data.visible ?? false,
    userId: data.userId ?? '',
  };
};