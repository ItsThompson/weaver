import { useEffect } from 'react';
import { revalidateSessions, revalidateSession, revalidateConfig } from '../queries';

export function useSessionEvents(debounceMs = 1000): void {
  useEffect(() => {
    const pending = new Map<string, ReturnType<typeof setTimeout>>();
    const source = new EventSource('/api/events');

    source.addEventListener('update', (event: MessageEvent) => {
      try {
        const { sessionId } = JSON.parse(event.data) as { sessionId: string };
        const existing = pending.get(sessionId);
        if (existing) clearTimeout(existing);
        pending.set(sessionId, setTimeout(() => {
          pending.delete(sessionId);
          revalidateSessions();
          revalidateSession(sessionId);
        }, debounceMs));
      } catch { /* ignore malformed */ }
    });

    source.addEventListener('configChanged', () => {
      revalidateConfig();
    });

    return () => {
      source.close();
      for (const timer of pending.values()) clearTimeout(timer);
    };
  }, [debounceMs]);
}
