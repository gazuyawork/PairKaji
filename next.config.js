// next.config.js
// @ts-check

const isProd = process.env.NODE_ENV === 'production';

/** @type {any} */
const pwaOptions = {
  dest: 'public',

  // 自動登録は一旦オフ（安定後に true/ isProd へ戻せます）
  register: false,

  skipWaiting: true,

  // InjectManifest（推奨）：カスタム SW を取り込む
  // ※ TypeScript (.ts) ではなく .js を指定してください
  swSrc: 'src/sw.js',

  // dev は必ず無効化（本番のみ SW をビルドに含める）
  disable: !isProd,

  // 生成物の一部を precache から除外（存在しない場合の衝突回避）
  buildExcludes: [
    /middleware-manifest\.json$/,
    /app-build-manifest\.json$/, // dev では存在しないことがあるので除外
    /middleware-manifest\.json$/,           // 既存
    /app-build-manifest\.json$/,            // 既存
    /(^|\/)sw\.js$/,                         // ★追加: SW 本体は precache しない
    /_next\/dynamic-css-manifest\.json$/,    // ★追加: 404 になり得る
    /_next\/.*\.json$/,                      // ★追加: 念のため _next 配下の json を広く除外
  ],

  // ⚠️ InjectManifest では runtimeCaching は使用不可（未指定）
};

// next-pwa をインライン適用
// next-pwa が型を提供していないため、JSDoc で型を明示
const withPWA =
  /** @type {(cfg: import('next').NextConfig) => import('next').NextConfig} */
  (require('next-pwa')(pwaOptions));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // images.domains は非推奨のため、remotePatterns を使用
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**', // 例: /v0/b/<bucket>/o/** を包括
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'www.google.com',
        // /s2/favicons?... を含むパスを包括
        pathname: '/s2/**',
      },
    ],
  },

  // Next.js 15系でも使用可
  transpilePackages: ['framer-motion'],
};

// エクスポート時にも型を明示して ts-check の誤検知を防止
module.exports =
  /** @type {import('next').NextConfig} */
  (withPWA(nextConfig));
