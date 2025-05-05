import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

// next.config.js
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development', // 開発中は無効
});

module.exports = withPWA({
  reactStrictMode: true,
  experimental: {
    appDir: true, // App Router を使用している場合
  },
});


export default nextConfig;
