import { jest } from '@jest/globals';
import { sessionsReducer, initialState } from '../../src/context/SessionsContext/reducer';
import type { SessionWithStatus } from '@shared/types';

const SESSION: SessionWithStatus = {
  id: 'aaa', pid: 100, customName: null, cwd: '/tmp',
  agentName: null, startTime: '2026-01-01T00:00:00Z', lastEventTime: '2026-01-01T00:01:00Z', status: 'open',
};

describe('sessionsReducer', () => {
  it('handles FETCH_START', () => {
    const result = sessionsReducer(initialState, { type: 'FETCH_START' });
    expect(result).toEqual({ sessions: [], loading: true, error: null });
  });

  it('handles FETCH_SUCCESS', () => {
    const result = sessionsReducer(initialState, { type: 'FETCH_SUCCESS', sessions: [SESSION] });
    expect(result).toEqual({ sessions: [SESSION], loading: false, error: null });
  });

  it('handles FETCH_ERROR', () => {
    const result = sessionsReducer(initialState, { type: 'FETCH_ERROR', error: 'test error' });
    expect(result).toEqual({ sessions: [], loading: false, error: 'test error' });
  });

  it('handles UPDATE_NAME', () => {
    const state = { sessions: [SESSION], loading: false, error: null };
    const result = sessionsReducer(state, { type: 'UPDATE_NAME', id: 'aaa', customName: 'new name' });
    expect(result.sessions[0].customName).toBe('new name');
  });
});