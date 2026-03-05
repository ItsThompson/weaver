import { createContext, useContext, type ReactNode } from 'react';
import { useWindowList } from '../../hooks/useWindowList';
import type { WindowEntry } from '../../components/CommandPalette/types';

const WindowContext = createContext<WindowEntry[]>([]);

export function WindowProvider({ children }: { children: ReactNode }) {
  const windows = useWindowList();
  return <WindowContext.Provider value={windows}>{children}</WindowContext.Provider>;
}

export function useWindows(): WindowEntry[] {
  return useContext(WindowContext);
}
