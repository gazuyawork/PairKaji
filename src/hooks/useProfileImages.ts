'use client';

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

export const useProfileImages = () => {
  const [profileImage, setProfileImage] = useState<string>('');
  const [partnerImage, setPartnerImage] = useState<string>('');
  const [partnerId, setPartnerId] = useState<string | null>(null);

  // ✅ 自分のプロフィール画像取得・監視
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const unsubscribeProfile = onSnapshot(doc(db, 'users', uid), (docSnap) => {
      const data = docSnap.data();
      const imageUrl = data?.imageUrl || '';
      setProfileImage(imageUrl);
      localStorage.setItem('profileImage', imageUrl);
    });

    return () => {
      unsubscribeProfile();
    };
  }, []);

  // ✅ partnerId を Firestore から取得（confirmed のペアのみ）
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const fetchPartnerId = async () => {
      const q = query(collection(db, 'pairs'), where('userIds', 'array-contains', uid));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        console.warn('❌ pairs ドキュメントが存在しません');
        setPartnerId(null);
        localStorage.removeItem('partnerImage');
        return;
      }

      const docRef = snapshot.docs.find((d) => d.data().status === 'confirmed');
      if (!docRef) {
        console.warn('⚠ confirmed 状態のペアが存在しません');
        setPartnerId(null);
        localStorage.removeItem('partnerImage');
        return;
      }

      const pairData = docRef.data();
      const pid = pairData.userIds?.find((id: string) => id !== uid) ?? null;

      console.log('✅ partnerId:', pid);
      setPartnerId(pid);
    };

    fetchPartnerId();
  }, []);

  // ✅ partnerId を監視して、パートナー画像取得
  useEffect(() => {
    if (!partnerId) {
      return;
    }

    console.log('📡 onSnapshot 設定開始 for partnerId:', partnerId);
    const unsubscribePartner = onSnapshot(doc(db, 'users', partnerId), (snap) => {
      const data = snap.data();
      console.log('👀 partner user doc:', data);
      const imageUrl = data?.imageUrl || '';
      setPartnerImage(imageUrl);
      localStorage.setItem('partnerImage', imageUrl);
    });

    return () => unsubscribePartner();
  }, [partnerId]);

  // ✅ fallback付き getter
  const getProfileImage = (person: string): string => {
    if (person === '自分') return profileImage || '/images/default.png';
    if (person === 'パートナー') return partnerImage || '/images/default.png';
    return '/images/default.png';
  };

  return { profileImage, partnerImage, getProfileImage, partnerId };
};
