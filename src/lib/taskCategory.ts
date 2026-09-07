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
    ['料理', 'りょうり', 'cooking', 'cook', 'meal'].includes(s) ||
    ['旅行', 'りょこう', 'travel', 'trip', 'journey', 'tour'].includes(s)
  );
}

export function parseCategoryForUI(v: unknown): TaskCategoryUI {
  if (isShoppingCategory(v)) return '買い物';
  return null;
}

export function normalizeCategoryForSave(v: unknown): TaskCategory {
  return isShoppingCategory(v) ? '買い物' : '未設定';
}
