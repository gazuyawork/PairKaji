'use client';

import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

export const useProfileImages = () => {
  const [profileImage, setProfileImage] = useState<string>('');
  const [partnerImage, setPartnerImage] = useState<string>('');

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    // 自分の画像を取得
    const unsubscribeProfile = onSnapshot(doc(db, 'users', uid), (docSnap) => {
      const data = docSnap.data();
      const imageUrl = data?.imageUrl || '';
      setProfileImage(imageUrl);
      localStorage.setItem('profileImage', imageUrl);
    });

    // ペアの画像を取得
    const fetchPartnerImage = async () => {
      const pairsSnapshot = await getDoc(doc(db, 'pairs', uid));
      const pairData = pairsSnapshot.data();
      const partnerId = pairData?.userIds?.find((id: string) => id !== uid);

      if (!partnerId) {
        setPartnerImage('');
        localStorage.removeItem('partnerImage');
        return;
      }

      const unsubscribePartner = onSnapshot(doc(db, 'users', partnerId), (partnerSnap) => {
        const partnerData = partnerSnap.data();
        const partnerImageUrl = partnerData?.imageUrl || '';
        setPartnerImage(partnerImageUrl);
        localStorage.setItem('partnerImage', partnerImageUrl);
      });

      return () => {
        unsubscribePartner?.();
      };
    };

    const cleanup = fetchPartnerImage();

    return () => {
      unsubscribeProfile();
      cleanup?.then((f) => f?.());
    };
  }, []);

  // ✅ getProfileImage 関数追加
  const getProfileImage = (person: string): string => {
    if (person === '自分') return profileImage || '/images/default.png';
    if (person === 'パートナー') return partnerImage || '/images/default.png';
    return '/images/default.png';
  };

  return { profileImage, partnerImage, getProfileImage };
};
