import { jest } from '@jest/globals';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { SessionWithStatus } from '@weaver/shared/types';

// Mock the API module before importing context
jest.unstable_mockModule('../../utils/api', () => ({
  apiFetch: jest.fn(),
  getSessions: jest.fn(),
  getSession: jest.fn(),
  updateSessionName: jest.fn(),
}));

const api = await import('../../utils/api');
const { SessionsProvider, useSessions } = await import('.');

const mockGetSessions = api.getSessions as jest.MockedFunction<typeof api.getSessions>;
const mockUpdateSessionName = api.updateSessionName as jest.MockedFunction<typeof api.updateSessionName>;

const SESSION: SessionWithStatus = {
  id: 'aaa', pid: 100, customName: null, cwd: '/tmp',
  agentName: null, startTime: '2026-01-01T00:00:00Z', lastEventTime: '2026-01-01T00:01:00Z', status: 'open',
};

// Helper component that exposes context values for testing
function TestConsumer() {
  const { state, fetchSessions, renameSession } = useSessions();
  return (
    <div>
      <span data-testid="loading">{String(state.loading)}</span>
      <span data-testid="error">{state.error ?? ''}</span>
      <span data-testid="count">{state.sessions.length}</span>
      {state.sessions.map((s) => (
        <span key={s.id} data-testid={`session-${s.id}`}>{s.customName ?? 'unnamed'}</span>
      ))}
      <button data-testid="fetch" onClick={() => fetchSessions()}>fetch</button>
      <button data-testid="rename" onClick={() => renameSession('aaa', 'renamed')}>rename</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <SessionsProvider><TestConsumer /></SessionsProvider>
  );
}

beforeEach(() => jest.clearAllMocks());

describe('SessionsContext', () => {
  it('starts with empty state', () => {
    renderWithProvider();
    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(screen.getByTestId('loading').textContent).toBe('false');
  });

  it('fetches sessions and updates state', async () => {
    mockGetSessions.mockResolvedValue([SESSION]);
    renderWithProvider();

    await act(async () => {
      screen.getByTestId('fetch').click();
    });

    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(screen.getByTestId('loading').textContent).toBe('false');
  });

  it('handles fetch error', async () => {
    mockGetSessions.mockRejectedValue(new Error('network fail'));
    renderWithProvider();

    await act(async () => {
      screen.getByTestId('fetch').click();
    });

    expect(screen.getByTestId('error').textContent).toBe('network fail');
  });

  it('renames a session optimistically', async () => {
    mockGetSessions.mockResolvedValue([SESSION]);
    mockUpdateSessionName.mockResolvedValue({ ...SESSION, customName: 'renamed' } as any);
    renderWithProvider();

    await act(async () => { screen.getByTestId('fetch').click(); });
    await act(async () => { screen.getByTestId('rename').click(); });

    expect(screen.getByTestId('session-aaa').textContent).toBe('renamed');
    expect(mockUpdateSessionName).toHaveBeenCalledWith('aaa', 'renamed');
  });
});