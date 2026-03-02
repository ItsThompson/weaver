import { jest } from '@jest/globals';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import type { SessionWithStatus } from '@weaver/shared/types';

jest.unstable_mockModule('../../utils/api', () => ({
  apiFetch: jest.fn(),
  getSessions: jest.fn(),
  getSession: jest.fn(),
  updateSessionName: jest.fn(),
  getOrphanCount: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 0 }),
  getOrphans: jest.fn(),
  assignOrphans: jest.fn(),
}));

const api = await import('../../utils/api');
const { SessionsPage } = await import('.');

const mockGetSessions = api.getSessions as jest.MockedFunction<typeof api.getSessions>;

const OPEN_SESSION: SessionWithStatus = {
  id: 'open-1', pid: 100, customName: 'My Session', cwd: '/projects/app',
  agentName: 'dev', startTime: '2026-01-02T00:00:00Z', lastEventTime: '2026-01-02T00:05:00Z', status: 'open',
};

const CLOSED_SESSION: SessionWithStatus = {
  id: 'closed-1', pid: 200, customName: null, cwd: '/tmp',
  agentName: null, startTime: '2026-01-01T00:00:00Z', lastEventTime: '2026-01-01T00:10:00Z', status: 'closed',
};

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MemoryRouter>
        <SessionsPage />
      </MemoryRouter>
    </SWRConfig>
  );
}

beforeEach(() => jest.clearAllMocks());

describe('SessionsPage', () => {
  it('renders header and tabs', async () => {
    mockGetSessions.mockResolvedValue([]);
    await act(async () => { renderPage(); });

    expect(screen.getByText('Sessions')).toBeInTheDocument();
    expect(screen.getByText(/Open/)).toBeInTheDocument();
    expect(screen.getByText(/Closed/)).toBeInTheDocument();
  });

  it('displays sessions after fetch', async () => {
    mockGetSessions.mockResolvedValue([OPEN_SESSION, CLOSED_SESSION]);
    await act(async () => { renderPage(); });

    expect(screen.getByText('My Session')).toBeInTheDocument();
  });

  it('shows tab counts', async () => {
    mockGetSessions.mockResolvedValue([OPEN_SESSION, CLOSED_SESSION]);
    await act(async () => { renderPage(); });

    expect(screen.getByText('Open (1)')).toBeInTheDocument();
    expect(screen.getByText('Closed (1)')).toBeInTheDocument();
  });
});
