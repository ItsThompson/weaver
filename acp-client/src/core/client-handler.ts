import { spawn, type ChildProcess } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  Agent,
  Client,
  SessionNotification,
  RequestPermissionRequest,
  RequestPermissionResponse,
  CreateTerminalRequest,
  CreateTerminalResponse,
  TerminalOutputRequest,
  TerminalOutputResponse,
  ReleaseTerminalRequest,
  ReleaseTerminalResponse,
  WaitForTerminalExitRequest,
  WaitForTerminalExitResponse,
  KillTerminalRequest,
  KillTerminalResponse,
  ReadTextFileRequest,
  ReadTextFileResponse,
  WriteTextFileRequest,
  WriteTextFileResponse,
} from '@agentclientprotocol/sdk';
import type { ClientHandlerDeps } from './types.js';

interface TrackedTerminal {
  process: ChildProcess;
  output: string;
  exitCode: number | null;
  signal: string | null;
  exited: boolean;
  exitPromise: Promise<void>;
}

export function createClientHandler(deps: ClientHandlerDeps): (agent: Agent) => Client {
  const terminals = new Map<string, TrackedTerminal>();

  function trackTerminal(id: string, child: ChildProcess): TrackedTerminal {
    const terminal: TrackedTerminal = {
      process: child,
      output: '',
      exitCode: null,
      signal: null,
      exited: false,
      exitPromise: new Promise<void>((resolve) => {
        child.once('exit', (code, sig) => {
          terminal.exitCode = code;
          terminal.signal = sig ?? null;
          terminal.exited = true;
          resolve();
        });
        child.once('error', () => {
          terminal.exited = true;
          resolve();
        });
      }),
    };

    child.stdout?.on('data', (chunk: Buffer) => { terminal.output += chunk.toString(); });
    child.stderr?.on('data', (chunk: Buffer) => { terminal.output += chunk.toString(); });

    terminals.set(id, terminal);
    return terminal;
  }

  return (_agent: Agent): Client => ({
    async sessionUpdate(params: SessionNotification): Promise<void> {
      const { sessionId, update } = params;

      switch (update.sessionUpdate) {
        case 'agent_message_chunk':
          deps.onMessageChunk(sessionId, update, 'assistant');
          break;
        case 'user_message_chunk':
          deps.onMessageChunk(sessionId, update, 'user');
          break;
        case 'tool_call':
          deps.onToolCall(sessionId, update);
          break;
        case 'tool_call_update':
          deps.onToolCallUpdate(sessionId, update);
          break;
        case 'plan':
          deps.onPlan(sessionId, update);
          break;
        case 'current_mode_update':
          deps.onModeChange(sessionId, update.currentModeId);
          break;
        case 'available_commands_update':
          deps.onCommandsAvailable(sessionId, update.availableCommands);
          break;
        case 'usage_update':
          deps.onUsageUpdate(sessionId, update.used, update.size);
          break;
        case 'session_info_update':
          deps.onSessionInfo(sessionId, update.title);
          break;
      }
    },

    async requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
      return deps.requestApproval(params);
    },

    async readTextFile(params: ReadTextFileRequest): Promise<ReadTextFileResponse> {
      const content = await deps.readFile(params.path, params.line, params.limit);
      return { content };
    },

    async writeTextFile(params: WriteTextFileRequest): Promise<WriteTextFileResponse> {
      await deps.writeFile(params.path, params.content);
      return {};
    },

    async createTerminal(params: CreateTerminalRequest): Promise<CreateTerminalResponse> {
      const terminalId = randomUUID();
      const child = spawn(params.command, params.args ?? [], {
        cwd: params.cwd ?? undefined,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: params.env
          ? { ...process.env, ...Object.fromEntries(params.env.map((e) => [e.name, e.value])) }
          : undefined,
      });
      trackTerminal(terminalId, child);
      return { terminalId };
    },

    async terminalOutput(params: TerminalOutputRequest): Promise<TerminalOutputResponse> {
      const terminal = terminals.get(params.terminalId);
      if (!terminal) return { output: '', truncated: false };
      return {
        output: terminal.output,
        truncated: false,
        ...(terminal.exited ? { exitStatus: { exitCode: terminal.exitCode, signal: terminal.signal } } : {}),
      };
    },

    async releaseTerminal(params: ReleaseTerminalRequest): Promise<ReleaseTerminalResponse | void> {
      const terminal = terminals.get(params.terminalId);
      if (!terminal) return {};
      if (!terminal.exited) terminal.process.kill('SIGTERM');
      terminals.delete(params.terminalId);
      return {};
    },

    async waitForTerminalExit(params: WaitForTerminalExitRequest): Promise<WaitForTerminalExitResponse> {
      const terminal = terminals.get(params.terminalId);
      if (!terminal) return { exitCode: null, signal: null };
      await terminal.exitPromise;
      return { exitCode: terminal.exitCode, signal: terminal.signal };
    },

    async killTerminal(params: KillTerminalRequest): Promise<KillTerminalResponse | void> {
      const terminal = terminals.get(params.terminalId);
      if (!terminal) return {};
      if (!terminal.exited) terminal.process.kill('SIGTERM');
      return {};
    },

    async extNotification(method: string, params: Record<string, unknown>): Promise<void> {
      await deps.onExtNotification?.(method, params);
    },
  });
}

export async function defaultReadFile(path: string, line?: number | null, limit?: number | null): Promise<string> {
  const content = await readFile(path, 'utf-8');
  if (line == null && limit == null) return content;

  const lines = content.split('\n');
  const start = (line ?? 1) - 1;
  const end = limit != null ? start + limit : lines.length;
  return lines.slice(start, end).join('\n');
}

export async function defaultWriteFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf-8');
}
