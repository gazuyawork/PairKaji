// src/app/pricing/page.tsx
'use client';

import Link from 'next/link';
import { CheckCircle } from 'lucide-react';
import Header from '@/components/common/Header';

export default function PricingPage() {
    return (
        <div className="min-h-screen bg-gray-50 py-10 px-4 bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] mt-12 overflow-y-auto">
            <Header title="Subscription" />

            <div className="mx-auto max-w-3xl text-center">
                <p className="text-gray-600 mb-5">
                    PairKajiをもっと便利に。あなたのライフスタイルに合わせた料金プランをご用意しました。
                </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3 max-w-5xl mx-auto">
                {/* Free プラン */}
                <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col">
                    <div className="flex items-center gap-3 mb-4">
                        <h2 className="text-xl font-semibold text-gray-800">Freeプラン</h2>
                        <p className="text-sm text-gray-500">0円 / 月</p>
                    </div>
                    <ul className="flex-1 space-y-2 text-sm text-gray-700 mb-6">
                        <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-500" /> 基本機能</li>
                        <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-500" /> 広告あり</li>
                    </ul>
                    <button disabled className="rounded-lg bg-gray-200 py-3 text-sm text-gray-500 cursor-not-allowed">
                        現在のプラン
                    </button>
                </div>

                {/* Lite プラン */}
                <div className="rounded-2xl border border-orange-300 bg-white p-6 shadow-md flex flex-col">
                    <div className="flex items-center gap-3 mb-4">
                        <h2 className="text-xl font-semibold text-gray-800">Liteプラン</h2>
                        <p className="text-sm text-gray-500">100円 / 月</p>
                    </div>
                    <ul className="flex-1 space-y-2 text-sm text-gray-700 mb-6">
                        <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-500" /> 基本機能</li>
                        <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-500" /> 広告なし</li>
                    </ul>
                    <Link
                        href="/subscribe/lite"
                        className="rounded-md bg-gradient-to-r from-[#fbbf24] to-[#f97316] px-6 py-3 text-sm font-medium tracking-wide text-white shadow-md transition duration-300 hover:from-[#facc15] hover:to-[#ea580c] hover:shadow-lg  text-center"
                    >
                        🌟 Liteに申し込む
                    </Link>
                </div>

                {/* Premium プラン */}
                <div className="rounded-2xl border border-indigo-300 bg-white p-6 shadow-md flex flex-col">
                    <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-xl font-semibold text-gray-800">Premiumプラン</h2>
                        <p className="text-sm text-gray-500">300円 / 月</p>
                    </div>

                    <p className="text-xs text-gray-500 mb-4">
                        ※ パートナーとご利用される場合でも、2人で 300円 / 月 でご利用いただけます。
                    </p>

                    <ul className="flex-1 space-y-2 text-sm text-gray-700 mb-2">
                        <li className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" /> 基本機能
                        </li>
                        <li className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" /> 広告なし
                        </li>
                        <li className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500 mt-1" />LINE通知機能
                        </li>
                    </ul>
                    <ul className="border border-gray-300 rounded-lg p-4 bg-yellow-50 space-y-2 ml-0 mb-6 text-sm ">
                        <li className="flex items-start gap-2">
                            <span className="shrink-0">①</span>
                            <span className="flex-1">
                                毎朝8時に当日のタスク一覧が通知されます。
                            </span>
                        </li>

                        <li className="flex items-start gap-2">
                            <span className="shrink-0">②</span>
                            <span className="flex-1">
                                当日のタスクで、時間指定がある場合は30分前に通知されます。
                            </span>
                        </li>

                        <li className="flex items-center gap-2 text-xs text-gray-600">
                            ※ ① の通知には頻度を毎日に設定しているのタスクは含まれません。
                        </li>
                    </ul>

                    <Link
                        href="/subscribe/premium"
                        className="rounded-md bg-gradient-to-r from-[#2c3e50] to-[#000000] px-6 py-3 text-sm font-semibold tracking-wide text-white shadow-lg transition duration-300 hover:from-[#3a506b] hover:to-[#1a1a1a] hover:shadow-xl text-center"
                    >
                        ✨ Premiumに申し込む
                    </Link>
                </div>
            </div>

            <div className="mt-6 text-center">
                <Link href="/" className="text-sm text-gray-600 hover:underline">
                    ← ホームに戻る
                </Link>
            </div>
        </div>
    );
}
