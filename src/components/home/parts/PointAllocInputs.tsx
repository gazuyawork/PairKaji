// src/components/home/parts/PointAllocInputs.tsx
'use client';

import Image from 'next/image';
import { useMemo } from 'react';
import HelpPopover from '@/components/common/HelpPopover'; // [追加] ポップアップ（？）用

type UserInfo = {
  id: string;
  name: string;
  imageUrl: string;
};

interface Props {
  users: UserInfo[];
  alloc: Record<string, number>;
  setAlloc: (next: Record<string, number>) => void;
  point: number;
  selfId: string | null;
  autoPartner?: boolean;
}

export default function PointAllocInputs({
  users,
  alloc,
  setAlloc,
  point,
  selfId,
  autoPartner = false,
}: Props) {
  const isPair = Array.isArray(users) && users.length === 2;
  const selfUser = isPair && selfId ? users.find((u) => u.id === selfId) ?? null : null;
  const partnerUser = isPair && selfId ? users.find((u) => u.id !== selfId) ?? null : null;

  const safeNum = (v: unknown) => (Number.isFinite(v) ? Number(v) : 0);

  const selfVal = selfUser ? safeNum(alloc[selfUser.id]) : 0;
  const derivedPartnerVal =
    autoPartner && isPair && selfUser && partnerUser
      ? Math.max(point - selfVal, 0)
      : null;

  const sumAlloc = useMemo(() => {
    if (autoPartner && isPair && selfUser && partnerUser) {
      return Math.min(point, selfVal + (derivedPartnerVal ?? 0));
    }
    return Object.values(alloc).reduce(
      (a, b) => a + (Number.isFinite(b) ? Number(b) : 0),
      0,
    );
  }, [alloc, autoPartner, isPair, selfUser, partnerUser, selfVal, derivedPartnerVal, point]);

  const handleChangeSelf = (raw: number) => {
    const v = Number.isFinite(raw) ? Math.max(0, Math.min(raw, point)) : 0;
    if (autoPartner && isPair && selfUser && partnerUser) {
      const nextSelf = v;
      const nextPartner = Math.max(point - nextSelf, 0);
      setAlloc({ ...alloc, [selfUser.id]: nextSelf, [partnerUser.id]: nextPartner });
    } else if (selfUser) {
      setAlloc({ ...alloc, [selfUser.id]: v });
    }
  };

  if (!Array.isArray(users) || users.length === 0) {
    return null;
  }

  // --- 自動配分（自分入力のみ、相手は自動） ---
  if (autoPartner && isPair && selfUser && partnerUser) {
    const ordered = [selfUser, partnerUser];

    return (
      <div className="flex items-center mt-2">
        {/* [置換] 内訳ラベル + ？（右横にスペースを確保） */}
        <div className="shrink-0 flex items-center px-3 py-2 mr-3">
          <span className="text-gray-600 font-bold">内訳</span>
          <HelpPopover
            className="ml-1"
            content={
              <div className="space-y-2 text-sm">
                <p>各担当者への<strong>ポイント配分</strong>です。</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>配分の合計は「目標pt」を<strong>超えない</strong>ように調整してください。</li>
                  <li>自動配分オン時は<strong>自分のみ入力可能</strong>、相手は自動計算されます。</li>
                </ul>
                <p className="text-xs text-gray-500">現在の配分合計：{sumAlloc} pt</p>
              </div>
            }
          />
        </div>

        {/* 横スクロールで常に1行表示 */}
        <div className="flex-1 overflow-x-auto">
          <div
            className="inline-flex flex-nowrap items-center gap-6 whitespace-nowrap pr-2"
            aria-label="ポイント内訳（横スクロール可能）"
          >
            {ordered.map((user) => {
              const isSelf = user.id === selfUser.id;
              const val = isSelf ? selfVal : derivedPartnerVal ?? 0;
              return (
                <div key={user.id} className="inline-flex items-center gap-2 shrink-0">
                  <Image
                    src={user.imageUrl || '/images/default.png'}
                    alt={user.name}
                    width={40}
                    height={40}
                    className="rounded-full w-8 h-8 sm:w-10 sm:h-10 object-cover aspect-square border border-gray-300"
                  />
                  <div className="inline-flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={point}
                      value={val}
                      onChange={(e) => {
                        if (!isSelf) return;
                        handleChangeSelf(Number(e.target.value));
                      }}
                      className={`w-14 sm:w-16 md:w-20 text-base sm:text-lg md:text-xl border-b outline-none text-center ${
                        isSelf
                          ? 'border-gray-300 text-gray-700'
                          : 'border-transparent text-gray-500'
                      }`}
                      disabled={!isSelf}
                    />
                    <span className="text-gray-600">pt</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // --- 通常（全員自由入力） ---
  return (
    <div className="flex items-center mt-2">
      {/* [置換] 内訳ラベル + ？（右横にスペースを確保） */}
      <div className="shrink-0 flex items-center px-3 py-2 mr-3">
        <span className="text-gray-600 font-bold">内訳</span>
        <HelpPopover
          className="ml-1"
          content={
            <div className="space-y-2 text-sm">
              <p>各担当者への<strong>ポイント配分</strong>です。</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>配分の合計は「目標pt」を<strong>超えない</strong>ように調整してください。</li>
                <li>必要に応じて各メンバーのptを直接編集できます。</li>
              </ul>
              <p className="text-xs text-gray-500">現在の配分合計：{sumAlloc} pt</p>
            </div>
          }
        />
      </div>

      {/* 横スクロールで常に1行表示 */}
      <div className="flex-1 overflow-x-auto">
        <div
          className="inline-flex flex-nowrap items-center gap-6 whitespace-nowrap pr-2"
          aria-label="ポイント内訳（横スクロール可能）"
        >
          {users.map((user) => (
            <div key={user.id} className="inline-flex items-center gap-2 shrink-0">
              <Image
                src={user.imageUrl || '/images/default.png'}
                alt={user.name}
                width={40}
                height={40}
                className="rounded-full w-8 h-8 sm:w-10 sm:h-10 object-cover aspect-square border border-gray-300"
              />
              <div className="inline-flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={point}
                  value={safeNum(alloc[user.id])}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    const val = Number.isFinite(raw) ? Math.max(0, raw) : 0;
                    setAlloc({ ...alloc, [user.id]: val });
                  }}
                  className="w-14 sm:w-16 md:w-20 text-base sm:text-lg md:text-xl border-b border-gray-300 outline-none text-center text-gray-700"
                />
                <span className="text-gray-600">pt</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
