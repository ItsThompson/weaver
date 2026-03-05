import { jest } from '@jest/globals';
import type { HookEvent, Session, WeaverConfig } from '@weaver/shared/types';
import { DEFAULT_CONFIG, PENDING_APPROVAL_THRESHOLD_MS } from '@weaver/shared/types';

const mockReadConfig = jest.fn<() => Promise<{ config: WeaverConfig; warnings: string[] }>>();
const mockParseLogFile = jest.fn<() => Promise<HookEvent[]>>();
const mockDeriveActivity = jest.fn<(name: string) => string>();
const mockLog = jest.fn();
const mockFetch = jest.fn<() => Promise<Response>>();

jest.unstable_mockModule('./config.js', () => ({ readConfig: mockReadConfig }));
jest.unstable_mockModule('./log-parser.js', () => ({
  parseLogFile: mockParseLogFile,
  deriveActivity: mockDeriveActivity,
}));
jest.unstable_mockModule('../utils/logger.js', () => ({ log: mockLog }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
globalThis.fetch = mockFetch as any;

const { buildWebhookPayload, buildSimpleWebhookPayload, dispatchWebhook, handleWebhookEvent, stopWebhookTimers } =
  await import('./webhook.js');

const TEST_SESSION: Session = {
  id: 'sess-1',
  pid: 111,
  customName: 'my-project',
  cwd: '/Users/me/project',
  agentName: null,
  startTime: '2026-01-01T00:00:00Z',
  lastEventTime: '2026-01-01T00:01:00Z',
};

function makeEvent(name: string, extra: Record<string, unknown> = {}): HookEvent {
  return { timestamp: '2026-01-01T00:00:00Z', event: { hook_event_name: name, cwd: '/tmp', ...extra } };
}

function configWith(url: string, format: 'simple' | 'advanced' = 'simple') {
  return { config: { ...DEFAULT_CONFIG, webhook_url: url, webhook_format: format }, warnings: [] };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockFetch.mockResolvedValue(new Response('ok'));
  mockReadConfig.mockResolvedValue(configWith('https://hooks.example.com'));
  mockParseLogFile.mockResolvedValue([]);
  mockDeriveActivity.mockImplementation((name: string) => {
    if (name === 'agentSpawn') return 'starting';
    if (name === 'stop') return 'idle';
    if (name === 'preToolUse') return 'running_tool';
    return 'processing';
  });
  stopWebhookTimers();
});

afterEach(() => {
  jest.useRealTimers();
  stopWebhookTimers();
});

describe('buildWebhookPayload (advanced)', () => {
  it('returns null fields for agentSpawn', () => {
    const payload = buildWebhookPayload('sess-1', 'agentSpawn', 'starting', 'my-project', TEST_SESSION, []);
    expect(payload.prompt).toBeNull();
    expect(payload.tool_name).toBeNull();
    expect(payload.session_name).toBe('my-project');
    expect(payload.session_pid).toBe(111);
  });

  it('extracts prompt for userPromptSubmit', () => {
    const events = [makeEvent('userPromptSubmit', { prompt: 'fix the bug' })];
    const payload = buildWebhookPayload('sess-1', 'userPromptSubmit', 'processing', 'my-project', TEST_SESSION, events);
    expect(payload.prompt).toBe('fix the bug');
    expect(payload.tool_name).toBeNull();
  });

  it('extracts tool context for preToolUse', () => {
    const events = [
      makeEvent('userPromptSubmit', { prompt: 'add tests' }),
      makeEvent('preToolUse', { tool_name: 'fs_write', tool_input: { path: '/src/a.ts' } }),
    ];
    const payload = buildWebhookPayload('sess-1', 'preToolUse', 'running_tool', 'my-project', TEST_SESSION, events);
    expect(payload.prompt).toBe('add tests');
    expect(payload.tool_name).toBe('fs_write');
    expect(payload.tool_input).toBe(JSON.stringify({ path: '/src/a.ts' }));
  });

  it('stringifies tool_response for postToolUse', () => {
    const events = [
      makeEvent('userPromptSubmit', { prompt: 'read file' }),
      makeEvent('postToolUse', { tool_name: 'fs_read', tool_input: { path: '/a' }, tool_response: { success: true, result: ['ok'] } }),
    ];
    const payload = buildWebhookPayload('sess-1', 'postToolUse', 'processing', 'my-project', TEST_SESSION, events);
    expect(payload.tool_response).toBe(JSON.stringify({ success: true, result: ['ok'] }));
  });

  it('produces a flat payload with no nested objects', () => {
    const events = [
      makeEvent('userPromptSubmit', { prompt: 'test' }),
      makeEvent('preToolUse', { tool_name: 'fs_write', tool_input: { path: '/a' } }),
    ];
    const payload = buildWebhookPayload('sess-1', 'preToolUse', 'running_tool', 'my-project', TEST_SESSION, events);
    for (const value of Object.values(payload)) {
      expect(value === null || typeof value !== 'object').toBe(true);
    }
  });
});

describe('buildSimpleWebhookPayload', () => {
  it('formats agentSpawn', () => {
    const { text } = buildSimpleWebhookPayload('agentSpawn', 'starting', 'my-project', []);
    expect(text).toBe('🟢 my-project started');
  });

  it('formats stop', () => {
    const { text } = buildSimpleWebhookPayload('stop', 'idle', 'my-project', []);
    expect(text).toBe('⚫ my-project idle');
  });

  it('formats userPromptSubmit with prompt', () => {
    const events = [makeEvent('userPromptSubmit', { prompt: 'fix the bug' })];
    const { text } = buildSimpleWebhookPayload('userPromptSubmit', 'processing', 'my-project', events);
    expect(text).toBe('💬 my-project ── fix the bug');
  });

  it('formats preToolUse with tool name and input summary', () => {
    const events = [
      makeEvent('userPromptSubmit', { prompt: 'test' }),
      makeEvent('preToolUse', { tool_name: 'fs_write', tool_input: { path: '/src/upload.ts' } }),
    ];
    const { text } = buildSimpleWebhookPayload('preToolUse', 'running_tool', 'my-project', events);
    expect(text).toBe('🔧 my-project ── fs_write ── /src/upload.ts');
  });

  it('formats postToolUse', () => {
    const events = [
      makeEvent('userPromptSubmit', { prompt: 'test' }),
      makeEvent('postToolUse', { tool_name: 'execute_bash', tool_input: { command: 'npm test' } }),
    ];
    const { text } = buildSimpleWebhookPayload('postToolUse', 'processing', 'my-project', events);
    expect(text).toBe('✅ my-project ── execute_bash ── npm test');
  });

  it('formats pending_approval with prompt', () => {
    const events = [
      makeEvent('userPromptSubmit', { prompt: 'add error handling' }),
      makeEvent('preToolUse', { tool_name: 'fs_write', tool_input: { path: '/src/upload.ts' } }),
    ];
    const { text } = buildSimpleWebhookPayload('preToolUse', 'pending_approval', 'my-project', events);
    expect(text).toContain('⏳ my-project ── fs_write ── /src/upload.ts waiting for approval');
    expect(text).toContain('💬 add error handling');
  });

  it('returns only text field', () => {
    const payload = buildSimpleWebhookPayload('stop', 'idle', 'my-project', []);
    expect(Object.keys(payload)).toEqual(['text']);
  });
});

describe('dispatchWebhook', () => {
  const payload = buildWebhookPayload('sess-1', 'stop', 'idle', 'test', TEST_SESSION, []);

  it('sends POST with correct headers and body', async () => {
    await dispatchWebhook('https://hooks.example.com', payload);
    expect(mockFetch).toHaveBeenCalledWith('https://hooks.example.com', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }));
  });

  it('logs and swallows fetch errors', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));
    await dispatchWebhook('https://hooks.example.com', payload);
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({ event: 'webhook_error' }));
  });
});

