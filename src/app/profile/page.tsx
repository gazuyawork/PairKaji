'use client';

import Header from '@/components/Header';
import FooterNav from '@/components/FooterNav';
import { Eye, EyeOff, X } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import EmailEditModal from '@/components/EmailEditModal';
import PasswordEditModal from '@/components/PasswordEditModal';

export default function ProfilePage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [profileImage, setProfileImage] = useState('/images/default.png');
  const [partnerImage, setPartnerImage] = useState('/images/hanako_default.png');
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setName(data.name || '');
        setEmail(user.email || '');
      }

      const storedImage = localStorage.getItem('profileImage');
      if (storedImage) setProfileImage(storedImage);

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
    if (!user) return alert('ログイン情報が確認できません');
    if (!name.trim()) {
      toast.error('氏名を入力してください');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        name,
        updatedAt: new Date(),
      });
      toast.success('氏名を更新しました');
    } catch (err: any) {
      console.error(err);
      toast.error(`氏名の保存に失敗しました: ${err.message || '不明なエラー'}`);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]">
      <Header title="Profile" />

      <main className="flex-1 px-4 py-6 space-y-6 overflow-y-auto">
        <div className="bg-white shadow rounded-2xl px-4 py-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="relative">
              <Image
                src={profileImage}
                alt="プロフィール画像"
                width={100}
                height={100}
                className="w-24 h-24 rounded-full object-cover border border-gray-300"
              />
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            <div className="flex-1 space-y-4">
              <div className="space-y-1">
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
                    className="text-sm bg-[#FFCB7D] text-white px-3 py-1 rounded shadow"
                  >
                    変更
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[#5E5E5E] font-semibold">メールアドレス</label>
                <div className="flex gap-2 items-center">
                  <p className="flex-1 text-[#5E5E5E] border-b border-b-gray-200 py-1">{email}</p>
                  <button
                    onClick={() => setIsEmailModalOpen(true)}
                    className="text-sm bg-gray-300 text-white px-3 py-1 rounded"
                  >
                    変更
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1 mb-5">
            <label className="text-[#5E5E5E] font-semibold">パスワード</label>
            <div className="flex gap-2 items-center">
              <input
                type="password"
                value={'●●●●●●●●'}
                readOnly
                className="flex-1 text-[#5E5E5E] border-b border-gray-300 py-1 tracking-widest focus:outline-none"
              />
              <button
                onClick={() => setIsPasswordModalOpen(true)}
                className="text-sm bg-gray-300 text-white px-3 py-1 rounded"
              >
                変更
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[#5E5E5E] font-semibold">招待コード</label>
            <p className="text-[#5E5E5E] border-b border-b-gray-200 py-1">ABC12345</p>
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

      <FooterNav />

      <EmailEditModal
        open={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        currentEmail={email}
        onUpdated={(newEmail) => setEmail(newEmail)}
      />

      <PasswordEditModal
        open={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      />
    </div>
  );
}