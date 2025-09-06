// src/components/home/parts/TodayCompletedTasksCard.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, SquareUser } from 'lucide-react';
import type { Task } from '@/types/Task';
import { format } from 'date-fns';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

/* =========================
   型とユーティリティ
   ========================= */

type MaybePrivate = {
  isPrivate?: boolean;
  private?: boolean;
  privateMode?: boolean;
  privacy?: string; // 'private' 等
  mode?: string;    // 'private' 等
};

type MaybeCompleted = {
  completedBy?: string;
  completedUserId?: string;
  completedById?: string;
  users?: string[];
};

type FirestoreDocData = Record<string, unknown>;

function isTaskPrivate(task: Task | MaybePrivate): boolean {
  const t = task as MaybePrivate;
  return !!(
    t.isPrivate === true ||
    t.private === true ||
    t.privateMode === true ||
    t.privacy === 'private' ||
    t.mode === 'private'
  );
}

/** 完了者の userId を決定
 * 優先: completedBy → completedUserId → completedById → users[0]
 */
function getCompletedUserId(task: Task | MaybeCompleted): string | null {
  const t = task as MaybeCompleted;
  const fromCompleted = t.completedBy ?? t.completedUserId ?? t.completedById ?? null;
  if (typeof fromCompleted === 'string' && fromCompleted.trim().length > 0) return fromCompleted;

  const arr = Array.isArray(t.users) ? t.users : [];
  const first = arr[0];
  return typeof first === 'string' && first.trim().length > 0 ? first : null;
}

/** 画像URL候補から最適なものを選ぶ（Storage パスは不可。getDownloadURL 済み前提） */
function resolveUserImageSrc(profile: FirestoreDocData | null): string {
  const pick = (k: string): string | undefined => {
    const v = profile?.[k];
    return typeof v === 'string' && v.trim().length > 0 ? v : undefined;
  };
  const candidates = [
    pick('imageUrl'),
    pick('photoURL'),
    pick('photoUrl'),
    pick('profileImageUrl'),
    pick('avatarUrl'),
    pick('pictureUrl'),
    pick('pictureURL'),
    pick('photo_url'),
    pick('icon'),
    pick('avatar'),
    pick('picture'),
    pick('photo'),
    typeof profile?.profile === 'object' && profile?.profile
      ? ((): string | undefined => {
          const p = profile!.profile as Record<string, unknown>;
          const cands = ['imageUrl', 'photoURL', 'avatarUrl']
            .map((kk) => (typeof p[kk] === 'string' && (p[kk] as string).trim() ? (p[kk] as string) : undefined))
            .filter(Boolean) as string[];
          return cands[0];
        })()
      : undefined,
  ].filter(Boolean) as string[];

  let src = candidates[0] ?? '';
  if (src && !/^https?:\/\//.test(src) && !src.startsWith('/')) {
    // 相対/gs:等の不正URLは不採用
    src = '';
  }
  return src;
}

function getDisplayName(data: FirestoreDocData | null): string {
  const dn = data?.displayName;
  if (typeof dn === 'string' && dn.trim()) return dn;
  const name = data?.name;
  if (typeof name === 'string' && name.trim()) return name;
  return '';
}

