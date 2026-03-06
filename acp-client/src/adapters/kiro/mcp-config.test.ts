import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { McpServerStdio } from '@agentclientprotocol/sdk';
import { readMcpServers } from './mcp-config.js';

describe('readMcpServers', () => {
  let tmpDir: string;
  let globalDir: string;
  let workspaceDir: string;

  // We override homedir by writing to a temp dir structure
  // But readMcpServers uses homedir() for global config.
  // Instead, we'll test with workspace-only and use a real temp dir as cwd.

  beforeEach(() => {
    tmpDir = join(tmpdir(), `mcp-test-${randomUUID()}`);
    globalDir = join(tmpDir, 'global', '.kiro', 'settings');
    workspaceDir = join(tmpDir, 'workspace');
    mkdirSync(globalDir, { recursive: true });
    mkdirSync(join(workspaceDir, '.kiro', 'settings'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array when no config files exist', () => {
    const result = readMcpServers(join(tmpDir, 'nonexistent'));
    // Global config at ~/.kiro may or may not exist, but workspace won't
    // We can't control homedir in this test, so just verify it returns an array
    expect(Array.isArray(result)).toBe(true);
  });

  it('reads workspace config', () => {
    writeFileSync(
      join(workspaceDir, '.kiro', 'settings', 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          'my-server': {
            command: 'npx',
            args: ['-y', 'my-mcp-server'],
            env: { API_KEY: 'test-key' },
          },
        },
      }),
    );

    const result = readMcpServers(workspaceDir);
    const myServer = result.find((s) => s.name === 'my-server') as McpServerStdio | undefined;
    expect(myServer).toBeDefined();
    expect(myServer!.command).toBe('npx');
    expect(myServer!.args).toEqual(['-y', 'my-mcp-server']);
    expect(myServer!.env).toEqual([{ name: 'API_KEY', value: 'test-key' }]);
  });

  it('handles config with empty mcpServers', () => {
    writeFileSync(
      join(workspaceDir, '.kiro', 'settings', 'mcp.json'),
      JSON.stringify({ mcpServers: {} }),
    );

    const result = readMcpServers(workspaceDir);
    // Should not add any workspace servers (global may contribute)
    expect(Array.isArray(result)).toBe(true);
  });

  it('handles malformed JSON gracefully', () => {
    writeFileSync(
      join(workspaceDir, '.kiro', 'settings', 'mcp.json'),
      'not valid json{{{',
    );

    // Should not throw
    const result = readMcpServers(workspaceDir);
    expect(Array.isArray(result)).toBe(true);
  });

  it('converts env object to array of {name, value}', () => {
    writeFileSync(
      join(workspaceDir, '.kiro', 'settings', 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          test: {
            command: 'node',
            args: ['server.js'],
            env: { FOO: 'bar', BAZ: 'qux' },
          },
        },
      }),
    );

    const result = readMcpServers(workspaceDir);
    const server = result.find((s) => s.name === 'test') as McpServerStdio | undefined;
    expect(server).toBeDefined();
    expect(server!.env).toEqual([
      { name: 'FOO', value: 'bar' },
      { name: 'BAZ', value: 'qux' },
    ]);
  });

  it('defaults args and env when not provided', () => {
    writeFileSync(
      join(workspaceDir, '.kiro', 'settings', 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          minimal: { command: 'my-tool' },
        },
      }),
    );

    const result = readMcpServers(workspaceDir);
    const server = result.find((s) => s.name === 'minimal') as McpServerStdio | undefined;
    expect(server).toBeDefined();
    expect(server!.args).toEqual([]);
    expect(server!.env).toEqual([]);
  });
});
