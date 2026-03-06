import { jest } from '@jest/globals';
import { mockServices } from '../../__tests__/mocks/services';
import { SESSION_A, SESSION_B } from '../../__tests__/fixtures/sessions';

mockServices();

const storage = await import('../../services/storage/index');
const logParser = await import('../../services/log-parser/index');
const eventBus = await import('../../services/event-bus');

const mockReadSessions = storage.readSessions as jest.MockedFunction<typeof storage.readSessions>;
const mockIsProcessRunning = storage.isProcessRunning as jest.MockedFunction<typeof storage.isProcessRunning>;
const mockGetDb = storage.getDb as jest.MockedFunction<typeof storage.getDb>;
const mockBuildTurnsFromSqlite = logParser.buildTurnsFromSqlite as jest.MockedFunction<typeof logParser.buildTurnsFromSqlite>;
const mockBroadcast = eventBus.broadcast as jest.MockedFunction<typeof eventBus.broadcast>;

const mockDb = {
  getSession: jest.fn(),
  getMessages: jest.fn().mockReturnValue([]),
  getToolCalls: jest.fn().mockReturnValue([]),
  updateSession: jest.fn(),
  deleteSession: jest.fn(),
};
mockGetDb.mockReturnValue(mockDb as any);

const { default: Fastify } = await import('fastify');
const { registerSessionRoutes } = await import('./sessions');

let server: ReturnType<typeof Fastify>;

beforeEach(async () => {
  jest.clearAllMocks();
  mockGetDb.mockReturnValue(mockDb as any);
  server = Fastify();
  registerSessionRoutes(server);
  await server.ready();
});

afterEach(() => server.close());

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
    mockDb.getSession.mockReturnValue({ id: 'aaa' });
    mockReadSessions.mockResolvedValue([SESSION_A]);
    mockIsProcessRunning.mockReturnValue(false);
    mockBuildTurnsFromSqlite.mockReturnValue([]);

    const res = await server.inject({ method: 'GET', url: '/api/sessions/aaa' });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.session.id).toBe('aaa');
    expect(body.session.status).toBe('closed');
    expect(body.turns).toEqual([]);
  });

  it('returns 404 for missing session', async () => {
    mockDb.getSession.mockReturnValue(null);
    const res = await server.inject({ method: 'GET', url: '/api/sessions/missing' });
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /api/sessions/:id', () => {
  it('updates customName via SQLite and returns updated session', async () => {
    mockDb.getSession.mockReturnValue({ id: 'aaa' });
    mockReadSessions.mockResolvedValue([{ ...SESSION_A, customName: 'renamed' }]);

    const res = await server.inject({
      method: 'PATCH',
      url: '/api/sessions/aaa',
      payload: { customName: 'renamed' },
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.customName).toBe('renamed');
    expect(mockDb.updateSession).toHaveBeenCalledWith('aaa', { custom_name: 'renamed' });
  });

  it('returns 404 for missing session', async () => {
    mockDb.getSession.mockReturnValue(null);
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/sessions/missing',
      payload: { customName: 'test' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when customName is not a string', async () => {
    mockDb.getSession.mockReturnValue({ id: 'aaa' });
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/sessions/aaa',
      payload: { customName: 123 },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/rename', () => {
  it('renames session by PID via SQLite', async () => {
    mockReadSessions.mockResolvedValue([{ ...SESSION_A }, { ...SESSION_B }]);

    const res = await server.inject({
      method: 'POST',
      url: '/api/rename',
      payload: { pid: 100, customName: 'new name' },
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(mockDb.updateSession).toHaveBeenCalledWith('aaa', { custom_name: 'new name' });
    expect(mockBroadcast).toHaveBeenCalledWith('aaa');
  });

  it('returns 404 when no session matches PID', async () => {
    mockReadSessions.mockResolvedValue([SESSION_A]);
    const res = await server.inject({
      method: 'POST',
      url: '/api/rename',
      payload: { pid: 999, customName: 'test' },
    });
    expect(res.statusCode).toBe(404);
  });

  test.each([
    ['pid missing', { customName: 'test' }],
    ['customName missing', { pid: 100 }],
  ])('returns 400 when %s', async (_label, payload) => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/rename',
      payload,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /api/sessions/:id', () => {
  it('deletes session from SQLite', async () => {
    mockDb.getSession.mockReturnValue({ id: 'aaa' });

    const res = await server.inject({ method: 'DELETE', url: '/api/sessions/aaa' });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockDb.deleteSession).toHaveBeenCalledWith('aaa');
    expect(mockBroadcast).toHaveBeenCalledWith('aaa');
  });

  it('returns 404 for missing session', async () => {
    mockDb.getSession.mockReturnValue(null);
    const res = await server.inject({ method: 'DELETE', url: '/api/sessions/missing' });
    expect(res.statusCode).toBe(404);
  });
});
