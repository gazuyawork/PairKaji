package com.pairkaji.app

import android.util.Log
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingResult
import com.getcapacitor.CapacitorPlugin
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod

/**
 * Web(React) 側から呼び出すための Capacitor プラグイン
 *
 * JS 側からは window.Capacitor.Plugins.Billing.purchase(...)
 * および addListener('purchaseCompleted' など) で利用される前提。
 */
@CapacitorPlugin(name = "Billing")
class BillingPlugin : Plugin() {

    private var helper: BillingHelper? = null

    override fun load() {
        super.load()

        helper = BillingHelper(
            activity,
            onCompleted = { purchaseToken, orderId ->
                // 購入成功イベントを JS 側へ通知
                val data = JSObject()
                data.put("purchaseToken", purchaseToken)
                if (orderId != null) {
                    data.put("orderId", orderId)
                }
                notifyListeners("purchaseCompleted", data)
            },
            onFailed = { result: BillingResult ->
                // 購入失敗イベントを JS 側へ通知
                val data = JSObject()
                data.put("code", result.responseCode)
                notifyListeners("purchaseFailed", data)
            },
            onCanceled = {
                // ユーザーキャンセル
                notifyListeners("purchaseCanceled", JSObject())
            }
        )
    }

    /**
     * JS 側の Billing.purchase({ productId, productType }) に対応
     */
    @PluginMethod
    fun purchase(call: PluginCall) {
        val productId = call.getString("productId")
        val productType = call.getString("productType") ?: "subs"

        if (productId.isNullOrBlank()) {
            call.reject("productId is required")
            return
        }

        val instance = helper
        if (instance == null) {
            call.reject("BillingHelper not initialized")
            return
        }

        activity.runOnUiThread {
            try {
                if (productType == "inapp") {
                    instance.launchInApp(productId)
                } else {
                    // デフォルトはサブスクリプション
                    instance.launchSubscription(productId)
                }
                call.resolve()
            } catch (e: Exception) {
                Log.e("BillingPlugin", "Error in purchase", e)
                call.reject("Purchase failed: ${e.message}")
            }
        }
    }
}
