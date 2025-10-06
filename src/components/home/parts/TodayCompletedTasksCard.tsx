// src/components/home/parts/TodayCompletedTasksCard.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, SquareUser, Heart } from 'lucide-react';
import type { Task } from '@/types/Task';
import Image from 'next/image';
import { db, auth } from '@/lib/firebase';
import {
  doc, getDoc, collection, query, where, limit, getDocs,
  setDoc, updateDoc, onSnapshot, arrayUnion, arrayRemove, type DocumentData
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

/** taskLikes コレクション用の型 */
type TaskLikeDoc = {
  taskId?: string;
  date?: string;
  ownerId?: string | null;
  likedBy?: string[];
};

/** 型ガード・補助 */
function getStr(obj: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const v = obj?.[key];
  return typeof v === 'string' ? v : undefined;
}
function getBool(obj: Record<string, unknown> | null | undefined, key: string): boolean | undefined {
  const v = obj?.[key];
  return typeof v === 'boolean' ? v : undefined;
}
function getStrArray(obj: Record<string, unknown> | null | undefined, key: string): string[] | undefined {
  const v = obj?.[key];
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as string[];
  return undefined;
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

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

/** 完了者の userId を決定 */
function getCompletedUserId(task: Task | MaybeCompleted): string | null {
  const t = task as MaybeCompleted;
  const fromCompleted = t.completedBy ?? t.completedUserId ?? t.completedById ?? null;
  if (typeof fromCompleted === 'string' && fromCompleted.trim().length > 0) return fromCompleted;

  const arr = Array.isArray(t.users) ? t.users : [];
  const first = arr[0];
  return typeof first === 'string' && first.trim().length > 0 ? first : null;
}

/** プロフィール画像URL候補から最適なものを選択 */
function resolveUserImageSrc(profile: FirestoreDocData | null): string {
  const pick = (k: string): string | undefined => getStr(profile, k);
  const nestedProfile = isRecord(profile?.profile) ? (profile!.profile as Record<string, unknown>) : null;
  const pickNested = (k: string): string | undefined => getStr(nestedProfile, k);

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
    pickNested('imageUrl'),
    pickNested('photoURL'),
    pickNested('avatarUrl'),
  ].filter(Boolean) as string[];

  let src = candidates[0] ?? '';
  if (src && !/^https?:\/\//.test(src) && !src.startsWith('/')) {
    src = '';
  }
  return src;
}

function getDisplayName(data: FirestoreDocData | null): string {
  const dn = getStr(data ?? null, 'displayName');
  if (dn && dn.trim()) return dn;
  const name = getStr(data ?? null, 'name');
  if (name && name.trim()) return name;
  return '';
}

/** イニシャル文字（フォールバック） */
function initialOf(idOrName?: string | null): string {
  const s = String(idOrName ?? '').trim();
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

  // 当日のキーは「当日中は固定」
  const dateKey = useMemo(() => todayKey(), []);

  // パートナー設定の検出
  useEffect(() => {
    let cancelled = false;
    async function detectPair() {
      if (!currentUid) return;
      let confirmed = false;
      let partner: string | null = null;
      try {
        // 1) 直接ドキュメント
        const directSnap = await getDoc(doc(db, 'pairs', currentUid));
        if (directSnap.exists()) {
          const d = directSnap.data() as DocumentData;
          const status = getStr(d, 'status') ?? getStr(d, 'state') ?? getStr(d, 'pairStatus');
          const confirmedFlag = status === 'confirmed' || getBool(d, 'confirmed') === true;
          if (confirmedFlag) {
            confirmed = true;
            partner =
              getStr(d, 'partnerId') ??
              getStr(d, 'partnerUid') ??
              ((getStrArray(d, 'userIds') ?? []).find((x) => x !== currentUid) ?? null);
          }
        }
        // 2) userIds に自分が含まれるドキュメントを検索
        if (!confirmed) {
          const q = query(collection(db, 'pairs'), where('userIds', 'array-contains', currentUid), limit(5));
          const list = await getDocs(q);
          for (const s of list.docs) {
            const d = s.data() as DocumentData;
            const status = getStr(d, 'status') ?? getStr(d, 'state') ?? getStr(d, 'pairStatus');
            const confirmedFlag = status === 'confirmed' || getBool(d, 'confirmed') === true;
            if (confirmedFlag) {
              confirmed = true;
              partner =
                getStr(d, 'partnerId') ??
                getStr(d, 'partnerUid') ??
                ((getStrArray(d, 'userIds') ?? []).find((x) => x !== currentUid) ?? null);
              break;
            }
          }
        }
      } catch {
        // 失敗しても無視（UIは単に pairEnabled=false で進む）
      }
      if (!cancelled) {
        setPairEnabled(confirmed);
        setPartnerUid(partner ?? null);
      }
    }
    void detectPair();
    return () => { cancelled = true; };
  }, [currentUid]);

  // このカードで必要な UID を一意化
  const completedUids = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      const uid = getCompletedUserId(t);
      if (uid) set.add(uid);
    }
    return Array.from(set);
  }, [tasks]);

  // Firestore プロフィールを解決
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

          // users
          const snapUsers = await getDoc(doc(db, 'users', uid));
          data = snapUsers.exists() ? (snapUsers.data() as FirestoreDocData) : null;

          // profiles
          if (!data) {
            const snapProfiles = await getDoc(doc(db, 'profiles', uid));
            data = snapProfiles.exists() ? (snapProfiles.data() as FirestoreDocData) : null;
          }
          // app_users
          if (!data) {
            const snapAppUsers = await getDoc(doc(db, 'app_users', uid));
            data = snapAppUsers.exists() ? (snapAppUsers.data() as FirestoreDocData) : null;
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

    return () => { cancelled = true; };
  }, [completedUids, imgMap]);

  // いいね購読
  useEffect(() => {
    if (!pairEnabled) return;
    if (!tasks || tasks.length === 0) return;
    const unsubs: Array<() => void> = [];
    for (const t of tasks) {
      const id = t.id;
      if (!id) continue;
      const ref = doc(db, 'taskLikes', likeDocId(id, dateKey));
      const unsub = onSnapshot(ref, (snap) => {
        const data = snap.data() as TaskLikeDoc | undefined;
        const likedBy = Array.isArray(data?.likedBy) ? (data!.likedBy as string[]) : [];
        setLikesMap((prev) => ({ ...prev, [id]: likedBy }));
      });
      unsubs.push(unsub);
    }
    return () => { unsubs.forEach((f) => f()); };
  }, [pairEnabled, tasks, dateKey]);

  // ハートON/OFF切り替え
  const toggleLike = async (taskId?: string, ownerId?: string | null) => {
    if (!taskId || !pairEnabled || !currentUid) return;
    if (ownerId && currentUid === ownerId) return;

    try {
      const ref = doc(db, 'taskLikes', likeDocId(taskId, dateKey));
      const snap = await getDoc(ref);
      const exists = snap.exists();
      const current = (exists ? (snap.data() as TaskLikeDoc | undefined)?.likedBy : []) as string[] | undefined;
      const already = Array.isArray(current) ? current.includes(currentUid) : false;

      if (!exists) {
        const newDoc: TaskLikeDoc = { taskId, date: dateKey, ownerId: ownerId ?? null, likedBy: [currentUid] };
        await setDoc(ref, newDoc, { merge: true });
      } else if (already) {
        await updateDoc(ref, { likedBy: arrayRemove(currentUid) });
      } else {
        await updateDoc(ref, { likedBy: arrayUnion(currentUid) });
      }

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
    } catch (e) {
      // Firestore 権限やネットワーク失敗などのときに無音にならないようログ
      console.error('[toggleLike] failed:', e);
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
            const privateFlag = isTaskPrivate(task);

            const imgSrc = completedUserId ? imgMap[completedUserId] : '';
            const displayName = (completedUserId && nameMap[completedUserId]) || completedUserId || '';

            const isMine = completedUserId && currentUid ? completedUserId === currentUid : false;
            const showHeart = pairEnabled;
            const likedBy = likesMap[task.id] ?? [];

            // 誰が押したかで色を変える
            const heartOnByPartner = isMine && !!partnerUid ? likedBy.includes(partnerUid) : false;
            const heartOnByMe = !isMine && !!currentUid ? likedBy.includes(currentUid) : false;
            const heartOn = heartOnByPartner || heartOnByMe;
            const heartDisabled = !showHeart || isMine;

            return (
              <li key={task.id} className="py-2 flex items-center justify-between gap-2">
                <span className="text-gray-700 truncate">{task.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {privateFlag ? (
                    <div className="w-6 h-6 rounded-full text-gray-600 flex items-center justify-center">
                      <SquareUser className="w-6 h-6 text-green-600" />
                    </div>
                  ) : completedUserId ? (
                    imgSrc ? (
                      <div className="relative w-6 h-6 rounded-full overflow-hidden shrink-0">
                        <Image src={imgSrc} alt={displayName || 'user'} fill sizes="24px" className="object-cover" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gray-300 text-gray-700 text-xs flex items-center justify-center">
                        {initialOf(displayName)}
                      </div>
                    )
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-500 text-xs flex items-center justify-center">U</div>
                  )}

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
                    >
                      <Heart
                        className={[
                          'h-6 w-6',
                          heartOnByPartner
                            ? 'text-orange-400 fill-orange-400' // パートナーからのいいね → 淡いオレンジ
                            : heartOnByMe
                            ? 'text-rose-400 fill-rose-400'     // 自分が押した → 淡いピンク
                            : 'text-gray-300',
                          animatingIds.has(task.id) ? 'heart-shake' : '',
                          heartDisabled && !heartOn ? 'heart-dashed' : '',
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
