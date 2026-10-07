'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { mapFirestoreDocToTask } from '@/lib/taskMappers';
import { resolveProfileImageUrl } from '@/lib/imageUtils';
import { applyLocalDayReset } from '@/lib/taskDayReset';
import { scrubRetiredTaskData } from '@/lib/scrubRetiredCategories';
import { repairSharedTaskViewerIds } from '@/lib/taskUtils';
import type { FirestoreTask, Task } from '@/types/Task';

const DEFAULT_PROFILE_IMAGE = '/images/default.png';

export type HouseholdTask = Task & {
  order?: number;
  categoryName?: string | null;
  categoryLabel?: string | null;
  categoryId?: string | null;
  type?: string | null;
  skipped?: boolean;
  updatedAt?: unknown;
};

export type PairRecord = {
  id: string;
  status?: string;
  userIds: string[];
  userAId?: string;
  userBId?: string;
  inviteCode?: string;
  emailB?: string;
};

type HouseholdContextValue = {
  uid: string | null;
  tasks: HouseholdTask[];
  pairs: PairRecord[];
  householdUids: string[];
  partnerId: string | null;
  hasPairConfirmed: boolean;
  hasSentInvite: boolean;
  hasIncomingInvite: boolean;
  outgoingInviteCode: string | null;
  incomingInvite: { pairId: string; inviterUid: string; emailB: string; inviteCode: string } | null;
  pairsReady: boolean;
  tasksReady: boolean;
  partnerImage: string;
};

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

function mapPair(d: QueryDocumentSnapshot<DocumentData>): PairRecord {
  const data = d.data() as Record<string, unknown>;
  const userIds = Array.isArray(data.userIds)
    ? data.userIds.filter((x): x is string => typeof x === 'string')
    : [];
  return {
    id: d.id,
    status: typeof data.status === 'string' ? data.status : undefined,
    userIds,
    userAId: typeof data.userAId === 'string' ? data.userAId : undefined,
    userBId: typeof data.userBId === 'string' ? data.userBId : undefined,
    inviteCode: typeof data.inviteCode === 'string' ? data.inviteCode : undefined,
    emailB: typeof data.emailB === 'string' ? data.emailB : undefined,
  };
}

function snapshotUpdatedMs(d: QueryDocumentSnapshot<DocumentData>): number {
  const withTime = d as QueryDocumentSnapshot<DocumentData> & {
    updateTime?: { toMillis?: () => number };
  };
  try {
    const fromSnap = withTime.updateTime?.toMillis?.();
    if (typeof fromSnap === 'number') return fromSnap;
  } catch {
    /* 時刻が取れないスナップショットは 0 */
  }
  const raw = (d.data() as { updatedAt?: unknown }).updatedAt;
  if (raw && typeof raw === 'object' && typeof (raw as { toMillis?: unknown }).toMillis === 'function') {
    try {
      return (raw as { toMillis: () => number }).toMillis();
    } catch {
      return 0;
    }
  }
  return 0;
}

