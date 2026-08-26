/**
 * Google Play 定期購入のサーバー検証。
 *
 * 事前準備:
 *  firebase functions:secrets:set PLAY_DEVELOPER_SERVICE_ACCOUNT
 *  （Play Console にリンクしたサービスアカウント JSON を貼る）
 *
 * plan は Admin SDK からのみ更新する（クライアント書き込み禁止）。
 */
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import {
  PLAY_PRODUCT_ID,
  evaluateSubscriptionPurchase,
  fetchSubscriptionPurchase,
} from './lib/androidPublisher';
import { applyPlayEntitlement, refreshStoredPlayEntitlement } from './lib/playEntitlement';

export const PLAY_DEVELOPER_SERVICE_ACCOUNT = defineSecret('PLAY_DEVELOPER_SERVICE_ACCOUNT');

type VerifyPayload = {
  purchaseToken?: string;
  productId?: string;
};

export const verifyPlayPurchase = onCall(
  {
    secrets: [PLAY_DEVELOPER_SERVICE_ACCOUNT],
    cors: true,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'ログインが必要です');
    }

    const data = (request.data ?? {}) as VerifyPayload;
    const purchaseToken = String(data.purchaseToken ?? '').trim();
    const productId = String(data.productId ?? PLAY_PRODUCT_ID).trim() || PLAY_PRODUCT_ID;

    if (!purchaseToken) {
      throw new HttpsError('invalid-argument', 'purchaseToken がありません');
    }
    if (productId !== PLAY_PRODUCT_ID) {
      throw new HttpsError('invalid-argument', '未対応の商品です');
    }

    const secret = PLAY_DEVELOPER_SERVICE_ACCOUNT.value();
    if (!secret) {
      throw new HttpsError(
        'failed-precondition',
        'Play Developer API のサービスアカウントが未設定です'
      );
    }

    try {
      const purchase = await fetchSubscriptionPurchase(secret, purchaseToken);
      const entitlement = evaluateSubscriptionPurchase(purchase, productId);
      return await applyPlayEntitlement({
        uid: request.auth.uid,
        purchaseToken,
        ...entitlement,
      });
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      if (e instanceof Error && e.message === 'PURCHASE_TOKEN_OWNED_BY_OTHER_USER') {
        throw new HttpsError('already-exists', 'この購入は別アカウントに紐づいています');
      }
      console.error('[verifyPlayPurchase]', e);
      throw new HttpsError('internal', '購入情報の検証に失敗しました');
    }
  }
);

export const refreshPlaySubscription = onCall(
  {
    secrets: [PLAY_DEVELOPER_SERVICE_ACCOUNT],
    cors: true,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'ログインが必要です');
    }
    try {
      return await refreshStoredPlayEntitlement(
        request.auth.uid,
        PLAY_DEVELOPER_SERVICE_ACCOUNT.value()
      );
    } catch (e) {
      console.error('[refreshPlaySubscription]', e);
      throw new HttpsError('internal', '購読状態の再確認に失敗しました');
    }
  }
);
