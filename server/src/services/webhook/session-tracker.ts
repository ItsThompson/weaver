const enabledSessions = new Set<string>();

export const isWebhookEnabled = (sessionId: string) =>
  enabledSessions.has(sessionId);

export const setWebhookEnabled = (sessionId: string, enabled: boolean) => {
  enabled ? enabledSessions.add(sessionId) : enabledSessions.delete(sessionId);
};

export const clearAll = () => enabledSessions.clear();
