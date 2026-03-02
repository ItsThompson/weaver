import type { SessionsState, SessionsAction } from './types';

export const initialState: SessionsState = { sessions: [], loading: false, error: null };

export function sessionsReducer(state: SessionsState, action: SessionsAction): SessionsState {
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