type MockEventSource = {
  simulateEvent(type: string, data: Record<string, unknown>): void;
  close(): void;
};

export function getLastEventSource(): MockEventSource {
  const instance = (
    EventSource as unknown as { lastInstance: MockEventSource | null }
  ).lastInstance;
  if (!instance) {
    throw new Error("No MockEventSource instance found");
  }
  return instance;
}

export function dispatchSSE(type: string, data: Record<string, unknown>): void {
  getLastEventSource().simulateEvent(type, data);
}
