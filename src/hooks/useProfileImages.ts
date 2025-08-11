'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { db, storage } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  onSnapshot,
} from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { useUserUid } from '@/hooks/useUserUid';

export const useProfileImages = () => {
  const [profileImage, setProfileImage] = useState<string>('/images/default.png');
  const [partnerImage, setPartnerImage] = useState<string>('/images/default.png');
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const uid = useUserUid();

  const resolveImageUrl = async (rawUrl?: string) => {
    if (!rawUrl || rawUrl.trim() === '') {
      return '/images/default.png';
    }
    if (rawUrl.startsWith('gs://') || (!rawUrl.startsWith('http') && !rawUrl.startsWith('/'))) {
      try {
        return await getDownloadURL(ref(storage, rawUrl));
      } catch (e) {
        console.warn('getDownloadURL失敗', rawUrl, e);
        return '/images/default.png';
      }
    }
    return rawUrl;
  };

  // 自分のプロフィール画像
  useEffect(() => {
    if (!uid) return;

    const unsubscribeProfile = onSnapshot(doc(db, 'users', uid), async (docSnap) => {
      const data = docSnap.data();
      const imageUrl = await resolveImageUrl(data?.imageUrl || '');
      setProfileImage(imageUrl);
      localStorage.setItem('profileImage', imageUrl);
    });

    return () => {
      unsubscribeProfile();
    };
  }, [uid]);

  // ペアID取得
  useEffect(() => {
    if (!uid) return;

    const fetchPartnerId = async () => {
      const q = query(collection(db, 'pairs'), where('userIds', 'array-contains', uid));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setPartnerId(null);
        localStorage.removeItem('partnerImage');
        return;
      }

      const docRef = snapshot.docs.find((d) => d.data().status === 'confirmed');
      if (!docRef) {
        setPartnerId(null);
        localStorage.removeItem('partnerImage');
        return;
      }

      const pairData = docRef.data();
      const pid = pairData.userIds?.find((id: string) => id !== uid) ?? null;
      setPartnerId(pid);
    };

    fetchPartnerId();
  }, [uid]);

  // パートナー画像
  useEffect(() => {
    if (!partnerId) return;

    const unsubscribePartner = onSnapshot(doc(db, 'users', partnerId), async (snap) => {
      const data = snap.data();
      const imageUrl = await resolveImageUrl(data?.imageUrl || '');
      setPartnerImage(imageUrl);
      localStorage.setItem('partnerImage', imageUrl);
    });

    return () => unsubscribePartner();
  }, [partnerId]);

  const getProfileImage = (person: string): string => {
    if (person === '自分') return profileImage;
    if (person === 'パートナー') return partnerImage;
    return '/images/default.png';
  };

  return {
    profileImage,
    partnerImage,
    getProfileImage,
    partnerId,
  };
};
