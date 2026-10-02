'use client';

export const dynamic = 'force-dynamic';

import { X, UserPlus, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import ConfirmModal from '@/components/common/modals/ConfirmModal';
import { useHousehold } from '@/context/HouseholdContext';
import {
  acceptIncomingPairInvite,
  cancelOutgoingPairInvite,
  issuePairInvite,
  joinPairByCode,
  pairInviteErrorMessage,
  rejectIncomingPairInvite,
} from '@/lib/pairInviteApi';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function PairInviteCard() {
  const { hasIncomingInvite, incomingInvite, hasSentInvite, outgoingInviteCode } = useHousehold();
  const [isDismissed, setIsDismissed] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  useEffect(() => {
    const dismissed = localStorage.getItem('dismissedPairCard');
    setIsDismissed(dismissed === 'true');
  }, []);

  const handleIssue = async () => {
    setBusy(true);
    try {
      await issuePairInvite();
      toast.success('招待コードを発行しました');
    } catch (err) {
      toast.error(pairInviteErrorMessage(err, '招待コードを発行できませんでした'));
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    setBusy(true);
    try {
      await joinPairByCode(joinCode);
      toast.success('パートナーとつながりました', {
        description: 'ホームから、最初のタスクを追加できます。',
      });
      setJoinCode('');
    } catch (err) {
      toast.error(pairInviteErrorMessage(err, '参加できませんでした'));
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    setBusy(true);
    try {
      await cancelOutgoingPairInvite();
      toast.success('招待を取り消しました');
    } catch (err) {
      toast.error(pairInviteErrorMessage(err, '取り消しに失敗しました'));
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async () => {
    if (!incomingInvite?.pairId) return;
    setBusy(true);
    try {
      await acceptIncomingPairInvite(incomingInvite.pairId);
      toast.success('ペア設定を承認しました', {
        description: 'ホームから、最初のタスクを追加できます。',
      });
    } catch (err) {
      toast.error(pairInviteErrorMessage(err, '承認できませんでした'));
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!incomingInvite?.pairId) return;
    setBusy(true);
    try {
      await rejectIncomingPairInvite(incomingInvite.pairId);
      toast.success('招待を拒否しました');
    } catch (err) {
      toast.error(pairInviteErrorMessage(err, '拒否できませんでした'));
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async (code: string) => {
    const ok = await copyText(code);
    toast.success(ok ? 'コードをコピーしました' : `コード: ${code}`);
  };

  const handleShare = async (code: string) => {
    const text = `PairKajiの招待コード: ${code}`;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: 'PairKaji', text });
        return;
      }
    } catch {
      /* 共有キャンセルは無視 */
    }
    await handleCopy(code);
  };

  if (hasIncomingInvite && incomingInvite) {
    return (
      <div className="relative mx-auto w-full max-w-xl bg-gradient-to-r from-[#fff4e5] to-[#fffaf1] border border-orange-200 py-6 px-5 rounded-xl shadow-md">
        <div className="flex items-center gap-2 justify-center mb-3">
          <UserPlus className="w-6 h-6 text-orange-500" />
          <p className="font-semibold text-lg text-gray-700">ペアリングの招待が来ています</p>
        </div>
        <p className="text-sm text-gray-500 text-center mb-4">承認すると、タスクを一緒に管理できます。</p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={handleAccept}
            className="w-full min-h-11 bg-[#FFCB7D] text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            承認する
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleReject}
            className="w-full min-h-11 bg-gray-200 text-gray-700 py-2 rounded-lg text-sm disabled:opacity-50"
          >
            拒否する
          </button>
        </div>
      </div>
    );
  }

  if (hasSentInvite) {
    const code = outgoingInviteCode || '';
    return (
      <div className="relative mx-auto w-full max-w-xl bg-gradient-to-r from-[#fff4e5] to-[#fffaf1] border border-orange-200 py-6 px-5 rounded-xl shadow-md">
        <p className="font-semibold text-lg text-gray-700 text-center mb-1">パートナーを待っています</p>
        <p className="text-sm text-gray-500 text-center mb-4">このコードを相手に伝えて、アプリで入力してもらってください。</p>
        <p className="text-center text-2xl tracking-[0.35em] font-semibold text-gray-800 mb-4">{code || '発行済み'}</p>
        <div className="flex flex-col gap-2">
          {code ? (
          <button
            type="button"
            onClick={() => handleShare(code)}
            className="w-full min-h-11 bg-[#FFCB7D] text-white py-2 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2"
          >
            <Copy className="w-4 h-4" />
            コードをコピー / 共有
          </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={handleCancel}
            className="w-full min-h-11 text-red-500 text-sm disabled:opacity-50"
          >
            招待を取り消す
          </button>
        </div>
      </div>
    );
  }

  if (isDismissed) return null;

  return (
    <>
      <div className="relative mx-auto w-full max-w-xl bg-gradient-to-r from-[#fff4e5] to-[#fffaf1] border border-orange-200 py-6 px-5 rounded-xl shadow-md">
        <button
          type="button"
          onClick={() => setShowConfirmModal(true)}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
          aria-label="閉じる"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 justify-center mb-2">
          <UserPlus className="w-6 h-6 text-orange-500" />
          <p className="font-semibold text-lg text-gray-700">パートナーとつながる</p>
        </div>
        <p className="text-sm text-gray-500 text-center mb-4">コードを発行して相手に渡すか、受け取ったコードを入力します。</p>
        <button
          type="button"
          disabled={busy}
          onClick={handleIssue}
          className="w-full min-h-11 bg-[#FFCB7D] text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50 mb-3"
        >
          招待コードを発行
        </button>
        <div className="flex gap-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="コードを入力"
            maxLength={8}
            autoCapitalize="characters"
            className="flex-1 min-h-11 border border-gray-200 rounded-lg px-3 tracking-widest"
          />
          <button
            type="button"
            disabled={busy || joinCode.trim().length < 6}
            onClick={handleJoin}
            className="min-h-11 px-4 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            参加
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={showConfirmModal}
        title=""
        message={<span className="font-semibold">非表示後はプロフィール画面から設定できます。</span>}
        confirmLabel="OK"
        cancelLabel="キャンセル"
        onConfirm={() => {
          localStorage.setItem('dismissedPairCard', 'true');
          setIsDismissed(true);
          setShowConfirmModal(false);
        }}
        onCancel={() => setShowConfirmModal(false)}
      />
    </>
  );
}
