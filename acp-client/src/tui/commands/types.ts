import type { ClientSideConnection, ContentBlock, PromptResponse } from '@agentclientprotocol/sdk';
import type { WeaverDb } from '@weaver/shared/db';
import type { KiroAdapter } from '../../adapters/kiro/index.js';

export interface SlashCommand {
  name: string;
  description: string;
  shortcut?: { key: string; ctrl?: boolean; shift?: boolean };
  handler: (args: string, context: CommandContext) => Promise<void>;
}

export interface CommandContext {
  sessionId: string;
  sendPrompt: (content: ContentBlock[]) => Promise<PromptResponse>;
  agent: ClientSideConnection;
  adapter: KiroAdapter;
  db: WeaverDb;
}
