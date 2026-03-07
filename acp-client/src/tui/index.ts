import type { ContentChunk, ToolCall, ToolCallUpdate, Plan, AvailableCommand, RequestPermissionRequest, RequestPermissionResponse } from '@agentclientprotocol/sdk';
import { WeaverDb } from '@weaver/shared/db';
import { connect } from '../core/connection.js';
import { createSessionManager } from '../core/session.js';
import { createClientHandler, defaultReadFile, defaultWriteFile } from '../core/client-handler.js';
import { KiroAdapter } from '../adapters/kiro/index.js';
import { createExtensionHandler } from '../adapters/kiro/extensions/index.js';
import { createOutputController } from './output/index.js';
import { createInputController, openEditor } from './input.js';
import { CommandRegistry } from './commands/index.js';
import type { CommandContext } from './commands/index.js';
import { promptApproval } from './approval.js';
import { persistMessageChunk, persistToolCall, persistToolCallUpdate, persistEvent } from '../storage/index.js';
import { notifyServer } from '../storage/event-emitter.js';

export interface TuiOptions {
  cwd: string;
  resumeSessionId?: string;
  agentCommand?: string;
}

function log(event: string, data?: Record<string, unknown>): void {
  const entry = { timestamp: new Date().toISOString(), event, ...data };
  process.stderr.write(JSON.stringify(entry) + '\n');
}

export async function startTui(options: TuiOptions): Promise<void> {
  const db = new WeaverDb();
  const output = createOutputController();
  const registry = new CommandRegistry();

  const sessionMap = new Map<string, string>();
  let internalId = '';
  let acpSessionId = '';
  let promptInProgress = false;
  let inputController: ReturnType<typeof createInputController>;

  const extHandler = createExtensionHandler({
    db,
    getInternalSessionId: (acpSid) => sessionMap.get(acpSid),
    onCompactionStatus: (_sid, status) => output.showSystem(`Compaction: ${status}`),
    onClearStatus: (_sid, status) => output.showSystem(`Clear: ${status}`),
    onMcpServerInitialized: (_sid, name) => output.showSystem(`MCP server initialized: ${name}`),
  });

  const clientFactory = createClientHandler({
    onMessageChunk(_sid: string, chunk: ContentChunk, role: 'user' | 'assistant') {
      if (internalId) persistMessageChunk(db, internalId, chunk, role);
      const block = chunk.content;
      if (role === 'assistant' && 'text' in block && typeof block.text === 'string') {
        output.writeChunk(block.text);
      }
    },
    onToolCall(_sid: string, toolCall: ToolCall) {
      if (internalId) persistToolCall(db, internalId, toolCall);
      output.showToolCall({
        toolCallId: toolCall.toolCallId,
        title: toolCall.title,
        kind: toolCall.kind ?? '',
        status: toolCall.status ?? 'pending',
      });
    },
    onToolCallUpdate(_sid: string, update: ToolCallUpdate) {
      if (internalId) persistToolCallUpdate(db, internalId, update);
      output.updateToolCall(update.toolCallId, update.status ?? 'in_progress');
    },
    onPlan(_sid: string, plan: Plan) {
      if (internalId) persistEvent(db, internalId, 'plan', plan);
      output.showPlan(plan.entries);
    },
    onModeChange(_sid: string, modeId: string) {
      output.showSystem(`Mode: ${modeId}`);
    },
    onCommandsAvailable(_sid: string, commands: AvailableCommand[]) {
      for (const cmd of commands) {
        registry.register({
          name: cmd.name,
          description: cmd.description ?? '',
          handler: async (args, ctx) => ctx.adapter.executeCommand(ctx.sessionId, `/${cmd.name}${args ? ' ' + args : ''}`),
        });
      }
    },
    onUsageUpdate(_sid: string, used: number, size: number) {
      if (internalId && size > 0) {
        db.updateSession(internalId, { context_usage_percent: (used / size) * 100 });
      }
    },
    onSessionInfo(_sid: string, title?: string | null) {
      if (internalId && title) {
        db.updateSession(internalId, { custom_name: title });
      }
    },
    async requestApproval(request: RequestPermissionRequest): Promise<RequestPermissionResponse> {
      inputController.pause();
      const result = await promptApproval(request);
      inputController.resume();
      return result;
    },
    readFile: defaultReadFile,
    writeFile: defaultWriteFile,
    onExtNotification: extHandler,
  });

  const agentCmd = options.agentCommand ?? 'kiro-cli-chat';
  log('connecting', { agentCommand: agentCmd });

  const connection = await connect({
    agentCommand: agentCmd,
    agentArgs: ['acp'],
    clientInfo: { name: 'weaver', version: '1.0.0' },
    createClient: clientFactory,
  });

  log('connected', { pid: connection.pid });

  const adapter = new KiroAdapter(connection.agent);
  const sessionManager = createSessionManager({
    agent: connection.agent,
    db,
    agentName: 'kiro',
    pid: connection.pid,
  });

  const mcpServers = KiroAdapter.readMcpServers(options.cwd);

  if (options.resumeSessionId) {
    const session = db.getSession(options.resumeSessionId);
    if (!session?.agent_session_id) {
      output.showError(`Session not found: ${options.resumeSessionId}`);
      db.close();
      await connection.shutdown();
      return;
    }
    internalId = session.id;
    acpSessionId = session.agent_session_id;
    sessionMap.set(acpSessionId, internalId);
    output.showSystem(`Resuming session ${internalId.slice(0, 8)}...`);
    await sessionManager.loadSession(acpSessionId, options.cwd, mcpServers);
    output.showSystem('Session loaded.');
  } else {
    const result = await sessionManager.createSession(options.cwd, mcpServers);
    internalId = result.internalId;
    acpSessionId = result.sessionId;
    sessionMap.set(acpSessionId, internalId);
    output.showSystem(`Session started (${internalId.slice(0, 8)})`);
    await notifyServer(internalId, 'session_start');
  }

  registerLocalCommands(registry, db, internalId, output, sessionManager, acpSessionId, adapter);

  for (const cmd of adapter.getForwardedCommands(acpSessionId)) {
    registry.register({
      name: cmd.name,
      description: cmd.description,
      handler: async (args) => cmd.handler(args),
    });
  }

  const commandContext: CommandContext = {
    sessionId: acpSessionId,
    sendPrompt: (content) => sessionManager.sendPrompt(acpSessionId, content),
    agent: connection.agent,
    adapter,
    db,
  };

  async function shutdown(): Promise<void> {
    log('shutting_down');
    if (promptInProgress) {
      try { await sessionManager.cancel(acpSessionId); } catch { /* ignore */ }
    }
    db.updateSession(internalId, { status: 'closed' });
    await notifyServer(internalId, 'session_end');
    db.close();
    await connection.shutdown();
    process.exit(0);
  }

  inputController = createInputController({
    prompt: 'weaver> ',
    onShortcut(key: string, ctrl: boolean): boolean {
      const cmd = registry.findByShortcut(key, ctrl, false);
      if (cmd) {
        cmd.handler('', commandContext).catch((err) => output.showError(String(err)));
        return true;
      }
      return false;
    },
    onQuit: () => { shutdown().catch(() => process.exit(1)); },
  });

  inputController.start(async (input) => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const handled = await registry.handleInput(trimmed, commandContext);
    if (handled) return;

    promptInProgress = true;
    inputController.pause();

    db.appendMessage({
      session_id: internalId,
      role: 'user',
      type: 'text',
      content: trimmed,
      metadata: null,
      created_at: new Date().toISOString(),
    });
    persistEvent(db, internalId, 'prompt', { content: trimmed });

    try {
      const response = await sessionManager.sendPrompt(acpSessionId, [{ type: 'text', text: trimmed }]);
      output.endMessage();
      log('turn_end', { stopReason: response.stopReason });
      persistEvent(db, internalId, 'turn_end', { stopReason: response.stopReason });
      await notifyServer(internalId, 'turn_end');
    } catch (err) {
      output.showError(`Error: ${err instanceof Error ? err.message : String(err)}`);
      persistEvent(db, internalId, 'error', { error: String(err) });
    } finally {
      promptInProgress = false;
      inputController.resume();
    }
  });
}

