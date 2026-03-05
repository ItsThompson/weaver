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

const { buildWebhookPayload, dispatchWebhook, handleWebhookEvent, stopWebhookTimers } =
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

function configWith(url: string) {
  return { config: { ...DEFAULT_CONFIG, webhook_url: url }, warnings: [] };
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

describe('buildWebhookPayload', () => {
  it('returns null fields for agentSpawn', () => {
    const payload = buildWebhookPayload('sess-1', 'agentSpawn', 'starting', 'my-project', TEST_SESSION, []);
    expect(payload.prompt).toBeNull();
    expect(payload.tool_name).toBeNull();
    expect(payload.tool_input).toBeNull();
    expect(payload.event).toBe('agentSpawn');
    expect(payload.activity).toBe('starting');
    expect(payload.session_name).toBe('my-project');
    expect(payload.session_pid).toBe(111);
  });

  it('returns null fields for stop', () => {
    const payload = buildWebhookPayload('sess-1', 'stop', 'idle', 'my-project', TEST_SESSION, []);
    expect(payload.prompt).toBeNull();
    expect(payload.tool_name).toBeNull();
  });

  it('extracts prompt for userPromptSubmit', () => {
    const events = [makeEvent('userPromptSubmit', { prompt: 'fix the bug' })];
    const payload = buildWebhookPayload('sess-1', 'userPromptSubmit', 'processing', 'my-project', TEST_SESSION, events);
    expect(payload.prompt).toBe('fix the bug');
    expect(payload.tool_name).toBeNull();
  });

  it('extracts tool context for preToolUse with prompt from current turn', () => {
    const events = [
      makeEvent('userPromptSubmit', { prompt: 'add tests' }),
      makeEvent('preToolUse', { tool_name: 'fs_write', tool_input: { path: '/src/a.ts' } }),
    ];
    const payload = buildWebhookPayload('sess-1', 'preToolUse', 'running_tool', 'my-project', TEST_SESSION, events);
    expect(payload.prompt).toBe('add tests');
    expect(payload.tool_name).toBe('fs_write');
    expect(payload.tool_input).toBe(JSON.stringify({ path: '/src/a.ts' }));
  });

  it('extracts tool_response for postToolUse', () => {
    const events = [
      makeEvent('userPromptSubmit', { prompt: 'read file' }),
      makeEvent('preToolUse', { tool_name: 'fs_read', tool_input: { path: '/a' } }),
      makeEvent('postToolUse', {
        tool_name: 'fs_read',
        tool_input: { path: '/a' },
        tool_response: { success: true, result: ['content'] },
      }),
    ];
    const payload = buildWebhookPayload('sess-1', 'postToolUse', 'processing', 'my-project', TEST_SESSION, events);
    expect(payload.prompt).toBe('read file');
    expect(payload.tool_name).toBe('fs_read');
    expect(payload.tool_response).toBe(JSON.stringify({ success: true, result: ['content'] }));
  });

  it('uses most recent userPromptSubmit for prompt', () => {
    const events = [
      makeEvent('userPromptSubmit', { prompt: 'first prompt' }),
      makeEvent('stop'),
      makeEvent('userPromptSubmit', { prompt: 'second prompt' }),
      makeEvent('preToolUse', { tool_name: 'grep', tool_input: { pattern: 'x' } }),
    ];
    const payload = buildWebhookPayload('sess-1', 'preToolUse', 'running_tool', 'my-project', TEST_SESSION, events);
    expect(payload.prompt).toBe('second prompt');
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

  it('dispatches webhook for normal events', async () => {
    mockParseLogFile.mockResolvedValue([makeEvent('agentSpawn')]);
    await handleWebhookEvent('sess-1', 'agentSpawn', 'my-project', TEST_SESSION);
    expect(mockFetch).toHaveBeenCalledTimes(1);
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
    const pendingCall = JSON.parse((mockFetch.mock.calls[1] as any)[1].body);
    expect(pendingCall.activity).toBe('pending_approval');
    expect(pendingCall.event).toBe('preToolUse');
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
