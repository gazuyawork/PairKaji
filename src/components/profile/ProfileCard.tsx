// components/ProfileCard.tsx
'use client';

import Image from 'next/image';

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
}: ProfileCardProps) {
  return (
    <div className="min-h-[260px] bg-white shadow rounded-2xl px-4 py-4 space-y-6">
      <p className="ml-4 mb-6">
        <label className="text-[#5E5E5E] font-semibold">プロフィール</label>
      </p>

      <div className="flex flex-row flex-nowrap items-center gap-6 overflow-x-auto">
        <div className="relative shrink-0">
          <Image
            src={profileImage || '/images/default.png'}
            alt="プロフィール画像"
            width={100}
            height={100}
            className="h-24 aspect-square rounded-full object-cover border border-gray-300"
          />
            <input
                type="file"
                accept="image/*"
                className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
                onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onloadend = () => {
                const base64 = reader.result as string;
                localStorage.setItem('profileImage', base64);
                setProfileImage(base64);
                };
                reader.readAsDataURL(file);
            }}
            />
        </div>
        <div className="flex-1 space-y-1 min-w-0">
          <label className="text-[#5E5E5E] font-semibold">氏名</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-w-0 flex-grow text-[#5E5E5E] border-b border-gray-300 py-1 focus:outline-none"
            />
            <button
              onClick={onEditName}
              className="w-12 h-8 rounded-sm text-sm bg-[#FFCB7D] text-white shadow"
            >
              変更
            </button>
          </div>
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
          <div className="flex gap-2 items-center">
            <p className="flex-1 text-[#5E5E5E] border-b border-b-gray-200 py-1">{email}</p>
            {!isGoogleUser && (
              <button
                onClick={onEditEmail}
                className="w-12 h-8 rounded-sm text-sm bg-gray-500 text-white"
              >
                変更
              </button>
            )}
          </div>
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
                className="w-12 h-8 rounded-sm text-sm bg-gray-500 text-white"
              >
                変更
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