describe('handleWebhookEvent', () => {
  it('skips dispatch when webhook_url is empty', async () => {
    mockReadConfig.mockResolvedValue(configWith(''));
    await handleWebhookEvent('sess-1', 'agentSpawn', 'my-project', TEST_SESSION);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('skips dispatch when eventName is undefined', async () => {
    await handleWebhookEvent('sess-1', undefined, 'my-project', TEST_SESSION);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('dispatches simple format by default', async () => {
    mockParseLogFile.mockResolvedValue([makeEvent('agentSpawn')]);
    await handleWebhookEvent('sess-1', 'agentSpawn', 'my-project', TEST_SESSION);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
    expect(body).toEqual({ text: '🟢 my-project started' });
  });

  it('dispatches advanced format when configured', async () => {
    mockReadConfig.mockResolvedValue(configWith('https://hooks.example.com', 'advanced'));
    mockParseLogFile.mockResolvedValue([makeEvent('agentSpawn')]);
    await handleWebhookEvent('sess-1', 'agentSpawn', 'my-project', TEST_SESSION);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
    expect(body.event).toBe('agentSpawn');
    expect(body.source).toBe('weaver');
  });

  it('fires pending_approval webhook after threshold on preToolUse', async () => {
    const events = [
      makeEvent('userPromptSubmit', { prompt: 'do it' }),
      makeEvent('preToolUse', { tool_name: 'fs_write', tool_input: { path: '/a' } }),
    ];
    mockParseLogFile.mockResolvedValue(events);

    await handleWebhookEvent('sess-1', 'preToolUse', 'my-project', TEST_SESSION);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(PENDING_APPROVAL_THRESHOLD_MS);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pendingBody = JSON.parse((mockFetch.mock.calls[1] as any)[1].body);
    expect(pendingBody.text).toContain('⏳');
    expect(pendingBody.text).toContain('waiting for approval');
  });

  it('cancels pending timer on postToolUse', async () => {
    mockParseLogFile.mockResolvedValue([makeEvent('preToolUse', { tool_name: 'fs_write', tool_input: {} })]);
    await handleWebhookEvent('sess-1', 'preToolUse', 'my-project', TEST_SESSION);

    mockParseLogFile.mockResolvedValue([makeEvent('postToolUse', { tool_name: 'fs_write', tool_input: {} })]);
    await handleWebhookEvent('sess-1', 'postToolUse', 'my-project', TEST_SESSION);

    await jest.advanceTimersByTimeAsync(PENDING_APPROVAL_THRESHOLD_MS);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('cancels pending timer on stop', async () => {
    mockParseLogFile.mockResolvedValue([makeEvent('preToolUse', { tool_name: 'fs_write', tool_input: {} })]);
    await handleWebhookEvent('sess-1', 'preToolUse', 'my-project', TEST_SESSION);

    mockParseLogFile.mockResolvedValue([makeEvent('stop')]);
    await handleWebhookEvent('sess-1', 'stop', 'my-project', TEST_SESSION);

    await jest.advanceTimersByTimeAsync(PENDING_APPROVAL_THRESHOLD_MS);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
