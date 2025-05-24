import { createContext, useContext, useState } from 'react';

type ViewContextType = {
  index: number;
  setIndex: (index: number) => void;
  selectedTaskName: string;
  setSelectedTaskName: (name: string) => void;
};

const ViewContext = createContext<ViewContextType | null>(null);

export const ViewProvider = ({ children }: { children: React.ReactNode }) => {
  const [index, setIndex] = useState(0);
  const [selectedTaskName, setSelectedTaskName] = useState('');

  return (
    <ViewContext.Provider value={{ index, setIndex, selectedTaskName, setSelectedTaskName }}>
      {children}
    </ViewContext.Provider>
  );
};

export const useView = () => {
  const ctx = useContext(ViewContext);
  if (!ctx) throw new Error('useView must be used within ViewProvider');
  return ctx;
};
