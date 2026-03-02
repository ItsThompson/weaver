import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react';
import type { SessionWithStatus } from '@shared/types';
import { getSessions, updateSessionName } from '../utils/api';

interface SessionsState {
  sessions: SessionWithStatus[];
  loading: boolean;
  error: string | null;
}

type SessionsAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; sessions: SessionWithStatus[] }
  | { type: 'FETCH_ERROR'; error: string }
  | { type: 'UPDATE_NAME'; id: string; customName: string };

const initialState: SessionsState = { sessions: [], loading: false, error: null };

function sessionsReducer(state: SessionsState, action: SessionsAction): SessionsState {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, loading: true, error: null };
    case 'FETCH_SUCCESS':
      return { sessions: action.sessions, loading: false, error: null };
    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.error };
    case 'UPDATE_NAME':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.id ? { ...s, customName: action.customName } : s,
        ),
      };
  }
}

interface SessionsContextValue {
  state: SessionsState;
  fetchSessions: () => Promise<void>;
  renameSession: (id: string, customName: string) => Promise<void>;
}

const SessionsContext = createContext<SessionsContextValue | null>(null);

export function SessionsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sessionsReducer, initialState);

  const fetchSessions = useCallback(async () => {
    dispatch({ type: 'FETCH_START' });
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

export function useSessions(): SessionsContextValue {
  const ctx = useContext(SessionsContext);
  if (!ctx) throw new Error('useSessions must be used within SessionsProvider');
  return ctx;
}
