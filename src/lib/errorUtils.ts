/**
 * Firestore で発生した例外をユーザーに通知するためのエラーハンドリングユーティリティ。
 * - 例外オブジェクトの種類を判定し、適切なエラーメッセージを toast 経由で表示する。
 * - 他のユーティリティや画面から再利用可能。
 */

import { toast } from 'sonner';

/**
 * Firestore 処理で発生したエラーをハンドリングして、ユーザーにトースト通知を表示する。
 * - 通常の Error オブジェクトには詳細なメッセージを表示
 * - その他の型（null や string など）には汎用メッセージで対応
 *
 * @param error 捕捉した例外オブジェクト（型は unknown を想定）
 */
export const handleFirestoreError = (error: unknown): void => {
  if (error instanceof Error) {
    toast.error(`Firestoreエラー: ${error.message}`);
  } else {
    toast.error('Firestoreエラーが発生しました');
  }
};
