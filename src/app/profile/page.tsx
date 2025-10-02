// src/app/profile/page.tsx
'use client';

export const dynamic = 'force-dynamic';

import Header from '@/components/common/Header';
import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { toast } from 'sonner';
import EmailEditModal from '@/components/profile/EmailEditModal';
import PasswordEditModal from '@/components/profile/PasswordEditModal';
import Link from 'next/link';
import type { PendingApproval } from '@/types/Pair';
import ProfileCard from '@/components/profile/ProfileCard';
import PartnerSettings from '@/components/profile/PartnerSettings';
import { collection, onSnapshot, query, where, doc, getDoc, getDocs, type Query, type QuerySnapshot, updateDoc, type Unsubscribe } from 'firebase/firestore';
import type { Pair } from '@/types/Pair';
import {
  getUserProfile,
  createUserProfile,
  createPairInvite,
  removePair,
  deletePair,
  handleFirestoreError,
  generateInviteCode,
  saveUserNameToFirestore,
  approvePair,
  getPendingPairByEmail,
} from '@/lib/firebaseUtils';
// import { splitSharedTasksOnPairRemoval } from '@/lib/firebaseUtils';
import LineLinkCard from '@/components/profile/LineLinkCard';

import PushToggle from '@/components/settings/PushToggle'; // ★ PushToggle を使用
import { useUserUid } from '@/hooks/useUserUid';           // ★ uid を React state として取得
import { onAuthStateChanged } from 'firebase/auth';        // ★ 追加
import LoadingSpinner from '@/components/common/LoadingSpinner';


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
  );

  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [partnerEmail, setPartnerEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isPairConfirmed, setIsPairConfirmed] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [pairDocId, setPairDocId] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [nameUpdateStatus, setNameUpdateStatus] = useState<'idle' | 'loading' | 'success'>('idle');

  const [plan, setPlan] = useState<string>(''); // プラン
  // ▼ LINE連携用の状態（Firestore users/{uid} 由来）
  const [lineLinked, setLineLinked] = useState<boolean>(false);
  const [lineDisplayName, setLineDisplayName] = useState<string | null>(null);
  const [linePictureUrl, setLinePictureUrl] = useState<string | null>(null);

  // ★ Stripe カスタマーポータル用状態
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);
  const [isPortalOpening, setIsPortalOpening] = useState(false);

  const uid = useUserUid(); // ★ auth.currentUser ではなく React state な uid を利用

  const onEditNameHandler = async () => {
    const user = auth.currentUser;
    if (!user) {
      toast.error('ユーザー情報が取得できません');
      return;
    }

    setNameUpdateStatus('loading');

    try {
      await saveUserNameToFirestore(user.uid, name);
      setNameUpdateStatus('success');
      setTimeout(() => {
        setNameUpdateStatus('idle');
      }, 1500);
    } catch {
      toast.error('氏名の更新に失敗しました');
      setNameUpdateStatus('idle');
    }
  };

  const onEditEmailHandler = () => {
    setIsEmailModalOpen(true);
  };

  const onEditPasswordHandler = () => {
    setIsPasswordModalOpen(true);
  };

  // ★ 追加: リロード直後の auth.currentUser=null を吸収し、email / provider を安定取得
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setEmail('');
        setIsGoogleUser(false);
        return;
      }
      setEmail(user.email ?? '');
      setIsGoogleUser(user.providerData.some((p) => p.providerId === 'google.com'));
    });
    return () => unsub();
  }, []);

  // ★ 再構成: uid と email が確定してから Firestore 初期取得 & 購読を開始
  useEffect(() => {
    if (!uid) return; // uid 未確定なら何もしない

    setIsLoading(true);
    setIsPairLoading(true);

    let unsubscribePairs: Unsubscribe | null = null;
    let unsubscribeUser: Unsubscribe | null = null;

    (async () => {
      try {
        // ------- プロフィール（users/{uid}）初期読込 -------
        const snap = await getUserProfile(uid);
        if (snap.exists()) {
          const data = snap.data();

          setName(data.name || (email ? email.split('@')[0] : '') || '');

          if (data.plan) setPlan(data.plan);

          if (data.imageUrl) {
            setProfileImage(data.imageUrl);
            if (typeof window !== 'undefined') {
              localStorage.setItem('profileImage', data.imageUrl);
            }
          }

          // LINE 連携
          setLineLinked(Boolean(data.lineLinked));
          setLineDisplayName(data.lineDisplayName ?? null);
          setLinePictureUrl(data.linePictureUrl ?? null);

          // Stripe
          if (typeof data.stripeCustomerId === 'string' && data.stripeCustomerId.trim() !== '') {
            setStripeCustomerId(data.stripeCustomerId);
          } else {
            setStripeCustomerId(null);
          }
        } else {
          // プロフィールが無ければ作成
          const fallbackName = email ? email.split('@')[0] : '';
          await createUserProfile(uid, fallbackName);
          setName(fallbackName);
        }

        // ------- pairs 初期読込 -------
        const pairQueryRef = query(
          collection(db, 'pairs'),
          where('userIds', 'array-contains', uid)
        ) as Query<Pair>;
        const pairSnap: QuerySnapshot<Pair> = await getDocs(pairQueryRef);

        if (!pairSnap.empty) {
          const pairDoc = pairSnap.docs[0];
          const pair = pairDoc.data() as Pair;

          setInviteCode(pair.inviteCode);
          setPartnerEmail(pair.emailB ?? '');
          setPairDocId(pairDoc.id);
          setIsPairConfirmed(pair.status === 'confirmed');

          if (pair.partnerImageUrl) {
            setPartnerImage(pair.partnerImageUrl);
            if (typeof window !== 'undefined') {
              localStorage.setItem('partnerImage', pair.partnerImageUrl);
            }
          } else {
            setPartnerImage(null);
            if (typeof window !== 'undefined') {
              localStorage.removeItem('partnerImage');
            }
          }
        } else {
          setInviteCode('');
          setPartnerEmail('');
          setPairDocId(null);
          setIsPairConfirmed(false);
          setPartnerImage(null);
          if (typeof window !== 'undefined') {
            localStorage.removeItem('partnerImage');
          }
        }

        // ------- pending 承認の確認（email が取れている場合のみ） -------
        if (email) {
          const pendingSnap = await getPendingPairByEmail(email);
          if (!pendingSnap.empty) {
            const docRef = pendingSnap.docs[0];
            const pair = docRef.data();
            if (
              pair.status === 'pending' &&
              !pair.userBId &&
              pair.userAId &&
              pair.emailB &&
              pair.inviteCode
            ) {
              setPendingApproval({
                pairId: docRef.id,
                inviterUid: pair.userAId,
                emailB: pair.emailB,
                inviteCode: pair.inviteCode,
              });
            } else {
              setPendingApproval(null);
            }
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
    })();

    // ------- リアルタイム購読（pairs） -------
    const pairsQ = query(
      collection(db, 'pairs'),
      where('userIds', 'array-contains', uid)
    );
    unsubscribePairs = onSnapshot(
      pairsQ,
      (snapshot) => {
        if (!snapshot.empty) {
          const pairDoc = snapshot.docs[0];
          const pair = pairDoc.data() as Pair;
          setInviteCode(pair.inviteCode);
          setPartnerEmail(pair.emailB ?? '');
          setPairDocId(pairDoc.id);
          setIsPairConfirmed(pair.status === 'confirmed');

          if (pair.partnerImageUrl) {
            setPartnerImage(pair.partnerImageUrl);
            if (typeof window !== 'undefined') {
              localStorage.setItem('partnerImage', pair.partnerImageUrl);
            }
          } else {
            setPartnerImage(null);
            if (typeof window !== 'undefined') {
              localStorage.removeItem('partnerImage');
            }
          }
        } else {
          setInviteCode('');
          setPartnerEmail('');
          setPairDocId(null);
          setIsPairConfirmed(false);
          setPartnerImage(null);
          if (typeof window !== 'undefined') {
            localStorage.removeItem('partnerImage');
          }
        }
      },
      (error) => {
        handleFirestoreError(error);
      }
    );

    // ------- リアルタイム購読（users/{uid}：LINE連携・画像・プランなど） -------
    unsubscribeUser = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        const data = snap.data();
        if (!data) return;

        if (typeof data.plan === 'string') setPlan(data.plan);

        if (typeof data.imageUrl === 'string') {
          setProfileImage(data.imageUrl);
          if (typeof window !== 'undefined') {
            localStorage.setItem('profileImage', data.imageUrl);
          }
        }

        setLineLinked(Boolean(data.lineLinked));
        setLineDisplayName(data.lineDisplayName ?? null);
        setLinePictureUrl(data.linePictureUrl ?? null);

        // Stripe カスタマーIDの反映
        if (typeof data.stripeCustomerId === 'string' && data.stripeCustomerId.trim() !== '') {
          setStripeCustomerId(data.stripeCustomerId);
        } else {
          setStripeCustomerId(null);
        }
      },
      (error) => {
        handleFirestoreError(error);
      }
    );

    return () => {
      unsubscribePairs?.();
      unsubscribeUser?.();
    };
  }, [uid, email]);

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

  // パートナー承認時の処理
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

      // 👇 両ユーザーの sharedTasksCleaned を false に更新
      const userRef = doc(db, 'users', user.uid);
      const partnerRef = doc(db, 'users', pendingApproval.inviterUid);
      await Promise.all([
        updateDoc(userRef, { sharedTasksCleaned: false }),
        updateDoc(partnerRef, { sharedTasksCleaned: false }),
      ]);

      toast.success('ペア設定を承認しました');
      setIsPairConfirmed(true);
      setPendingApproval(null);
    } catch (_err: unknown) {
      handleFirestoreError(_err);
    }
  };

  // パートナー解除時の処理
  const handleRemovePair = async () => {
    const user = auth.currentUser;
    if (!user || !pairDocId) return;

    const pairSnap = await getDoc(doc(db, 'pairs', pairDocId));
    if (!pairSnap.exists()) return;

    const pairData = pairSnap.data();
    const partnerId = pairData?.userIds?.find((id: string) => id !== user.uid);
    if (!partnerId) return;

    const confirmed = confirm('ペアを解除しますか？\nパートナー解消時は共通タスクのみ継続して使用できます。\n※この操作は取り消せません。');
    if (!confirmed) return;

    setIsRemoving(true);
    try {
      await removePair(pairDocId);
      // await splitSharedTasksOnPairRemoval(user.uid, partnerId);

      toast.success('ペアを解除しました');
      setIsPairConfirmed(false);
      setPartnerEmail('');
      setInviteCode('');
      setPairDocId(null);
    } catch (_err: unknown) {
      handleFirestoreError(_err);
    } finally {
      setIsRemoving(false);
    }
  };

  const handleCancelInvite = async () => {
    if (!pairDocId || typeof pairDocId !== 'string' || pairDocId.trim() === '') {
      toast.error('ペア情報が取得できません');
      return;
    }
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

  const handleCancelPlan = async () => {
    const confirmed = confirm('本当にFreeプランに戻しますか？');
    if (!confirmed) return;

    const user = auth.currentUser;
    if (!user) {
      toast.error('ユーザー情報が取得できません');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        plan: 'free',
        lineLinked: false,
      });
      toast.success('プランをFreeに戻しました');
      setPlan('free');
    } catch (err) {
      console.error('[プラン解約エラー]', err);
      toast.error('プラン変更に失敗しました');
    }
  };

  // ★ Stripe カスタマーポータルを開く
  const handleOpenStripePortal = async () => {
    if (!stripeCustomerId) {
      toast.error('決済情報が見つかりません。決済完了後にお試しください。');
      return;
    }
    try {
      setIsPortalOpening(true);
      const res = await fetch('/api/billing/create-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: stripeCustomerId }),
      });
      const data = await res.json();
      if (!res.ok || !data?.url) {
        console.error('[create-portal] failed:', data);
        toast.error('ポータルの作成に失敗しました。しばらくしてからお試しください。');
        return;
      }
      // Stripe がホストするカスタマーポータルへ遷移
      window.location.href = data.url as string;
    } catch (err) {
      console.error('[create-portal] error:', err);
      toast.error('ポータルの作成に失敗しました。');
    } finally {
      setIsPortalOpening(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen w-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] mt-16">
      <Header title="Setting" />
      <main className="flex-1 px-4 py-6 space-y-6 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center w-full h-[60vh]">
            <LoadingSpinner size={48} />
          </div>
        ) : (
          <>
            <ProfileCard
              // ▼ Auth user ではなく Firestore の値を渡す
              isLineLinked={lineLinked}
              lineDisplayName={lineDisplayName}
              linePictureUrl={linePictureUrl}
              profileImage={profileImage}
              setProfileImage={setProfileImage}
              name={name}
              setName={setName}
              isGoogleUser={isGoogleUser}
              onEditName={onEditNameHandler}
              onEditEmail={onEditEmailHandler}
              onEditPassword={onEditPasswordHandler}
              email={email}
              isLoading={isLoading}
              nameUpdateStatus={nameUpdateStatus}
            />
            <PartnerSettings
              isLoading={isLoading}
              isPairLoading={isPairLoading}
              pendingApproval={pendingApproval}
              isPairConfirmed={isPairConfirmed}
              partnerEmail={partnerEmail}
              partnerImage={partnerImage ?? '/images/default.png'}
              inviteCode={inviteCode}
              pairDocId={pairDocId}
              onApprovePair={handleApprovePair}
              onRejectPair={handleRejectPair}
              onCancelInvite={handleCancelInvite}
              onSendInvite={handleSendInvite}
              onRemovePair={handleRemovePair}
              onChangePartnerEmail={setPartnerEmail}
              isRemoving={isRemoving}
            />

            <section className="mt-6">
              {/* ★ auth.currentUser 依存をやめ、uid 判定で確実に表示 */}
              {uid && <PushToggle uid={uid} />}
            </section>

            {plan === 'premium' && !lineLinked && <LineLinkCard />}

            {plan !== 'free' && (
              <div className="flex flex-col items-center gap-2">
                {/* ★ Stripe カスタマーポータルへ遷移 */}
                <button
                  onClick={handleOpenStripePortal}
                  disabled={isPortalOpening}
                  className="mt-4 text-indigo-600 py-2 px-4 rounded transition text-xs underline decoration-indigo-600 disabled:opacity-60"
                >
                  {isPortalOpening ? '開いています…' : 'サブスクリプションを管理（ポータル）'}
                </button>

                <button
                  onClick={handleCancelPlan}
                  className="text-gray-400 py-2 px-4 rounded transition text-[11px] underline decoration-gray-400"
                >
                  （開発用）強制的にFreeに戻す
                </button>
              </div>
            )}

            <div className="text-center mt-auto">
              <Link
                href="/delete-account"
                className="text-xs text-gray-400 hover:underline underline decoration-gray-400"
              >
                アカウントを削除する
              </Link>
            </div>
          </>
        )}
      </main>

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
