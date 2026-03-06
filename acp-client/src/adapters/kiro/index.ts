import type { ClientSideConnection, McpServer } from '@agentclientprotocol/sdk';
import { readMcpServers } from './mcp-config.js';
import { createForwardedCommands, type CommandRegistration } from './commands.js';

export class KiroAdapter {
  constructor(private agent: ClientSideConnection) {}

  async executeCommand(sessionId: string, command: string): Promise<void> {
    await this.agent.extMethod('_kiro.dev/commands/execute', { sessionId, command });
  }

  async getCommandOptions(sessionId: string, partial: string): Promise<string[]> {
    const result = await this.agent.extMethod('_kiro.dev/commands/options', { sessionId, partial });
    return (result.options as string[] | undefined) ?? [];
  }

  static readMcpServers(cwd: string): McpServer[] {
    return readMcpServers(cwd);
  }

  getForwardedCommands(sessionId: string): CommandRegistration[] {
    return createForwardedCommands(this, sessionId);
  }
}
