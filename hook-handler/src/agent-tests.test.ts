import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('node:fs', () => ({
  readFileSync: jest.fn<() => string>(),
  existsSync: jest.fn<() => boolean>(),
}));

const fs = await import('node:fs');
const { extractAgentTestedDirs } = await import('./agent-tests');

const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;

const DEFAULT_RUNNERS = ['jest', 'vitest', 'mocha', 'pytest', 'rspec', 'cargo test', 'npm test', 'npx test', 'bundle exec rspec'];

function makeEvent(hook_event_name: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ timestamp: '2026-01-01T00:00:00Z', event: { hook_event_name, cwd: '/project', ...extra } });
}

beforeEach(() => { jest.clearAllMocks(); });

describe('extractAgentTestedDirs', () => {
  it('detects npx jest with directory arg', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue([
      makeEvent('userPromptSubmit', { prompt: 'go' }),
      makeEvent('postToolUse', { tool_name: 'execute_bash', tool_input: { command: 'npx jest src/features/auth/' } }),
    ].join('\n'));

    expect(extractAgentTestedDirs('/log.jsonl', '/project', DEFAULT_RUNNERS)).toEqual(['src/features/auth']);
  });

  it('detects npm test as CWD', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue([
      makeEvent('userPromptSubmit', { prompt: 'go' }),
      makeEvent('postToolUse', { tool_name: 'execute_bash', tool_input: { command: 'npm test' } }),
    ].join('\n'));

    expect(extractAgentTestedDirs('/log.jsonl', '/project', DEFAULT_RUNNERS)).toEqual(['.']);
  });

  it('detects vitest run with directory arg', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue([
      makeEvent('userPromptSubmit', { prompt: 'go' }),
      makeEvent('postToolUse', { tool_name: 'execute_bash', tool_input: { command: 'vitest run src/' } }),
    ].join('\n'));

    expect(extractAgentTestedDirs('/log.jsonl', '/project', DEFAULT_RUNNERS)).toEqual(['src']);
  });

  it('detects pytest with directory arg', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue([
      makeEvent('userPromptSubmit', { prompt: 'go' }),
      makeEvent('postToolUse', { tool_name: 'execute_bash', tool_input: { command: 'pytest tests/' } }),
    ].join('\n'));

    expect(extractAgentTestedDirs('/log.jsonl', '/project', DEFAULT_RUNNERS)).toEqual(['tests']);
  });

  it('detects cargo test as CWD', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue([
      makeEvent('userPromptSubmit', { prompt: 'go' }),
      makeEvent('postToolUse', { tool_name: 'execute_bash', tool_input: { command: 'cargo test' } }),
    ].join('\n'));

    expect(extractAgentTestedDirs('/log.jsonl', '/project', DEFAULT_RUNNERS)).toEqual(['.']);
  });

  it('detects rspec with directory arg', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue([
      makeEvent('userPromptSubmit', { prompt: 'go' }),
      makeEvent('postToolUse', { tool_name: 'execute_bash', tool_input: { command: 'bundle exec rspec spec/models/order/' } }),
    ].join('\n'));

    expect(extractAgentTestedDirs('/log.jsonl', '/project', DEFAULT_RUNNERS)).toEqual(['spec/models/order']);
  });

  it('detects custom test runner from config', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue([
      makeEvent('userPromptSubmit', { prompt: 'go' }),
      makeEvent('postToolUse', { tool_name: 'execute_bash', tool_input: { command: 'mix test test/models/' } }),
    ].join('\n'));

    expect(extractAgentTestedDirs('/log.jsonl', '/project', ['mix test'])).toEqual(['test/models']);
  });

  it('ignores non-test execute_bash commands', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue([
      makeEvent('userPromptSubmit', { prompt: 'go' }),
      makeEvent('postToolUse', { tool_name: 'execute_bash', tool_input: { command: 'ls -la' } }),
      makeEvent('postToolUse', { tool_name: 'execute_bash', tool_input: { command: 'cat foo.ts' } }),
    ].join('\n'));

    expect(extractAgentTestedDirs('/log.jsonl', '/project', DEFAULT_RUNNERS)).toEqual([]);
  });

  it('returns [] when no execute_bash events in turn', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue([
      makeEvent('userPromptSubmit', { prompt: 'go' }),
      makeEvent('postToolUse', { tool_name: 'fs_write', tool_input: { path: '/project/a.ts' } }),
    ].join('\n'));

    expect(extractAgentTestedDirs('/log.jsonl', '/project', DEFAULT_RUNNERS)).toEqual([]);
  });

  it('returns [] when command has no parseable input', () => {
    mockExistsSync.mockReturnValue(false);
    expect(extractAgentTestedDirs('/missing.jsonl', '/project', DEFAULT_RUNNERS)).toEqual([]);
  });

  it('does not match runner embedded in another word (e.g. my-pytest-wrapper)', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue([
      makeEvent('userPromptSubmit', { prompt: 'go' }),
      makeEvent('postToolUse', { tool_name: 'execute_bash', tool_input: { command: 'my-pytest-wrapper src/' } }),
    ].join('\n'));

    expect(extractAgentTestedDirs('/log.jsonl', '/project', DEFAULT_RUNNERS)).toEqual([]);
  });

  it('matches runner with special characters like c++ test', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue([
      makeEvent('userPromptSubmit', { prompt: 'go' }),
      makeEvent('postToolUse', { tool_name: 'execute_bash', tool_input: { command: 'c++ test src/' } }),
    ].join('\n'));

    expect(extractAgentTestedDirs('/log.jsonl', '/project', ['c++ test'])).toEqual(['src']);
  });

  it('returns [] when test runners list is empty', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue([
      makeEvent('userPromptSubmit', { prompt: 'go' }),
      makeEvent('postToolUse', { tool_name: 'execute_bash', tool_input: { command: 'npx jest src/' } }),
    ].join('\n'));

    expect(extractAgentTestedDirs('/log.jsonl', '/project', [])).toEqual([]);
  });
});
