// src/components/PairInit.tsx

'use client';

export const dynamic = 'force-dynamic'

/**
 * PairInit コンポーネント
 *
 * ログインユーザーが存在する場合に、Firestore からペアIDを取得し、
 * `sessionStorage` に保存する非表示ユーティリティコンポーネント。
 * ペア情報を全画面で扱いやすくするための初期化処理を担当する。
 */

import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { fetchPairId } from '@/lib/firebaseUtils';

export default function PairInit() {
  useEffect(() => {
    // Firebase Auth 状態の変化を監視するリスナーを登録
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // ユーザーがログインしている場合にのみ処理を実行
      if (user) {
        // Firestore からペアIDを取得
        const pairId = await fetchPairId();
        if (pairId) {
          // 取得したペアIDをセッションストレージに保存
          sessionStorage.setItem('pairId', pairId);
        }
      }
    });

    // コンポーネントのアンマウント時にリスナーを解除
    return () => unsubscribe();
  }, []);

  // 表示なしのコンポーネント（初期化専用）
  return null;
}
