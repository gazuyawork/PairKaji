// /src/hooks/useProfileImages.ts
import { useState, useEffect } from 'react';

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
