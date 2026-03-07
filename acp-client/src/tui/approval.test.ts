import { describe, it, expect } from '@jest/globals';
import { PassThrough } from 'node:stream';
import { promptApproval } from './approval.js';
import { makePermissionRequest, simulateInput } from '../__tests__/setup.js';

describe('promptApproval', () => {
  it.each([
    { input: 'y', expectedOptionId: 'opt-allow', desc: '"y" → allow_once' },
    { input: 'yes', expectedOptionId: 'opt-allow', desc: '"yes" → allow_once (first char)' },
    { input: 'Y', expectedOptionId: 'opt-allow', desc: '"Y" → allow_once (case-insensitive)' },
    { input: 't', expectedOptionId: 'opt-trust', desc: '"t" → allow_always' },
    { input: 'n', expectedOptionId: 'opt-reject', desc: '"n" → reject_once' },
  ])('maps $desc', async ({ input, expectedOptionId }) => {
    const output = new PassThrough();
    const result = await promptApproval(makePermissionRequest(), simulateInput(input), output);
    expect(result).toEqual({ outcome: { outcome: 'selected', optionId: expectedOptionId } });
  });

  it.each([
    { input: 'x', desc: 'unrecognized input' },
    { input: '', desc: 'empty input' },
  ])('returns cancelled for $desc', async ({ input }) => {
    const output = new PassThrough();
    const result = await promptApproval(makePermissionRequest(), simulateInput(input), output);
    expect(result).toEqual({ outcome: { outcome: 'cancelled' } });
  });

  it('returns cancelled when matching kind not in options', async () => {
    const output = new PassThrough();
    const request = makePermissionRequest({
      options: [{ optionId: 'opt-reject', kind: 'reject_once', name: 'Reject' }],
    });
    const result = await promptApproval(request, simulateInput('y'), output);
    expect(result).toEqual({ outcome: { outcome: 'cancelled' } });
  });

  it('displays tool call title in prompt', async () => {
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
    await promptApproval(makePermissionRequest(), simulateInput('y'), output);
    const text = chunks.join('');
    expect(text).toContain('Write to file.ts');
    expect(text).toContain('Kind: edit');
  });

  it('displays rawInput preview', async () => {
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
    const request = makePermissionRequest({
      toolCall: { toolCallId: 'tc-1', title: 'Test', rawInput: { path: '/foo.ts' } },
    });
    await promptApproval(request, simulateInput('y'), output);
    expect(chunks.join('')).toContain('/foo.ts');
  });
});
