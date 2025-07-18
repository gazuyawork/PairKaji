import { useEffect, useState, useCallback } from 'react';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, doc, getDocs, onSnapshot } from 'firebase/firestore';

/**
 * ポイント編集モーダル用のカスタムフック。
 * 初期ポイント・Firestoreのペアポイント設定に応じて状態を制御。
 *
 * @param initialPoint 初期設定ポイント（指定されていればそれを優先）
 * @param setRouletteEnabled ルーレット機能のON/OFF状態を更新するsetter
 * @param setRouletteOptions ルーレットの選択肢リストを更新するsetter
 */
export function useEditPointData(
  initialPoint: number,
  setRouletteEnabled: (enabled: boolean) => void,
  setRouletteOptions: (options: string[]) => void
) {
  const [point, setPoint] = useState<number>(0);         // 合計ポイント（週次目標）
  const [selfPoint, setSelfPoint] = useState<number>(0); // 自分が担うポイント

  /**
   * Firestore上のタスク情報から合計ポイントを計算。
   * 各タスクの頻度・ポイントに応じて週次ポイントを算出。
   */
  const calculatePoints = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    try {
      const q = query(collection(db, 'tasks'), where('userIds', 'array-contains', uid));
      const snapshot = await getDocs(q);

      let total = 0;

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        const pt = data.point ?? 0;
        const freq = data.period;
        const days = data.daysOfWeek ?? [];

        if (freq === '毎日') {
          total += pt * 7;
        } else if (freq === '週次') {
          total += pt * days.length;
        }
      });

      const half = Math.floor(total / 2);
      const extra = total % 2; // 奇数ポイントの余りを自分側に足す
      setPoint(total);
      setSelfPoint(half + extra);
    } catch (err) {
      console.error('ポイント自動算出失敗:', err);
    }
  }, []);

  /**
   * 初回レンダリング & Firestore上のポイントデータが更新されたときの処理。
   */
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    if (initialPoint && initialPoint > 0) {
      // 明示的に初期ポイントが与えられている場合はそれを使用
      setPoint(initialPoint);
      setSelfPoint(Math.ceil(initialPoint / 2));
    } else {
      // そうでなければ自動算出処理を実行
      calculatePoints();
    }

    // Firestore上の自分のポイントデータにリアルタイムで反応
    const unsubscribe = onSnapshot(doc(db, 'points', uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();

        if (typeof data.weeklyTargetPoint === 'number') {
          setPoint(data.weeklyTargetPoint);
        }
        if (typeof data.selfPoint === 'number') {
          setSelfPoint(data.selfPoint);
        }
        if (typeof data.rouletteEnabled === 'boolean') {
          setRouletteEnabled(data.rouletteEnabled);
        }
        if (Array.isArray(data.rouletteOptions)) {
          setRouletteOptions(data.rouletteOptions);
        }
      }
    });

    // コンポーネントアンマウント時に監視解除
    return () => unsubscribe();
  }, [initialPoint, setRouletteEnabled, setRouletteOptions, calculatePoints]);

  return {
    point,
    selfPoint,
    setPoint,
    setSelfPoint,
    calculatePoints,
  };
}