/** 任意の Firestore 値→Date へ安全変換 */
function toDateSafe(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  // Timestamp 互換（toDate を持っていれば使う）
  if (typeof (value as { toDate?: () => Date })?.toDate === 'function') {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** イニシャル文字（フォールバック） */
function initialOf(idOrName?: string | null): string {
  if (!idOrName) return 'U';
  const s = String(idOrName).trim();
  return s ? s[0]!.toUpperCase() : 'U';
}

/* =========================
   Component
   ========================= */

type Props = {
  tasks: Task[];
};

export default function TodayCompletedTasksCard({ tasks }: Props) {
  const [imgMap, setImgMap] = useState<Record<string, string>>({});
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const pendingRef = useRef<Set<string>>(new Set());

  // このカードで必要な UID を一意化
  const completedUids = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      const uid = getCompletedUserId(t);
      if (uid) set.add(uid);
    }
    return Array.from(set);
  }, [tasks]);

  // Firestore から未取得の UID のプロフィールを解決
  useEffect(() => {
    let cancelled = false;

    async function fetchProfiles(uids: string[]) {
      for (const uid of uids) {
        if (!uid) continue;
        if (imgMap[uid]) continue;
        if (pendingRef.current.has(uid)) continue;

        pendingRef.current.add(uid);
        try {
          let data: FirestoreDocData | null = null;

          // 1) users/{uid}
          let snap = await getDoc(doc(db, 'users', uid));
          data = snap.exists() ? (snap.data() as FirestoreDocData) : null;

          // 2) profiles/{uid}
          if (!data) {
            snap = await getDoc(doc(db, 'profiles', uid));
            data = snap.exists() ? (snap.data() as FirestoreDocData) : null;
          }

          // 3) app_users/{uid}（必要に応じて）
          if (!data) {
            snap = await getDoc(doc(db, 'app_users', uid));
            data = snap.exists() ? (snap.data() as FirestoreDocData) : null;
          }

          const img = resolveUserImageSrc(data);
          const displayName = getDisplayName(data);

          if (!cancelled) {
            if (img) setImgMap((prev) => ({ ...prev, [uid]: img }));
            if (displayName) setNameMap((prev) => ({ ...prev, [uid]: displayName }));
          }
        } finally {
          pendingRef.current.delete(uid);
        }
      }
    }

    const targets = completedUids.filter((uid) => uid && !imgMap[uid] && !pendingRef.current.has(uid));
    if (targets.length > 0) void fetchProfiles(targets);

    return () => {
      cancelled = true;
    };
  }, [completedUids, imgMap]);

  return (
    <div className="bg-white rounded-lg shadow-md p-4 mx-auto w-full max-w-xl">
      <div className="flex items-center justify-center mb-2">
        <CheckCircle className="w-6 h-6 text-green-500" />
        <h3 className="ml-2 font-bold text-lg text-gray-800">本日の完了タスク</h3>
      </div>

      {tasks.length > 0 ? (
        <ul className="divide-y divide-gray-200 mx-4">
          {tasks.map((task) => {
            const completedUserId = getCompletedUserId(task);

            const completedAtDate = toDateSafe(
              (task as unknown as { completedAt?: unknown })?.completedAt
            );
            const timeLabel = completedAtDate ? format(completedAtDate, 'HH:mm') : '';

            const privateFlag = isTaskPrivate(task);

            const imgSrc = completedUserId ? imgMap[completedUserId] : '';
            const displayName =
              (completedUserId && nameMap[completedUserId]) || completedUserId || '';

            return (
              <li key={task.id} className="py-2 flex items-center justify-between gap-2">
                {/* 左：タスク名 */}
                <span className="text-gray-700 truncate">{task.name}</span>

                {/* 右：時刻 + 完了者（プライベート時は鍵風アイコン） */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm text-gray-400">{timeLabel}</span>

                  {privateFlag ? (
                    <div
                      className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center"
                      title="プライベート（パートナーには非表示）"
                      aria-label="プライベート（パートナーには非表示）"
                    >
                      <SquareUser className="w-6 h-6 text-green-600" />
                    </div>
                  ) : completedUserId ? (
                    imgSrc ? (
                      <div className="relative w-6 h-6 rounded-full overflow-hidden shrink-0">
                        <Image
                          src={imgSrc}
                          alt={displayName || 'user'}
                          fill
                          sizes="24px"
                          className="object-cover"
                          onError={() => {
                            /* no-op: 表示だけフォールバックに任せる */
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        className="w-6 h-6 rounded-full bg-gray-300 text-gray-700 text-xs flex items-center justify-center"
                        title={displayName}
                        aria-label={displayName}
                      >
                        {initialOf(displayName)}
                      </div>
                    )
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-500 text-xs flex items-center justify-center">
                      U
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-gray-500 text-sm text-center py-4">本日の完了タスクはありません。</p>
      )}
    </div>
  );
}
