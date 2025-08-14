// src/app/landing/page.tsx
import Link from 'next/link';
import Image from 'next/image';
import AdsenseAd from '@/components/ads/AdsenseAd';

export const metadata = {
  title: 'PairKaji | 家事を2人で分担するアプリ',
  description:
    'PairKajiは、家事を2人で分担・見える化するためのタスク管理アプリです。タスクの進捗共有、ポイント付与、TODO管理がカンタンに。',
  robots: { index: true, follow: true },
};

export default function LandingPage() {
  return (
    <main className="min-h-[100dvh] bg-white">
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 pt-16 pb-10">
        <div className="flex flex-col items-center text-center gap-6">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
            家事を<span className="text-blue-600">ふたりで</span>、もっと楽に。
          </h1>
          <p className="text-gray-600 text-base md:text-lg leading-relaxed max-w-2xl">
            PairKajiは、ふたりの家事を「見える化」して、気持ちよく分担できるようにするアプリ。
            タスク、TODO、ポイント管理をスマホでもPCでもサクサク操作。
          </p>

          <div className="flex gap-3">
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

          {/* 審査用の広告枠（ファーストビュー下） */}
          <div className="w-full mt-6">
            {/* ▼ slot は管理画面で作成後の「実ID」に置き換えてください */}
            <AdsenseAd
              slot="ca-pub-5428928410579937"
              testMode
              style={{ display: 'block', minHeight: 160 }}
            />
          </div>

          <div className="relative w-full max-w-3xl aspect-[16/9] rounded-2xl overflow-hidden shadow">
            <Image
              src="/landing-sample.png" // public/landing-sample.png を参照
              alt="アプリのスクリーンショット"
              fill
              className="object-cover"
              priority
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-4 py-12 grid md:grid-cols-3 gap-6">
        {[
          {
            title: 'タスクを共同管理',
            desc: '誰が・いつ・何をやるかを共有。見落としゼロでスムーズ。',
          },
          {
            title: 'TODOもサクッと',
            desc: '買い物リストや細かなメモもひとつに集約。リアルタイム反映。',
          },
          {
            title: 'ポイントで見える化',
            desc: 'がんばりをポイント化。あとから振り返れて、公平に分担。',
          },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-gray-200 p-6 shadow-sm bg-white"
          >
            <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
            <p className="text-gray-600 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* セクション下の広告枠（テキストの近接を避け余白確保） */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="my-8">
          <AdsenseAd
            slot="ca-pub-5428928410579937"
            testMode
            style={{ display: 'block', minHeight: 160 }}
          />
        </div>

        <div className="rounded-2xl bg-blue-50 border border-blue-100 p-6 text-center">
          <h2 className="text-xl md:text-2xl font-semibold mb-2">
            いますぐPairKajiをはじめよう
          </h2>
          <p className="text-gray-700 mb-4">
            会員登録は1分。いつでも解約できます。
          </p>
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
      </section>

      {/* フッター（審査で評価されやすい） */}
      <footer className="border-t border-gray-200">
        <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-gray-600 flex flex-col md:flex-row gap-3 md:gap-6 md:items-center md:justify-between">
          <div>© {new Date().getFullYear()} PairKaji</div>
          <nav className="flex gap-4">
            <Link href="/terms" className="hover:underline">
              利用規約
            </Link>
            <Link href="/privacy" className="hover:underline">
              プライバシーポリシー
            </Link>
            <Link href="/contact" className="hover:underline">
              お問い合わせ
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
