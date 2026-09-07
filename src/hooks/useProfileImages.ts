'use client';

export const dynamic = 'force-dynamic';

import { useAuth } from '@/context/AuthContext';
import { useHousehold } from '@/context/HouseholdContext';

export const useProfileImages = () => {
  const { profileImage } = useAuth();
  const { partnerId, partnerImage } = useHousehold();

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
