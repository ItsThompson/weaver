import type { WeaverDb } from '@weaver/shared/db';

export interface ExtensionHandlerDeps {
  db: WeaverDb;
  getInternalSessionId: (acpSessionId: string) => string | undefined;
  onCompactionStatus?: (sessionId: string, status: string) => void;
  onClearStatus?: (sessionId: string, status: string) => void;
  onMcpServerInitialized?: (sessionId: string, serverName: string) => void;
  onOAuthRequest?: (sessionId: string, url: string) => void;
}

export function createExtensionHandler(deps: ExtensionHandlerDeps) {
  return async (method: string, params: Record<string, unknown>): Promise<void> => {
    const acpSessionId = params.sessionId as string | undefined;
    const internalId = acpSessionId ? deps.getInternalSessionId(acpSessionId) : undefined;

    switch (method) {
      case '_kiro.dev/metadata': {
        if (!internalId) return;
        const pct = params.contextUsagePercentage as number | undefined;
        if (pct != null) {
          deps.db.updateSession(internalId, { context_usage_percent: pct });
        }
        break;
      }
      case '_kiro.dev/compaction/status': {
        if (internalId) deps.onCompactionStatus?.(internalId, params.status as string ?? '');
        break;
      }
      case '_kiro.dev/clear/status': {
        if (internalId) deps.onClearStatus?.(internalId, params.status as string ?? '');
        break;
      }
      case '_kiro.dev/mcp/server_initialized': {
        if (internalId) deps.onMcpServerInitialized?.(internalId, params.serverName as string ?? '');
        break;
      }
      case '_kiro.dev/mcp/oauth_request': {
        if (internalId) deps.onOAuthRequest?.(internalId, params.url as string ?? '');
        break;
      }
    }
  };
}
