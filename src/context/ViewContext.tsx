'use client';

export const dynamic = 'force-dynamic'

import { createContext, useContext, useState, ReactNode } from 'react';

// ✅ Context の型定義：どのような値を保持・更新するかを明示
type ViewContextType = {
  index: number;                         // 0=ホーム, 1=家事, 2=履歴
  setIndex: (index: number) => void;
  selectedTaskName: string;              // 選択されたタスク ID / 名前
  setSelectedTaskName: (name: string) => void;
  listOpen: boolean;
  openTaskList: (taskId?: string) => void;
  closeTaskList: () => void;
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
  const [index, setIndexState] = useState(initialIndex);
  const [selectedTaskName, setSelectedTaskName] = useState<string>('');
  const [listOpen, setListOpen] = useState(false);

  const setIndex = (next: number) => {
    setIndexState(next);
    if (next !== 1) setListOpen(false);
  };

  const openTaskList = (taskId?: string) => {
    if (taskId) setSelectedTaskName(taskId);
    setIndexState(1);
    setListOpen(true);
  };

  const closeTaskList = () => {
    setListOpen(false);
  };

  return (
    <ViewContext.Provider
      value={{
        index,
        setIndex,
        selectedTaskName,
        setSelectedTaskName,
        listOpen,
        openTaskList,
        closeTaskList,
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
