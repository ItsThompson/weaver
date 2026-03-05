import { jest } from '@jest/globals';
import { mockServices } from '../../__tests__/mocks/services';
import { SESSION_A, SESSION_B } from '../../__tests__/fixtures/sessions';

mockServices();

const storage = await import('../../services/storage/index');
const logParser = await import('../../services/log-parser/index');
const eventBus = await import('../../services/event-bus');

const mockReadSessions = storage.readSessions as jest.MockedFunction<typeof storage.readSessions>;
const mockWriteSessions = storage.writeSessions as jest.MockedFunction<typeof storage.writeSessions>;
const mockIsProcessRunning = storage.isProcessRunning as jest.MockedFunction<typeof storage.isProcessRunning>;
const mockParseLogFile = logParser.parseLogFile as jest.MockedFunction<typeof logParser.parseLogFile>;
const mockGroupEventsByTurn = logParser.groupEventsByTurn as jest.MockedFunction<typeof logParser.groupEventsByTurn>;
const mockBroadcast = eventBus.broadcast as jest.MockedFunction<typeof eventBus.broadcast>;

const { default: Fastify } = await import('fastify');
const { registerSessionRoutes } = await import('./sessions');

let server: ReturnType<typeof Fastify>;

beforeEach(async () => {
  jest.clearAllMocks();
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

describe('POST /api/rename', () => {
  it('renames session by PID and persists', async () => {
    mockReadSessions.mockResolvedValue([{ ...SESSION_A }, { ...SESSION_B }]);
    mockWriteSessions.mockResolvedValue(undefined as never);

    const res = await server.inject({
      method: 'POST',
      url: '/api/rename',
      payload: { pid: 100, customName: 'new name' },
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.customName).toBe('new name');
    expect(mockWriteSessions).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'aaa', customName: 'new name' })]),
    );
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
