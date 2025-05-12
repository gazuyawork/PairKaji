// src/app/profile/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import Image from 'next/image';
import Header from '@/components/Header';
import FooterNav from '@/components/FooterNav';
import { auth, db, storage } from '@/lib/firebase';
import {
  verifyBeforeUpdateEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export default function ProfilePage() {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [profileImage, setProfileImage] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; password?: string }>({});

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const fetchUserData = async () => {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setName(data.name || '');
        setProfileImage(data.profileImage || '/images/default.png');
        setInviteCode(data.inviteCode || '');
        setEmail(user.email || '');
      }
    };

    fetchUserData();
  }, []);

  const handleToggleEdit = async () => {
    const user = auth.currentUser;
    if (!user || !user.uid) {
      setErrorMsg('ユーザー情報の取得に失敗しました。再ログインしてください。');
      return;
    }

    if (!isEditing) {
      setIsEditing(true);
      return;
    }

    const errors: typeof fieldErrors = {};
    if (!name.trim()) errors.name = '氏名を入力してください';
    if (!email.trim()) errors.email = 'メールアドレスを入力してください';
    if (!password.trim()) errors.password = 'パスワードを入力してください';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setErrorMsg('');

    const executeSave = async () => {
      try {
        if (email !== user.email) {
          await verifyBeforeUpdateEmail(user, email);
          setErrorMsg('新しいメールアドレスに確認メールを送信しました。リンクをクリックして変更を完了してください。');
        }

        if (password) {
          await updatePassword(user, password);
        }

        let imageUrl = profileImage;
        if (imageFile && user.uid) {
          const imageRef = ref(storage, `profiles/${user.uid}`);
          await uploadBytes(imageRef, imageFile);
          imageUrl = await getDownloadURL(imageRef);
        }

        await setDoc(doc(db, 'users', user.uid), {
          name,
          profileImage: imageUrl,
          inviteCode,
        });

        setProfileImage(imageUrl);
        setIsEditing(false);
      } catch (err: any) {
        console.error(err);
        setErrorMsg(err.message || '更新に失敗しました');
      }
    };

    try {
      await executeSave();
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        const inputPassword = prompt('再認証が必要です。現在のパスワードを再入力してください。');
        if (inputPassword) {
          try {
            const credential = EmailAuthProvider.credential(user.email || '', inputPassword);
            await reauthenticateWithCredential(user, credential);
            await executeSave();
          } catch (reauthErr: any) {
            setErrorMsg('再認証に失敗しました。パスワードが正しいか確認してください。');
          }
        } else {
          setErrorMsg('パスワードの入力がキャンセルされました。');
        }
      } else {
        console.error(err);
        setErrorMsg(err.message || '更新に失敗しました');
      }
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const imageUrl = URL.createObjectURL(file);
      setProfileImage(imageUrl);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]">
      <Header title="Profile" />
      <main className="flex-1 px-4 py-6 space-y-6 overflow-y-auto">
        <div className="bg-white shadow rounded-2xl px-4 py-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="relative w-[100px] aspect-square">
              <Image
                src={profileImage}
                alt="プロフィール画像"
                fill
                className="rounded-full object-cover border border-gray-300"
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
                  <>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={`w-full text-[#5E5E5E] border-b py-1 focus:outline-none ${
                        fieldErrors.name ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    {fieldErrors.name && <p className="text-sm text-red-500">{fieldErrors.name}</p>}
                  </>
                ) : (
                  <p className="text-[#5E5E5E] border-b border-b-gray-200 py-1">{name}</p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-[#5E5E5E] font-semibold">メールアドレス</label>
                {isEditing ? (
                  <>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`w-full text-[#5E5E5E] border-b py-1 focus:outline-none ${
                        fieldErrors.email ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    {fieldErrors.email && <p className="text-sm text-red-500">{fieldErrors.email}</p>}
                  </>
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
                className={`w-full text-[#5E5E5E] border-b py-1 pr-8 tracking-widest focus:outline-none ${
                  fieldErrors.password ? 'border-red-500' : 'border-gray-300'
                }`}
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
            {fieldErrors.password && <p className="text-sm text-red-500">{fieldErrors.password}</p>}
          </div>

          <div className="space-y-1">
            <label className="text-[#5E5E5E] font-semibold">招待コード</label>
            <p className="text-[#5E5E5E] border-b border-b-gray-200 py-1">{inviteCode}</p>
          </div>

          {errorMsg && <p className="text-red-500 text-sm mt-2">{errorMsg}</p>}

          <button
            onClick={handleToggleEdit}
            className="mt-2 bg-[#FFCB7D] text-white font-bold py-2 px-4 rounded-xl shadow w-full"
          >
            {isEditing ? '保存する' : '変更する'}
          </button>
        </div>

        <div className="bg-white shadow rounded-2xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/images/hanako.png"
              alt="パートナー画像"
              width={60}
              height={60}
              className="rounded-full object-cover border border-gray-300"
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
