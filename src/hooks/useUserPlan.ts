import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

/**
 * ユーザープラン判定フック
 * - 未ログイン / usersドキュメント未作成 / plan未設定・空文字 でも "free" 扱いに統一
 * - Firestoreの値は trim + lower で正規化
 *
 * 戻り値:
 *  - plan: 'free' | 'premium' | undefined
 *      ※ 失敗時のみ undefined になり得ます
 *  - isChecking: 判定中フラグ
 */
export function useUserPlan(): { plan: string | undefined; isChecking: boolean } {
  const [plan, setPlan] = useState<string | undefined>(undefined);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Auth状態の変化を購読（初回も発火）
    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          // 未ログインは free 扱い（広告を出したい要件に合わせる）
          setPlan('free');
          return;
        }

        const snap = await getDoc(doc(db, 'users', user.uid));
        const raw = snap.exists() ? (snap.data()?.plan as string | undefined) : undefined;

        // 表記ゆれ/未設定/空文字/ドキュメントなし → 'free'
        const normalized =
          typeof raw === 'string' && raw.trim()
            ? raw.trim().toLowerCase()
            : 'free';

        setPlan(normalized);
      } catch (err) {
        console.error('プラン判定失敗:', err);
        setPlan(undefined);
      } finally {
        setIsChecking(false);
      }
    });

    return () => unsub();
  }, []);

  return { plan, isChecking };
}
