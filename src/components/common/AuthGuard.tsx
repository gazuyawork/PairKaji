// src/components/AuthGuard.tsx

'use client';

/**
 * AuthGuard コンポーネント
 *
 * 認証されていないユーザーがログインページ以外にアクセスするのを防ぐためのガードコンポーネント。
 * Firebase Auth によるユーザー認証状態を確認し、未ログインなら `/login` にリダイレクトする。
 * 認証が確認されるまで `children` を表示しない。
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true); // ユーザー確認中フラグ

  useEffect(() => {
    // Firebaseの認証状態が変更されたときのリスナー登録
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        // 🔒 認証されていない場合はログイン画面に遷移させる
        router.replace('/login');
      } else {
        // ✅ 認証されていれば、描画を許可する
        setChecking(false);
      }
    });

    // コンポーネントのアンマウント時にリスナー解除
    return () => unsubscribe();
  }, [router]);

  // 🔸 ユーザー確認中は何も表示しない（ちらつきを防ぐ）
  if (checking) return null;

  // 認証済みユーザーの場合、子要素（protectedページ）を描画
  return <>{children}</>;
}
