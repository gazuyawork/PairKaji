// src/hooks/useUserUid.ts

import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';

/**
 * 現在ログインしているユーザーの UID（ユーザーID）を取得するためのカスタムフック。
 * 
 * 特徴：
 * - Firebase Authentication の onAuthStateChanged を使って、認証状態の変化をリアルタイムで監視
 * - ログイン・ログアウトが行われると自動で状態を更新
 * - Reactの関数コンポーネントのトップレベルでのみ使用する（ルール違反に注意）
 * 
 * 注意：
 * - 通常の関数や非コンポーネント関数の中では絶対に使わないこと
 */
export function useUserUid(): string | null {
  // UIDの状態を保持する（初期値はnull）
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    // Firebase Authのユーザー状態を監視
    const unsubscribe = auth.onAuthStateChanged(user => {
      // ログインしていればUIDをセット、していなければnull
      setUid(user?.uid ?? null);
    });

    // クリーンアップ関数：コンポーネントがアンマウントされたときに監視を解除
    return () => unsubscribe();
  }, []);

  // 現在のUIDを返す
  return uid;
}
