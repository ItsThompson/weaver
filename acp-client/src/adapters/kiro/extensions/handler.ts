import type { ExtensionHandlerDeps } from './types.js';

function getString(params: Record<string, unknown>, key: string): string {
  const val = params[key];
  return typeof val === 'string' ? val : '';
}

function getNumber(params: Record<string, unknown>, key: string): number | undefined {
  const val = params[key];
  return typeof val === 'number' ? val : undefined;
}

export function createExtensionHandler(deps: ExtensionHandlerDeps) {
  return async (method: string, params: Record<string, unknown>): Promise<void> => {
    const acpSessionId = getString(params, 'sessionId') || undefined;
    const internalId = acpSessionId ? deps.getInternalSessionId(acpSessionId) : undefined;

    switch (method) {
      case '_kiro.dev/metadata': {
        if (!internalId) return;
        const pct = getNumber(params, 'contextUsagePercentage');
        if (pct != null) {
          deps.db.updateSession(internalId, { context_usage_percent: pct });
        }
        break;
      }
      case '_kiro.dev/compaction/status': {
        if (internalId) deps.onCompactionStatus?.(internalId, getString(params, 'status'));
        break;
      }
      case '_kiro.dev/clear/status': {
        if (internalId) deps.onClearStatus?.(internalId, getString(params, 'status'));
        break;
      }
      case '_kiro.dev/mcp/server_initialized': {
        if (internalId) deps.onMcpServerInitialized?.(internalId, getString(params, 'serverName'));
        break;
      }
      case '_kiro.dev/mcp/oauth_request': {
        if (internalId) deps.onOAuthRequest?.(internalId, getString(params, 'url'));
        break;
      }
    }
  };
}
