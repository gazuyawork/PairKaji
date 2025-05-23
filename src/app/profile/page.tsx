'use client';

import Header from '@/components/Header';
import { X } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { toast } from 'sonner';
import EmailEditModal from '@/components/EmailEditModal';
import PasswordEditModal from '@/components/PasswordEditModal';
import Link from 'next/link';

export default function ProfilePage() {
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [isPairLoading, setIsPairLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isGoogleUser, setIsGoogleUser] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(
    typeof window !== 'undefined' ? localStorage.getItem('profileImage') : null
  );
  const [partnerImage, setPartnerImage] = useState('/images/hanako_default.png');
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [partnerEmail, setPartnerEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isPairConfirmed, setIsPairConfirmed] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<{
    pairId: string;
    inviterUid: string;
    emailB: string;
    inviteCode: string;
  } | null>(null);
  const [pairDocId, setPairDocId] = useState<string | null>(null);

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

      const pairsRef = collection(db, 'pairs');

      const q = query(pairsRef, where('userAId', '==', user.uid));
      const pairSnap = await getDocs(q);
      if (!pairSnap.empty) {
        const pairDoc = pairSnap.docs[0];
        const pair = pairDoc.data();
        setInviteCode(pair.inviteCode);
        setPartnerEmail(pair.emailB ?? '');
        setPairDocId(pairDoc.id);
        if (pair.userBId) {
          setIsPairConfirmed(true);
        }
      }

      const q2 = query(pairsRef, where('emailB', '==', user.email));
      const pendingSnap = await getDocs(q2);
      if (!pendingSnap.empty) {
        const docRef = pendingSnap.docs[0];
        const pair = docRef.data();
        if (!pair.userBId) {
          setPendingApproval({
            pairId: docRef.id,
            inviterUid: pair.userAId,
            emailB: pair.emailB,
            inviteCode: pair.inviteCode,
          });
        }
      }
      setIsProfileLoading(false);
      setIsPairLoading(false);
      // setTimeout(() => {
      //   setIsPairLoading(false);
      // }, 3000); // 1秒後にローディングを解除（確認用）
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

  const generateInviteCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleSendInvite = async () => {
    const user = auth.currentUser;
    if (!user || !partnerEmail.trim()) {
      toast.error('メールアドレスを入力してください');
      return;
    }

    const generatedCode = generateInviteCode();
    setInviteCode(generatedCode);

    try {
      await addDoc(collection(db, 'pairs'), {
        userAId: user.uid,
        emailB: partnerEmail.trim(),
        inviteCode: generatedCode,
        status: 'pending',
        createdAt: new Date(),
        userIds: [user.uid],
      });

      toast.success('招待コードを発行しました');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'permission-denied') {
        toast.error('操作が許可されていません');
      } else {
        toast.error('予期せぬエラーが発生しました');
      }
    }
  };

  const handleApprovePair = async () => {
    const user = auth.currentUser;
    if (!user || !pendingApproval) return;

    try {
      await updateDoc(doc(db, 'pairs', pendingApproval.pairId), {
        userBId: user.uid,
        status: 'confirmed',
        userIds: [pendingApproval.inviterUid, user.uid],
        updatedAt: new Date(),
      });
      toast.success('ペア設定を承認しました');
      setIsPairConfirmed(true);
      setPendingApproval(null);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'permission-denied') {
        toast.error('操作が許可されていません');
      } else {
        toast.error('予期せぬエラーが発生しました');
      }
    }

  };

  const handleRemovePair = async () => {
    if (!pairDocId) return;
    const confirmed = confirm('ペアを解除しますか？この操作は取り消せません。');
    if (!confirmed) return;

    try {
      const uid = auth.currentUser?.uid;
      console.log('[DEBUG] currentUser.uid:', uid);

      const snap = await getDoc(doc(db, 'pairs', pairDocId));
      const data = snap.data();
      console.log('[DEBUG] pairDoc:', {
        userAId: data?.userAId,
        userBId: data?.userBId,
        userIds: data?.userIds,
      });

      await updateDoc(doc(db, 'pairs', pairDocId), {
        status: 'removed',
        updatedAt: new Date(),
      });

      toast.success('ペアを解除しました');
      setIsPairConfirmed(false);
      setPartnerEmail('');
      setInviteCode('');
      setPairDocId(null);
    } catch (err: any) {
      console.error('[ERROR] handleRemovePair:', err);
      if (err.code === 'permission-denied') {
        toast.error('操作が許可されていません');
      } else {
        toast.error('予期せぬエラーが発生しました');
      }
    }
  };


  const handleCancelInvite = async () => {
    if (!pairDocId) return;
    const confirmed = confirm('この招待を取り消しますか？');
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'pairs', pairDocId));
      toast.success('招待を取り消しました');
      setInviteCode('');
      setPartnerEmail('');
      setPairDocId(null);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'permission-denied') {
        toast.error('操作が許可されていません');
      } else {
        toast.error('予期せぬエラーが発生しました');
      }
    }
  };

  const handleRejectPair = async () => {
    if (!pendingApproval) return;
    const confirmed = confirm('この招待を拒否しますか？');
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'pairs', pendingApproval.pairId));
      toast.success('招待を拒否しました');
      setPendingApproval(null);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'permission-denied') {
        toast.error('操作が許可されていません');
      } else {
        toast.error('予期せぬエラーが発生しました');
      }
    }

  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]">
      <Header title="Profile" />
      <main className="flex-1 px-4 py-6 space-y-6 overflow-y-auto">
        <div className="min-h-[260px] bg-white shadow rounded-2xl px-4 py-4 space-y-6">

        <p className="ml-4 mb-6">
          <label className="text-[#5E5E5E] font-semibold">プロフィール</label>
        </p>

        {isProfileLoading ? (
        <div className="flex items-center justify-center min-h-[260px] text-gray-400 text-sm">
          <div className="w-8 h-8 border-4 border-gray-400 border-t-transparent rounded-full animate-spin" />
        </div>
        ) : (
          <>

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
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="min-w-0 flex-grow text-[#5E5E5E] border-b border-gray-300 py-1 focus:outline-none"
                  />
                  <button
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
            </div>
          </>
        )}
        </div>

        <div className="min-h-[180px] bg-white shadow rounded-2xl px-8 py-6 space-y-3">
          <p className="mb-6">
            <label className="text-[#5E5E5E] font-semibold">パートナー設定</label>
          </p>
          {isPairLoading ? (
            <div className="flex items-center justify-center text-gray-400 text-sm">
              <div className="w-8 h-8 border-4 border-gray-400 border-t-transparent rounded-full animate-spin" />
            </div>

          ) : (
            <>
              {pendingApproval && (
                <>
                  <p className="text-gray-600 text-sm">{pendingApproval.emailB} さんとして招待されています</p>
                  <p className="text-gray-600 text-sm">招待コード: {pendingApproval.inviteCode}</p>
                  <button
                    onClick={handleApprovePair}
                    className="w-full bg-[#FFCB7D] text-white py-2 rounded shadow text-sm"
                  >
                    承認する
                  </button>
                  <button
                    onClick={handleRejectPair}
                    className="w-full bg-gray-300 text-white py-2 rounded shadow text-sm"
                  >
                    拒否する
                  </button>
                </>
              )}

              {!isPairConfirmed && !pendingApproval && (
                <>
                  <div>
                    <input
                      type="email"
                      value={partnerEmail}
                      onChange={(e) => setPartnerEmail(e.target.value)}
                      placeholder="partner@example.com"
                      className="w-full border-b border-gray-300 py-1 px-2"
                    />
                  </div>
                  <div>
                    <label className="text-[#5E5E5E] font-semibold">招待コード（自動生成）</label>
                    <p className="text-[#5E5E5E] border-b border-b-gray-200 py-1 tracking-widest">
                      {inviteCode || '未設定'}
                    </p>
                  </div>
                  <button
                    onClick={pairDocId ? handleCancelInvite : handleSendInvite}
                    className={`w-full py-2 rounded shadow text-sm ${
                      pairDocId ? 'bg-gray-500 text-white hover:underline' : 'bg-[#FFCB7D] text-white'
                    }`}
                  >
                    {pairDocId ? '招待を取り消す' : '招待コードを発行'}
                  </button>
                </>
              )}

              {isPairConfirmed && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Image
                      src={partnerImage}
                      alt="パートナー画像"
                      width={60}
                      height={60}
                      className="w-16 h-16 rounded-full object-cover border border-gray-300"
                    />
                    <div className="text-[#5E5E5E]">
                      <p className="font-semibold">パートナー承認済み</p>
                      <p>{partnerEmail}</p>
                    </div>
                  </div>
                  <button onClick={handleRemovePair} className="text-red-500">
                    <X size={24} />
                  </button>
                </div>
              )}
            </>
          )}
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