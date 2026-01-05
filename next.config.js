// next.config.js
// @ts-check

const isProd = process.env.NODE_ENV === 'production';

/** @type {any} */
const pwaOptions = {
  dest: 'public',
  register: false,
  skipWaiting: true,
  swSrc: 'src/sw.js',
  disable: true, // ✅ Capacitorでは常に無効
};

const withPWA =
  /** @type {(cfg: import('next').NextConfig) => import('next').NextConfig} */
  (require('next-pwa')(pwaOptions));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ✅ 常に static export
  output: 'export',

  images: {
    unoptimized: true,
  },
};

module.exports = withPWA(nextConfig);
