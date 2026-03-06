import { describe, it, expect } from '@jest/globals';
import { createForwardedCommands, type CommandRegistration } from './commands.js';
import type { KiroAdapter } from './index.js';

describe('createForwardedCommands', () => {
  it('creates registrations for all forwarded commands', () => {
    const executedCommands: string[] = [];
    const mockAdapter = {
      executeCommand: async (_sid: string, cmd: string) => { executedCommands.push(cmd); },
    } as unknown as KiroAdapter;

    const commands = createForwardedCommands(mockAdapter, 'sess-1');

    const names = commands.map((c) => c.name);
    expect(names).toContain('compact');
    expect(names).toContain('tools');
    expect(names).toContain('model');
    expect(names).toContain('context');
    expect(names).toContain('mcp');
    expect(names).toContain('usage');
    expect(names).toContain('agent');
    expect(names).toContain('chat');
    expect(names).toContain('prompts');
    expect(names).toContain('plan');
    expect(names).toContain('todos');
    expect(names).toContain('hooks');
    expect(commands.length).toBe(12);
  });

  it('handler calls executeCommand with correct format', async () => {
    const executedCommands: string[] = [];
    const mockAdapter = {
      executeCommand: async (_sid: string, cmd: string) => { executedCommands.push(cmd); },
    } as unknown as KiroAdapter;

    const commands = createForwardedCommands(mockAdapter, 'sess-1');
    const compact = commands.find((c) => c.name === 'compact')!;

    await compact.handler('');
    expect(executedCommands).toEqual(['/compact']);
  });

  it('handler passes args to executeCommand', async () => {
    const executedCommands: string[] = [];
    const mockAdapter = {
      executeCommand: async (_sid: string, cmd: string) => { executedCommands.push(cmd); },
    } as unknown as KiroAdapter;

    const commands = createForwardedCommands(mockAdapter, 'sess-1');
    const model = commands.find((c) => c.name === 'model')!;

    await model.handler('claude-opus-4-20250514');
    expect(executedCommands).toEqual(['/model claude-opus-4-20250514']);
  });

  it('each command has a description', () => {
    const mockAdapter = {
      executeCommand: async () => {},
    } as unknown as KiroAdapter;

    const commands = createForwardedCommands(mockAdapter, 'sess-1');
    for (const cmd of commands) {
      expect(cmd.description).toBeTruthy();
    }
  });
});
