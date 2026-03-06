import { spawn, type ChildProcess } from 'node:child_process';
import { Writable, Readable } from 'node:stream';
import { createWriteStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import type { Stream } from '@agentclientprotocol/sdk';
import type { ConnectionOptions, ActiveConnection } from './types.js';

function logPath(): string {
  const dir = join(homedir(), '.weaver');
  mkdirSync(dir, { recursive: true });
  return join(dir, 'acp-client.log');
}

function shutdownChild(child: ChildProcess): Promise<void> {
  return new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.killed) {
      resolve();
      return;
    }

    const forceKillTimer = setTimeout(() => {
      child.kill('SIGKILL');
    }, 2000);

    child.once('exit', () => {
      clearTimeout(forceKillTimer);
      resolve();
    });

    child.kill('SIGTERM');
  });
}

function spawnAgent(command: string, args: string[]): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });

    child.once('error', (err) => reject(err));

    // If we get a pid, the process spawned successfully
    if (child.pid) {
      resolve(child);
      return;
    }

    // Wait a tick for the error event if pid is not set
    child.once('spawn', () => resolve(child));
  });
}

export async function connect(options: ConnectionOptions): Promise<ActiveConnection> {
  const child = await spawnAgent(options.agentCommand, options.agentArgs);

  // Pipe stderr to log file
  if (child.stderr) {
    const logStream = createWriteStream(logPath(), { flags: 'a' });
    child.stderr.pipe(logStream);
  }

  const output = Writable.toWeb(child.stdin!) as unknown as WritableStream<Uint8Array>;
  const input = Readable.toWeb(child.stdout!) as unknown as ReadableStream<Uint8Array>;
  const stream: Stream = ndJsonStream(output, input);

  const conn = new ClientSideConnection(options.createClient, stream);

  const capabilities = await conn.initialize({
    protocolVersion: PROTOCOL_VERSION,
    clientInfo: options.clientInfo,
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true,
    },
  });

  return {
    agent: conn,
    capabilities,
    pid: child.pid!,
    shutdown: () => shutdownChild(child),
  };
}
