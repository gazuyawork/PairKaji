import Link from 'next/link';
import Image from 'next/image';
import AdsenseAd from '@/components/ads/AdsenseAd';
import { Pacifico } from 'next/font/google';
import LandingAnimations from './LandingAnimations';
import './landing.css';

export const metadata = {
  title: 'PairKaji | 家事を2人で分担するアプリ',
  description:
    'PairKajiは、家事を2人で分担・見える化するためのタスク管理アプリです。タスクの進捗共有、ポイント付与、TODO管理がカンタンに。',
  robots: { index: true, follow: true },
  // ▼ 追加：OG画像（SNSでの見え方向上）
  openGraph: {
    images: ['/images/default.png'],
  },
};

const pacifico = Pacifico({ subsets: ['latin'], weight: '400' });

export default function LandingPage() {
  const logo = 'PairKaji'.split('');

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

          <div className="flex justify-center gap-3 mt-7">
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
          </div>
        </div>
      </section>

      {/* ③ スマホ縦長カルーセル + スクリーンショット（現在色 #FFF7EE） */}
      <section className="bg-[#FFF7EE]" data-animate="reveal-up">
        <div className="mx-auto max-w-5xl px-4 py-12">
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

      {/* ④ Features（生成り #FFFBF2） */}
      <section className="bg-[#FFFBF2]" data-animate="reveal-up">
        <h2 className="text-wave text-[24px] md:text-[40px] font-bold tracking-[-0.01em] leading-tight text-center mb-6 pt-8">
          なにができる？
        </h2>
        <div className="mx-auto max-w-5xl px-4 py-4 grid md:grid-cols-3 gap-6">
          {[
            { title: 'プレミアムで快適に', desc: 'LINE通知に対応し、広告も非表示。よりスムーズな家事シェアを。', badge: 'Premium' },
            { title: 'ひとりでも使える', desc: '個人のタスク管理にも最適。後からパートナー追加も可能です。' },
            { title: 'タスクを共同管理', desc: '誰が・いつ・何をやるかを共有。見落としゼロでスムーズ。' },
            { title: 'TODOもサクッと', desc: '買い物リストや細かなメモもひとつに集約。リアルタイム反映。' },
            { title: 'ポイントで見える化', desc: 'がんばりをポイント化。あとから振り返れて、公平に分担。' },
            { title: 'リアルタイム同期', desc: 'Firestore連携で変更は即時に反映。二人の画面がずれません。' },
            { title: 'ペア設定＆共有', desc: '招待コードでペアを承認。タスク・TODO・ポイントを双方向に共有。' },
            { title: 'ポイント履歴', desc: '週次で頑張りを見える化。振り返りやすく、モチベ維持に最適。' },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl soft-card border border-gray-200/70 p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-semibold text-[17px] tracking-tight">{f.title}</h3>
                {'badge' in f && (f as any).badge ? (
                  <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-blue-600 text-white">
                    {(f as any).badge}
                  </span>
                ) : null}
              </div>
              <p className="text-gray-600 leading-relaxed text-[15px]">{f.desc}</p>
            </div>
          ))}
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

      {/* ⑥ CTA + 下部広告（生成り #FFFBF2） */}
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

      {/* ⑦ Premium ミニ帯（現在色 #FFF7EE） */}
      <section className="bg-[#FFF7EE]" data-animate="reveal-up">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <div className="rounded-2xl bg-white border border-blue-200 p-5 shadow-sm text-center">
            <p className="text-gray-800 text-sm md:text-base">
              プレミアムなら <span className="font-semibold">LINE通知</span> &amp; <span className="font-semibold">広告非表示</span>。
              <span className="ml-1">まずは無料でお試しください。</span>
            </p>
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
