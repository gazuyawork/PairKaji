'use client';

import Link from 'next/link';
import Image from 'next/image';
import AdsenseAd from '@/components/ads/AdsenseAd';
import { Pacifico } from 'next/font/google';
import LandingAnimations from './LandingAnimations';
import './landing.css';
import { useState } from 'react';
import type { ReactNode, ComponentType } from 'react';
import {
  User, ChevronDown, Users, ListChecks, CheckCircle, BellRing, Filter,
  Crown, ShieldCheck, Smartphone, Info, RefreshCw
} from 'lucide-react';

import StickyCTA from '@/components/common/StickyCTA';

const pacifico = Pacifico({ subsets: ['latin'], weight: '400' });

// ===== 型定義（any 排除） =====
type IconComponent = ComponentType<{ size?: number; className?: string }>;

type Feature = {
  title: string;
  desc: string;
  icon: IconComponent;
  badge?: string;
  detail?: ReactNode;
};

type Faq = {
  title: string;
  desc?: string;
  icon: IconComponent;
  detail?: ReactNode;
};

export default function LandingPage() {
  const logo = 'PairKaji'.split('');
  const [featExpanded, setFeatExpanded] = useState(false);
  const [openFeature, setOpenFeature] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [faqExpanded, setFaqExpanded] = useState(false); // FAQの段階的開示フラグ

  // ▼▼▼ LP コンテンツ用データ（アプリ実装に即した説明）
  const features: Feature[] = [
    {
      title: 'ふたりで家事を共有',
      desc: 'ペアを組むと、タスク・TODO・ポイントがリアルタイムで共有されます。双方が編集可能で、状態が即時に同期されます。',
      icon: Users,
      // badge: 'Premium',
      // detail: (
      //   <div className="mt-3 space-y-3">
      //     <p className="text-gray-700 text-[14px] leading-relaxed">
      //       TODOはドラッグ＆ドロップやチェック操作で素早く整理できます。
      //     </p>
      //     <video className="rounded-xl w-full" controls preload="metadata" poster="/videos/todo_poster.jpg">
      //       <source src="/videos/todo_demo.mp4" type="video/mp4" />
      //       お使いのブラウザは動画再生に対応していません。
      //     </video>
      //   </div>
      // ),
    },
    {
      title: 'タスク',
      desc: '毎日/週次/日付指定など、家庭の運用に合わせた柔軟な設定。注意フラグで「要対応」を強調できます。',
      icon: ListChecks,
      // detail: (
      //   <div className="mt-3 space-y-3">
      //     <p className="text-gray-700 text-[14px] leading-relaxed">
      //       毎日/週次/日付指定など、家庭の運用に合わせた柔軟な設定。注意フラグで「要対応」を強調できます。
      //     </p>
      //     <video className="rounded-xl w-full" controls preload="metadata" poster="/videos/todo_poster.jpg">
      //       <source src="/videos/todo_demo.mp4" type="video/mp4" />
      //       お使いのブラウザは動画再生に対応していません。
      //     </video>
      //   </div>
      // ),
    },
    {
      title: 'ToDo管理',
      desc: 'タスクに対してTODOを設定できます。例えば「お買い物」タスクに対してTODOを作成することで、お買い物リストとして使用することが出来ます。',
      icon: ListChecks,
    },
    {
      title: 'ポイント制度',
      desc: 'WeeklyPoints / PairPoints で家事の可視化することで、パートナーが頑張りがわかります。',
      icon: CheckCircle,
    },
    {
      title: 'リマインド（プッシュ通知）',
      desc: '毎朝の予定タスクや直近のタスクをプッシュ通知します。※当日のタスクが存在しない場合は送信されません。',
      icon: BellRing,
      badge: 'Premium',
    },
    {
      title: '検索・フィルタ',
      desc: '検索やフィルタで絞り込みができるので、タスクを探すのが楽になります。',
      icon: Filter,
      detail: (
        <div className="mt-3 space-y-3">
          <p className="text-gray-700 text-[14px] leading-relaxed">
            TODOはドラッグ＆ドロップやチェック操作で素早く整理できます。
          </p>
          <video className="rounded-xl w-full" controls preload="metadata" poster="/videos/todo_poster.jpg">
            <source src="/videos/todo_demo.mp4" type="video/mp4" />
            お使いのブラウザは動画再生に対応していません。
          </video>
        </div>
      ),
    },
    {
      title: 'リアルタイム同期',
      desc: 'リアルタイムにタスクが共有されるため、同じタスクをおこなってしまうことを避けられます。',
      icon: RefreshCw,
    },
    {
      title: 'プライベートでの使用',
      desc: 'パートナー設定をおこなった後でも、タスク登録時にPrivateモードをONにすることで、パートナーにタスクが見えなくなります。※Privateタスクはポイントに加算されません。',
      icon: Crown,
      // detail: (
      //   <div className="mt-3 space-y-3">
      //     <p className="text-gray-700 text-[14px] leading-relaxed">
      //       TODOはドラッグ＆ドロップやチェック操作で素早く整理できます。
      //     </p>
      //     <video className="rounded-xl w-full" controls preload="metadata" poster="/videos/todo_poster.jpg">
      //       <source src="/videos/todo_demo.mp4" type="video/mp4" />
      //       お使いのブラウザは動画再生に対応していません。
      //     </video>
      //   </div>
      // ),
    },
  ];

  const faqs: Faq[] = [
    {
      title: 'ふたりで使い始めるにはどうすればいいですか？',
      detail: (
        <p className="text-gray-700 leading-relaxed text-[14px] mt-1">
          ホーム画面、またはプロフィール画面で招待コードを発行し、相手が承認することでペアが確定します。確定後はタスク・TODO・ポイントが共有され、お互いに編集できます。<br />
          ※個人で作成していたタスクは共有されませんので、共有したい場合はタスクの編集より、Privateモードをオフにしてください。
        </p>
      ),
      icon: Users,
    },
    {
      title: '招待の承認が表示されない/反映が遅いのですが？',
      desc: 'Firestoreのリアルタイムリスナーで反映されますが、ネットワークの状況等でタイムラグが生じる場合があります。表示が不安定なときは一度アプリを終了して再起動してください。',
      icon: Info,
    },
    {
      title: 'ペアを解除したらデータはどうなりますか？',
      desc: '解除後はプライベートタスク・TODOは保持されますが、共有タスクは削除されます。また、ポイントは使用できなくなります。',
      icon: User,
    },
    {
      title: '通知は何で届きますか？',
      desc: '現在はプッシュ通知に対応しています。週次または日付指定のタスクが送信の対象となります。時間指定をしているタスクは、指定時間の30分程度前に通知が届きます。',
      icon: BellRing,
    },
    {
      title: 'ポイント機能はどのように使用すればいいですか？',
      desc: '家事の偏りが見え、話し合いの材料にできます。',
      icon: CheckCircle,
    },
    {
      title: '対応環境は？インストールできますか？',
      desc: 'スマホ/PCのブラウザで利用できます。ホーム画面追加にも対応していますので、アプリのように起動できます（OSやブラウザの仕様に依存します）。',
      detail: (
        <div className="mt-3 space-y-3">
          <p className="text-gray-700 text-[14px] leading-relaxed">
            スマホ/PCのブラウザで利用できます。ホーム画面追加にも対応していますので、アプリのように起動できます（OSやブラウザの仕様に依存します）。<br/>※ホーム画面への追加方法は動画を参照ください。
          </p>
          <video className="rounded-xl w-full" controls preload="metadata" poster="/videos/todo_poster.jpg">
            <source src="/videos/todo_demo.mp4" type="video/mp4" />
            お使いのブラウザは動画再生に対応していません。
          </video>
        </div>
      ),
      icon: Smartphone,
    },
    {
      title: 'データの保存先/プライバシーは？',
      desc: 'Google Cloud Firestoreに保存します。共有対象はペア相手のみ。アクセス制御・読み書き権限はセキュリティルールで制限しています。',
      icon: ShieldCheck,
    },
    {
      title: '料金やプレミアム機能はありますか？',
      desc: 'プレミアム機能にご登録いただくことで、広告が非表示となり、LINEでの通知を受け取ることが出来ます。現時点の料金は月々150円でご利用いただけます。',
      icon: Crown,
    },
    // {
    //   title: '既存のタスクをペア共有に切り替えたい',
    //   desc: 'ペアが確定すると共有が有効化されます。解除時はペア情報を除去し、タスク/ToDoは保持されます。共有切り替えの詳細はアプリ内の説明をご参照ください。',
    //   // icon: CalendarClock, // 使う場合は import も追加
    // },
  ];

  const INITIAL = 5;
  const visibleFeatures = featExpanded ? features : features.slice(0, INITIAL);

  const FAQ_INITIAL = 5; // FAQの初期表示件数
  const visibleFaqs = faqExpanded ? faqs : faqs.slice(0, FAQ_INITIAL); // FAQの可視配列

  return (
    // main には地の色を指定せず、各セクションで交互配色
    <main>
      {/* ① Header（現在色 #FFF7EE） */}
      <section className="relative overflow-hidden bg-[#FFF7EE]" data-animate="reveal-up">
        {/* 飾り玉（背景の淡い光） */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-amber-200/40 blur-3xl" />

        {/* 薄いウォーターマーク（アイコン） */}
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
        {/* <div className="pointer-events-none absolute -top-24 right-10 h-52 w-52 rounded-full bg-blue-200/40 blur-3xl" /> */}

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
              className="rounded-2xl border border-gray-300 bg-white/70 backdrop-blur text-gray-800 px-5 py-3 text-sm md:text-base hover:bg白 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
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
      <section className="relative bg-[#FFFBF2]" data-animate="reveal-up">
        <div className="pointer-events-none absolute inset-0 bg-grid-soft opacity-40" />
        <h2 className="text-wave text-[24px] md:text-[40px] font-bold tracking-[-0.01em] leading-tight text-center mb-6 pt-8">
          なにができる？
        </h2>

        {/* ヒーローの直後に来る情報は“軽く”見せる */}
        <div className="mx-auto max-w-5xl px-4 pb-2">
          {/* カードグリッド */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {visibleFeatures.map((f) => {
              const Icon = f.icon;
              const isOpen = openFeature === f.title;
              const contentId = `feature-desc-${f.title}`;

              return (
                <div
                  key={f.title}
                  className="group rounded-2xl border border-gray-200/70 bg-white/70 backdrop-blur p-3 md:p-5 shadow-sm hover:shadow-md transition-shadow duration-200"
                >
                  {/* ヘッダー（クリック/タップで開閉） */}
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={contentId}
                    onClick={() => setOpenFeature((prev) => (prev === f.title ? null : f.title))}
                    className="w-full flex items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
                  >
                    {/* アイコン枠 */}
                    <div className="shrink-0 rounded-xl border border-gray-200 p-2 flex items-center justify-center">
                      <Icon size={18} className="opacity-80" />
                    </div>

                    {/* タイトル・バッジ・矢印 */}
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <h3 className="font-semibold text-[16px] tracking-tight">{f.title}</h3>
                      {f.badge ? (
                        <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-blue-600 text-white">
                          {f.badge}
                        </span>
                      ) : null}
                      <span className="ml-auto">
                        <ChevronDown
                          size={16}
                          className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : 'rotate-0'}`}
                          aria-hidden="true"
                        />
                      </span>
                    </div>
                  </button>

                  {/* 詳細：画像/動画含む。buttonの外なので動画操作OK */}
                  <div
                    id={contentId}
                    className={`overflow-hidden transition-all duration-300 ${isOpen ? 'mt-3 max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}
                  >
                    {f.detail ? (
                      f.detail
                    ) : (
                      <p className="text-gray-700 leading-relaxed text-[14px] mt-1 whitespace-pre-line">
                        {f.desc}
                      </p>
                    )}
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
            <div className="mx-auto max-w-3xl">
              <div className="grid grid-cols-1 gap-4">
                {visibleFaqs.map((q) => {
                  const Icon = q.icon;
                  const isOpen = openFaq === q.title;
                  const contentId = `faq-${q.title}`;

                  return (
                    <div
                      key={q.title}
                      className="group rounded-2xl border border-gray-200/70 bg-white/70 backdrop-blur p-3 md:p-5 shadow-sm hover:shadow-md transition-shadow duration-200"
                    >
                      {/* ヘッダー（クリック/タップで開閉） */}
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={contentId}
                        onClick={() => setOpenFaq((prev) => (prev === q.title ? null : q.title))}
                        className="w-full flex items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
                      >
                        <div className="shrink-0 rounded-xl border border-gray-200 p-2 flex items-center justify-center">
                          <Icon size={18} className="opacity-80" />
                        </div>

                        <div className="min-w-0 flex-1 flex items-center gap-2">
                          <h3 className="font-semibold text-[16px] tracking-tight">{q.title}</h3>
                          <span className="ml-auto">
                            <ChevronDown
                              size={16}
                              className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : 'rotate-0'}`}
                              aria-hidden="true"
                            />
                          </span>
                        </div>
                      </button>

                      {/* 詳細（desc or detail） */}
                      <div
                        id={contentId}
                        className={`overflow-hidden transition-all duration-300 ${isOpen ? 'mt-3 max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}
                      >
                        {q.detail ? (
                          q.detail
                        ) : (
                          <p className="text-gray-700 leading-relaxed text-[14px] mt-1 whitespace-pre-line">
                            {q.desc}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* “さらに見る/閉じる” トグル（FAQ） */}
              {faqs.length > FAQ_INITIAL && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setFaqExpanded((v) => !v)}
                    className="mt-6 inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white/80 px-5 py-2 text-sm shadow-sm hover:bg白 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
                  >
                    {faqExpanded ? '閉じる' : `さらに見る（+${faqs.length - FAQ_INITIAL}）`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* CTA ブロック（現在色 #FFFBF2） */}
      <section className="relative bg-[#FFFBF2]" data-animate="reveal-up">
        <div className="pointer-events-none absolute inset-0 bg-grid-soft opacity-40" />
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

      {/* ⑥ 広告枠（生成り #FFFBF2） */}
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
