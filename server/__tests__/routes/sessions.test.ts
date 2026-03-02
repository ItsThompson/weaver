import { jest } from '@jest/globals';

// Mock storage and log-parser before importing routes
jest.unstable_mockModule('../../src/services/storage.js', () => ({
  readSessions: jest.fn(),
  writeSessions: jest.fn(),
  isProcessRunning: jest.fn(),
  ensureDataDir: jest.fn(),
  appendSession: jest.fn(),
  startStaleSessionCleanup: jest.fn(),
  stopStaleSessionCleanup: jest.fn(),
  cleanStaleSessions: jest.fn(),
}));

jest.unstable_mockModule('../../src/services/log-parser.js', () => ({
  parseLogFile: jest.fn(),
  groupEventsByTurn: jest.fn(),
}));

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  log: jest.fn(),
}));

const storage = await import('../../src/services/storage.js');
const logParser = await import('../../src/services/log-parser.js');

const mockReadSessions = storage.readSessions as jest.MockedFunction<typeof storage.readSessions>;
const mockWriteSessions = storage.writeSessions as jest.MockedFunction<typeof storage.writeSessions>;
const mockIsProcessRunning = storage.isProcessRunning as jest.MockedFunction<typeof storage.isProcessRunning>;
const mockParseLogFile = logParser.parseLogFile as jest.MockedFunction<typeof logParser.parseLogFile>;
const mockGroupEventsByTurn = logParser.groupEventsByTurn as jest.MockedFunction<typeof logParser.groupEventsByTurn>;

// Dynamically import Fastify and register routes after mocks
const { default: Fastify } = await import('fastify');
const { registerSessionRoutes } = await import('../../src/routes/sessions.js');

let server: ReturnType<typeof Fastify>;

beforeEach(async () => {
  jest.clearAllMocks();
  server = Fastify();
  registerSessionRoutes(server);
  await server.ready();
});

afterEach(() => server.close());

const SESSION_A = { id: 'aaa', pid: 100, customName: null, cwd: '/tmp', agentName: null, startTime: '2026-01-02T00:00:00Z', lastEventTime: '2026-01-02T00:01:00Z' };
const SESSION_B = { id: 'bbb', pid: 200, customName: 'my session', cwd: '/home', agentName: 'dev', startTime: '2026-01-01T00:00:00Z', lastEventTime: '2026-01-01T00:05:00Z' };

describe('GET /api/sessions', () => {
  it('returns sessions sorted by startTime descending with computed status', async () => {
    mockReadSessions.mockResolvedValue([SESSION_B, SESSION_A]);
    mockIsProcessRunning.mockImplementation((pid) => pid === 100);

    const res = await server.inject({ method: 'GET', url: '/api/sessions' });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe('aaa');
    expect(body[0].status).toBe('open');
    expect(body[1].id).toBe('bbb');
    expect(body[1].status).toBe('closed');
  });
});

describe('GET /api/sessions/:id', () => {
  it('returns session with turns', async () => {
    mockReadSessions.mockResolvedValue([SESSION_A]);
    mockIsProcessRunning.mockReturnValue(false);
    mockParseLogFile.mockResolvedValue([]);
    mockGroupEventsByTurn.mockReturnValue([]);

    const res = await server.inject({ method: 'GET', url: '/api/sessions/aaa' });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.session.id).toBe('aaa');
    expect(body.session.status).toBe('closed');
    expect(body.turns).toEqual([]);
  });

  it('returns 404 for missing session', async () => {
    mockReadSessions.mockResolvedValue([]);
    const res = await server.inject({ method: 'GET', url: '/api/sessions/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /api/sessions/:id', () => {
  it('updates customName and persists', async () => {
    mockReadSessions.mockResolvedValue([{ ...SESSION_A }]);
    mockWriteSessions.mockResolvedValue(undefined as never);

    const res = await server.inject({
      method: 'PATCH',
      url: '/api/sessions/aaa',
      payload: { customName: 'renamed' },
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.customName).toBe('renamed');
    expect(mockWriteSessions).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ customName: 'renamed' })]),
    );
  });

  it('returns 404 for missing session', async () => {
    mockReadSessions.mockResolvedValue([]);
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/sessions/missing',
      payload: { customName: 'test' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when customName is not a string', async () => {
    mockReadSessions.mockResolvedValue([SESSION_A]);
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/sessions/aaa',
      payload: { customName: 123 },
    });
    expect(res.statusCode).toBe(400);
  });
});
