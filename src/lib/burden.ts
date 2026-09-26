export type BurdenLevel = 1 | 2 | 3;

export const BURDEN_OPTIONS: { value: BurdenLevel; label: string }[] = [
  { value: 1, label: '小' },
  { value: 2, label: '中' },
  { value: 3, label: '大' },
];

export function burdenWeight(value: unknown): BurdenLevel {
  return value === 1 || value === 2 || value === 3 ? value : 2;
}

export function burdenLabel(value: unknown): string {
  const weight = burdenWeight(value);
  return BURDEN_OPTIONS.find((option) => option.value === weight)?.label ?? '中';
}

export type BurdenTask = {
  id: string;
  period?: '毎日' | '週次' | '不定期' | string;
  daysOfWeek?: string[];
  dates?: string[];
  users?: string[];
  private?: boolean;
  burden?: number;
};

export type CompletionHit = {
  taskId: string;
  userId: string | null;
};

export type PersonBurden = {
  load: number;
};

export type WeekBurden = {
  me: PersonBurden;
  partner: PersonBurden;
  total: number;
  meShare: number;
  partnerShare: number;
};

export function summarizeWeekBurden(args: {
  tasks: BurdenTask[];
  completions: CompletionHit[];
  meUid: string;
  partnerUid: string | null;
  start: Date;
  end: Date;
}): WeekBurden {
  const { tasks, completions, meUid, partnerUid } = args;
  const me = { load: 0 };
  const partner = { load: 0 };
  const byId = new Map(tasks.map((task) => [task.id, task]));

  for (const hit of completions) {
    if (!hit.userId) continue;
    const task = byId.get(hit.taskId);
    if (task?.private) continue;
    const weight = task ? burdenWeight(task.burden) : 2;
    if (hit.userId === meUid) me.load += weight;
    else if (!partnerUid || hit.userId === partnerUid) partner.load += weight;
  }

  const total = me.load + partner.load;
  const meShare = total > 0 ? Math.round((me.load / total) * 100) : 0;
  return {
    me,
    partner,
    total,
    meShare,
    partnerShare: total > 0 ? 100 - meShare : 0,
  };
}
