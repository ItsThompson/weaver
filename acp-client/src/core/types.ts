import type { Agent, InitializeResponse, Client, ClientSideConnection } from '@agentclientprotocol/sdk';

export interface ConnectionOptions {
  agentCommand: string;
  agentArgs: string[];
  clientInfo: { name: string; version: string };
  createClient: (agent: Agent) => Client;
}

export interface ActiveConnection {
  agent: ClientSideConnection;
  capabilities: InitializeResponse;
  pid: number;
  shutdown: () => Promise<void>;
}
