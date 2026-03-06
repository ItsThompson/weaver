const SERVER_URL = () => 'http://localhost:8143';

export async function notifyServer(sessionId: string, eventName?: string): Promise<void> {
  try {
    await fetch(`${SERVER_URL()}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, eventName }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Fire-and-forget: server may not be running
  }
}
