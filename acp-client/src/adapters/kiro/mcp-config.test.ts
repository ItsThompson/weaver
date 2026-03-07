import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { McpServer } from '@agentclientprotocol/sdk';
import { readMcpServers } from './mcp-config.js';

function isStdioServer(s: McpServer): s is McpServer & { command: string; args: unknown[]; env: unknown[] } {
  return 'command' in s;
}

describe('readMcpServers', () => {
  let tmpDir: string;
  let workspaceDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `mcp-test-${randomUUID()}`);
    workspaceDir = join(tmpDir, 'workspace');
    mkdirSync(join(workspaceDir, '.kiro', 'settings'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array when no config files exist', () => {
    const result = readMcpServers(join(tmpDir, 'nonexistent'));
    expect(Array.isArray(result)).toBe(true);
  });

  it('reads workspace config', () => {
    writeFileSync(
      join(workspaceDir, '.kiro', 'settings', 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          'my-server': { command: 'npx', args: ['-y', 'my-mcp-server'], env: { API_KEY: 'test-key' } },
        },
      }),
    );

    const result = readMcpServers(workspaceDir);
    const myServer = result.find((s) => s.name === 'my-server');
    expect(myServer).toBeDefined();
    expect(isStdioServer(myServer!)).toBe(true);
    if (isStdioServer(myServer!)) {
      expect(myServer!.command).toBe('npx');
      expect(myServer!.args).toEqual(['-y', 'my-mcp-server']);
      expect(myServer!.env).toEqual([{ name: 'API_KEY', value: 'test-key' }]);
    }
  });

  it('handles config with empty mcpServers', () => {
    writeFileSync(
      join(workspaceDir, '.kiro', 'settings', 'mcp.json'),
      JSON.stringify({ mcpServers: {} }),
    );
    expect(Array.isArray(readMcpServers(workspaceDir))).toBe(true);
  });

  it('handles malformed JSON gracefully', () => {
    writeFileSync(join(workspaceDir, '.kiro', 'settings', 'mcp.json'), 'not valid json{{{');
    expect(Array.isArray(readMcpServers(workspaceDir))).toBe(true);
  });

  it('converts env object to array of {name, value}', () => {
    writeFileSync(
      join(workspaceDir, '.kiro', 'settings', 'mcp.json'),
      JSON.stringify({
        mcpServers: { test: { command: 'node', args: ['server.js'], env: { FOO: 'bar', BAZ: 'qux' } } },
      }),
    );

    const server = readMcpServers(workspaceDir).find((s) => s.name === 'test');
    expect(server).toBeDefined();
    if (isStdioServer(server!)) {
      expect(server!.env).toEqual([{ name: 'FOO', value: 'bar' }, { name: 'BAZ', value: 'qux' }]);
    }
  });

  it('defaults args and env when not provided', () => {
    writeFileSync(
      join(workspaceDir, '.kiro', 'settings', 'mcp.json'),
      JSON.stringify({ mcpServers: { minimal: { command: 'my-tool' } } }),
    );

    const server = readMcpServers(workspaceDir).find((s) => s.name === 'minimal');
    expect(server).toBeDefined();
    if (isStdioServer(server!)) {
      expect(server!.args).toEqual([]);
      expect(server!.env).toEqual([]);
    }
  });
});
