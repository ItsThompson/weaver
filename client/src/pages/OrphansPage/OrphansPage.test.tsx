import { jest } from '@jest/globals';
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';

jest.unstable_mockModule('../../utils/api', () => ({
  apiFetch: jest.fn(),
  getSessions: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  getSession: jest.fn(),
  updateSessionName: jest.fn(),
  getOrphanCount: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 0 }),
  getOrphans: jest.fn(),
  assignOrphans: jest.fn<() => Promise<{ ok: true }>>(),
  deleteOrphans: jest.fn<() => Promise<{ ok: true }>>(),
  getConfig: jest.fn<() => Promise<{ config: object; warnings: string[] }>>().mockResolvedValue({ config: {}, warnings: [] }),
  updateConfig: jest.fn(),
}));

const api = await import('../../utils/api');
const { OrphansPage } = await import('./OrphansPage');

const mockGetOrphans = api.getOrphans as jest.MockedFunction<typeof api.getOrphans>;
const mockDeleteOrphans = api.deleteOrphans as jest.MockedFunction<typeof api.deleteOrphans>;

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MemoryRouter>
        <OrphansPage />
      </MemoryRouter>
    </SWRConfig>,
  );
}

beforeEach(() => jest.clearAllMocks());

describe('OrphansPage', () => {
  it('renders empty state when no orphans', async () => {
    mockGetOrphans.mockResolvedValue({ groups: [] });
    await act(async () => { renderPage(); });

    expect(screen.getByText('Orphaned Events')).toBeInTheDocument();
    expect(screen.getByText('No orphaned events')).toBeInTheDocument();
  });

  it('renders orphan groups', async () => {
    mockGetOrphans.mockResolvedValue({
      groups: [{
        pid: 100,
        turns: [],
        eventCount: 3,
        timeRange: { start: '2026-01-01T00:00:00Z', end: '2026-01-01T01:00:00Z' },
      }],
    });
    await act(async () => { renderPage(); });

    expect(screen.getByText('PID 100')).toBeInTheDocument();
    expect(screen.getByText('3 events')).toBeInTheDocument();
  });

  it('delete action calls API and refreshes', async () => {
    mockGetOrphans.mockResolvedValue({
      groups: [{
        pid: 100,
        turns: [],
        eventCount: 2,
        timeRange: { start: '2026-01-01T00:00:00Z', end: '2026-01-01T01:00:00Z' },
      }],
    });
    mockDeleteOrphans.mockResolvedValue({ ok: true });

    await act(async () => { renderPage(); });

    // Click Delete on the group
    const deleteBtns = screen.getAllByText('Delete');
    await act(async () => { fireEvent.click(deleteBtns[0]); });

    // Confirm in the modal
    const confirmBtns = screen.getAllByText('Delete');
    await act(async () => { fireEvent.click(confirmBtns[confirmBtns.length - 1]); });

    expect(mockDeleteOrphans).toHaveBeenCalledWith(100);
  });
});
