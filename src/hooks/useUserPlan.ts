import { useAuth } from '@/context/AuthContext';

export function formatPlayExpiry(expiryTime: string | null | undefined): string | null {
  if (!expiryTime) return null;
  const ms = Date.parse(expiryTime);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}

/**
 * Firestore の plan。未ログイン / 未設定は free。
 * 購読は AuthProvider が1本だけ持つ。
 */
export function useUserPlan(): {
  plan: string | undefined;
  isChecking: boolean;
  isCancelPending: boolean;
  expiryLabel: string | null;
} {
  const { plan, isCheckingPlan, loading, playSubscriptionState, playExpiryTime, subscriptionStatus } = useAuth();
  const isCancelPending =
    plan === 'premium' &&
    (playSubscriptionState === 'SUBSCRIPTION_STATE_CANCELED' || subscriptionStatus === 'canceled');
  return {
    plan,
    isChecking: loading || isCheckingPlan,
    isCancelPending,
    expiryLabel: formatPlayExpiry(playExpiryTime),
  };
}