function mapHouseholdTask(d: QueryDocumentSnapshot<DocumentData>): HouseholdTask {
  const base = mapFirestoreDocToTask(d as QueryDocumentSnapshot<FirestoreTask>);
  const data = d.data() as Record<string, unknown>;
  return {
    ...base,
    order: typeof data.order === 'number' ? data.order : undefined,
    categoryName: typeof data.categoryName === 'string' ? data.categoryName : null,
    categoryLabel: typeof data.categoryLabel === 'string' ? data.categoryLabel : null,
    categoryId: typeof data.categoryId === 'string' ? data.categoryId : null,
    type: typeof data.type === 'string' ? data.type : null,
    skipped: data.skipped === true,
    updatedAt: data.updatedAt,
  };
}

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const uid = user?.uid ?? null;
  const email = user?.email ?? null;

  const [pairs, setPairs] = useState<PairRecord[]>([]);
  const [hasIncomingInvite, setHasIncomingInvite] = useState(false);
  const [incomingInvite, setIncomingInvite] = useState<
    HouseholdContextValue['incomingInvite']
  >(null);
  const [tasks, setTasks] = useState<HouseholdTask[]>([]);
  const [pairsReady, setPairsReady] = useState(false);
  const [tasksReady, setTasksReady] = useState(false);
  const [partnerImage, setPartnerImage] = useState(DEFAULT_PROFILE_IMAGE);

  useEffect(() => {
    if (authLoading) {
      setPairsReady(false);
      return;
    }
    if (!uid) {
      setPairs([]);
      setPairsReady(true);
      return;
    }

    setPairsReady(false);
    const qPairs = query(collection(db, 'pairs'), where('userIds', 'array-contains', uid));
    const unsub = onSnapshot(
      qPairs,
      (snap) => {
        setPairs(snap.docs.map(mapPair));
        setPairsReady(true);
      },
      (err) => {
        console.warn('[Household] pairs onSnapshot error:', err);
        setPairs([]);
        setPairsReady(true);
      }
    );
    return () => unsub();
  }, [uid, authLoading]);

  useEffect(() => {
    if (!email) {
      setHasIncomingInvite(false);
      setIncomingInvite(null);
      return;
    }

    const qIncoming = query(collection(db, 'pairs'), where('emailB', '==', email));
    const unsub = onSnapshot(
      qIncoming,
      (snap) => {
        const pending = snap.docs.find((d) => {
          const data = d.data() as Record<string, unknown>;
          return data.status === 'pending';
        });
        if (!pending) {
          setHasIncomingInvite(false);
          setIncomingInvite(null);
          return;
        }
        const data = pending.data() as Record<string, unknown>;
        setHasIncomingInvite(true);
        setIncomingInvite({
          pairId: pending.id,
          inviterUid: typeof data.userAId === 'string' ? data.userAId : '',
          emailB: typeof data.emailB === 'string' ? data.emailB : email,
          inviteCode: typeof data.inviteCode === 'string' ? data.inviteCode : '',
        });
      },
      (err) => {
        console.warn('[Household] incoming pairs onSnapshot error:', err);
        setHasIncomingInvite(false);
        setIncomingInvite(null);
      }
    );
    return () => unsub();
  }, [email]);

  const { hasPairConfirmed, hasSentInvite, outgoingInviteCode, partnerId, householdUids } = useMemo(() => {
    if (!uid) {
      return {
        hasPairConfirmed: false,
        hasSentInvite: false,
        outgoingInviteCode: null as string | null,
        partnerId: null as string | null,
        householdUids: [] as string[],
      };
    }

    const confirmed = pairs.find((p) => p.status === 'confirmed');
    const ids = new Set<string>([uid]);
    if (confirmed) {
      confirmed.userIds.forEach((id) => ids.add(id));
    }

    let other: string | null = null;
    if (confirmed) {
      other = confirmed.userIds.find((id) => id !== uid) ?? null;
      if (!other) {
        const a = confirmed.userAId;
        const b = confirmed.userBId;
        other = a && a !== uid ? a : b && b !== uid ? b : null;
      }
    }

    const outgoing = pairs.find((p) => p.userAId === uid && p.status === 'pending');
    return {
      hasPairConfirmed: Boolean(confirmed),
      hasSentInvite: Boolean(outgoing),
      outgoingInviteCode: outgoing?.inviteCode ?? null,
      partnerId: other,
      householdUids: Array.from(ids).slice(0, 10),
    };
  }, [pairs, uid]);

  useEffect(() => {
    if (!uid || !partnerId) return;
    void repairSharedTaskViewerIds(uid, householdUids).catch((err) => {
      console.warn('[Household] shared task viewers repair failed:', err);
    });
  }, [uid, partnerId, householdUids]);

  useEffect(() => {
    if (authLoading) {
      setTasksReady(false);
      return;
    }
    if (!uid) {
      setTasks([]);
      setTasksReady(true);
      return;
    }

    setTasksReady(false);
    const mapA = new Map<string, { task: HouseholdTask; updatedMs: number }>();
    const mapB = new Map<string, { task: HouseholdTask; updatedMs: number }>();
    let gotA = false;
    let gotB = false;

    const publish = () => {
      try {
        const merged = new Map(mapA);
        mapB.forEach((entry, id) => {
          const prev = merged.get(id);
          if (!prev || entry.updatedMs >= prev.updatedMs) merged.set(id, entry);
        });
        setTasks(Array.from(merged.values()).map((entry) => applyLocalDayReset(entry.task)));
        if (gotA && gotB) setTasksReady(true);
      } catch (err) {
        console.warn('[Household] tasks publish failed:', err);
      }
    };

    const unsubA = onSnapshot(
      query(collection(db, 'tasks'), where('userIds', 'array-contains', uid)),
      (snap) => {
        mapA.clear();
        snap.docs.forEach((d) => {
          try {
            scrubRetiredTaskData(d.id, d.data() as Record<string, unknown>);
            mapA.set(d.id, { task: mapHouseholdTask(d), updatedMs: snapshotUpdatedMs(d) });
          } catch (err) {
            console.warn('[Household] tasks(userIds) map failed:', d.id, err);
          }
        });
        gotA = true;
        publish();
      },
      (err) => {
        console.warn('[Household] tasks(userIds) onSnapshot error:', err);
        gotA = true;
        publish();
      }
    );
    const unsubB = onSnapshot(
      query(collection(db, 'tasks'), where('userId', '==', uid)),
      (snap) => {
        mapB.clear();
        snap.docs.forEach((d) => {
          try {
            scrubRetiredTaskData(d.id, d.data() as Record<string, unknown>);
            mapB.set(d.id, { task: mapHouseholdTask(d), updatedMs: snapshotUpdatedMs(d) });
          } catch (err) {
            console.warn('[Household] tasks(userId) map failed:', d.id, err);
          }
        });
        gotB = true;
        publish();
      },
      (err) => {
        console.warn('[Household] tasks(userId) onSnapshot error:', err);
        gotB = true;
        publish();
      }
    );

    return () => {
      unsubA();
      unsubB();
    };
  }, [uid, authLoading]);

  useEffect(() => {
    if (!partnerId) {
      setPartnerImage(DEFAULT_PROFILE_IMAGE);
      try {
        localStorage.removeItem('partnerImage');
      } catch {
        /* ignore */
      }
      return;
    }
    let cancelled = false;
    const unsub = onSnapshot(doc(db, 'users', partnerId), async (snap) => {
      const url = await resolveProfileImageUrl(
        typeof snap.data()?.imageUrl === 'string' ? snap.data()?.imageUrl : ''
      );
      if (!cancelled) {
        setPartnerImage(url);
        try {
          localStorage.setItem('partnerImage', url);
        } catch {
          /* ignore */
        }
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [partnerId]);

  const value = useMemo<HouseholdContextValue>(
    () => ({
      uid,
      tasks,
      pairs,
      householdUids,
      partnerId,
      hasPairConfirmed,
      hasSentInvite,
      hasIncomingInvite,
      outgoingInviteCode,
      incomingInvite,
      pairsReady,
      tasksReady,
      partnerImage,
    }),
    [
      uid,
      tasks,
      pairs,
      householdUids,
      partnerId,
      hasPairConfirmed,
      hasSentInvite,
      hasIncomingInvite,
      outgoingInviteCode,
      incomingInvite,
      pairsReady,
      tasksReady,
      partnerImage,
    ]
  );

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdContextValue {
  const ctx = useContext(HouseholdContext);
  if (!ctx) {
    throw new Error('useHousehold must be used within HouseholdProvider');
  }
  return ctx;
}
