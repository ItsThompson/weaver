import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { McpServer } from '@agentclientprotocol/sdk';

interface KiroMcpServerEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface KiroMcpConfig {
  mcpServers?: Record<string, KiroMcpServerEntry>;
}

function isKiroMcpConfig(value: unknown): value is KiroMcpConfig {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return !('mcpServers' in obj) || typeof obj.mcpServers === 'object';
}

function readConfigFile(path: string): KiroMcpConfig | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    return isKiroMcpConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function toAcpServer(name: string, entry: KiroMcpServerEntry): McpServer {
  return {
    name,
    command: entry.command,
    args: entry.args ?? [],
    env: entry.env
      ? Object.entries(entry.env).map(([n, value]) => ({ name: n, value }))
      : [],
  };
}

export function readMcpServers(cwd: string): McpServer[] {
  const globalConfig = readConfigFile(join(homedir(), '.kiro', 'settings', 'mcp.json'));
  const workspaceConfig = readConfigFile(join(cwd, '.kiro', 'settings', 'mcp.json'));

  const merged = new Map<string, KiroMcpServerEntry>();

  if (globalConfig?.mcpServers) {
    for (const [name, entry] of Object.entries(globalConfig.mcpServers)) {
      merged.set(name, entry);
    }
  }

  if (workspaceConfig?.mcpServers) {
    for (const [name, entry] of Object.entries(workspaceConfig.mcpServers)) {
      merged.set(name, entry);
    }
  }

  return Array.from(merged.entries()).map(([name, entry]) => toAcpServer(name, entry));
}
