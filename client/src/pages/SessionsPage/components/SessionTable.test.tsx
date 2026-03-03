import { jest } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import type { SessionWithStatus } from '@weaver/shared/types';

jest.unstable_mockModule('../../../utils/api', () => ({
  apiFetch: jest.fn(),
  getSessions: jest.fn(),
  getSession: jest.fn(),
  updateSessionName: jest.fn(),
  getOrphanCount: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 0 }),
  getOrphans: jest.fn(),
  assignOrphans: jest.fn(),
  getConfig: jest.fn<() => Promise<{ config: object; warnings: string[] }>>().mockResolvedValue({ config: {}, warnings: [] }),
  updateConfig: jest.fn(),
}));

const { SessionTable } = await import('./SessionTable');

function makeSession(index: number): SessionWithStatus {
  return {
    id: `session-${index}`,
    pid: 100 + index,
    customName: `Session ${index}`,
    cwd: `/projects/project-${index}`,
    agentName: 'dev',
    startTime: `2026-01-01T00:${String(index).padStart(2, '0')}:00Z`,
    lastEventTime: `2026-01-01T00:${String(index).padStart(2, '0')}:00Z`,
    status: 'open',
  };
}

const SESSIONS: SessionWithStatus[] = [
  {
    id: 'session-1', pid: 100, customName: 'Frontend App', cwd: '/projects/frontend',
    agentName: 'dev', startTime: '2026-01-02T00:00:00Z', lastEventTime: '2026-01-02T00:05:00Z', status: 'open',
  },
  {
    id: 'session-2', pid: 200, customName: null, cwd: '/projects/backend',
    agentName: null, startTime: '2026-01-01T00:00:00Z', lastEventTime: '2026-01-01T00:10:00Z', status: 'closed',
  },
];

const COLUMNS = [
  { id: 'name', header: 'Name', cell: (item: any) => item.customName || item.id },
  { id: 'cwd', header: 'CWD', cell: (item: any) => item.cwd },
];

function renderTable(sessions = SESSIONS) {
  const contentDisplayOptions = COLUMNS.map((c) => ({ id: c.id, label: c.header as string }));
  const defaultContentDisplay = COLUMNS.map((c) => ({ id: c.id, visible: true }));
  return render(
    <MemoryRouter>
      <SessionTable
        sessions={sessions}
        columnDefinitions={COLUMNS}
        contentDisplayOptions={contentDisplayOptions}
        defaultContentDisplay={defaultContentDisplay}
        configKey="open_display_options"
      />
    </MemoryRouter>
  );
}

describe('SessionTable', () => {
  it('displays all sessions by default', () => {
    renderTable();
    expect(screen.getByText('Frontend App')).toBeInTheDocument();
    expect(screen.getByText('/projects/backend')).toBeInTheDocument();
  });

  it('filters by custom name', () => {
    renderTable();
    const filter = screen.getByRole('textbox');
    fireEvent.change(filter, { target: { value: 'Frontend' } });
    
    expect(screen.getByText('Frontend App')).toBeInTheDocument();
    expect(screen.queryByText('/projects/backend')).not.toBeInTheDocument();
  });

  it('filters by cwd', () => {
    renderTable();
    const filter = screen.getByRole('textbox');
    fireEvent.change(filter, { target: { value: 'backend' } });
    
    expect(screen.queryByText('Frontend App')).not.toBeInTheDocument();
    expect(screen.getByText('/projects/backend')).toBeInTheDocument();
  });

  it('filters by session id', () => {
    renderTable();
    const filter = screen.getByRole('textbox');
    fireEvent.change(filter, { target: { value: 'session-1' } });
    
    expect(screen.getByText('Frontend App')).toBeInTheDocument();
    expect(screen.queryByText('/projects/backend')).not.toBeInTheDocument();
  });

  it('shows empty state when no sessions match filter', () => {
    renderTable();
    const filter = screen.getByRole('textbox');
    fireEvent.change(filter, { target: { value: 'nonexistent' } });
    
    expect(screen.getByText('No matching sessions')).toBeInTheDocument();
  });

  describe('pagination', () => {
    const manySessions = Array.from({ length: 30 }, (_, i) => makeSession(i + 1));

    it('limits first page to 25 items', () => {
      renderTable(manySessions);
      expect(screen.getByText('Session 1')).toBeInTheDocument();
      expect(screen.getByText('Session 25')).toBeInTheDocument();
      expect(screen.queryByText('Session 26')).not.toBeInTheDocument();
    });

    it('shows all items when under page size', () => {
      renderTable(SESSIONS);
      expect(screen.getByText('Frontend App')).toBeInTheDocument();
      expect(screen.getByText('/projects/backend')).toBeInTheDocument();
    });
  });
});
