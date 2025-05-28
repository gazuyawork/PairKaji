// /src/hooks/useProfileImages.ts
import { useState, useEffect } from 'react';

export const getProfileImage = (name: string): string => {
  if (typeof window === 'undefined') return '/images/default.png';
  if (name === '太郎') return localStorage.getItem('taroImage') ?? '/images/taro.png';
  if (name === '花子') return localStorage.getItem('hanakoImage') ?? '/images/hanako.png';
  return '/images/default.png';
};

export const useProfileImages = () => {
  const [profileImage, setProfileImage] = useState<string>('/images/taro.png');
  const [partnerImage, setPartnerImage] = useState<string>('/images/hanako.png');

  useEffect(() => {
    const storedProfileImage = localStorage.getItem('profileImage');
    const storedPartnerImage = localStorage.getItem('partnerImage');

    if (storedProfileImage) setProfileImage(storedProfileImage);
    if (storedPartnerImage) setPartnerImage(storedPartnerImage);
  }, []);

  return { profileImage, partnerImage };
};
