import { jest } from '@jest/globals';
import { mockServices } from '../../__tests__/mocks/services';
import { SESSION_A } from '../../__tests__/fixtures/sessions';

mockServices();

const storage = await import('../../services/storage/index.js');
const eventBus = await import('../../services/event-bus.js');
const webhook = await import('../../services/webhook/index.js');

const mockReadSessions = storage.readSessions as jest.MockedFunction<typeof storage.readSessions>;
const mockBroadcast = eventBus.broadcast as jest.MockedFunction<typeof eventBus.broadcast>;
const mockEmit = eventBus.emit as jest.MockedFunction<typeof eventBus.emit>;
const mockSseReply = eventBus.sseReply as jest.MockedFunction<typeof eventBus.sseReply>;
const mockHandleWebhookEvent = webhook.handleWebhookEvent as jest.MockedFunction<typeof webhook.handleWebhookEvent>;

const { default: Fastify } = await import('fastify');
const { registerEventRoutes } = await import('./events.js');

let server: ReturnType<typeof Fastify>;

beforeEach(async () => {
  jest.clearAllMocks();
  server = Fastify();
  registerEventRoutes(server);
  await server.ready();
});

afterEach(() => server.close());

describe('POST /api/notify', () => {
  it('broadcasts with enriched session name', async () => {
    mockReadSessions.mockResolvedValue([{ ...SESSION_A, customName: 'My App' }]);

    const res = await server.inject({
      method: 'POST',
      url: '/api/notify',
      payload: { sessionId: 'aaa', eventName: 'userPromptSubmit' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockBroadcast).toHaveBeenCalledWith('aaa', 'userPromptSubmit', 'My App');
    expect(mockHandleWebhookEvent).toHaveBeenCalled();
  });

  it('returns 400 when sessionId missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/notify',
      payload: { eventName: 'stop' },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/view', () => {
  it('resolves PID to session and emits navigate', async () => {
    mockReadSessions.mockResolvedValue([SESSION_A]);

    const res = await server.inject({
      method: 'POST',
      url: '/api/view',
      payload: { pid: 100 },
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.sessionId).toBe('aaa');
    expect(mockEmit).toHaveBeenCalledWith({ event: 'navigate', data: { sessionId: 'aaa' } });
  });

  it('returns 404 when PID not found', async () => {
    mockReadSessions.mockResolvedValue([]);

    const res = await server.inject({
      method: 'POST',
      url: '/api/view',
      payload: { pid: 999 },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/navigate', () => {
  it('emits navigate event with page', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/navigate',
      payload: { page: 'sessions' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith({ event: 'navigate', data: { page: 'sessions' } });
  });
});

describe('GET /api/events', () => {
  it('delegates to sseReply', async () => {
    await server.inject({ method: 'GET', url: '/api/events' });
    expect(mockSseReply).toHaveBeenCalled();
  });
});
