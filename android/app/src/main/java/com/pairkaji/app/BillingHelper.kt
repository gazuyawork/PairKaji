package com.pairkaji.app

import android.app.Activity
import android.util.Log
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.ProductDetails

/**
 * Google Play Billing v7 を使って
 * 購入フローを開始するためのヘルパークラス
 */
class BillingHelper(
    private val activity: Activity,
    private val onCompleted: (purchaseToken: String, orderId: String?) -> Unit,
    private val onFailed: (BillingResult) -> Unit,
    private val onCanceled: () -> Unit
) : PurchasesUpdatedListener {

    private val tag = "BillingHelper"

    private val billingClient: BillingClient =
        BillingClient.newBuilder(activity)
            .setListener(this)              // 購入結果のコールバックを受け取る
            .enablePendingPurchases()       // 必須
            .build()

    /**
     * BillingClient への接続を開始
     */
    fun startConnection(onConnected: () -> Unit) {
        if (billingClient.isReady) {
            onConnected()
            return
        }

        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(billingResult: BillingResult) {
                if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                    Log.d(tag, "Billing setup finished")
                    onConnected()
                } else {
                    Log.e(tag, "Billing setup failed: ${billingResult.debugMessage}")
                    onFailed(billingResult)
                }
            }

            override fun onBillingServiceDisconnected() {
                Log.w(tag, "Billing service disconnected")
                // 必要なら再接続処理などを入れる
            }
        })
    }

    /**
     * サブスクリプション購入フローを開始
     */
    fun launchSubscription(productId: String) {
        launchPurchase(productId, BillingClient.ProductType.SUBS)
    }

    /**
     * 単発課金購入フローを開始
     */
    fun launchInApp(productId: String) {
        launchPurchase(productId, BillingClient.ProductType.INAPP)
    }

    /**
     * 共通の購入処理
     */
    private fun launchPurchase(
        productId: String,
        @BillingClient.ProductType productType: String
    ) {
        if (!billingClient.isReady) {
            startConnection {
                launchPurchase(productId, productType)
            }
            return
        }

        val queryProductDetailsParams =
            QueryProductDetailsParams.newBuilder()
                .setProductList(
                    listOf(
                        QueryProductDetailsParams.Product.newBuilder()
                            .setProductId(productId)
                            .setProductType(productType)
                            .build()
                )
            ).build()

        billingClient.queryProductDetailsAsync(
            queryProductDetailsParams
        ) { billingResult: BillingResult, productDetailsList: MutableList<ProductDetails> ->
            if (billingResult.responseCode != BillingClient.BillingResponseCode.OK) {
                Log.e(tag, "queryProductDetailsAsync failed: ${billingResult.debugMessage}")
                onFailed(billingResult)
                return@queryProductDetailsAsync
            }

            val productDetails = productDetailsList.firstOrNull()
            if (productDetails == null) {
                Log.e(tag, "No ProductDetails found for $productId")
                return@queryProductDetailsAsync
            }

            // サブスクの場合のみ offerToken を利用
            val offerToken =
                if (productType == BillingClient.ProductType.SUBS) {
                    productDetails.subscriptionOfferDetails
                        ?.firstOrNull()
                        ?.offerToken
                } else {
                    null
                }

            val productDetailsParamsBuilder =
                BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(productDetails)

            if (offerToken != null) {
                productDetailsParamsBuilder.setOfferToken(offerToken)
            }

            val billingFlowParams =
                BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(listOf(productDetailsParamsBuilder.build()))
                    .build()

            val result = billingClient.launchBillingFlow(activity, billingFlowParams)
            Log.d(tag, "launchBillingFlow result: ${result.responseCode}")
        }
    }

    /**
     * 購入結果のコールバック
     */
    override fun onPurchasesUpdated(
        billingResult: BillingResult,
        purchases: MutableList<Purchase>?
    ) {
        when (billingResult.responseCode) {
            BillingClient.BillingResponseCode.OK -> {
                if (purchases != null) {
                    for (purchase in purchases) {
                        Log.d(tag, "Purchase success: ${purchase.orderId}")
                        // JS 側へ渡す情報
                        onCompleted(purchase.purchaseToken, purchase.orderId)
                    }
                }
            }

            BillingClient.BillingResponseCode.USER_CANCELED -> {
                Log.d(tag, "Purchase canceled by user")
                onCanceled()
            }

            else -> {
                Log.e(
                    tag,
                    "Purchase failed: ${billingResult.responseCode}, ${billingResult.debugMessage}"
                )
                onFailed(billingResult)
            }
        }
    }
}
