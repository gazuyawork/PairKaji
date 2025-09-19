// src/components/profile/PartnerSettings.tsx
'use client';

export const dynamic = 'force-dynamic'

import { X } from 'lucide-react';
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
  onApprovePair: () => void;
  onRejectPair: () => void;
  onCancelInvite: () => void;
  onSendInvite: () => void;
  onRemovePair: () => void;
  onChangePartnerEmail: (email: string) => void;
  partnerImage: string;
  isRemoving: boolean;
};

export default function PartnerSettings({
  isPairLoading,
  pendingApproval,
  isPairConfirmed,
  partnerEmail,
  inviteCode,
  pairDocId,
  onApprovePair,
  onRejectPair,
  onCancelInvite,
  onSendInvite,
  onRemovePair,
  onChangePartnerEmail,
  partnerImage,
  isRemoving,
}: PartnerSettingsProps) {
  return (
    <motion.div
      className="min-h-[180px] bg-white shadow rounded-2xl px-8 py-6 space-y-3 mx-auto w-full max-w-xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <p className="mb-6">
        <label className="text-[#5E5E5E] font-semibold">パートナー設定</label>
      </p>

      {isPairLoading ? (
        <div className="flex items-center justify-center text-gray-400 text-sm">
          <LoadingSpinner size={48} />
        </div>
      ) : (
        <>
          {pendingApproval ? (
            <>
              <p className="text-gray-600 text-sm">{pendingApproval.emailB} さんとして招待されています</p>
              <p className="text-gray-600 text-sm">招待コード: {pendingApproval.inviteCode}</p>
              <button
                onClick={onApprovePair}
                className="w-full bg-[#FFCB7D] text-white py-2 rounded shadow text-sm"
              >
                承認する
              </button>
              <button
                onClick={onRejectPair}
                className="w-full bg-gray-300 text-white py-2 rounded shadow text-sm"
              >
                拒否する
              </button>
            </>
          ) : isPairConfirmed ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative w-16 h-16 rounded-full border border-gray-300 overflow-hidden">
                  <Image
                    src={partnerImage || '/images/default.png'}
                    alt="パートナー画像"
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="text-[#5E5E5E]">
                  <p className="font-semibold">パートナー承認済み</p>
                  <p>{partnerEmail}</p>
                </div>
                <button
                  onClick={onRemovePair}
                  disabled={isRemoving}
                  className={`ml-auto text-red-500 ${isRemoving ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isRemoving ? '処理中...' : <X size={24} />}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <input
                  type="email"
                  value={partnerEmail}
                  onChange={(e) => onChangePartnerEmail(e.target.value)}
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
                onClick={pairDocId ? onCancelInvite : onSendInvite}
                className={`w-full py-2 rounded shadow text-sm ${pairDocId ? 'bg-gray-100 text-red-500 hover:underline' : 'bg-[#FFCB7D] text-white'
                  }`}
              >
                {pairDocId ? '招待を取り消す' : '招待コードを発行'}
              </button>
            </>
          )}
        </>
      )}
    </motion.div>
  );
}
