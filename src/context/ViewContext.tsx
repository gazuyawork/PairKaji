'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

// ✅ Context の型定義：どのような値を保持・更新するかを明示
type ViewContextType = {
  index: number;                         // 表示中の画面インデックス（例：0=ホーム, 1=タスク, 2=ポイント）
  setIndex: (index: number) => void;     // 画面インデックスを変更する関数
  selectedTaskName: string;              // 選択されたタスク名（検索や選択時に使用）
  setSelectedTaskName: (name: string) => void; // タスク名を設定する関数
};

// ✅ Context を作成（初期値は undefined にして、Provider 配下でのみ使用可能にする）
const ViewContext = createContext<ViewContextType | undefined>(undefined);

// ✅ Provider の props 型：children（子要素）と任意の初期インデックス
type ViewProviderProps = {
  children: ReactNode;
  initialIndex?: number; // 任意指定の初期表示インデックス（デフォルト 0）
};

/**
 * ViewProvider: グローバルな UI 状態（インデックスやタスク名）を提供するラッパー
 */
export function ViewProvider({ children, initialIndex = 0 }: ViewProviderProps) {
  const [index, setIndex] = useState(initialIndex);                // 表示中のビューインデックス
  const [selectedTaskName, setSelectedTaskName] = useState<string>(''); // タスク名の選択状態

  return (
    <ViewContext.Provider
      value={{
        index,
        setIndex,
        selectedTaskName,
        setSelectedTaskName,
      }}
    >
      {children}
    </ViewContext.Provider>
  );
}

/**
 * useView: ViewContext にアクセスするためのカスタムフック
 * Provider 配下でのみ呼び出すようチェックも含めている
 */
export function useView() {
  const context = useContext(ViewContext);
  if (!context) {
    throw new Error('useView must be used within a ViewProvider');
  }
  return context;
}
