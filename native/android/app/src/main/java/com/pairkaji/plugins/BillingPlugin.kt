package com.pairkaji.app.plugins

import android.app.Activity
import android.util.Log
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.android.billingclient.api.*

@CapacitorPlugin(name = "Billing")
class BillingPlugin : Plugin(), PurchasesUpdatedListener {

    private lateinit var billingClient: BillingClient
    private var ready: Boolean = false
    private var savedCall: PluginCall? = null
    private val TAG = "BillingPlugin"

    override fun load() {
        billingClient = BillingClient.newBuilder(context)
            .enablePendingPurchases()
            .setListener(this)
            .build()

        billingClient.startConnection(object: BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                ready = (result.responseCode == BillingClient.BillingResponseCode.OK)
                Log.d(TAG, "Billing setup finished: ${result.responseCode}")
            }
            override fun onBillingServiceDisconnected() {
                ready = false
                Log.w(TAG, "Billing service disconnected")
            }
        })
    }

    // JS: Billing.purchase({ productId, productType })
    @PluginMethod
    fun purchase(call: PluginCall) {
        val productId = call.getString("productId")
        val productType = call.getString("productType") ?: BillingClient.ProductType.SUBS // "inapp" or "subs"
        if (!ready) { call.reject("BillingClient not ready"); return }
        if (productId.isNullOrBlank()) { call.reject("productId required"); return }

        savedCall = call
        bridge.saveCall(call)

        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(listOf(
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(productId)
                    .setProductType(productType)
                    .build()
            ))
            .build()

        billingClient.queryProductDetailsAsync(params) { result, detailsList ->
            if (result.responseCode != BillingClient.BillingResponseCode.OK || detailsList.isEmpty()) {
                resolveAndRelease(error = "Product not found or query failed: ${result.responseCode}")
                return@queryProductDetailsAsync
            }

            val productDetails = detailsList.first()

            val offerToken = when {
                productType == BillingClient.ProductType.SUBS ->
                    productDetails.subscriptionOfferDetails?.firstOrNull()?.offerToken
                else -> null
            }

            val productParams = BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(productDetails)
                .apply { if (offerToken != null) setOfferToken(offerToken) }
                .build()

            val flowParams = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(listOf(productParams))
                .build()

            val activity: Activity = bridge.activity
            val res = billingClient.launchBillingFlow(activity, flowParams)
            if (res.responseCode != BillingClient.BillingResponseCode.OK &&
                res.responseCode != BillingClient.BillingResponseCode.USER_CANCELED) {
                resolveAndRelease(error = "launchBillingFlow failed: ${res.responseCode}")
            } else {
                // 実際の購入結果は onPurchasesUpdated で受け取る
                // ここでは「開始した」ことだけ返しておく
                savedCall?.resolve(JSObject().put("status", "started"))
            }
        }
    }

    // JS: Billing.restore()
    @PluginMethod
    fun restore(call: PluginCall) {
        if (!ready) { call.reject("BillingClient not ready"); return }
        billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.SUBS)
                .build()
        ) { result, purchasesList ->
            val obj = JSObject()
            obj.put("restored", result.responseCode == BillingClient.BillingResponseCode.OK)
            obj.put("count", purchasesList?.size ?: 0)
            call.resolve(obj)
        }
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        if (result.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (purchase in purchases) {
                // 消費型でなければ acknowledge するのが推奨
                if (!purchase.isAcknowledged) {
                    billingClient.acknowledgePurchase(
                        AcknowledgePurchaseParams.newBuilder()
                            .setPurchaseToken(purchase.purchaseToken)
                            .build()
                    ) { ackResult ->
                        Log.d(TAG, "acknowledge: ${ackResult.responseCode}")
                    }
                }
                // JS へイベント送出（purchaseToken を渡す）
                val payload = JSObject()
                payload.put("purchaseToken", purchase.purchaseToken)
                payload.put("orderId", purchase.orderId)
                payload.put("packageName", purchase.packageName)
                notifyListeners("purchaseCompleted", payload)
            }
        } else if (result.responseCode == BillingClient.BillingResponseCode.USER_CANCELED) {
            notifyListeners("purchaseCanceled", JSObject())
        } else {
            notifyListeners("purchaseFailed", JSObject().put("code", result.responseCode))
        }
        resolveAndRelease()
    }

    private fun resolveAndRelease(error: String? = null) {
        savedCall?.let { call ->
            if (error != null) call.reject(error) else call.resolve(JSObject().put("status", "done"))
            bridge.releaseCall(call)
            savedCall = null
        }
    }
}
