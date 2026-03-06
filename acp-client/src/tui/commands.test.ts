import { describe, it, expect, beforeEach } from '@jest/globals';
import { CommandRegistry, type SlashCommand, type CommandContext } from './commands.js';

function makeCommand(overrides: Partial<SlashCommand> = {}): SlashCommand {
  return {
    name: overrides.name ?? 'test',
    description: overrides.description ?? 'A test command',
    handler: overrides.handler ?? (async () => {}),
    ...('shortcut' in overrides ? { shortcut: overrides.shortcut } : {}),
  };
}

const mockContext = {} as CommandContext;

describe('CommandRegistry', () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  describe('register and get', () => {
    it('registers and retrieves a command by name', () => {
      const cmd = makeCommand({ name: 'quit' });
      registry.register(cmd);
      expect(registry.get('quit')).toBe(cmd);
    });

    it('returns undefined for unregistered command', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('overwrites a command with the same name', () => {
      const cmd1 = makeCommand({ name: 'quit', description: 'first' });
      const cmd2 = makeCommand({ name: 'quit', description: 'second' });
      registry.register(cmd1);
      registry.register(cmd2);
      expect(registry.get('quit')?.description).toBe('second');
    });
  });

  describe('getAll', () => {
    it('returns empty array when no commands registered', () => {
      expect(registry.getAll()).toEqual([]);
    });

    it('returns all registered commands', () => {
      registry.register(makeCommand({ name: 'a' }));
      registry.register(makeCommand({ name: 'b' }));
      registry.register(makeCommand({ name: 'c' }));
      const names = registry.getAll().map((c) => c.name);
      expect(names).toEqual(['a', 'b', 'c']);
    });
  });

  describe('findByShortcut', () => {
    it('finds command by ctrl shortcut', () => {
      const cmd = makeCommand({ name: 'editor', shortcut: { key: 'e', ctrl: true } });
      registry.register(cmd);
      expect(registry.findByShortcut('e', true, false)).toBe(cmd);
    });

    it('finds command by shift shortcut', () => {
      const cmd = makeCommand({ name: 'special', shortcut: { key: 'x', shift: true } });
      registry.register(cmd);
      expect(registry.findByShortcut('x', false, true)).toBe(cmd);
    });

    it('returns undefined when no shortcut matches', () => {
      registry.register(makeCommand({ name: 'editor', shortcut: { key: 'e', ctrl: true } }));
      expect(registry.findByShortcut('r', true, false)).toBeUndefined();
    });

    it('does not match when ctrl differs', () => {
      registry.register(makeCommand({ name: 'editor', shortcut: { key: 'e', ctrl: true } }));
      expect(registry.findByShortcut('e', false, false)).toBeUndefined();
    });

    it('treats missing ctrl/shift as false', () => {
      const cmd = makeCommand({ name: 'plain', shortcut: { key: 'p' } });
      registry.register(cmd);
      expect(registry.findByShortcut('p', false, false)).toBe(cmd);
      expect(registry.findByShortcut('p', true, false)).toBeUndefined();
    });
  });

  describe('handleInput', () => {
    it('dispatches a slash command and returns true', async () => {
      const calls: string[] = [];
      registry.register(makeCommand({
        name: 'quit',
        handler: async () => { calls.push('quit'); },
      }));
      const result = await registry.handleInput('/quit', mockContext);
      expect(result).toBe(true);
      expect(calls).toEqual(['quit']);
    });

    it('passes args to the handler', async () => {
      const receivedArgs: string[] = [];
      registry.register(makeCommand({
        name: 'reply',
        handler: async (args) => { receivedArgs.push(args); },
      }));
      await registry.handleInput('/reply 3', mockContext);
      expect(receivedArgs).toEqual(['3']);
    });

    it('passes empty string when no args', async () => {
      const receivedArgs: string[] = [];
      registry.register(makeCommand({
        name: 'help',
        handler: async (args) => { receivedArgs.push(args); },
      }));
      await registry.handleInput('/help', mockContext);
      expect(receivedArgs).toEqual(['']);
    });

    it('returns false for non-command input', async () => {
      const result = await registry.handleInput('hello world', mockContext);
      expect(result).toBe(false);
    });

    it('returns false for unregistered command', async () => {
      const result = await registry.handleInput('/unknown', mockContext);
      expect(result).toBe(false);
    });

    it('handles leading/trailing whitespace', async () => {
      const calls: string[] = [];
      registry.register(makeCommand({
        name: 'quit',
        handler: async () => { calls.push('quit'); },
      }));
      const result = await registry.handleInput('  /quit  ', mockContext);
      expect(result).toBe(true);
      expect(calls).toEqual(['quit']);
    });

    it('trims args whitespace', async () => {
      const receivedArgs: string[] = [];
      registry.register(makeCommand({
        name: 'model',
        handler: async (args) => { receivedArgs.push(args); },
      }));
      await registry.handleInput('/model   claude-opus-4-20250514  ', mockContext);
      expect(receivedArgs).toEqual(['claude-opus-4-20250514']);
    });

    it('passes context to handler', async () => {
      let receivedContext: CommandContext | undefined;
      registry.register(makeCommand({
        name: 'test',
        handler: async (_args, ctx) => { receivedContext = ctx; },
      }));
      await registry.handleInput('/test', mockContext);
      expect(receivedContext).toBe(mockContext);
    });
  });
});
