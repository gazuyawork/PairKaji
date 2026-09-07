// src/components/profile/PartnerSettings.tsx
'use client';

export const dynamic = 'force-dynamic';

import Image from 'next/image';
import type { PendingApproval } from '@/types/Pair';
import { motion } from 'framer-motion';
import LoadingSpinner from '@/components/common/LoadingSpinner';

type PartnerSettingsProps = {
  isLoading: boolean;
  isPairLoading: boolean;
  pendingApproval: PendingApproval | null;
  isPairConfirmed: boolean;
  partnerEmail: string;
  inviteCode: string;
  pairDocId: string | null;
  joinCode: string;
  onChangeJoinCode: (code: string) => void;
  onApprovePair: () => void;
  onRejectPair: () => void;
  onCancelInvite: () => void;
  onSendInvite: () => void;
  onJoinByCode: () => void;
  onRemovePair: () => void;
  partnerImage: string;
  isRemoving: boolean;
  busy?: boolean;
};

export default function PartnerSettings({
  isPairLoading,
  pendingApproval,
  isPairConfirmed,
  partnerEmail,
  inviteCode,
  pairDocId,
  joinCode,
  onChangeJoinCode,
  onApprovePair,
  onRejectPair,
  onCancelInvite,
  onSendInvite,
  onJoinByCode,
  onRemovePair,
  partnerImage,
  isRemoving,
  busy = false,
}: PartnerSettingsProps) {
  return (
    <motion.div
      className="bg-white shadow rounded-2xl px-4 py-4 space-y-3 mx-auto w-full max-w-xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      {isPairLoading ? (
        <div className="flex items-center justify-center text-gray-400 text-sm">
          <LoadingSpinner size={48} />
        </div>
      ) : (
        <>
          {pendingApproval ? (
            <>
              <p className="text-gray-600 text-sm">メール宛の招待が届いています。</p>
              <button
                type="button"
                disabled={busy}
                onClick={onApprovePair}
                className="w-full min-h-11 bg-[#FFCB7D] text-white py-2 rounded shadow text-sm disabled:opacity-50"
              >
                承認する
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onRejectPair}
                className="w-full min-h-11 bg-gray-300 text-white py-2 rounded shadow text-sm disabled:opacity-50"
              >
                拒否する
              </button>
            </>
          ) : isPairConfirmed ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative h-16 w-16 overflow-hidden rounded-full border border-gray-300">
                  <Image
                    src={partnerImage || '/images/default.png'}
                    alt="パートナー画像"
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0 text-[#5E5E5E]">
                  <p className="font-semibold">つながっています</p>
                  <p className="truncate text-sm">{partnerEmail}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onRemovePair}
                disabled={isRemoving}
                className={`w-full min-h-11 rounded-xl border border-red-200 text-sm font-semibold text-red-600 active:bg-red-50 ${isRemoving ? 'opacity-50' : ''}`}
              >
                {isRemoving ? '処理中...' : 'ペアを解除'}
              </button>
            </div>
          ) : pairDocId ? (
            <>
              <p className="text-sm text-gray-600">相手にこのコードを伝えてください。</p>
              <p className="text-2xl tracking-[0.35em] font-semibold text-center text-[#5E5E5E] py-2">
                {inviteCode || '発行済み'}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={onCancelInvite}
                className="w-full min-h-11 py-2 rounded shadow text-sm bg-gray-100 text-red-500 disabled:opacity-50"
              >
                招待を取り消す
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onSendInvite}
                className="w-full min-h-11 py-2 rounded shadow text-sm bg-[#FFCB7D] text-white disabled:opacity-50"
              >
                招待コードを発行
              </button>
              <p className="text-xs text-gray-500 text-center">または、受け取ったコードで参加</p>
              <div className="flex gap-2">
                <input
                  value={joinCode}
                  onChange={(e) => onChangeJoinCode(e.target.value.toUpperCase())}
                  placeholder="コードを入力"
                  maxLength={8}
                  autoCapitalize="characters"
                  className="flex-1 min-h-11 border-b border-gray-300 py-1 px-2 tracking-widest"
                />
                <button
                  type="button"
                  disabled={busy || joinCode.trim().length < 6}
                  onClick={onJoinByCode}
                  className="min-h-11 px-4 rounded bg-emerald-600 text-white text-sm disabled:opacity-50"
                >
                  参加
                </button>
              </div>
            </>
          )}
        </>
      )}
    </motion.div>
  );
}
