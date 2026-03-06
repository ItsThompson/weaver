import type { KiroAdapter } from './index.js';

export interface CommandRegistration {
  name: string;
  description: string;
  handler: (args: string) => Promise<void>;
}

const FORWARDED_COMMANDS: Array<{ name: string; description: string }> = [
  { name: 'compact', description: 'Compact conversation context' },
  { name: 'tools', description: 'List available tools' },
  { name: 'model', description: 'Change or view the current model' },
  { name: 'context', description: 'View context usage' },
  { name: 'mcp', description: 'Manage MCP servers' },
  { name: 'usage', description: 'View token usage' },
  { name: 'agent', description: 'View agent info' },
  { name: 'chat', description: 'Manage chat sessions' },
  { name: 'prompts', description: 'View prompt history' },
  { name: 'plan', description: 'View or manage the current plan' },
  { name: 'todos', description: 'View or manage todos' },
  { name: 'hooks', description: 'View or manage hooks' },
];

export function createForwardedCommands(
  adapter: KiroAdapter,
  sessionId: string,
): CommandRegistration[] {
  return FORWARDED_COMMANDS.map(({ name, description }) => ({
    name,
    description,
    handler: async (args: string) => {
      const command = args ? `/${name} ${args}` : `/${name}`;
      await adapter.executeCommand(sessionId, command);
    },
  }));
}
