// next.config.js

const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  sw: 'sw.js',
  scope: '/',
  disable: process.env.NODE_ENV === 'development',

  // 📄 オフラインフォールバックページ（/offline.tsx or /offline.html を用意）
  // fallbacks: {
  //   document: '/offline',
  // },

  // 🧠 キャッシュルール（API / 画像 / 静的ファイルなど）
  runtimeCaching: [
    {
      // Firestore API キャッシュ
      urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'firebase-api',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60, // 1時間
        },
      },
    },
    {
      // 画像キャッシュ
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'images',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7日
        },
      },
    },
    {
      // JS / CSS リソース
      urlPattern: /\.(?:js|css)$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'static-resources',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 7 * 24 * 60 * 60,
        },
      },
    },
    {
      // Next.js のチャンク
      urlPattern: /^\/_next\/.*/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'next-js-chunks',
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30日
        },
      },
    },
    {
      // 初回読み込みページ
      urlPattern: /^\/$/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'start-url',
        expiration: {
          maxEntries: 1,
          maxAgeSeconds: 60 * 60,
        },
      },
    },
    {
      // その他すべてのページ
      urlPattern: /^\/.+$/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'page-data',
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: 7 * 24 * 60 * 60,
        },
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 🔒 外部画像ドメインの許可
  images: {
    domains: ['firebasestorage.googleapis.com'],
  },

  // 🔬 任意：App Router 使用時に必要
  experimental: {
    appDir: true,
  },

  // 💡 任意：特定パッケージをトランスパイル（SSG 時の framer-motion 対策）
  transpilePackages: ['framer-motion'],
};

module.exports = withPWA(nextConfig);
