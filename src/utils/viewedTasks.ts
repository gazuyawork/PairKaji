// utils/viewedTasks.ts

export const VIEWED_FLAGGED_TASK_IDS_KEY = 'viewedFlaggedTaskIds';

export const getViewedFlaggedTaskIds = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(VIEWED_FLAGGED_TASK_IDS_KEY) || '[]');
  } catch {
    return [];
  }
};

export const markTaskAsViewed = (taskId: string) => {
  if (typeof window === 'undefined') return;
  const viewed = getViewedFlaggedTaskIds();
  if (!viewed.includes(taskId)) {
    viewed.push(taskId);
    localStorage.setItem(VIEWED_FLAGGED_TASK_IDS_KEY, JSON.stringify(viewed));
  }
};

export const clearViewedFlaggedTaskIds = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(VIEWED_FLAGGED_TASK_IDS_KEY);
};
