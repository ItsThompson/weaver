const enabledSessions = new Set<string>();

export const isWebhookEnabled = (sessionId: string) =>
  enabledSessions.has(sessionId);

export const setWebhookEnabled = (sessionId: string, enabled: boolean) => {
  if (enabled) {
    enabledSessions.add(sessionId);
  } else {
    enabledSessions.delete(sessionId);
  }
};

export const clearAll = () => enabledSessions.clear();
