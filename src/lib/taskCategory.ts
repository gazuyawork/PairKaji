export type TaskCategory = '買い物' | '未設定';
export type TaskCategoryUI = '買い物' | null;

function asNorm(raw: unknown): string {
  return typeof raw === 'string' ? raw.normalize('NFKC').trim().toLowerCase() : '';
}

export function isShoppingCategory(raw: unknown): boolean {
  return ['買い物', '買物', 'かいもの', 'shopping', 'purchase', 'groceries'].includes(asNorm(raw));
}

export function isRetiredCategory(raw: unknown): boolean {
  const s = asNorm(raw);
  return (
    isShoppingCategory(raw) ||
    ['料理', 'りょうり', 'cooking', 'cook', 'meal'].includes(s) ||
    ['旅行', 'りょこう', 'travel', 'trip', 'journey', 'tour'].includes(s)
  );
}

export function parseCategoryForUI(_v: unknown): TaskCategoryUI {
  return null;
}

export function normalizeCategoryForSave(_v: unknown): TaskCategory {
  return '未設定';
}
