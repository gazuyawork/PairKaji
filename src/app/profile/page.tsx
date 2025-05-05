// src/app/profile/page.tsx

'use client';

import Header from '@/components/Header';
import FooterNav from '@/components/FooterNav';
import { useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';

export default function ProfilePage() {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('太郎');
  const [email, setEmail] = useState('taro@example.com');
  const [password, setPassword] = useState('password');
  const [showPassword, setShowPassword] = useState(false);
  const [profileImage, setProfileImage] = useState('/images/taro.png');

  const handleToggleEdit = () => setIsEditing(!isEditing);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const imageUrl = URL.createObjectURL(file);
      setProfileImage(imageUrl);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]">
      <Header title="Profile" />

      <main className="flex-1 px-4 py-6 space-y-6">
        {/* プロフィールカード */}
        <div className="bg-white shadow rounded-2xl px-4 py-4">
          {/* プロフィール画像＋情報 */}
          <div className="flex items-center gap-4 mb-4">
            <div className="relative">
              <img
                src={profileImage}
                alt="プロフィール画像"
                className="w-20 h-20 rounded-full object-cover border border-gray-300"
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
              {/* 氏名 */}
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

              {/* メールアドレス */}
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

          {/* パスワード */}
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

          {/* 招待コード（常時表示） */}
          <div className="space-y-1">
            <label className="text-[#5E5E5E] font-semibold">招待コード</label>
            <p className="text-[#5E5E5E] border-b border-b-gray-200 py-1">ABC12345</p>
          </div>

          <button
            onClick={handleToggleEdit}
            className="mt-2 bg-[#FFCB7D] text-white font-bold py-2 px-4 rounded-xl shadow w-full"
          >
            {isEditing ? '保存する' : '変更する'}
          </button>
        </div>

        {/* パートナー設定済みの例 */}
        <div className="bg-white shadow rounded-2xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/images/hanako.png"
              alt="パートナー画像"
              className="w-12 h-12 rounded-full object-cover border border-gray-300"
            />
            <div className="text-[#5E5E5E]">
              <p className="font-semibold">花子</p>
              <p className="">partner@example.com</p>
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
