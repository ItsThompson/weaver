import { createContext, useReducer, useCallback, type ReactNode } from 'react';
import type { SessionsContextValue } from './types';
import { sessionsReducer, initialState } from './reducer';
import { getSessions, updateSessionName } from '../../utils/api';

export const SessionsContext = createContext<SessionsContextValue | null>(null);

export function SessionsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sessionsReducer, initialState);

  const fetchSessions = useCallback(async (silent = false) => {
    if (!silent) dispatch({ type: 'FETCH_START' });
    try {
      const sessions = await getSessions();
      dispatch({ type: 'FETCH_SUCCESS', sessions });
    } catch (err) {
      dispatch({ type: 'FETCH_ERROR', error: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const renameSession = useCallback(async (id: string, customName: string) => {
    await updateSessionName(id, customName);
    dispatch({ type: 'UPDATE_NAME', id, customName });
  }, []);

  return (
    <SessionsContext.Provider value={{ state, fetchSessions, renameSession }}>
      {children}
    </SessionsContext.Provider>
  );
}