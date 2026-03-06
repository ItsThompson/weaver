import { jest } from '@jest/globals';
import { DEFAULT_CONFIG } from '@weaver/shared/types';

jest.unstable_mockModule('../services/config/index', () => ({
  readConfig: jest.fn(),
  parseAndValidateConfig: jest.fn(),
  writeConfig: jest.fn(),
}));

jest.unstable_mockModule('../services/event-bus', () => ({
  broadcast: jest.fn(),
  emit: jest.fn(),
  sseReply: jest.fn(),
}));

const configService = await import('../services/config/index');
const eventBus = await import('../services/event-bus');

const mockReadConfig = configService.readConfig as jest.MockedFunction<typeof configService.readConfig>;
const mockParseAndValidateConfig = configService.parseAndValidateConfig as jest.MockedFunction<typeof configService.parseAndValidateConfig>;
const mockWriteConfig = configService.writeConfig as jest.MockedFunction<typeof configService.writeConfig>;
const mockEmit = eventBus.emit as jest.MockedFunction<typeof eventBus.emit>;

const { default: Fastify } = await import('fastify');
const { registerConfigRoutes } = await import('./config');

let server: ReturnType<typeof Fastify>;

beforeEach(async () => {
  jest.clearAllMocks();
  mockWriteConfig.mockResolvedValue(undefined);
  server = Fastify();
  registerConfigRoutes(server);
  await server.ready();
});

afterEach(() => server.close());

describe('PUT /api/config', () => {
  it('emits configChanged SSE after successful write', async () => {
    const config = { ...DEFAULT_CONFIG, dark_mode: false };
    mockParseAndValidateConfig.mockReturnValue({ config, warnings: [] });

    const res = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: config,
    });

    expect(res.statusCode).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith({ event: 'configChanged', data: { ...config } });
  });

  it('does not emit SSE on validation failure', async () => {
    mockParseAndValidateConfig.mockReturnValue({ config: DEFAULT_CONFIG, warnings: ['bad field'] });

    const res = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: DEFAULT_CONFIG,
    });

    expect(res.statusCode).toBe(422);
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/config', () => {
  it('merges partial body with current config and returns merged result', async () => {
    const current = { ...DEFAULT_CONFIG, ghost_mode: false };
    const merged = { ...current, ghost_mode: true };
    mockReadConfig.mockResolvedValue({ config: current, warnings: [] });
    mockParseAndValidateConfig.mockReturnValue({ config: merged, warnings: [] });

    const res = await server.inject({
      method: 'PATCH',
      url: '/api/config',
      payload: { ghost_mode: true },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ config: merged });
    expect(mockWriteConfig).toHaveBeenCalledWith(merged);
  });

  it('emits configChanged SSE after successful write', async () => {
    const config = { ...DEFAULT_CONFIG, ghost_mode: true };
    mockReadConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    mockParseAndValidateConfig.mockReturnValue({ config, warnings: [] });

    await server.inject({
      method: 'PATCH',
      url: '/api/config',
      payload: { ghost_mode: true },
    });

    expect(mockEmit).toHaveBeenCalledWith({ event: 'configChanged', data: { ...config } });
  });

  it('returns 422 on validation failure', async () => {
    mockReadConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    mockParseAndValidateConfig.mockReturnValue({ config: DEFAULT_CONFIG, warnings: ['ghost_opacity must be a number between 0 and 1'] });

    const res = await server.inject({
      method: 'PATCH',
      url: '/api/config',
      payload: { ghost_opacity: 5 },
    });

    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body)).toEqual({ error: 'ghost_opacity must be a number between 0 and 1' });
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('returns current config unchanged when body is empty', async () => {
    mockReadConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    mockParseAndValidateConfig.mockReturnValue({ config: DEFAULT_CONFIG, warnings: [] });

    const res = await server.inject({
      method: 'PATCH',
      url: '/api/config',
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ config: DEFAULT_CONFIG });
  });
});
