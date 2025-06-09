'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

type ViewContextType = {
  index: number;
  setIndex: (index: number) => void;
  selectedTaskName: string;
  setSelectedTaskName: (name: string) => void;
};

const ViewContext = createContext<ViewContextType | undefined>(undefined);


type ViewProviderProps = {
  children: ReactNode;
  initialIndex?: number; // ✅ 追加
};

export function ViewProvider({ children, initialIndex = 0 }: ViewProviderProps) {
  const [index, setIndex] = useState(initialIndex);
  const [selectedTaskName, setSelectedTaskName] = useState<string>('');
  
  return (
    <ViewContext.Provider value={{ index, setIndex, selectedTaskName, setSelectedTaskName }}>
      {children}
    </ViewContext.Provider>
  );
}

export function useView() {
  const context = useContext(ViewContext);
  if (!context) {
    throw new Error('useView must be used within a ViewProvider');
  }
  return context;
}
