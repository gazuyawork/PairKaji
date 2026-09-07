// src/app/profile/page.tsx
'use client';

export const dynamic = 'force-dynamic';

import Header from '@/components/common/Header';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { auth, db } from '@/lib/firebase';
import { toast } from 'sonner';
import EmailEditModal from '@/components/profile/EmailEditModal';
import PasswordEditModal from '@/components/profile/PasswordEditModal';
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
  type Unsubscribe,
} from 'firebase/firestore';
import type { Pair } from '@/types/Pair';
import {
  getUserProfile,
  createUserProfile,
  removePair,
  handleFirestoreError,
  saveUserNameToFirestore,
  getPendingPairByEmail,
} from '@/lib/firebaseUtils';
import {
  acceptIncomingPairInvite,
  cancelOutgoingPairInvite,
  issuePairInvite,
  joinPairByCode,
  pairInviteErrorMessage,
  rejectIncomingPairInvite,
} from '@/lib/pairInviteApi';

import PushToggle from '@/components/settings/PushToggle';
import SettingsSection from '@/components/settings/SettingsSection';
import SettingsNavRow from '@/components/settings/SettingsNavRow';
import { useUserUid } from '@/hooks/useUserUid';
import { onAuthStateChanged } from 'firebase/auth';
import LoadingSpinner from '@/components/common/LoadingSpinner';

// ★★★ 追加：ConfirmModal を使用するためのインポート
import ConfirmModal from '@/components/common/modals/ConfirmModal';

// android ネイティブ課金ボタン
import HelpHintsToggle from '@/components/common/HelpHintsToggle';
import { useUserPlan } from '@/hooks/useUserPlan';


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
  const [joinCode, setJoinCode] = useState('');
  const [pairBusy, setPairBusy] = useState(false);
  const [isPairConfirmed, setIsPairConfirmed] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [pairDocId, setPairDocId] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [nameUpdateStatus, setNameUpdateStatus] = useState<'idle' | 'loading' | 'success'>('idle');

  const uid = useUserUid();
  const { plan, isChecking: isPlanChecking, isCancelPending } = useUserPlan();
  const planRowValue = isPlanChecking
    ? undefined
    : plan === 'premium'
      ? isCancelPending
        ? '解約済み'
        : '加入中'
      : '未加入';

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

          if (data.imageUrl) {
            setProfileImage(data.imageUrl);
            if (typeof window !== 'undefined') {
              localStorage.setItem('profileImage', data.imageUrl);
            }
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

        if (typeof data.imageUrl === 'string') {
          setProfileImage(data.imageUrl);
          if (typeof window !== 'undefined') {
            localStorage.setItem('profileImage', data.imageUrl);
          }
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
    setPairBusy(true);
    try {
      const created = await issuePairInvite();
      setInviteCode(created.inviteCode);
      setPairDocId(created.pairId);
      toast.success('招待コードを発行しました');
    } catch (err) {
      toast.error(pairInviteErrorMessage(err, '招待コードを発行できませんでした'));
    } finally {
      setPairBusy(false);
    }
  };

  const handleJoinByCode = async () => {
    setPairBusy(true);
    try {
      await joinPairByCode(joinCode);
      toast.success('パートナーとつながりました', {
        description: 'ホームから、最初の家事を追加できます。',
      });
      setJoinCode('');
      setIsPairConfirmed(true);
      setPendingApproval(null);
    } catch (err) {
      toast.error(pairInviteErrorMessage(err, '参加できませんでした'));
    } finally {
      setPairBusy(false);
    }
  };

  const handleApprovePair = async () => {
    if (!pendingApproval) return;
    setPairBusy(true);
    try {
      await acceptIncomingPairInvite(pendingApproval.pairId);
      toast.success('ペア設定を承認しました', {
        description: 'ホームから、最初の家事を追加できます。',
      });
      setIsPairConfirmed(true);
      setPendingApproval(null);
    } catch (err) {
      toast.error(pairInviteErrorMessage(err, '承認できませんでした'));
    } finally {
      setPairBusy(false);
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
          await cancelOutgoingPairInvite();
          toast.success('招待を取り消しました');
          setInviteCode('');
          setPartnerEmail('');
          setPairDocId(null);
        } catch (err) {
          toast.error(pairInviteErrorMessage(err, '取り消しに失敗しました'));
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
          await rejectIncomingPairInvite(pendingApproval.pairId);
          toast.success('招待を拒否しました');
          setPendingApproval(null);
        } catch (err) {
          toast.error(pairInviteErrorMessage(err, '拒否できませんでした'));
        }
      },
    });
  };

  return (
    <div className="flex flex-col min-h-screen w-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] mt-16">
      <Header title="設定" />
      <main className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center w-full h-[60vh]">
            <LoadingSpinner size={48} />
          </div>
        ) : (
          <>
            <SettingsSection title="アカウント">
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
            </SettingsSection>

            <SettingsSection title="ペア">
              <PartnerSettings
                isLoading={isLoading}
                isPairLoading={isPairLoading}
                pendingApproval={pendingApproval}
                isPairConfirmed={isPairConfirmed}
                partnerEmail={partnerEmail}
                partnerImage={partnerImage ?? '/images/default.png'}
                inviteCode={inviteCode}
                pairDocId={pairDocId}
                joinCode={joinCode}
                onChangeJoinCode={setJoinCode}
                onApprovePair={handleApprovePair}
                onRejectPair={requestRejectPair}
                onCancelInvite={requestCancelInvite}
                onSendInvite={handleSendInvite}
                onJoinByCode={handleJoinByCode}
                onRemovePair={requestRemovePair}
                isRemoving={isRemoving}
                busy={pairBusy}
              />
            </SettingsSection>

            <SettingsSection title="プラン / 通知">
              <div className="overflow-hidden rounded-2xl bg-white shadow">
                <SettingsNavRow href="/pricing" label="応援プラン" value={planRowValue} />
              </div>
              {uid && <PushToggle uid={uid} />}
            </SettingsSection>

            <SettingsSection title="その他">
              <HelpHintsToggle />
              <div className="overflow-hidden divide-y divide-gray-100 rounded-2xl bg-white shadow">
                <SettingsNavRow href="/contact" label="お問い合わせ" />
                <SettingsNavRow href="/terms" label="利用規約" />
                <SettingsNavRow href="/privacy" label="プライバシー" />
                <SettingsNavRow href="/delete-account" label="アカウントを削除する" danger />
              </div>
            </SettingsSection>
          </>
        )}

      </main>

      <EmailEditModal open={isEmailModalOpen} onClose={() => setIsEmailModalOpen(false)} />
      <PasswordEditModal open={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} />

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
    </div>
  );
}

