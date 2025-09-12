// next.config.js
// @ts-check

const isProd = process.env.NODE_ENV === 'production';

/** @type {any} */
const pwaOptions = {
  dest: 'public',
  register: isProd, // ✅ 本番のみ SW 登録
  skipWaiting: true,

  // ✅ InjectManifest（推奨方式）：カスタム SW を取り込む
  //   ※ TypeScript (.ts) ではなく .js を指定してください
  swSrc: 'src/sw.js',

  // ✅ dev は必ず無効化
  disable: !isProd,

  // ✅ 生成物の一部を precache から除外（存在しない場合の衝突回避）
  buildExcludes: [
    /middleware-manifest\.json$/,
    /app-build-manifest\.json$/, // dev では存在しないことがあるので除外
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

  images: {
    domains: [
      'firebasestorage.googleapis.com',
      'profile.line-scdn.net',
    ],
  },

  // Next.js 15系でも使用可
  transpilePackages: ['framer-motion'],
};

// エクスポート時にも型を明示して ts-check の誤検知を防止
module.exports =
  /** @type {import('next').NextConfig} */
  (withPWA(nextConfig));
