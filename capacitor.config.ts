import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pairkaji.app',
  appName: 'PairKaji',
  webDir: 'out',

  // ★ Android アプリ内の WebView で開く URL を指定
  //   ここを本番の PairKaji の URL に変更してください
  server: {
    url: 'https://pair-kaji.vercel.app', // ← 実際の本番URLに書き換え
    cleartext: false,
  },

  android: {
    allowMixedContent: false,
  },
};

export default config;
