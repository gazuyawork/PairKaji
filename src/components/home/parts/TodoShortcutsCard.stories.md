// src/components/home/parts/TodoShortcutsCard.stories.md

# TodoShortcutsCard 使い方（メモ）

- `user_settings/{uid}` に `todoShortcuts: string[]`（taskIdの配列, 最大3件）を保存します。
- 候補のTODOは `tasks` コレクションから `isTodo==true` かつ `userIds` に `uid` を含むものをリアルタイム取得します。
- 空スロット（＋アイコン）をタップすると `SlideUpModal` で選択モーダルが開きます。
- 既に選択されているスロットをタップすると `/todo?focusTask=...` に遷移します。
- スロット右上の ✕ でスロット解除（保存）します。
