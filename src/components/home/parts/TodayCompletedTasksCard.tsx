// src/components/home/parts/TodayCompletedTasksCard.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, SquareUser, Heart } from 'lucide-react';
import type { Task } from '@/types/Task';
// import { format } from 'date-fns'; // 時刻関連は停止
import Image from 'next/image';
import { db, auth } from '@/lib/firebase';
import {
  doc, getDoc, collection, query, where, limit, getDocs,
  setDoc, updateDoc, onSnapshot, arrayUnion, arrayRemove
} from 'firebase/firestore';

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
  const dn = (data as any)?.displayName;
  if (typeof dn === 'string' && dn.trim()) return dn;
  const name = (data as any)?.name;
  if (typeof name === 'string' && name.trim()) return name;
  return '';
}

/** 任意の Firestore 値→Date へ安全変換（時刻表示停止中） */
// function toDateSafe(value: unknown): Date | null { ... }

/** イニシャル文字（フォールバック） */
function initialOf(idOrName?: string | null): string {
  if (!idOrName) return 'U';
  const s = String(idOrName).trim();
  return s ? s[0]!.toUpperCase() : 'U';
}

/** 今日(ローカル)のキー: 'YYYY-MM-DD' */
function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function likeDocId(taskId: string, date: string) {
  return `${taskId}_${date}`;
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

  const [pairEnabled, setPairEnabled] = useState<boolean>(false);
  const [partnerUid, setPartnerUid] = useState<string | null>(null);

  const [likesMap, setLikesMap] = useState<Record<string, string[]>>({});
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());

  const currentUid = auth.currentUser?.uid ?? null;

  // パートナー設定の検出
  useEffect(() => {
    let cancelled = false;
    async function detectPair() {
      if (!currentUid) return;
      let confirmed = false;
      let partner: string | null = null;
      try {
        const direct = await getDoc(doc(db, 'pairs', currentUid));
        if (direct.exists()) {
          const d = direct.data() as any;
          const status = d?.status ?? d?.state ?? d?.pairStatus;
          const confirmedLike = status === 'confirmed' || d?.confirmed === true;
          if (confirmedLike) {
            confirmed = true;
            partner =
              d?.partnerId ??
              d?.partnerUid ??
              (Array.isArray(d?.userIds) ? (d.userIds as string[]).find((x) => x !== currentUid) ?? null : null);
          }
        }
        if (!confirmed) {
          const q = query(collection(db, 'pairs'), where('userIds', 'array-contains', currentUid), limit(5));
          const snap = await getDocs(q);
          for (const s of snap.docs) {
            const d = s.data() as any;
            const status = d?.status ?? d?.state ?? d?.pairStatus;
            const confirmedLike = status === 'confirmed' || d?.confirmed === true;
            if (confirmedLike) {
              confirmed = true;
              partner =
                d?.partnerId ??
                d?.partnerUid ??
                (Array.isArray(d?.userIds) ? (d.userIds as string[]).find((x) => x !== currentUid) ?? null : null);
              break;
            }
          }
        }
      } catch {}
      if (!cancelled) {
        setPairEnabled(confirmed);
        setPartnerUid(partner ?? null);
      }
    }
    void detectPair();
    return () => { cancelled = true; };
  }, [currentUid]);

  // このカードで必要な UID を一意化（完了者のプロフィール表示に利用）
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

  // いいね購読（各 taskId × 今日）
  useEffect(() => {
    if (!pairEnabled) return;
    const date = todayKey();
    const unsubs: Array<() => void> = [];
    for (const t of tasks) {
      const id = t.id;
      if (!id) continue;
      const ref = doc(db, 'taskLikes', likeDocId(id, date));
      const unsub = onSnapshot(ref, (snap) => {
        const data = snap.data() as any | undefined;
        const likedBy: string[] = Array.isArray(data?.likedBy) ? data!.likedBy as string[] : [];
        setLikesMap((prev) => ({ ...prev, [id]: likedBy }));
      });
      unsubs.push(unsub);
    }
    return () => {
      unsubs.forEach((f) => f());
    };
  }, [pairEnabled, tasks]);

  // ハートON/OFF切り替え（ON時のみ震えアニメ）
  const toggleLike = async (taskId?: string, ownerId?: string | null) => {
    if (!taskId || !pairEnabled || !currentUid) return;
    if (ownerId && currentUid === ownerId) return; // 自分の完了タスクは押せない
    const date = todayKey();
    const ref = doc(db, 'taskLikes', likeDocId(taskId, date));
    const snap = await getDoc(ref);
    const exists = snap.exists();
    const current = (exists ? snap.data()?.likedBy : []) as string[] | undefined;
    const already = Array.isArray(current) ? current.includes(currentUid) : false;

    if (!exists) {
      await setDoc(ref, {
        taskId,
        date,
        ownerId: ownerId ?? null,
        likedBy: [currentUid],
      }, { merge: true });
    } else if (already) {
      await updateDoc(ref, { likedBy: arrayRemove(currentUid) });
    } else {
      await updateDoc(ref, { likedBy: arrayUnion(currentUid) });
    }

    // ONになるときだけ揺らす
    if (!already) {
      setAnimatingIds((a) => new Set(a).add(taskId));
      setTimeout(() => {
        setAnimatingIds((a) => {
          const b = new Set(a);
          b.delete(taskId);
          return b;
        });
      }, 450);
    }
  };

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

            // ▼ 時刻表示は停止
            // const completedAtDate = toDateSafe((task as any)?.completedAt);
            // const timeLabel = completedAtDate ? format(completedAtDate, 'HH:mm') : '';

            const privateFlag = isTaskPrivate(task);

            const imgSrc = completedUserId ? imgMap[completedUserId] : '';
            const displayName =
              (completedUserId && nameMap[completedUserId]) || completedUserId || '';

            const isMine = completedUserId && currentUid ? completedUserId === currentUid : false;
            const showHeart = pairEnabled;

            const likedBy = likesMap[task.id] ?? [];
            // ON条件: 自分が押した（相手のタスク） or 相手が押した（自分のタスク）
            const heartOn = showHeart && (
              (isMine ? (partnerUid ? likedBy.includes(partnerUid) : false)
                      : likedBy.includes(currentUid ?? ''))
            );
            const heartDisabled = !showHeart || isMine;

            return (
              <li key={task.id} className="py-2 flex items-center justify-between gap-2">
                {/* 左：タスク名 */}
                <span className="text-gray-700 truncate">{task.name}</span>

                {/* 右：完了者（プライベート時は鍵風アイコン） + ハート（条件表示） */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* <span className="text-sm text-gray-400">{timeLabel}</span> */} {/* 時刻表示停止 */}

                  {privateFlag ? (
                    <div
                      className="w-6 h-6 rounded-full text-gray-600 flex items-center justify-center"
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
                          onError={() => { /* no-op */ }}
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

                  {/* ハート（ペア時のみ） */}
                  {showHeart && (
                    <button
                      type="button"
                      onClick={() => toggleLike(task.id, completedUserId)}
                      aria-label={heartDisabled ? 'いいね不可' : (heartOn ? 'いいね済み' : 'いいね')}
                      aria-pressed={heartOn}
                      aria-disabled={heartDisabled}
                      disabled={heartDisabled}
                      className={[
                        'flex-shrink-0',
                        heartDisabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
                      ].join(' ')}
                      title={
                        heartDisabled
                          ? isMine
                            ? '自分の完了タスクには「いいね」できません'
                            : 'パートナー設定時のみ利用できます'
                          : (heartOn ? 'いいね済み' : 'いいね')
                      }
                      tabIndex={heartDisabled ? -1 : 0}
                    >
                      <Heart
                        className={[
                          'h-6 w-6',
                          heartOn ? 'text-rose-500 fill-rose-500' : 'text-gray-300',
                          animatingIds.has(task.id) ? 'heart-shake' : '',
                          heartDisabled && !heartOn ? 'heart-dashed' : '', // 自分の完了タスクは点線表示
                          !heartDisabled ? 'hover:scale-110 transition-transform' : '',
                        ].join(' ')}
                      />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-gray-500 text-sm text-center py-4">本日の完了タスクはありません。</p>
      )}

      {/* 震えアニメーション（ON時）と点線スタイル */}
      <style jsx>{`
        @keyframes heartShake {
          0%   { transform: scale(1) rotate(0deg); }
          20%  { transform: scale(1.15) rotate(-12deg); }
          40%  { transform: scale(1.05) rotate(10deg); }
          60%  { transform: scale(1.12) rotate(-8deg); }
          80%  { transform: scale(1.04) rotate(6deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        :global(.heart-shake) {
          animation: heartShake 0.45s ease-in-out both;
          transform-origin: center;
          transform-box: fill-box;
        }
        :global(.heart-dashed path) {
          stroke-dasharray: 3 3;
        }
      `}</style>
    </div>
  );
}
