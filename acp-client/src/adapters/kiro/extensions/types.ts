import type { WeaverDb } from '@weaver/shared/db';

export interface ExtensionHandlerDeps {
  db: WeaverDb;
  getInternalSessionId: (acpSessionId: string) => string | undefined;
  onCompactionStatus?: (sessionId: string, status: string) => void;
  onClearStatus?: (sessionId: string, status: string) => void;
  onMcpServerInitialized?: (sessionId: string, serverName: string) => void;
  onOAuthRequest?: (sessionId: string, url: string) => void;
}
