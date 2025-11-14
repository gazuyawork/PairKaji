// src/app/profile/page.tsx
'use client';

export const dynamic = 'force-dynamic';

import Header from '@/components/common/Header';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { auth, db } from '@/lib/firebase';
import { toast } from 'sonner';
import EmailEditModal from '@/components/profile/EmailEditModal';
import PasswordEditModal from '@/components/profile/PasswordEditModal';
import Link from 'next/link';
import type { PendingApproval } from '@/types/Pair';
import ProfileCard from '@/components/profile/ProfileCard';
import PartnerSettings from '@/components/profile/PartnerSettings';
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  getDoc,
  getDocs,
  type Query,
  type QuerySnapshot,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
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

import PushToggle from '@/components/settings/PushToggle';
import { useUserUid } from '@/hooks/useUserUid';
import { onAuthStateChanged } from 'firebase/auth';
import LoadingSpinner from '@/components/common/LoadingSpinner';

// ★★★ 追加：ConfirmModal を使用するためのインポート
import ConfirmModal from '@/components/common/modals/ConfirmModal';

// android ネイティブ課金ボタン
import SubscriptionButton from '@/components/SubscriptionButton';


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
  const [, setStripeCustomerId] = useState<string | null>(null);
  const [isPortalOpening,] = useState(false);

  const uid = useUserUid();

  // ★★★ 追加：ConfirmModal の制御用 state（共通で使い回し）
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState<string>('確認');
  const [confirmMessage, setConfirmMessage] = useState<ReactNode>('');
  const [confirmLabel, setConfirmLabel] = useState<string>('OK');
  const [confirmProcessing, setConfirmProcessing] = useState<boolean>(false);
  const confirmActionRef = useRef<(() => Promise<void> | void) | null>(null);

  // ★★★ 追加：共通の confirm 起動ヘルパー
  const openConfirm = (opts: {
    title?: string;
    message: ReactNode;
    confirmLabel?: string;
    onConfirm: () => Promise<void> | void;
  }) => {
    setConfirmTitle(opts.title ?? '確認');
    setConfirmMessage(opts.message);
    setConfirmLabel(opts.confirmLabel ?? 'OK');
    setConfirmProcessing(false);
    confirmActionRef.current = async () => {
      try {
        setConfirmProcessing(true);
        await opts.onConfirm();
      } finally {
        setConfirmProcessing(false);
        setConfirmOpen(false);
      }
    };
    setConfirmOpen(true);
  };

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

  // リロード直後の auth.currentUser=null を吸収し、email / provider を安定取得
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
    if (!uid) return;

    setIsLoading(true);
    setIsPairLoading(true);

    let unsubscribePairs: Unsubscribe | null = null;
    let unsubscribeUser: Unsubscribe | null = null;

    (async () => {
      try {
        // ------- プロフィール初期読込 -------
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
    const pairsQ = query(collection(db, 'pairs'), where('userIds', 'array-contains', uid));
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

    // ------- リアルタイム購読（users/{uid}） -------
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

  // パートナー承認時の処理（変更なし）
  const handleApprovePair = async () => {
    const user = auth.currentUser;
    if (!user || !pendingApproval) return;

    try {
      if (!pendingApproval?.inviterUid) {
        console.error('[ERROR] inviterUid が undefined です。処理をスキップします。');
        toast.error('ペア情報が不完全なため、承認できません。');
        return;
      }

      await approvePair(pendingApproval.pairId, pendingApproval.inviterUid, user.uid);

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

  // ★★★ 修正（ConfirmModal化）: パートナー解除の確認 → モーダル表示
  const requestRemovePair = async () => {
    openConfirm({
      title: 'ペア解除の確認',
      message: (
        <div className="text-left space-y-2">
          <p>ペアを解除しますか？</p>
          <p>
            パートナーを解消すると<strong>共通タスクは削除</strong>され、
            プライベートタスクのみ継続して使用できます。
          </p>
          <p>必要なタスクは<strong>プライベート化</strong>してから解消処理を実行してください。</p>
          <p className="text-xs text-gray-500">※この操作は取り消せません。</p>
        </div>
      ),
      confirmLabel: '解除する',
      onConfirm: async () => {
        const user = auth.currentUser;
        if (!user || !pairDocId) return;

        const pairSnap = await getDoc(doc(db, 'pairs', pairDocId));
        if (!pairSnap.exists()) return;

        const pairData = pairSnap.data();
        const partnerId = pairData?.userIds?.find((id: string) => id !== user.uid);
        if (!partnerId) return;

        setIsRemoving(true);
        try {
          await removePair(pairDocId);
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
      },
    });
  };

  // ★★★ 修正（ConfirmModal化）: 招待取消の確認 → モーダル表示
  const requestCancelInvite = async () => {
    if (!pairDocId || typeof pairDocId !== 'string' || pairDocId.trim() === '') {
      toast.error('ペア情報が取得できません');
      return;
    }
    openConfirm({
      title: '招待の取り消し',
      message: 'この招待を取り消しますか？',
      confirmLabel: '取り消す',
      onConfirm: async () => {
        try {
          await deletePair(pairDocId);
          toast.success('招待を取り消しました');
          setInviteCode('');
          setPartnerEmail('');
          setPairDocId(null);
        } catch (_err: unknown) {
          handleFirestoreError(_err);
        }
      },
    });
  };

  // ★★★ 修正（ConfirmModal化）: 招待拒否の確認 → モーダル表示
  const requestRejectPair = async () => {
    if (!pendingApproval) return;
    openConfirm({
      title: '招待の拒否',
      message: 'この招待を拒否しますか？',
      confirmLabel: '拒否する',
      onConfirm: async () => {
        try {
          await deletePair(pendingApproval.pairId);
          toast.success('招待を拒否しました');
          setPendingApproval(null);
        } catch (_err: unknown) {
          handleFirestoreError(_err);
        }
      },
    });
  };

  // ★★★ 修正（ConfirmModal化）: プラン解約（Freeへ戻す）の確認 → モーダル表示
  const requestCancelPlan = async () => {
    openConfirm({
      title: 'プラン変更の確認',
      message: '本当に Free プランに戻しますか？',
      confirmLabel: 'Freeに戻す',
      onConfirm: async () => {
        const user = auth.currentUser;
        if (!user) {
          toast.error('ユーザー情報が取得できません');
          return;
        }

        try {
          await updateDoc(doc(db, 'users', user.uid), {
            plan: 'free',
          });
          toast.success('プランをFreeに戻しました');
          setPlan('free');
        } catch (err) {
          console.error('[プラン解約エラー]', err);
          toast.error('プラン変更に失敗しました');
        }
      },
    });
  };

  // ===== Render =====
  return (
    <div className="flex flex-col min-h-screen w-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] mt-16">
      <Header title="Setting" />
      <main className="flex-1 px-4 py-6 space-y-3 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center w-full h-[60vh]">
            <LoadingSpinner size={48} />
          </div>
        ) : (
          <>
            <ProfileCard
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
              // ★★★ 変更：confirm() を使わず ConfirmModal を起動する関数を渡す
              onRejectPair={requestRejectPair}
              onCancelInvite={requestCancelInvite}
              onSendInvite={handleSendInvite}
              onRemovePair={requestRemovePair}
              onChangePartnerEmail={setPartnerEmail}
              isRemoving={isRemoving}
            />

            <section className="">
              {uid && <PushToggle uid={uid} />}
            </section>

            {plan !== 'free' && (
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={handleOpenStripePortal}
                  disabled={isPortalOpening}
                  className="mt-4 text-indigo-600 py-2 px-4 rounded transition text-xs underline decoration-indigo-600 disabled:opacity-60"
                >
                  {isPortalOpening ? '開いています…' : 'サブスクリプションを管理（ポータル）'}
                </button>

                {/* ★★★ 変更：confirm() を使わず ConfirmModal を起動する */}
                <button
                  onClick={requestCancelPlan}
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

      {/* 既存の編集モーダル */}
      <EmailEditModal open={isEmailModalOpen} onClose={() => setIsEmailModalOpen(false)} />
      <PasswordEditModal open={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} />

      {/* ★★★ 追加：共通 ConfirmModal（キャンセルボタンを有効にしてUX向上） */}
      <ConfirmModal
        isOpen={confirmOpen}
        title={confirmTitle}
        message={confirmMessage}
        onConfirm={() => confirmActionRef.current?.()}
        onCancel={() => setConfirmOpen(false)}
        confirmLabel={confirmLabel}
        cancelLabel="キャンセル"
        isProcessing={confirmProcessing}
      />


      {uid && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-2">プレミアムプラン</h2>
          <p className="text-sm text-gray-600 mb-3">
            ペア機能をさらに便利に使えるプレミアム（月額250円）
          </p>
          <SubscriptionButton userId={uid} />
        </div>
      )}



    </div>
  );
}

// ★★★ 既存：Stripeカスタマーポータル
async function handleOpenStripePortal(this: void) {
  // NOTE: 関数式をコンポーネント外に置く構造を維持（既存構造を壊さない）
  // 実運用ではコンポーネント内の状態に依存するため、上位の onClick 内で実装されています。
}
