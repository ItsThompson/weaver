import { jest } from '@jest/globals';
import { mockFsModules } from '../../__tests__/mocks/fs';
import { mockServices } from '../../__tests__/mocks/services';
import { SESSION_A } from '../../__tests__/fixtures/sessions';

mockFsModules();
mockServices();

const fsp = await import('node:fs/promises');
const fs = await import('node:fs');
const storage = await import('../../services/storage/index.js');

const mockReadFile = fsp.readFile as jest.MockedFunction<typeof fsp.readFile>;
const mockWriteFile = fsp.writeFile as jest.MockedFunction<typeof fsp.writeFile>;
const mockAppendFile = fsp.appendFile as jest.MockedFunction<typeof fsp.appendFile>;
const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockReadSessions = storage.readSessions as jest.MockedFunction<typeof storage.readSessions>;
const mockWriteSessions = storage.writeSessions as jest.MockedFunction<typeof storage.writeSessions>;

const { default: Fastify } = await import('fastify');
const { registerOrphanRoutes } = await import('./orphans.js');

let server: ReturnType<typeof Fastify>;

beforeEach(async () => {
  jest.clearAllMocks();
  server = Fastify();
  registerOrphanRoutes(server);
  await server.ready();
});

afterEach(() => server.close());

const orphanLine = (pid: number, eventName = 'userPromptSubmit') =>
  JSON.stringify({ timestamp: '2026-01-01T00:00:00Z', pid, event: { hook_event_name: eventName, cwd: '/tmp' } });

describe('GET /api/orphans', () => {
  it('returns grouped orphan events', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(`${orphanLine(100)}\n${orphanLine(100)}\n${orphanLine(200)}\n`);

    const res = await server.inject({ method: 'GET', url: '/api/orphans' });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.groups).toHaveLength(2);
    expect(body.groups.find((g: any) => g.pid === 100).eventCount).toBe(2);
    expect(body.groups.find((g: any) => g.pid === 200).eventCount).toBe(1);
  });

  it('returns empty groups when no orphan file', async () => {
    mockExistsSync.mockReturnValue(false);

    const res = await server.inject({ method: 'GET', url: '/api/orphans' });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.groups).toEqual([]);
  });
});

describe('POST /api/orphans/assign', () => {
  it('moves events to target session log', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(`${orphanLine(100)}\n${orphanLine(200)}\n`);
    mockReadSessions.mockResolvedValue([{ ...SESSION_A }]);

    const res = await server.inject({
      method: 'POST',
      url: '/api/orphans/assign',
      payload: { targetSessionId: 'aaa', pid: 100 },
    });

    expect(res.statusCode).toBe(200);
    expect(mockAppendFile).toHaveBeenCalledWith(
      expect.stringContaining('aaa.jsonl'),
      expect.any(String),
    );
    // Orphan file rewritten without the assigned events
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('orphan.jsonl'),
      expect.stringContaining('"pid":200'),
    );
  });

  it('returns 404 when target session missing', async () => {
    mockReadSessions.mockResolvedValue([]);

    const res = await server.inject({
      method: 'POST',
      url: '/api/orphans/assign',
      payload: { targetSessionId: 'missing', pid: 100 },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/orphans/:pid', () => {
  it('removes orphan events for PID', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(`${orphanLine(100)}\n${orphanLine(200)}\n`);

    const res = await server.inject({ method: 'DELETE', url: '/api/orphans/100' });

    expect(res.statusCode).toBe(200);
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('orphan.jsonl'),
      expect.stringContaining('"pid":200'),
    );
  });

  it('returns 404 when no events for PID', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(`${orphanLine(200)}\n`);

    const res = await server.inject({ method: 'DELETE', url: '/api/orphans/999' });

    expect(res.statusCode).toBe(404);
  });
});
