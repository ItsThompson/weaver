import type { SessionWithStatus } from '@shared/types';

export interface SessionsState {
  sessions: SessionWithStatus[];
  loading: boolean;
  error: string | null;
}

export type SessionsAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; sessions: SessionWithStatus[] }
  | { type: 'FETCH_ERROR'; error: string }
  | { type: 'UPDATE_NAME'; id: string; customName: string };

export interface SessionsContextValue {
  state: SessionsState;
  fetchSessions: () => Promise<void>;
  renameSession: (id: string, customName: string) => Promise<void>;
}