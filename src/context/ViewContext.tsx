'use client';

export const dynamic = 'force-dynamic'

import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { writeLastListTaskId } from '@/lib/todayTask';

// ✅ Context の型定義：どのような値を保持・更新するかを明示
type TaskScreenRequest = {
  token: number;
  search: string;
  flagged: boolean;
};

type ViewContextType = {
  index: number;                         // 0=ホーム, 1=家事, 2=履歴
  setIndex: (index: number) => void;
  selectedTaskName: string;              // 選択されたタスク ID / 名前
  setSelectedTaskName: (name: string) => void;
  listOpen: boolean;
  /** リストをオンで保存した直後だけ、追加欄を開く対象の家事 ID */
  listAddTaskId: string;
  openTaskList: (taskId?: string, opts?: { startAdding?: boolean }) => void;
  closeTaskList: () => void;
  taskScreenRequest: TaskScreenRequest;
  /** 同じ /main の中で家事タブへ移す。URL を変えると画面全体の読み込みが戻らなくなる */
  openTaskScreen: (opts?: { search?: string; flagged?: boolean }) => void;
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
  const [listAddTaskId, setListAddTaskId] = useState('');
  const [taskScreenRequest, setTaskScreenRequest] = useState<TaskScreenRequest>({
    token: 0,
    search: '',
    flagged: false,
  });

  const setIndex = useCallback((next: number) => {
    setIndexState(next);
    if (next !== 1) {
      setListOpen(false);
      setListAddTaskId('');
    }
  }, []);

  const openTaskList = useCallback((taskId?: string, opts?: { startAdding?: boolean }) => {
    if (taskId) {
      setSelectedTaskName(taskId);
      writeLastListTaskId(taskId);
    }
    setListAddTaskId(opts?.startAdding && taskId ? taskId : '');
    setIndexState(1);
    setListOpen(true);
  }, []);

  const closeTaskList = useCallback(() => {
    setListOpen(false);
    setListAddTaskId('');
  }, []);

  const openTaskScreen = useCallback((opts?: { search?: string; flagged?: boolean }) => {
    setListOpen(false);
    setListAddTaskId('');
    setIndexState(1);
    setTaskScreenRequest((prev) => ({
      token: prev.token + 1,
      search: opts?.search?.trim() ?? '',
      flagged: opts?.flagged === true,
    }));
  }, []);

  return (
    <ViewContext.Provider
      value={{
        index,
        setIndex,
        selectedTaskName,
        setSelectedTaskName,
        listOpen,
        listAddTaskId,
        openTaskList,
        closeTaskList,
        taskScreenRequest,
        openTaskScreen,
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
