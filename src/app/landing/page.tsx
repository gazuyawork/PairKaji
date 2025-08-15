'use client';

import Link from 'next/link';
import Image from 'next/image';
import AdsenseAd from '@/components/ads/AdsenseAd';
import { Pacifico } from 'next/font/google';
import LandingAnimations from './LandingAnimations';
import './landing.css';
import { useState } from 'react';
import { Crown, User, Users, ListChecks, Zap, Clock, Share2, History } from 'lucide-react';
import StickyCTA from '@/components/common/StickyCTA';

const pacifico = Pacifico({ subsets: ['latin'], weight: '400' });

export default function LandingPage() {
  const logo = 'PairKaji'.split('');
  const [featExpanded, setFeatExpanded] = useState(false);

  /** 表示する機能一覧（アイコン付き） */
  const features = [
    { title: 'プレミアムで快適に', desc: 'LINE通知／広告非表示。集中できる管理体験。', icon: Crown, badge: 'Premium' },
    { title: 'ひとりでも使える', desc: '個人管理からスタート。後からペア追加もOK。', icon: User },
    { title: 'タスクを共同管理', desc: '誰が・いつ・何をやるか共有して見落としゼロ。', icon: Users },
    { title: 'TODOもサクッと', desc: '買い物リストやメモもひとまとめに。', icon: ListChecks },
    { title: 'ポイントで見える化', desc: 'がんばりをポイント化。あとから公平に振り返り。', icon: Zap },
    { title: 'リアルタイム同期', desc: '変更は即時反映。ふたりの画面がズレない。', icon: Clock },
    { title: 'ペア設定＆共有', desc: '招待コードで承認。タスク/ポイントを相互編集。', icon: Share2 },
    { title: 'ポイント履歴', desc: '週次で推移を可視化。モチベ維持に最適。', icon: History },
  ] as const;

  const INITIAL = 4;
  const visibleFeatures = featExpanded ? features : features.slice(0, INITIAL);

  return (
    // main には地の色を指定せず、各セクションで交互配色
    <main>
      {/* ① Header（現在色 #FFF7EE） */}
      <section className="relative overflow-hidden bg-[#FFF7EE]" data-animate="reveal-up">
        {/* 飾り玉（背景の淡い光） */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-amber-200/40 blur-3xl" />

        {/* ▼ 追加：薄いウォーターマーク（アイコン） */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.06]">
          <div className="relative w-[520px] max-w-[75vw] aspect-square -z-10">
            <Image
              src="/images/default.png"
              alt=""
              fill
              className="object-contain"
              priority={false}
            />
          </div>
        </div>

        <header className="text-center py-20 select-none relative">
          <h1
            className={`${pacifico.className} text-[56px] md:text-[84px] leading-[0.9] tracking-tight text-[#555] inline-block mt-5 tracking-wide`}
            aria-label="PairKaji"
          >
            {logo.map((ch, i) => (
              <span
                key={`${ch}-${i}`}
                className="logo-bounce inline-block will-change-transform"
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                {ch}
              </span>
            ))}
          </h1>
          <p className="fade-in-delay text-[16px] md:text-base text-gray-700 mt-6 md:mt-8">
            家事を<span className="text-blue-600">ふたりで</span>、わかちあう。
          </p>
        </header>
      </section>

      {/* ② Hero（生成り #FFFBF2） */}
      <section className="relative overflow-hidden bg-[#FFFBF2]" data-animate="reveal-up">
        {/* うっすらグリッド */}
        <div className="absolute inset-0 bg-grid-soft opacity-40" />
        {/* 飾り玉 */}
        <div className="pointer-events-none absolute -top-24 right-10 h-52 w-52 rounded-full bg-blue-200/40 blur-3xl" />

        <div className="relative mx-auto max-w-5xl px-4 pt-14 pb-12 text-center">
          <h2 className="text-wave text-[24px] md:text-[40px] font-bold tracking-[-0.01em] leading-tight">
            <span className={`${pacifico.className} tracking-wider`}>PairKaji</span> とは？
          </h2>
          <p className="text-gray-600 text-[15px] md:text-[17px] leading-relaxed max-w-2xl mx-auto mt-4">
            PairKajiは、ふたりの家事を「見える化」して、気持ちよく分担できるようにするアプリ。
            タスク、TODO、ポイント管理をスマホでもPCでもサクサク操作。
          </p>

          {/* <div className="flex justify-center gap-3 mt-7">
            <Link
              href="/register"
              className="rounded-2xl bg-blue-600 text-white px-5 py-3 text-sm md:text-base shadow transition hover:translate-y-[-1px] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            >
              無料ではじめる
            </Link>
            <Link
              href="/login"
              className="rounded-2xl border border-gray-300 bg-white/70 backdrop-blur text-gray-800 px-5 py-3 text-sm md:text-base hover:bg-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
            >
              ログイン
            </Link>
          </div> */}
        </div>
      </section>

      {/* ③ スマホ縦長カルーセル + スクリーンショット（現在色 #FFF7EE） */}
      <section className="bg-[#FFF7EE]" data-animate="reveal-up">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <h2 className="text-wave text-[24px] md:text-[40px] font-bold tracking-[-0.01em] leading-tight text-center mb-6">
            アプリ画面イメージ
          </h2>

          {/* スマホ縦長カルーセル */}
          <div className="relative">
            <div className="hide-scroll mask-fade-x flex gap-4 overflow-x-auto px-1 py-3 snap-x snap-mandatory scroll-smooth">
              {[
                { src: '/screenshots/home_01.png', alt: 'ホーム画面' },
                { src: '/screenshots/task_01.png', alt: 'タスク画面' },
                { src: '/screenshots/todo_01.png', alt: 'Todo画面' },
                { src: '/screenshots/extra_01.png', alt: 'その他画面' },
              ].map((img) => (
                <div key={img.src} className="snap-center flex-none w-[244px]">
                  <div className="relative w-[244px] h-[520px] rounded-[22px] bg-white border border-gray-200 shadow overflow-hidden hover:translate-y-[-2px] transition-transform">
                    {/* 擬似デバイス枠上部（スピーカーっぽい） */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-1.5 rounded-full bg-gray-200 mt-2 z-10" />
                    <Image
                      src={img.src}
                      alt={img.alt}
                      fill
                      className="object-cover"
                      sizes="244px"
                      priority={false}
                    />
                  </div>
                  <p className="text-center text-xs text-gray-600 mt-2">{img.alt}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>


      {/* ④ Features（生成り #FFFBF2）— 段階的開示 & アイコン付きカード */}
      <section className="bg-[#FFFBF2]" data-animate="reveal-up">
        <h2 className="text-wave text-[24px] md:text-[40px] font-bold tracking-[-0.01em] leading-tight text-center mb-6 pt-8">
          なにができる？
        </h2>

        {/* ▼ 追加：段階的開示の状態 */}
        {/* ヒーローの直後に来る情報は“軽く”見せる */}
        <div className="mx-auto max-w-5xl px-4 pb-2">
          {/* カードグリッド */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {visibleFeatures.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="group rounded-2xl border border-gray-200/70 bg-white/70 backdrop-blur p-5 shadow-sm hover:shadow-md transition-shadow duration-200"
                >
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 rounded-xl border border-gray-200 p-2">
                      <Icon size={18} className="opacity-80" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-[16px] tracking-tight">{f.title}</h3>
                        {'badge' in f && (f as any).badge ? (
                          <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-blue-600 text-white">
                            {(f as any).badge}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-gray-600 leading-relaxed text-[14px] mt-1">
                        {f.desc}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* “さらに見る/閉じる” トグル */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setFeatExpanded((v) => !v)}
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white/80 px-5 py-2 text-sm shadow-sm hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
            >
              {featExpanded ? '閉じる' : `さらに見る（+${features.length - INITIAL}）`}
            </button>
          </div>
        </div>

      </section>




      {/* ⑤ FAQ（現在色 #FFF7EE） */}
      <section className="bg-[#FFF7EE]" data-animate="reveal-up">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <h2 className="text-wave text-[24px] md:text-[40px] font-bold tracking-[-0.01em] leading-tight text-center mb-6">
            よくあるご質問
          </h2>
          <div className="space-y-3">
            <details className="group rounded-xl bg-white border border-gray-200 p-4 shadow-sm open:shadow-md transition-shadow">
              <summary className="cursor-pointer font-medium text-gray-800 list-none select-none">個人でも使えますか？</summary>
              <div className="mt-2 text-sm text-gray-700">
                はい。ひとりのタスク管理にも最適です。あとからパートナーを追加できます。
              </div>
            </details>
            <details className="group rounded-xl bg-white border border-gray-200 p-4 shadow-sm open:shadow-md transition-shadow">
              <summary className="cursor-pointer font-medium text-gray-800 list-none select-none">プレミアムのメリットは？</summary>
              <div className="mt-2 text-sm text-gray-700">
                LINE通知が使え、広告が非表示になります。集中して管理したい方におすすめです。
              </div>
            </details>
            <details className="group rounded-xl bg-white border border-gray-200 p-4 shadow-sm open:shadow-md transition-shadow">
              <summary className="cursor-pointer font-medium text-gray-800 list-none select-none">スマホで使いやすいですか？</summary>
              <div className="mt-2 text-sm text-gray-700">
                モバイルファーストで設計しています。縦長スクリーンショットのギャラリーもご覧ください。
              </div>
            </details>
          </div>
        </div>
      </section>

      <section className="bg-[#FFFBF2]" data-animate="reveal-up">
        <div className="mx-auto max-w-5xl px-4 py-12">
          <div className="rounded-2xl soft-card bg-blue-50/70 border border-blue-100 p-6 text-center">
            <h2 className="text-xl md:text-2xl font-semibold mb-2 tracking-tight">いますぐPairKajiをはじめよう</h2>
            <p className="text-gray-700 mb-4 text-[15px]">会員登録は1分。いつでも解約できます。</p>
            <div className="flex justify-center gap-3">
              <Link
                href="/register"
                className="rounded-2xl bg-blue-600 text-white px-5 py-3 text-sm md:text-base shadow transition hover:translate-y-[-1px] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
              >
                無料で登録
              </Link>
              <Link
                href="/login"
                className="rounded-2xl border border-gray-300 bg-white/70 backdrop-blur text-gray-800 px-5 py-3 text-sm md:text-base hover:bg-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
              >
                すでにアカウントをお持ちの方
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ② Hero（生成り #FFFBF2） */}
      <section className="relative overflow-hidden bg-[#FFFBF2]" data-animate="reveal-up">
        <div className="relative mx-auto max-w-5xl px-4 pt-4 pb-4 text-center">
          {/* 審査用の広告枠（ファーストビュー直下） */}
          <div className="w-full mt-8">
            <div className="soft-card rounded-2xl border border-gray-200/70 p-3">
              {/* ▼ slot は管理画面で作成後の「実ID」に置き換えてください */}
              <AdsenseAd
                slot="9059633104"
                testMode={true}
                style={{ display: 'block', minHeight: 160 }}
              />
            </div>
          </div>
        </div>
      </section>

      <StickyCTA appHref="/main" registerHref="/login" />

      {/* ⑧ Footer（白） */}
      <footer className="bg-white border-t border-gray-200" data-animate="reveal-up">
        <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-gray-600 flex flex-col md:flex-row gap-3 md:gap-6 md:items-center md:justify-between">
          <div>© {new Date().getFullYear()} PairKaji</div>
          <nav className="flex gap-4">
            <Link href="/terms" className="hover:underline">利用規約</Link>
            <Link href="/privacy" className="hover:underline">プライバシーポリシー</Link>
            <Link href="/contact" className="hover:underline">お問い合わせ</Link>
          </nav>
        </div>
      </footer>

      {/* クライアント側でアニメーションCSS/JSを注入 */}
      <LandingAnimations />
    </main>
  );
}
