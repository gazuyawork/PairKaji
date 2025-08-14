import Link from 'next/link';
import Image from 'next/image';
import AdsenseAd from '@/components/ads/AdsenseAd';
import { Pacifico } from 'next/font/google';
import LandingAnimations from './LandingAnimations';

export const metadata = {
  title: 'PairKaji | 家事を2人で分担するアプリ',
  description:
    'PairKajiは、家事を2人で分担・見える化するためのタスク管理アプリです。タスクの進捗共有、ポイント付与、TODO管理がカンタンに。',
  robots: { index: true, follow: true },
};

const pacifico = Pacifico({ subsets: ['latin'], weight: '400' });

export default function LandingPage() {
  const logo = 'PairKaji'.split('');

  return (
    // main には地の色を指定せず、各セクションで交互配色
    <main>
      {/* ① Header（現在色 #FFF7EE） */}
      <section className="bg-[#FFF7EE]" data-animate="reveal-up">
        <header className="text-center pt-10 pb-4 select-none">
          <h1
            className={`${pacifico.className} text-[64px] md:text-[80px] leading-none text-[#555] inline-block`}
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
          <p className="text-sm md:text-base text-gray-700 mt-10">
            ふたりで家事やタスクを簡単に共有・管理しよう！
          </p>
        </header>
      </section>

      {/* ② Hero（生成り #FFFBF2） */}
      <section className="bg-[#FFFBF2]" data-animate="reveal-up">
        <div className="mx-auto max-w-5xl px-4 pt-12 pb-10 text-center">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
            家事を<span className="text-blue-600">ふたりで</span>、もっと楽に。
          </h2>
          <p className="text-gray-600 text-base md:text-lg leading-relaxed max-w-2xl mx-auto mt-4">
            PairKajiは、ふたりの家事を「見える化」して、気持ちよく分担できるようにするアプリ。
            タスク、TODO、ポイント管理をスマホでもPCでもサクサク操作。
          </p>

          <div className="flex justify-center gap-3 mt-6">
            <Link
              href="/register"
              className="rounded-2xl bg-blue-600 text-white px-5 py-3 text-sm md:text-base shadow hover:opacity-90 transition"
            >
              無料ではじめる
            </Link>
            <Link
              href="/login"
              className="rounded-2xl border border-gray-300 text-gray-800 px-5 py-3 text-sm md:text-base hover:bg-gray-50 transition"
            >
              ログイン
            </Link>
          </div>

          {/* 審査用の広告枠（ファーストビュー直下） */}
          <div className="w-full mt-8">
            {/* ▼ slot は管理画面で作成後の「実ID」に置き換えてください */}
            <AdsenseAd
              slot="9059633104"
              testMode={true}
              style={{ display: 'block', minHeight: 160 }}
            />
          </div>
        </div>
      </section>

      {/* ③ スマホ縦長カルーセル + スクリーンショット（現在色 #FFF7EE） */}
      <section className="bg-[#FFF7EE]" data-animate="reveal-up">
        <div className="mx-auto max-w-5xl px-4 py-12">
          <h3 className="text-lg md:text-xl font-semibold text-gray-800 mb-3 text-center">
            アプリ画面イメージ
          </h3>

          {/* スマホ縦長カルーセル */}
          <div className="relative">
            <div className="flex gap-4 overflow-x-auto px-1 py-3 snap-x snap-mandatory scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[
                { src: '/screenshots/home.png', alt: 'ホーム画面' },
                { src: '/screenshots/task.png', alt: 'タスク画面' },
                { src: '/screenshots/todo.png', alt: 'Todo画面' },
                { src: '/screenshots/extra.png', alt: 'その他画面' },
              ].map((img) => (
                <div key={img.src} className="snap-center flex-none w-[240px]">
                  <div className="relative w-[240px] h-[510px] rounded-xl border border-gray-200 shadow bg-white overflow-hidden hover:translate-y-[-2px] transition-transform">
                    <Image
                      src={img.src}
                      alt={img.alt}
                      fill
                      className="object-cover"
                      sizes="240px"
                      priority={false}
                    />
                  </div>
                  <p className="text-center text-xs text-gray-600 mt-2">{img.alt}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ヒーロー横長スクショ（軽いパララックス） */}
          <div className="relative w-full max-w-3xl mx-auto aspect-[16/9] rounded-2xl overflow-hidden shadow parallax mt-10">
            <Image
              src="/landing-sample.png"
              alt="アプリのスクリーンショット"
              fill
              className="object-cover"
              priority
            />
          </div>
        </div>
      </section>

      {/* ④ Features（生成り #FFFBF2） */}
      <section className="bg-[#FFFBF2]" data-animate="reveal-up">
        <div className="mx-auto max-w-5xl px-4 py-12 grid md:grid-cols-3 gap-6">
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
            <div key={f.title} className="rounded-2xl border border-gray-200 p-6 shadow-sm bg-white hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-semibold text-lg">{f.title}</h3>
                {'badge' in f && (f as any).badge ? (
                  <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-blue-600 text-white">
                    {(f as any).badge}
                  </span>
                ) : null}
              </div>
              <p className="text-gray-600 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ⑤ FAQ（現在色 #FFF7EE） */}
      <section className="bg-[#FFF7EE]" data-animate="reveal-up">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <h2 className="text-xl md:text-2xl font-semibold text-center mb-4">よくあるご質問</h2>
          <div className="space-y-3">
            <details className="group rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
              <summary className="cursor-pointer font-medium text-gray-800 list-none">個人でも使えますか？</summary>
              <div className="mt-2 text-sm text-gray-700">
                はい。ひとりのタスク管理にも最適です。あとからパートナーを追加できます。
              </div>
            </details>
            <details className="group rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
              <summary className="cursor-pointer font-medium text-gray-800 list-none">プレミアムのメリットは？</summary>
              <div className="mt-2 text-sm text-gray-700">
                LINE通知が使え、広告が非表示になります。集中して管理したい方におすすめです。
              </div>
            </details>
            <details className="group rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
              <summary className="cursor-pointer font-medium text-gray-800 list-none">スマホで使いやすいですか？</summary>
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
          <div className="rounded-2xl bg-blue-50 border border-blue-100 p-6 text-center">
            <h2 className="text-xl md:text-2xl font-semibold mb-2">いますぐPairKajiをはじめよう</h2>
            <p className="text-gray-700 mb-4">会員登録は1分。いつでも解約できます。</p>
            <div className="flex justify-center gap-3">
              <Link
                href="/register"
                className="rounded-2xl bg-blue-600 text-white px-5 py-3 text-sm md:text-base shadow hover:opacity-90 transition"
              >
                無料で登録
              </Link>
              <Link
                href="/login"
                className="rounded-2xl border border-gray-300 text-gray-800 px-5 py-3 text-sm md:text-base hover:bg-gray-50 transition"
              >
                すでにアカウントをお持ちの方
              </Link>
            </div>
          </div>

          {/* セクション下の広告枠（テキストの近接を避け余白確保） */}
          <div className="my-8">
            <AdsenseAd
              slot="9059633104"
              testMode={true}
              style={{ display: 'block', minHeight: 160 }}
            />
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
