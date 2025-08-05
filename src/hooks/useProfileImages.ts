'use client';

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  onSnapshot,
} from 'firebase/firestore';

/**
 * プロフィール画像とパートナー画像の取得・監視・保存を行うカスタムフック
 */
export const useProfileImages = () => {
  const [profileImage, setProfileImage] = useState<string>('');     // 自分のプロフィール画像URL
  const [partnerImage, setPartnerImage] = useState<string>('');     // パートナーのプロフィール画像URL
  const [partnerId, setPartnerId] = useState<string | null>(null);  // パートナーのユーザーID

  /**
   * 自分のプロフィール画像を Firestore から取得し、リアルタイムで監視
   */
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const unsubscribeProfile = onSnapshot(doc(db, 'users', uid), (docSnap) => {
      const data = docSnap.data();
      const imageUrl = data?.imageUrl || '';
      setProfileImage(imageUrl);

      // ローカルストレージにも保存（ページ跨ぎ再利用用など）
      localStorage.setItem('profileImage', imageUrl);
    });

    return () => {
      unsubscribeProfile(); // コンポーネントアンマウント時に監視解除
    };
  }, []);

  /**
   * 自分に紐づく confirmed 状態のペア（partnerId）を Firestore から1回取得
   */
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const fetchPartnerId = async () => {
      const q = query(collection(db, 'pairs'), where('userIds', 'array-contains', uid));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        // ペア情報なし → partnerImageもリセット
        setPartnerId(null);
        localStorage.removeItem('partnerImage');
        return;
      }

      // confirmed 状態のペアのみ対象とする
      const docRef = snapshot.docs.find((d) => d.data().status === 'confirmed');
      if (!docRef) {
        console.warn('⚠ confirmed 状態のペアが存在しません');
        setPartnerId(null);
        localStorage.removeItem('partnerImage');
        return;
      }

      const pairData = docRef.data();
      const pid = pairData.userIds?.find((id: string) => id !== uid) ?? null;
      setPartnerId(pid);
    };

    fetchPartnerId();
  }, []);

  /**
   * partnerId がセットされたら、該当ユーザーのプロフィール画像を Firestore から取得して監視
   */
  useEffect(() => {
    if (!partnerId) return;

    const unsubscribePartner = onSnapshot(doc(db, 'users', partnerId), (snap) => {
      const data = snap.data();
      const imageUrl = data?.imageUrl || '';
      setPartnerImage(imageUrl);

      // ローカルストレージにも保存
      localStorage.setItem('partnerImage', imageUrl);
    });

    return () => unsubscribePartner();
  }, [partnerId]);

  /**
   * プロフィール画像の取得関数（引数に応じて自分・パートナーの画像URLを返す）
   * @param person '自分' または 'パートナー'
   * @returns プロフィール画像のURL（なければデフォルト画像）
   */
  const getProfileImage = (person: string): string => {
    if (person === '自分') return profileImage || '/images/default.png';
    if (person === 'パートナー') return partnerImage || '/images/default.png';
    return '/images/default.png'; // 想定外の値が来た場合
  };

  // ✅ 呼び出し元に返す値
  return {
    profileImage,     // 自分の画像URL
    partnerImage,     // パートナーの画像URL
    getProfileImage,  // 画像取得用ユーティリティ関数
    partnerId,        // 現在のパートナーID（未設定時は null）
  };
};
