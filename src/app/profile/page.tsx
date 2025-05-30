'use client';

import Header from '@/components/Header';
import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { toast } from 'sonner';
import EmailEditModal from '@/components/EmailEditModal';
import PasswordEditModal from '@/components/PasswordEditModal';
import Link from 'next/link';
import type { PendingApproval } from '@/types/Pair';
import { 
  getUserProfile, createUserProfile, 
  getUserPair, getPendingPairByEmail, 
  createPairInvite, 
  removePair, deletePair, 
  handleFirestoreError, generateInviteCode 
} from '@/lib/firebaseUtils';
import ProfileCard from '@/components/profile/ProfileCard';
import PartnerSettings from '@/components/profile/PartnerSettings';
import { saveUserNameToFirestore } from '@/lib/firebaseUtils';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import type { Pair } from '@/types/Pair';
import { removePartnerFromUserTasks } from '@/lib/firebaseUtils';
import { approvePair } from '@/lib/firebaseUtils';



export default function ProfilePage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isPairLoading, setIsPairLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isGoogleUser, setIsGoogleUser] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(
    typeof window !== 'undefined' ? localStorage.getItem('profileImage') : null
  );
  const [partnerImage, setPartnerImage] = useState<string | null>(
    typeof window !== 'undefined' ? localStorage.getItem('partnerImage') : null
  ); // ← 追加部分
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [partnerEmail, setPartnerEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isPairConfirmed, setIsPairConfirmed] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [pairDocId, setPairDocId] = useState<string | null>(null);

  const onEditNameHandler = async () => {
    const user = auth.currentUser;
    if (!user) {
      toast.error('ユーザー情報が取得できません');
      return;
    }

    try {
      await saveUserNameToFirestore(user.uid, name);
      toast.success('氏名を更新しました');
    } catch {
      toast.error('氏名の更新に失敗しました');
    }
  };

  const onEditEmailHandler = () => {
    setIsEmailModalOpen(true);
  };

  const onEditPasswordHandler = () => {
    setIsPasswordModalOpen(true);
  };

  // パートナー画像の変更ハンドラ
  const handlePartnerImageChange = (image: string) => {
    localStorage.setItem('partnerImage', image);
    setPartnerImage(image);
  };

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;

        await user.reload();
        const refreshedUser = auth.currentUser;

        setIsGoogleUser(
          refreshedUser?.providerData.some((p) => p.providerId === 'google.com') ?? false
        );

        const snap = await getUserProfile(user.uid);
        if (snap.exists()) {
          const data = snap.data();
          setName(data.name || user.email?.split('@')[0] || '');
        } else {
          await createUserProfile(user.uid, user.email?.split('@')[0] || '');
          setName(user.email?.split('@')[0] || '');
        }

        setEmail(user.email ?? '');

        const pairSnap = await getUserPair(user.uid);
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

        if (!user.email) {
          console.warn('[WARN] user.email が null です。pending ペア検索をスキップします');
          return;
        }
        const pendingSnap = await getPendingPairByEmail(user.email);
        if (!pendingSnap.empty) {
          const docRef = pendingSnap.docs[0];
          const pair = docRef.data();
          if (pair.status === 'pending' && !pair.userBId && pair.userAId && pair.emailB && pair.inviteCode) {
            setPendingApproval({
              pairId: docRef.id,
              inviterUid: pair.userAId,
              emailB: pair.emailB,
              inviteCode: pair.inviteCode,
            });
          } else {
            setPendingApproval(null);
          }

        }
      } catch (err) {
        handleFirestoreError(err);
      } finally {
        setIsLoading(false);
        setIsPairLoading(false);
      }
    };

    fetchProfile();

    // 🔥 onSnapshotはfetchProfile内で取得したuserではなく、再度取得する
    const user = auth.currentUser;
    if (!user) return;

    const q = query(collection(db, 'pairs'), where('userAId', '==', user.uid)); // ← user.uidエラーなし
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const pairDoc = snapshot.docs[0];
          const pair = pairDoc.data() as Pair;
          setInviteCode(pair.inviteCode);
          setPartnerEmail(pair.emailB ?? '');
          setPairDocId(pairDoc.id);
          setIsPairConfirmed(!!pair.userBId);
        } else {
          setInviteCode('');
          setPartnerEmail('');
          setPairDocId(null);
          setIsPairConfirmed(false);
        }
      },
      (error) => {
        handleFirestoreError(error);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);


  const handleSendInvite = async () => {
    const user = auth.currentUser;
    if (!user || !partnerEmail.trim()) {
      toast.error('メールアドレスを入力してください');
      return;
    }

    const generatedCode = generateInviteCode();
    setInviteCode(generatedCode);

    try {
      const docRef = await createPairInvite(user.uid, partnerEmail.trim(), generatedCode);
      setPairDocId(docRef.id);
      toast.success('招待コードを発行しました');
    } catch (_err: unknown) {
      handleFirestoreError(_err);
    }
  };

  const handleApprovePair = async () => {
    const user = auth.currentUser;
    if (!user || !pendingApproval) return;

    try {
      if (!pendingApproval?.inviterUid) {
        console.error('[ERROR] inviterUid が undefined です。処理をスキップします。');
        toast.error('ペア情報が不完全なため、承認できません。');
        return;
      }

      // Firestoreのペア情報を更新
      await approvePair(pendingApproval.pairId, pendingApproval.inviterUid, user.uid);

      toast.success('ペア設定を承認しました');
      setIsPairConfirmed(true);
      setPendingApproval(null);
    } catch (_err: unknown) {
      handleFirestoreError(_err);
    }
  };

  const handleRemovePair = async () => {
    if (!pairDocId) return;
    const confirmed = confirm('ペアを解除しますか？この操作は取り消せません。');
    if (!confirmed) return;

    try {
      await removePair(pairDocId);

      // 🆕 ペア解除後にタスク共有解除処理
      const user = auth.currentUser;
      if (user) {
        await removePartnerFromUserTasks(user.uid);
      }

      toast.success('ペアを解除しました');
      setIsPairConfirmed(false);
      setPartnerEmail('');
      setInviteCode('');
      setPairDocId(null);
    } catch (_err: unknown) {
      handleFirestoreError(_err);
    }
  };

  const handleCancelInvite = async () => {
    if (!pairDocId) return;
    const confirmed = confirm('この招待を取り消しますか？');
    if (!confirmed) return;

    try {
      await deletePair(pairDocId);
      toast.success('招待を取り消しました');
      setInviteCode('');
      setPartnerEmail('');
      setPairDocId(null);
    } catch (_err: unknown) {
      handleFirestoreError(_err);
    }
  };

  const handleRejectPair = async () => {
    if (!pendingApproval) return;
    const confirmed = confirm('この招待を拒否しますか？');
    if (!confirmed) return;

    try {
      await deletePair(pendingApproval.pairId);
      toast.success('招待を拒否しました');
      setPendingApproval(null);
    } catch (_err: unknown) {
      handleFirestoreError(_err);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]">
      <Header title="Profile" />
      <main className="flex-1 px-4 py-6 space-y-6 overflow-y-auto">

        {isLoading ? (
          <div className="flex items-center justify-center text-gray-400 text-sm h-200">
            <div className="w-8 h-8 border-4 border-gray-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <ProfileCard
              profileImage={profileImage}
              setProfileImage={setProfileImage} // ←追加
              name={name}
              setName={setName}
              isGoogleUser={isGoogleUser}
              onEditName={onEditNameHandler}
              onEditEmail={onEditEmailHandler}
              onEditPassword={onEditPasswordHandler}
              email={email}
              isLoading={isLoading}
            />

            <PartnerSettings
              isLoading={isLoading}
              isPairLoading={isPairLoading}
              pendingApproval={pendingApproval}
              isPairConfirmed={isPairConfirmed}
              partnerEmail={partnerEmail}
              partnerImage={partnerImage || '/images/hanako_default.png'}
              inviteCode={inviteCode}
              pairDocId={pairDocId}
              onApprovePair={handleApprovePair}
              onRejectPair={handleRejectPair}
              onCancelInvite={handleCancelInvite}
              onSendInvite={handleSendInvite}
              onRemovePair={handleRemovePair}
              onChangePartnerEmail={setPartnerEmail}
              onChangePartnerImage={handlePartnerImageChange}
            />
          </>
      )}

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