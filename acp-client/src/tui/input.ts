import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import { writeFile, readFile, unlink, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

export interface InputController {
  start(onSubmit: (input: string) => Promise<void>): void;
  pause(): void;
  resume(): void;
  close(): void;
}

export interface InputControllerOptions {
  prompt: string;
  onShortcut: (key: string, ctrl: boolean) => boolean;
  onQuit: () => void;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

function hasSetRawMode(stream: NodeJS.ReadableStream): stream is NodeJS.ReadStream {
  return 'setRawMode' in stream && typeof (stream as NodeJS.ReadStream).setRawMode === 'function';
}

// readline exposes `line` and `cursor` as internal properties not in the type defs
interface ReadlineInternals extends ReadlineInterface {
  line: string;
  cursor: number;
}

export function createInputController(options: InputControllerOptions): InputController {
  let rl: ReadlineInterface | null = null;
  let buffer = '';
  let lastCtrlC = 0;
  let paused = false;

  return {
    start(onSubmit) {
      const input = options.input ?? process.stdin;
      const output = options.output ?? process.stdout;

      rl = createInterface({ input, output, prompt: options.prompt, terminal: true });

      if (hasSetRawMode(input)) {
        input.setRawMode(true);
      }

      rl.on('line', async (line) => {
        if (paused) return;
        const text = buffer + line;
        buffer = '';
        await onSubmit(text);
      });

      input.on('keypress', (_ch: string | undefined, key: { name?: string; ctrl?: boolean; shift?: boolean; sequence?: string } | undefined) => {
        if (paused || !key) return;

        if (key.ctrl && key.name === 'c') {
          const now = Date.now();
          if (now - lastCtrlC < 2000) {
            options.onQuit();
            return;
          }
          lastCtrlC = now;
          output.write('\n(Press Ctrl+C again to quit)\n');
          rl?.prompt();
          return;
        }

        if (key.ctrl && key.name === 'j') {
          const internals = rl as unknown as ReadlineInternals | null;
          buffer += (internals?.line ?? '') + '\n';
          if (internals) {
            internals.line = '';
            internals.cursor = 0;
          }
          output.write('\n... ');
          return;
        }

        if (key.ctrl && key.name) {
          if (options.onShortcut(key.name, true)) return;
        }
      });

      rl.prompt();
    },

    pause() {
      paused = true;
    },

    resume() {
      paused = false;
      rl?.prompt();
    },

    close() {
      rl?.close();
      rl = null;
    },
  };
}

export async function openEditor(initialContent?: string): Promise<string | null> {
  const editorCmd = () => process.env['EDITOR'] || 'vi';
  const dir = await mkdtemp(join(tmpdir(), 'weaver-'));
  const tmpFile = join(dir, 'prompt.md');

  await writeFile(tmpFile, initialContent ?? '', 'utf-8');

  const editor = editorCmd();
  const parts = editor.split(/\s+/);
  const cmd = parts[0];
  const args = [...parts.slice(1), tmpFile];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Editor exited with code ${code}`));
    });
    child.once('error', reject);
  });

  const content = await readFile(tmpFile, 'utf-8');
  await unlink(tmpFile).catch(() => {});

  if (!content.trim()) return null;
  return content;
}
