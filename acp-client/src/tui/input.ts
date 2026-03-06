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

export function createInputController(options: InputControllerOptions): InputController {
  let rl: ReadlineInterface | null = null;
  let buffer = '';
  let lastCtrlC = 0;
  let paused = false;

  return {
    start(onSubmit) {
      const input = (options.input ?? process.stdin) as NodeJS.ReadableStream;
      const output = (options.output ?? process.stdout) as NodeJS.WritableStream;

      rl = createInterface({ input, output, prompt: options.prompt, terminal: true });

      if ('setRawMode' in input && typeof (input as NodeJS.ReadStream).setRawMode === 'function') {
        (input as NodeJS.ReadStream).setRawMode(true);
      }

      rl.on('line', async (line) => {
        if (paused) return;
        const text = buffer + line;
        buffer = '';
        await onSubmit(text);
      });

      // Handle keypress for special keys
      input.on('keypress', (_ch: string | undefined, key: { name?: string; ctrl?: boolean; shift?: boolean; sequence?: string } | undefined) => {
        if (paused || !key) return;

        // ctrl+c: double-tap to quit
        if (key.ctrl && key.name === 'c') {
          const now = Date.now();
          if (now - lastCtrlC < 2000) {
            options.onQuit();
            return;
          }
          lastCtrlC = now;
          const out = options.output ?? process.stdout;
          (out as NodeJS.WritableStream).write('\n(Press Ctrl+C again to quit)\n');
          rl?.prompt();
          return;
        }

        // ctrl+j: insert newline into buffer
        if (key.ctrl && key.name === 'j') {
          buffer += (rl as ReadlineInterface & { line?: string })?.line + '\n';
          if (rl) {
            (rl as ReadlineInterface & { line: string }).line = '';
            (rl as ReadlineInterface & { cursor: number }).cursor = 0;
          }
          const out = options.output ?? process.stdout;
          (out as NodeJS.WritableStream).write('\n... ');
          return;
        }

        // Delegate other ctrl shortcuts
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

  if (initialContent) {
    await writeFile(tmpFile, initialContent, 'utf-8');
  } else {
    await writeFile(tmpFile, '', 'utf-8');
  }

  const editor = editorCmd();
  const parts = editor.split(/\s+/);
  const cmd = parts[0];
  const args = [...parts.slice(1), tmpFile];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
    });
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
