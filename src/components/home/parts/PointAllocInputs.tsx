// src/components/home/parts/PointAllocInputs.tsx
'use client';

import Image from 'next/image';
import { useMemo } from 'react';

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
  const partnerUser =
    isPair && selfId ? users.find((u) => u.id !== selfId) ?? null : null;

  const safeNum = (v: unknown) => (Number.isFinite(v) ? Number(v) : 0);

  const selfVal = selfUser ? safeNum(alloc[selfUser.id]) : 0;
  const derivedPartnerVal =
    autoPartner && isPair && selfUser && partnerUser
      ? Math.max(point - selfVal, 0)
      : null;

  // ✅ useMemo を必ずトップレベルで呼ぶ
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

  // ✅ Hooks の後で分岐 return
  if (!Array.isArray(users) || users.length === 0) {
    return null;
  }

  if (autoPartner && isPair && selfUser && partnerUser) {
    const ordered = [selfUser, partnerUser];

    return (
      <div className="flex mt-2">
        <p className="text-gray-600 font-bold pt-2 pl-2 pr-4">内訳</p>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-6">
            {ordered.map((user) => {
              const isSelf = user.id === selfUser.id;
              const val = isSelf ? selfVal : derivedPartnerVal ?? 0;
              return (
                <div key={user.id} className="flex items-center gap-2">
                  <Image
                    src={user.imageUrl || '/images/default.png'}
                    alt={user.name}
                    width={40}
                    height={40}
                    className="rounded-full w-[40px] h-[40px] object-cover aspect-square border border-gray-300"
                  />
                  <div className="flex items-center gap-2">
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
                      className={`w-20 text-xl border-b outline-none text-center ${
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
          <div className="text-xs text-gray-500">
            合計: <span className="font-semibold">{sumAlloc}</span>/{point} pt
          </div>
        </div>
      </div>
    );
  }

  // --- 通常（全員自由入力） ---
  return (
    <div className="flex mt-2">
      <p className="text-gray-600 font-bold pt-2 pl-2 pr-4">内訳</p>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-6">
          {users.map((user) => (
            <div key={user.id} className="flex items-center gap-2">
              <Image
                src={user.imageUrl || '/images/default.png'}
                alt={user.name}
                width={40}
                height={40}
                className="rounded-full w-[40px] h-[40px] object-cover aspect-square border border-gray-300"
              />
              <div className="flex items-center gap-2">
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
                  className="w-20 text-xl border-b border-gray-300 outline-none text-center text-gray-700"
                />
                <span className="text-gray-600">pt</span>
              </div>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-500">
          合計: <span className="font-semibold">{sumAlloc}</span>/{point} pt
        </div>
      </div>
    </div>
  );
}
