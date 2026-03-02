import { useContext } from 'react';
import type { SessionsContextValue } from './types';
import { SessionsContext } from './SessionsProvider';

export function useSessions(): SessionsContextValue {
  const ctx = useContext(SessionsContext);
  if (!ctx) throw new Error('useSessions must be used within SessionsProvider');
  return ctx;
}