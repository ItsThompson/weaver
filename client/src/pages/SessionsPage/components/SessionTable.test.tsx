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
}));

const { SessionTable } = await import('./SessionTable');

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

function renderTable(sessions = SESSIONS) {
  const columns = [
    { id: 'name', header: 'Name', cell: (item: any) => item.customName || item.id },
    { id: 'cwd', header: 'CWD', cell: (item: any) => item.cwd },
  ];
  const contentDisplayOptions = columns.map((c) => ({ id: c.id, label: c.header as string }));
  const defaultContentDisplay = columns.map((c) => ({ id: c.id, visible: true }));
  return render(
    <MemoryRouter>
      <SessionTable
        sessions={sessions}
        columnDefinitions={columns}
        contentDisplayOptions={contentDisplayOptions}
        defaultContentDisplay={defaultContentDisplay}
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
    
    expect(screen.getByText('No sessions')).toBeInTheDocument();
  });
});