function registerLocalCommands(
  registry: CommandRegistry,
  db: WeaverDb,
  internalId: string,
  output: ReturnType<typeof createOutputController>,
  sessionManager: ReturnType<typeof createSessionManager>,
  acpSessionId: string,
  adapter: KiroAdapter,
): void {
  registry.register({
    name: 'quit',
    description: 'Exit weaver chat',
    handler: async () => { process.exit(0); },
  });

  registry.register({
    name: 'editor',
    description: 'Open $EDITOR to compose a prompt',
    shortcut: { key: 'e', ctrl: true },
    handler: async (_args, ctx) => {
      const content = await openEditor();
      if (content) await ctx.sendPrompt([{ type: 'text', text: content }]);
    },
  });

  registry.register({
    name: 'reply',
    description: 'Open $EDITOR with quoted assistant message(s)',
    shortcut: { key: 'r', ctrl: true },
    handler: async (args) => {
      const count = parseInt(args, 10) || 1;
      const messages = db.getMessages(internalId)
        .filter((m) => m.role === 'assistant' && m.type === 'text' && m.content)
        .slice(-count);
      const quoted = messages
        .map((m) => m.content!.split('\n').map((line) => `> ${line}`).join('\n'))
        .join('\n\n');
      const content = await openEditor(quoted + '\n\n');
      if (content) await sessionManager.sendPrompt(acpSessionId, [{ type: 'text', text: content }]);
    },
  });

  registry.register({
    name: 'clear',
    description: 'Clear terminal and agent context',
    handler: async (_args, ctx) => {
      output.clear();
      await adapter.executeCommand(ctx.sessionId, '/clear');
    },
  });

  registry.register({
    name: 'help',
    description: 'Show available commands',
    handler: async () => {
      for (const cmd of registry.getAll()) {
        const shortcut = cmd.shortcut ? ` (${cmd.shortcut.ctrl ? 'ctrl+' : ''}${cmd.shortcut.key})` : '';
        output.showSystem(`  /${cmd.name}${shortcut} — ${cmd.description}`);
      }
    },
  });
}
