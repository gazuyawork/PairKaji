import { admin } from './firebaseAdmin';
import {
  PLAY_PRODUCT_ID,
  evaluateSubscriptionPurchase,
  fetchSubscriptionPurchase,
  hashPurchaseToken,
} from './androidPublisher';

export async function applyPlayEntitlement(params: {
  uid: string;
  purchaseToken: string;
  entitled: boolean;
  productId: string | null;
  expiryTime: string | null;
  subscriptionState: string | null;
}): Promise<{ entitled: boolean }> {
  const { uid, purchaseToken, entitled, productId, expiryTime, subscriptionState } = params;
  const db = admin.firestore();
  const tokenHash = hashPurchaseToken(purchaseToken);
  const lockRef = db.collection('playPurchaseLocks').doc(tokenHash);
  const userRef = db.collection('users').doc(uid);

  await db.runTransaction(async (tx) => {
    const lockSnap = await tx.get(lockRef);
    if (lockSnap.exists) {
      const ownerUid = String(lockSnap.data()?.uid ?? '');
      if (ownerUid && ownerUid !== uid) {
        throw new Error('PURCHASE_TOKEN_OWNED_BY_OTHER_USER');
      }
    } else {
      tx.set(lockRef, {
        uid,
        productId: productId ?? PLAY_PRODUCT_ID,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    if (entitled) {
      tx.set(
        userRef,
        {
          plan: 'premium',
          premiumType: 'google_play',
          subscriptionStatus: 'active',
          googlePlayProductId: productId ?? PLAY_PRODUCT_ID,
          googlePlayPurchaseToken: purchaseToken,
          googlePlayExpiryTime: expiryTime,
          googlePlaySubscriptionState: subscriptionState,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      tx.set(
        userRef,
        {
          plan: 'free',
          subscriptionStatus: 'inactive',
          googlePlayExpiryTime: expiryTime,
          googlePlaySubscriptionState: subscriptionState,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  });

  return { entitled };
}

export async function refreshStoredPlayEntitlement(
  uid: string,
  serviceAccountJson: string
): Promise<{ entitled: boolean }> {
  const userRef = admin.firestore().collection('users').doc(uid);
  const snap = await userRef.get();
  const token = String(snap.data()?.googlePlayPurchaseToken ?? '').trim();
  if (!token) {
    return { entitled: false };
  }

  const purchase = await fetchSubscriptionPurchase(serviceAccountJson, token);
  const entitlement = evaluateSubscriptionPurchase(purchase, PLAY_PRODUCT_ID);
  return applyPlayEntitlement({
    uid,
    purchaseToken: token,
    ...entitlement,
  });
}
