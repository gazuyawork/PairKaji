'use client';

import Header from '@/components/Header';
import { X } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import EmailEditModal from '@/components/EmailEditModal';
import PasswordEditModal from '@/components/PasswordEditModal';
import Link from 'next/link';

export default function ProfilePage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isGoogleUser, setIsGoogleUser] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(
    typeof window !== 'undefined' ? localStorage.getItem('profileImage') : null
  );
  const [partnerImage, setPartnerImage] = useState('/images/hanako_default.png');
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      const user = auth.currentUser;
      if (!user) return;

      await user.reload();
      const refreshedUser = auth.currentUser;

      setIsGoogleUser(
        refreshedUser?.providerData.some((p) => p.providerId === 'google.com') ?? false
      );

      const ref = doc(db, 'users', user.uid);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = snap.data();
        setName(data.name || user.email?.split('@')[0] || '');
      } else {
        await setDoc(ref, {
          name: user.email?.split('@')[0] || '',
          createdAt: new Date(),
        });
        setName(user.email?.split('@')[0] || '');
      }

      setEmail(user.email || '');

      const storedImage = localStorage.getItem('profileImage');
      if (storedImage) {
        setProfileImage(storedImage);
      } else {
        setProfileImage('/images/default.png');
      }

      const storedPartnerImage = localStorage.getItem('partnerImage');
      if (storedPartnerImage) setPartnerImage(storedPartnerImage);
    };
    fetchProfile();
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      localStorage.setItem('profileImage', base64);
      setProfileImage(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveName = async () => {
    const user = auth.currentUser;
    if (!user || !name.trim()) return;

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        name,
        updatedAt: new Date(),
      });
      toast.success('氏名を更新しました');
    } catch (err) {
      console.error(err);
      toast.error('氏名の保存に失敗しました');
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]">
      <Header title="Profile" />

      <main className="flex-1 px-4 py-6 space-y-6 overflow-y-auto">
        <div className="bg-white shadow rounded-2xl px-4 py-4 space-y-6">
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
                onChange={handleImageChange}
                className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>

            <div className="flex-1 space-y-1 min-w-0">
              <label className="text-[#5E5E5E] font-semibold">氏名</label>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1 text-[#5E5E5E] border-b border-gray-300 py-1 focus:outline-none"
                />
                <button
                  onClick={handleSaveName}
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
                    onClick={() => setIsEmailModalOpen(true)}
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
                  value={'●●●●●●●●'}
                  readOnly
                  className="flex-1 text-[#5E5E5E] border-b border-gray-300 py-1 tracking-widest focus:outline-none"
                />
                {!isGoogleUser && (
                  <button
                    onClick={() => setIsPasswordModalOpen(true)}
                    className="w-12 h-8 rounded-sm text-sm bg-gray-500 text-white"
                  >
                    変更
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[#5E5E5E] font-semibold">招待コード</label>
              <p className="text-[#5E5E5E] border-b border-b-gray-200 py-1">ABC12345</p>
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-2xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src={partnerImage}
              alt="パートナー画像"
              width={60}
              height={60}
              className="w-16 h-16 rounded-full object-cover border border-gray-300"
            />
            <div className="text-[#5E5E5E]">
              <p className="font-semibold">花子</p>
              <p>partner@example.com</p>
            </div>
          </div>
          <button className="text-red-500">
            <X size={24} />
          </button>
        </div>
      </main>

      <div className="text-center mt-auto mb-10">
        <Link href="/delete-account" className="text-xs text-gray-400 hover:underline">
          アカウントを削除する
        </Link>
      </div>

      <EmailEditModal
        open={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
      />

      <PasswordEditModal
        open={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      />
    </div>
  );
}
