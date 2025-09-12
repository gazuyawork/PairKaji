// next.config.js

const isProd = process.env.NODE_ENV === 'production';

const withPWA = require('next-pwa')({
  dest: 'public',
  register: isProd,                  // ✅ 本番のみSW登録
  skipWaiting: true,
  sw: 'sw.js',
  scope: '/',
  disable: !isProd,                  // ✅ dev時は必ず無効化

  // ✅ Webpackチャンク競合対策：一部生成物を除外
  buildExcludes: [
    /middleware-manifest\.json$/,
    /app-build-manifest\.json$/,     // ✅ devで存在しないので除外
  ],

  // ✅ 必要であれば fallback ページも指定可能
  // fallbacks: {
  //   document: '/offline',
  // },

  runtimeCaching: [
    {
      urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'firebase-api',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60,
        },
      },
    },
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'images',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 7 * 24 * 60 * 60,
        },
      },
    },
    {
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
      urlPattern: /^\/_next\/.*/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'next-js-chunks',
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        },
      },
    },
    {
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

  images: {
    domains: [
      'firebasestorage.googleapis.com',
      'profile.line-scdn.net',
    ],
  },

  transpilePackages: ['framer-motion'],
};

module.exports = withPWA(nextConfig);
