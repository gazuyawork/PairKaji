'use client';

import Image from 'next/image';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { db, auth } from '@/lib/firebase';
import { uploadProfileImage } from '@/lib/firebaseUtils';
import { Check, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import ProfileImageAdjustModal from '@/components/profile/ProfileImageAdjustModal';

type ProfileCardProps = {
  profileImage: string | null;
  setProfileImage: React.Dispatch<React.SetStateAction<string | null>>;
  name: string;
  setName: (name: string) => void;
  isGoogleUser: boolean;
  onEditName: () => void;
  onEditEmail: () => void;
  onEditPassword: () => void;
  email: string;
  isLoading: boolean;
  nameUpdateStatus: 'idle' | 'loading' | 'success';
};

export default function ProfileCard({
  profileImage,
  setProfileImage,
  name,
  setName,
  isGoogleUser,
  onEditName,
  onEditEmail,
  onEditPassword,
  email,
  isLoading,
  nameUpdateStatus,
}: ProfileCardProps) {
  const renderEditButtonContent = () => {
    switch (nameUpdateStatus) {
      case 'loading':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'success':
        return <Check className="w-4 h-4 text-white" />;
      default:
        return <span>変更</span>;
    }
  };

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [adjustUrl, setAdjustUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadAdjusted = (file: File) => {
    const user = auth.currentUser;
    if (!user) {
      toast.error('ログイン状態が確認できません');
      return;
    }
    setIsUploadingImage(true);
    uploadProfileImage(user.uid, file, 'user')
      .then((downloadUrl) => {
        setProfileImage(downloadUrl);
        return updateDoc(doc(db, 'users', user.uid), {
          imageUrl: downloadUrl,
          updatedAt: serverTimestamp(),
        });
      })
      .catch((err) => {
        console.error('画像アップロード失敗', err);
        toast.error('プロフィール画像の更新に失敗しました');
      })
      .finally(() => {
        setIsUploadingImage(false);
      });
  };

  const closeAdjust = () => {
    if (adjustUrl) URL.revokeObjectURL(adjustUrl);
    setAdjustUrl(null);
  };

  return (
    <motion.div
      className="relative bg-white shadow rounded-2xl px-4 py-4 space-y-4 mx-auto w-full max-w-xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <p className="mb-2">
        <span className="text-sm font-semibold text-[#5E5E5E]">プロフィール</span>
      </p>

      <div className="flex flex-row flex-nowrap items-center gap-6 overflow-x-auto">
        <div className="relative shrink-0">
          {isLoading ? (
            <div className="w-24 h-24 bg-gray-200 animate-pulse rounded-full" />
          ) : (
            <>
              {isUploadingImage ? (
                <div
                  style={{ width: 100, height: 100 }}
                  className="bg-white rounded-full border border-gray-300 flex items-center justify-center"
                >
                  <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
                </div>
              ) : (
                <Image
                  src={profileImage || '/images/default.png'}
                  alt="プロフィール画像"
                  width={100}
                  height={100}
                  className="aspect-square rounded-full object-cover border border-gray-300"
                />
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;

                  if (!file.type.startsWith('image/')) {
                    toast.error('画像ファイルを選択してください');
                    return;
                  }

                  if (file.size > 5 * 1024 * 1024) {
                    toast.error('画像サイズは5MB以下にしてください');
                    return;
                  }

                  if (adjustUrl) URL.revokeObjectURL(adjustUrl);
                  setAdjustUrl(URL.createObjectURL(file));
                }}
              />
            </>
          )}
        </div>

        <div className="flex-1 space-y-1 min-w-0">
          <label className="text-[#5E5E5E] font-semibold">氏名</label>
          {isLoading ? (
            <div className="h-8 bg-gray-200 animate-pulse rounded" />
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="min-w-0 flex-grow min-h-12 text-base text-[#5E5E5E] border-b border-gray-300 py-2 focus:outline-none"
              />
              <button
                onClick={onEditName}
                disabled={nameUpdateStatus === 'loading'}
                className="min-h-11 min-w-14 shrink-0 rounded-lg px-3 text-sm font-semibold bg-[#FFCB7D] text-white shadow active:opacity-90 disabled:opacity-60"
              >
                {renderEditButtonContent()}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-[#5E5E5E] font-semibold flex items-center gap-2">
            メールアドレス
            {isGoogleUser && (
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                Googleログインでは変更不可
              </span>
            )}
          </label>
          {isLoading ? (
            <div className="h-6 bg-gray-200 animate-pulse rounded" />
          ) : (
            <div className="flex gap-2 items-center">
              <p className="flex-1 text-[#5E5E5E] border-b border-b-gray-200 py-1">{email}</p>
              {!isGoogleUser && (
                <button
                  onClick={onEditEmail}
                  className="min-h-11 min-w-14 shrink-0 rounded-lg bg-gray-500 px-3 text-sm font-semibold text-white active:opacity-90"
                >
                  変更
                </button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-[#5E5E5E] font-semibold flex items-center gap-2">
            パスワード
            {isGoogleUser && (
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                Googleログインでは変更不可
              </span>
            )}
          </label>
          {isLoading ? (
            <div className="h-6 bg-gray-200 animate-pulse rounded" />
          ) : (
            <div className="flex gap-2 items-center">
              <input
                type="password"
                value="●●●●●●●●"
                readOnly
                className="flex-1 text-[#5E5E5E] border-b border-gray-300 py-1 tracking-widest focus:outline-none"
              />
              {!isGoogleUser && (
                <button
                  onClick={onEditPassword}
                  className="min-h-11 min-w-14 shrink-0 rounded-lg bg-gray-500 px-3 text-sm font-semibold text-white active:opacity-90"
                >
                  変更
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {adjustUrl && (
        <ProfileImageAdjustModal
          imageUrl={adjustUrl}
          onCancel={closeAdjust}
          onConfirm={(file) => {
            closeAdjust();
            uploadAdjusted(file);
          }}
        />
      )}
    </motion.div>
  );
}
