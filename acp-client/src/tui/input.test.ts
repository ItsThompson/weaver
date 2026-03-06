import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { writeFile, readFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openEditor } from './input.js';

// --- openEditor tests ---

describe('openEditor', () => {
  let originalEditor: string | undefined;

  beforeEach(() => {
    originalEditor = process.env['EDITOR'];
  });

  afterEach(() => {
    if (originalEditor !== undefined) {
      process.env['EDITOR'] = originalEditor;
    } else {
      delete process.env['EDITOR'];
    }
  });

  it('returns content written by the editor', async () => {
    // Use a script that writes content to the file
    process.env['EDITOR'] = 'sh -c "echo hello > "';
    // The editor command becomes: sh -c "echo hello > " /tmp/weaver-.../prompt.md
    // That won't work. Let's use a different approach.

    // Create a script that appends text to the given file
    const scriptDir = await mkdtemp(join(tmpdir(), 'weaver-test-'));
    const script = join(scriptDir, 'editor.sh');
    await writeFile(script, '#!/bin/sh\necho "test content" > "$1"\n', { mode: 0o755 });

    process.env['EDITOR'] = script;
    const result = await openEditor();
    expect(result).toBe('test content\n');
  });

  it('returns null when editor saves empty file', async () => {
    const scriptDir = await mkdtemp(join(tmpdir(), 'weaver-test-'));
    const script = join(scriptDir, 'editor.sh');
    await writeFile(script, '#!/bin/sh\n: > "$1"\n', { mode: 0o755 });

    process.env['EDITOR'] = script;
    const result = await openEditor();
    expect(result).toBeNull();
  });

  it('returns null when editor saves whitespace-only file', async () => {
    const scriptDir = await mkdtemp(join(tmpdir(), 'weaver-test-'));
    const script = join(scriptDir, 'editor.sh');
    await writeFile(script, '#!/bin/sh\necho "   " > "$1"\n', { mode: 0o755 });

    process.env['EDITOR'] = script;
    const result = await openEditor();
    expect(result).toBeNull();
  });

  it('passes initial content to the editor', async () => {
    const scriptDir = await mkdtemp(join(tmpdir(), 'weaver-test-'));
    const script = join(scriptDir, 'editor.sh');
    // Script that reads the file and appends " edited"
    await writeFile(script, '#!/bin/sh\ncontent=$(cat "$1")\necho "${content} edited" > "$1"\n', { mode: 0o755 });

    process.env['EDITOR'] = script;
    const result = await openEditor('original');
    expect(result).toBe('original edited\n');
  });

  it('throws when editor exits with non-zero code', async () => {
    const scriptDir = await mkdtemp(join(tmpdir(), 'weaver-test-'));
    const script = join(scriptDir, 'editor.sh');
    await writeFile(script, '#!/bin/sh\nexit 1\n', { mode: 0o755 });

    process.env['EDITOR'] = script;
    await expect(openEditor()).rejects.toThrow('Editor exited with code 1');
  });

  it('throws when editor command does not exist', async () => {
    process.env['EDITOR'] = '/nonexistent/editor';
    await expect(openEditor()).rejects.toThrow();
  });
});
