import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pairkaji.app',
  appName: 'PairKaji',

  // ✅ Next.js static export の出力先
  webDir: 'out',

  // ✅ FirebaseAuthentication（Googleログインを使うなら providers に google.com が必須）
  //    skipNativeAuth は「JS SDK を使って Web層でもログイン状態を持ちたい」場合に true 推奨。
  //    （プラグインの説明上も、JS SDK を使うなら skipNativeAuth を使う想定）:contentReference[oaicite:2]{index=2}
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
};

export default config;
