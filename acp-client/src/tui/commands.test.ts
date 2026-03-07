import { describe, it, expect, beforeEach } from '@jest/globals';
import { CommandRegistry, type SlashCommand, type CommandContext } from './commands/index.js';

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
      registry.register(makeCommand({ name: 'quit', description: 'first' }));
      registry.register(makeCommand({ name: 'quit', description: 'second' }));
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
      expect(registry.getAll().map((c) => c.name)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('findByShortcut', () => {
    it.each([
      { key: 'e', ctrl: true, shift: false, shortcut: { key: 'e', ctrl: true }, matches: true },
      { key: 'x', ctrl: false, shift: true, shortcut: { key: 'x', shift: true }, matches: true },
      { key: 'p', ctrl: false, shift: false, shortcut: { key: 'p' }, matches: true },
      { key: 'e', ctrl: false, shift: false, shortcut: { key: 'e', ctrl: true }, matches: false },
      { key: 'p', ctrl: true, shift: false, shortcut: { key: 'p' }, matches: false },
      { key: 'r', ctrl: true, shift: false, shortcut: { key: 'e', ctrl: true }, matches: false },
    ])('key=$key ctrl=$ctrl shift=$shift with shortcut $shortcut → matches=$matches', ({ key, ctrl, shift, shortcut, matches }) => {
      const cmd = makeCommand({ name: 'test', shortcut });
      registry.register(cmd);
      const result = registry.findByShortcut(key, ctrl, shift);
      if (matches) {
        expect(result).toBe(cmd);
      } else {
        expect(result).toBeUndefined();
      }
    });
  });

  describe('handleInput', () => {
    it('dispatches a slash command and returns true', async () => {
      const calls: string[] = [];
      registry.register(makeCommand({ name: 'quit', handler: async () => { calls.push('quit'); } }));
      expect(await registry.handleInput('/quit', mockContext)).toBe(true);
      expect(calls).toEqual(['quit']);
    });

    it('passes args to the handler', async () => {
      const receivedArgs: string[] = [];
      registry.register(makeCommand({ name: 'reply', handler: async (args) => { receivedArgs.push(args); } }));
      await registry.handleInput('/reply 3', mockContext);
      expect(receivedArgs).toEqual(['3']);
    });

    it('passes empty string when no args', async () => {
      const receivedArgs: string[] = [];
      registry.register(makeCommand({ name: 'help', handler: async (args) => { receivedArgs.push(args); } }));
      await registry.handleInput('/help', mockContext);
      expect(receivedArgs).toEqual(['']);
    });

    it.each([
      { input: 'hello world', desc: 'non-command input' },
      { input: '/unknown', desc: 'unregistered command' },
    ])('returns false for $desc', async ({ input }) => {
      expect(await registry.handleInput(input, mockContext)).toBe(false);
    });

    it('handles leading/trailing whitespace', async () => {
      const calls: string[] = [];
      registry.register(makeCommand({ name: 'quit', handler: async () => { calls.push('quit'); } }));
      expect(await registry.handleInput('  /quit  ', mockContext)).toBe(true);
      expect(calls).toEqual(['quit']);
    });

    it('trims args whitespace', async () => {
      const receivedArgs: string[] = [];
      registry.register(makeCommand({ name: 'model', handler: async (args) => { receivedArgs.push(args); } }));
      await registry.handleInput('/model   claude-opus-4-20250514  ', mockContext);
      expect(receivedArgs).toEqual(['claude-opus-4-20250514']);
    });

    it('passes context to handler', async () => {
      let receivedContext: CommandContext | undefined;
      registry.register(makeCommand({ name: 'test', handler: async (_args, ctx) => { receivedContext = ctx; } }));
      await registry.handleInput('/test', mockContext);
      expect(receivedContext).toBe(mockContext);
    });
  });
});
