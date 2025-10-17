// src/context/HelpHintsContext.tsx
'use client';

import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type HelpHintsContextValue = {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  toggle: () => void;
};

const HelpHintsContext = createContext<HelpHintsContextValue | undefined>(undefined);

const LS_KEY = 'pairkaji:help_hints_enabled';

export function HelpHintsProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState<boolean>(true); // 既定はON（必要なら false に）

  // 初期化（SSR安全）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw === '0') setEnabled(false);
      if (raw === '1') setEnabled(true);
    } catch {
      /* no-op */
    }
  }, []);

  // 永続化
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, enabled ? '1' : '0');
    } catch {
      /* no-op */
    }
  }, [enabled]);

  const value = useMemo<HelpHintsContextValue>(() => ({
    enabled,
    setEnabled,
    toggle: () => setEnabled((v) => !v),
  }), [enabled]);

  return <HelpHintsContext.Provider value={value}>{children}</HelpHintsContext.Provider>;
}

export function useHelpHints(): HelpHintsContextValue {
  const ctx = useContext(HelpHintsContext);
  if (!ctx) {
    throw new Error('useHelpHints must be used within a HelpHintsProvider');
  }
  return ctx;
}
