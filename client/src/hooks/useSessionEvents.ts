import { useEffect, useRef } from 'react';

interface UseSessionEventsOptions {
  onUpdate: (sessionId: string) => void;
  debounceMs?: number;
}

export function useSessionEvents({ onUpdate, debounceMs = 1000 }: UseSessionEventsOptions): void {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    const pending = new Map<string, ReturnType<typeof setTimeout>>();
    const source = new EventSource('/api/events');

    source.onmessage = (event) => {
      try {
        const { sessionId } = JSON.parse(event.data) as { sessionId: string };
        const existing = pending.get(sessionId);
        if (existing) clearTimeout(existing);
        pending.set(sessionId, setTimeout(() => {
          pending.delete(sessionId);
          callbackRef.current(sessionId);
        }, debounceMs));
      } catch { /* ignore malformed */ }
    };

    return () => {
      source.close();
      for (const timer of pending.values()) clearTimeout(timer);
    };
  }, [debounceMs]);
}
