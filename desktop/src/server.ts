import { spawn, execSync, ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import http from 'node:http';
import { app } from 'electron';

export const SERVER_PORT = 8143;
export const SERVER_URL = `http://localhost:${SERVER_PORT}`;

const isPacked = app.isPackaged;
const resourcesPath = isPacked
  ? resolve(process.resourcesPath, 'server')
  : resolve(__dirname, '../../server');

let child: ChildProcess | null = null;

export function killPortOccupant(): void {
  try {
    const pid = execSync(`lsof -ti tcp:${SERVER_PORT}`, { encoding: 'utf8' }).trim();
    if (pid) {
      process.kill(Number(pid), 'SIGKILL');
      console.log(`Killed orphaned process ${pid} on port ${SERVER_PORT}`);
    }
  } catch {
    // No process on port — nothing to clean up
  }
}

export function start(): void {
  const serverEntry = resolve(resourcesPath, 'dist/index.mjs');
  const env = { ...process.env };
  if (isPacked) {
    env.WEAVER_CLIENT_DIST = resolve(process.resourcesPath, 'client/dist');
  }
  child = spawn('node', [serverEntry], { stdio: 'inherit', env });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Server exited with code ${code}`);
    }
  });
}

export function stop(): void {
  if (!child) return;
  child.kill('SIGTERM');
  const ref = child;
  const timeout = setTimeout(() => {
    if (ref.killed === false) ref.kill('SIGKILL');
  }, 2000);
  ref.on('exit', () => clearTimeout(timeout));
  child = null;
}

export function waitForReady(retries = 30): Promise<void> {
  return new Promise((resolve, reject) => {
    const attempt = (remaining: number) => {
      http.get(`${SERVER_URL}/api/health`, (res) => {
        if (res.statusCode === 200) return resolve();
        retry(remaining);
      }).on('error', () => retry(remaining));
    };

    const retry = (remaining: number) => {
      if (remaining <= 0) return reject(new Error('Server failed to start'));
      setTimeout(() => attempt(remaining - 1), 200);
    };

    attempt(retries);
  });
}
