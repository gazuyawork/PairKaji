import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pairkaji.app',
  appName: 'PairKaji',
  webDir: 'www',
  server: {
    // ここにあなたのNext.jsアプリURL（Vercelなど）を入れる
    url: 'https://pair-kaji.vercel.app',
    cleartext: false,
  },
};

export default config;
