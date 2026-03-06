import { describe, it, expect } from '@jest/globals';
import { PassThrough } from 'node:stream';
import { promptApproval } from './approval.js';
import type { RequestPermissionRequest, PermissionOption } from '@agentclientprotocol/sdk';

function makeOptions(): PermissionOption[] {
  return [
    { optionId: 'opt-allow', kind: 'allow_once', name: 'Allow once' },
    { optionId: 'opt-trust', kind: 'allow_always', name: 'Trust always' },
    { optionId: 'opt-reject', kind: 'reject_once', name: 'Reject once' },
  ];
}

function makeRequest(overrides: Partial<RequestPermissionRequest> = {}): RequestPermissionRequest {
  return {
    sessionId: 'sess-1',
    toolCall: { toolCallId: 'tc-1', title: 'Write to file.ts', kind: 'edit' },
    options: makeOptions(),
    ...overrides,
  };
}

function simulateInput(answer: string): PassThrough {
  const input = new PassThrough();
  // Write answer after a microtask to simulate user typing
  queueMicrotask(() => input.write(answer + '\n'));
  return input;
}

describe('promptApproval', () => {
  it('maps "y" to allow_once option', async () => {
    const output = new PassThrough();
    const result = await promptApproval(makeRequest(), simulateInput('y'), output);
    expect(result).toEqual({ outcome: { outcome: 'selected', optionId: 'opt-allow' } });
  });

  it('maps "yes" to allow_once option (first char)', async () => {
    const output = new PassThrough();
    const result = await promptApproval(makeRequest(), simulateInput('yes'), output);
    expect(result).toEqual({ outcome: { outcome: 'selected', optionId: 'opt-allow' } });
  });

  it('maps "t" to allow_always option', async () => {
    const output = new PassThrough();
    const result = await promptApproval(makeRequest(), simulateInput('t'), output);
    expect(result).toEqual({ outcome: { outcome: 'selected', optionId: 'opt-trust' } });
  });

  it('maps "n" to reject_once option', async () => {
    const output = new PassThrough();
    const result = await promptApproval(makeRequest(), simulateInput('n'), output);
    expect(result).toEqual({ outcome: { outcome: 'selected', optionId: 'opt-reject' } });
  });

  it('returns cancelled for unrecognized input', async () => {
    const output = new PassThrough();
    const result = await promptApproval(makeRequest(), simulateInput('x'), output);
    expect(result).toEqual({ outcome: { outcome: 'cancelled' } });
  });

  it('returns cancelled for empty input', async () => {
    const output = new PassThrough();
    const result = await promptApproval(makeRequest(), simulateInput(''), output);
    expect(result).toEqual({ outcome: { outcome: 'cancelled' } });
  });

  it('returns cancelled when matching kind not in options', async () => {
    const output = new PassThrough();
    const request = makeRequest({
      options: [{ optionId: 'opt-reject', kind: 'reject_once', name: 'Reject' }],
    });
    const result = await promptApproval(request, simulateInput('y'), output);
    expect(result).toEqual({ outcome: { outcome: 'cancelled' } });
  });

  it('displays tool call title in prompt', async () => {
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
    await promptApproval(makeRequest(), simulateInput('y'), output);
    const text = chunks.join('');
    expect(text).toContain('Write to file.ts');
    expect(text).toContain('Kind: edit');
  });

  it('displays rawInput preview', async () => {
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
    const request = makeRequest({
      toolCall: { toolCallId: 'tc-1', title: 'Test', rawInput: { path: '/foo.ts' } },
    });
    await promptApproval(request, simulateInput('y'), output);
    const text = chunks.join('');
    expect(text).toContain('/foo.ts');
  });

  it('is case-insensitive', async () => {
    const output = new PassThrough();
    const result = await promptApproval(makeRequest(), simulateInput('Y'), output);
    expect(result).toEqual({ outcome: { outcome: 'selected', optionId: 'opt-allow' } });
  });
});
