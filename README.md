# PairKaji（ペア家事管理アプリ）

## 概要

PairKajiは、家事やTODOをペアで管理できるタスク管理アプリです。
Firebase（Authentication, Firestore）とNext.js（App Router）を使用して構築されています。

---

## 📁 ディレクトリ構成

pairkaji/
├── public/ # アイコンや画像などの静的アセット
│ ├── icons/ # タスクON/OFFのアイコン
│ ├── images/ # プロフィール用画像
│ └── ... # manifestやService Workerなど
├── src/
│ ├── app/ # Next.js App Router 対応の各ページ
│ │ ├── main/ # タスク操作画面（スライドUI）
│ │ ├── profile/ # プロフィールとペア設定画面
│ │ ├── todo/ # TODO画面
│ │ ├── login/, register/ # 認証画面
│ │ └── splash/ # スプラッシュ画面
│ ├── components/ # UI部品
│ │ ├── common/ # 共通UI（ボタン等）
│ │ ├── home/ # ホーム画面関連UI
│ │ ├── profile/ # プロフィール画面専用コンポーネント
│ │ ├── task/ # タスク関連UI（TaskCardなど）
│ │ └── todo/ # TODO画面用UI
│ ├── constants/ # バージョン情報などの定数定義
│ ├── context/ # グローバルステート（ViewContextなど）
│ ├── hooks/ # カスタムフック（プロフィール画像, アニメーションなど）
│ ├── icons/ # オリジナルアイコン
│ ├── lib/ # ロジック・Firestore操作群
│ │ ├── firebase.ts # Firebase初期化
│ │ ├── firebaseUtils.ts # Firestore関連ユーティリティ
│ │ ├── taskUtils.ts # タスク保存・処理ロジック
│ │ ├── pairUtils.ts # ペア関連処理
│ │ ├── pointUtils.ts # ポイント関連処理
│ │ └── ... # 各種ユーティリティ
│ ├── store/ # Zustand等のグローバルストア（将来拡張用）
│ ├── types/ # 型定義（Task, Pairなど）
│ └── utils/ # 各種汎用関数（数値整形、ローカルストレージなど）
├── pairkaji_functions/ # Firebase Cloud Functions (TypeScript)
│ ├── src/index.ts # 関数エントリポイント
│ └── lib/ # ビルド生成ファイル
├── .gitignore
├── firebase.json # Firebase 設定
├── next.config.js # Next.js 設定
├── tsconfig.json # TypeScript 設定
├── tailwind.config.js # Tailwind 設定
└── README.md

yaml
コピーする
編集する

---

## 🔧 使用技術

- **Next.js** (App Router)
- **Firebase**
  - Authentication
  - Firestore
  - Cloud Functions（TypeScript）
- **Tailwind CSS**
- **Framer Motion**
- **Lucide Icons**
- **Zustand** (予定)
- **TypeScript**

---

## 🔐 認証・ペア機能

- Firebase Authentication によるログイン/新規登録
- ペア設定（招待コード式）、承認・拒否・解除可能
- ペア成立後、タスク・ポイント共有が可能

---

## 📝 今後の予定（例）

- タグ/グループ分け機能
- 通知機能
- モバイルアプリ対応（PWA強化）

---

## 🗂 注意事項

- Cloud Functions は `pairkaji_functions/` 以下に TypeScript で実装
- セキュリティルールは Firestore の `userId`, `userIds` に基づいて制御
- 開発中の未使用コンポーネントは `/src/components/common` または別途 `_archive` に整理予定

---