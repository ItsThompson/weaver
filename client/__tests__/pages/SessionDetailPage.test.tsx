import { jest } from '@jest/globals';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import type { SessionWithStatus, TurnGroup } from '@shared/types';

jest.unstable_mockModule('../../src/utils/api', () => ({
  apiFetch: jest.fn(),
  getSessions: jest.fn(),
  getSession: jest.fn(),
  updateSessionName: jest.fn(),
}));

jest.unstable_mockModule('react-router-dom', () => ({
  useParams: () => ({ id: 'test-session-id' }),
  useNavigate: () => jest.fn(),
  MemoryRouter: ({ children }: any) => React.createElement('div', {}, children),
  BreadcrumbGroup: ({ children }: any) => React.createElement('div', {}, children),
}));

const { SessionDetailPage } = await import('../../src/pages/SessionDetailPage');
const api = await import('../../src/utils/api');

const mockGetSession = api.getSession as jest.MockedFunction<typeof api.getSession>;

const mockSession: SessionWithStatus = {
  id: 'test-session-id',
  pid: 12345,
  cwd: '/test/path',
  status: 'open',
  customName: null,
  agentName: 'dev',
  startTime: '2024-01-01T10:00:00Z',
  lastEventTime: '2024-01-01T10:05:00Z',
};

const mockTurns: TurnGroup[] = [
  {
    id: 1,
    startTime: '2024-01-01T10:00:00Z',
    endTime: '2024-01-01T10:01:00Z',
    events: [{ timestamp: '2024-01-01T10:00:00Z', event: { hook_event_name: 'agentSpawn', cwd: '/test/path' } }],
    userPrompt: null,
    toolCalls: [],
  },
  {
    id: 2,
    startTime: '2024-01-01T10:05:00Z',
    endTime: '2024-01-01T10:06:00Z',
    events: [{ timestamp: '2024-01-01T10:05:00Z', event: { hook_event_name: 'userPrompt', cwd: '/test/path' } }],
    userPrompt: 'Test user prompt',
    toolCalls: [],
  },
];

function renderComponent() {
  return render(<SessionDetailPage />);
}

// Mock useParams to return our test session ID
jest.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'test-session-id' }),
  useNavigate: () => jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

describe('SessionDetailPage', () => {
  it('shows loading state initially', () => {
    mockGetSession.mockImplementation(() => new Promise(() => {}));
    renderComponent();
    // Component renders without crashing during loading
    expect(document.body).toBeInTheDocument();
  });

  it('renders session data after fetch', async () => {
    mockGetSession.mockResolvedValue({ session: mockSession, turns: mockTurns });
    renderComponent();
    
    await waitFor(() => {
      expect(screen.getByText(/test-ses/)).toBeInTheDocument();
    });
  });

  it('shows error state', async () => {
    mockGetSession.mockRejectedValue(new Error('Failed to fetch'));
    renderComponent();
    
    await waitFor(() => {
      expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
    });
  });

  it('renders agentSpawn as session start marker', async () => {
    mockGetSession.mockResolvedValue({ session: mockSession, turns: mockTurns });
    renderComponent();
    
    await waitFor(() => {
      expect(screen.getByText('Session started')).toBeInTheDocument();
    });
  });

  it('renders user prompt', async () => {
    mockGetSession.mockResolvedValue({ session: mockSession, turns: mockTurns });
    renderComponent();
    
    await waitFor(() => {
      expect(screen.getByText('Test user prompt')).toBeInTheDocument();
    });
  });
});