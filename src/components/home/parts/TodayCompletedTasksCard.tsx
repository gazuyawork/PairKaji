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

// 追加: タスクがプライベート完了かどうかを判定
function isTaskPrivate(task: Task): boolean {
  const anyTask = task as any;
  // よく使われがちな候補を網羅的にチェック（存在するものだけが true になる）
  return !!(
    anyTask?.isPrivate === true ||
    anyTask?.private === true ||
    anyTask?.privateMode === true ||
    anyTask?.privacy === 'private' ||
    anyTask?.mode === 'private'
  );
}


/** 補助: 完了者の userId を決定する
 * 優先度: completedBy → completedUserId → completedById → users[0]
 */
function getCompletedUserId(task: Task): string | null {
  const anyTask = task as any;
  const fromCompleted =
    anyTask?.completedBy ??
    anyTask?.completedUserId ??
    anyTask?.completedById ??
    null;

  if (typeof fromCompleted === 'string' && fromCompleted.trim().length > 0) {
    return fromCompleted;
  }
  if (Array.isArray(task.users) && task.users.length > 0) {
    const uid = task.users[0];
    if (typeof uid === 'string' && uid.trim().length > 0) return uid;
  }
  return null;
}

/** 補助: 画像URLの候補キーから最適なものを選ぶ */
function resolveUserImageSrc(profile: any): string {
  const candidates: Array<string | undefined> = [
    profile?.imageUrl,
    profile?.photoURL,
    profile?.photoUrl,
    profile?.profileImageUrl,
    profile?.avatarUrl,
    profile?.pictureUrl,
    profile?.pictureURL,
    profile?.photo_url,
    profile?.icon,
    profile?.avatar,
    profile?.picture,
    profile?.photo,
    profile?.profile?.imageUrl,
    profile?.profile?.photoURL,
    profile?.profile?.avatarUrl,
  ];

  let src = candidates.find((v) => typeof v === 'string' && v.trim().length > 0) || '';

  // HTTP(S)/絶対パス以外は表示しない（Storage パスなどは getDownloadURL 済み前提）
  if (src && !/^https?:\/\//.test(src) && !src.startsWith('/')) {
    src = '';
  }
  return src;
}

/** 補助: イニシャル文字 */
function initialOf(idOrName?: string | null): string {
  if (!idOrName) return 'U';
  const s = String(idOrName).trim();
  if (!s) return 'U';
  return s[0]!.toUpperCase();
}

type Props = {
  tasks: Task[];
};

export default function TodayCompletedTasksCard({ tasks }: Props) {
  // 画像/名前のキャッシュ
  const [imgMap, setImgMap] = useState<Record<string, string>>({});
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const pendingRef = useRef<Set<string>>(new Set()); // 多重取得防止

  // このカードで必要となる UID を一意化
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
        if (imgMap[uid]) continue; // 既に取得済み
        if (pendingRef.current.has(uid)) continue; // 取得中

        pendingRef.current.add(uid);
        try {
          // コレクション候補を順に探索（プロジェクト実装に合わせて調整可）
          // 1) users/{uid}
          let snap = await getDoc(doc(db, 'users', uid));
          let data: any | null = snap.exists() ? snap.data() : null;

          // 2) profiles/{uid}
          if (!data) {
            snap = await getDoc(doc(db, 'profiles', uid));
            data = snap.exists() ? snap.data() : null;
          }

          // 3) app_users/{uid}（必要なら追加）
          if (!data) {
            snap = await getDoc(doc(db, 'app_users', uid));
            data = snap.exists() ? snap.data() : null;
          }

          const img = resolveUserImageSrc(data);
          const displayName: string =
            typeof data?.displayName === 'string' && data.displayName.trim()
              ? data.displayName
              : typeof data?.name === 'string' && data.name.trim()
                ? data.name
                : '';

          if (!cancelled) {
            setImgMap((prev) => (img ? { ...prev, [uid]: img } : prev));
            if (displayName) {
              setNameMap((prev) => ({ ...prev, [uid]: displayName }));
            }
          }
        } catch {
          // 取得失敗時は何もしない（フォールバックでイニシャルを表示）
          // console.warn('[TodayCompletedTasksCard] profile fetch error', uid, e);
        } finally {
          pendingRef.current.delete(uid);
        }
      }
    }

    const targets = completedUids.filter((uid) => uid && !imgMap[uid] && !pendingRef.current.has(uid));
    if (targets.length > 0) fetchProfiles(targets);

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
            const timeLabel = task.completedAt
              ? format(
                typeof task.completedAt === 'string'
                  ? new Date(task.completedAt)
                  : (task.completedAt as any)?.toDate
                    ? (task.completedAt as any).toDate()
                    : new Date(task.completedAt as any),
                'HH:mm'
              )
              : '';

            // 追加: プライベート判定
            const isPrivate = isTaskPrivate(task);

            const imgSrc = completedUserId ? imgMap[completedUserId] : '';
            const displayName =
              (completedUserId && nameMap[completedUserId]) || completedUserId || '';

            return (
              <li key={task.id} className="py-2 flex items-center justify-between gap-2">
                {/* 左：タスク名 */}
                <span className="text-gray-700 truncate">{task.name}</span>

                {/* 右：時刻 + 完了者表記（プライベート時は鍵アイコン） */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm text-gray-400">{timeLabel}</span>

                  {isPrivate ? (
                    // 追加: プライベートアイコン（鍵）を表示
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
                          onError={(e) => {
                            const t = e?.currentTarget as HTMLImageElement | undefined;
                            console.warn('[TodayCompletedTasksCard] icon load error (keeping last good)', {
                              completedUserId,
                              imgSrc,
                              naturalWidth: t?.naturalWidth,
                              naturalHeight: t?.naturalHeight,
                            });
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
