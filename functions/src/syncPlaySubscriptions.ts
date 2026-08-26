import { onSchedule } from 'firebase-functions/v2/scheduler';
import { PLAY_DEVELOPER_SERVICE_ACCOUNT } from './verifyPlayPurchase';
import { admin } from './lib/firebaseAdmin';
import { refreshStoredPlayEntitlement } from './lib/playEntitlement';

/** 解約後も期限内は Premium、期限切れで Free に戻す */
export const syncPlaySubscriptionsDaily = onSchedule(
  {
    schedule: '20 4 * * *',
    timeZone: 'Asia/Tokyo',
    secrets: [PLAY_DEVELOPER_SERVICE_ACCOUNT],
    retryCount: 0,
  },
  async () => {
    const secret = PLAY_DEVELOPER_SERVICE_ACCOUNT.value();
    if (!secret) {
      console.error('[syncPlaySubscriptionsDaily] secret missing');
      return;
    }

    const db = admin.firestore();
    const snap = await db.collection('users').where('premiumType', '==', 'google_play').get();

    let ok = 0;
    let failed = 0;
    for (const doc of snap.docs) {
      const token = String(doc.data()?.googlePlayPurchaseToken ?? '').trim();
      if (!token) continue;
      try {
        await refreshStoredPlayEntitlement(doc.id, secret);
        ok += 1;
      } catch (e) {
        failed += 1;
        console.error('[syncPlaySubscriptionsDaily]', doc.id, e);
      }
    }
    console.log('[syncPlaySubscriptionsDaily] ok=', ok, 'failed=', failed, 'scanned=', snap.size);
  }
);
