'use client';

import Header from '@/components/Header';
import FooterNav from '@/components/FooterNav';
import { Eye, EyeOff, X } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import {
  updateEmail,
  updatePassword,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  updateDoc
} from 'firebase/firestore';

export default function ProfilePage() {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [profileImage, setProfileImage] = useState('/images/default.png');
  const [partnerImage, setPartnerImage] = useState('/images/hanako_default.png');

  // 初期読み込み（Firestore + localStorage）
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
      if (storedImage) {
        setProfileImage(storedImage);
      }

      const storedPartnerImage = localStorage.getItem('partnerImage');
      if (storedPartnerImage) {
        setPartnerImage(storedPartnerImage);
      }
    };
    fetchProfile();
  }, []);

  const handleToggleEdit = () => setIsEditing(!isEditing);

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

  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) return alert('ログイン情報が確認できません');

    try {
      if (email !== user.email) {
        await updateEmail(user, email);
      }

      await updatePassword(user, password);

      await updateDoc(doc(db, 'users', user.uid), {
        name,
        updatedAt: new Date(),
      });

      alert('プロフィールを更新しました');
      setIsEditing(false);
    } catch (err) {
      console.error(err);
      alert('プロフィールの更新に失敗しました');
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]">
      <Header title="Profile" />

      <main className="flex-1 px-4 py-6 space-y-6 overflow-y-auto">
        {/* プロフィールカード */}
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
              {isEditing && (
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
                />
              )}
            </div>
            <div className="flex-1 space-y-4">
              <div className="space-y-1">
                <label className="text-[#5E5E5E] font-semibold">氏名</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full text-[#5E5E5E] border-b border-gray-300 py-1 focus:outline-none"
                  />
                ) : (
                  <p className="text-[#5E5E5E] border-b border-b-gray-200 py-1">{name}</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[#5E5E5E] font-semibold">メールアドレス</label>
                {isEditing ? (
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full text-[#5E5E5E] border-b border-gray-300 py-1 focus:outline-none"
                  />
                ) : (
                  <p className="text-[#5E5E5E] border-b border-b-gray-200 py-1">{email}</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1 mb-5">
            <label className="text-[#5E5E5E] font-semibold">パスワード</label>
            <div className="relative">
              <input
                type={isEditing ? (showPassword ? 'text' : 'password') : 'text'}
                value={isEditing ? password : '●●●●●●●●'}
                onChange={(e) => isEditing && setPassword(e.target.value)}
                className="w-full text-[#5E5E5E] border-b border-gray-300 py-1 pr-8 tracking-widest focus:outline-none"
                readOnly={!isEditing}
              />
              {isEditing && (
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-0 top-1 text-gray-400"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[#5E5E5E] font-semibold">招待コード</label>
            <p className="text-[#5E5E5E] border-b border-b-gray-200 py-1">ABC12345</p>
          </div>

          <button
            onClick={isEditing ? handleSave : handleToggleEdit}
            className="mt-2 bg-[#FFCB7D] text-white font-bold py-2 px-4 rounded-xl shadow w-full"
          >
            {isEditing ? '保存する' : '変更する'}
          </button>
        </div>

        {/* パートナー表示例 */}
        <div className="bg-white shadow rounded-2xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src={partnerImage}
              alt="パートナー画像"
              width={60}
              height={60}
              className="w-24 h-24 rounded-full object-cover border border-gray-300"
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
    </div>
  );
}
