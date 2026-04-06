import { useRef, useMemo, useCallback, useEffect } from "react";
import {
  revalidateSessions,
  revalidateSession,
  revalidateConfig,
} from "../queries";
import { useSSE } from "../useSSE";

export function useSessionEvents(debounceMs = 1000): void {
  const pendingRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Clear pending timers on unmount
  useEffect(() => {
    return () => {
      pendingRef.current.forEach((timer) => clearTimeout(timer));
      pendingRef.current.clear();
    };
  }, []);

  const handleUpdate = useCallback(
    (data: Record<string, unknown>) => {
      const { sessionId } = data as { sessionId: string };
      const pending = pendingRef.current;
      const existing = pending.get(sessionId);
      if (existing) {
        clearTimeout(existing);
      }
      pending.set(
        sessionId,
        setTimeout(() => {
          pending.delete(sessionId);
          revalidateSessions();
          revalidateSession(sessionId);
        }, debounceMs),
      );
    },
    [debounceMs],
  );

  const handleConfigChanged = useCallback(() => {
    revalidateConfig();
  }, []);

  const handlers = useMemo(
    () => ({
      update: handleUpdate,
      configChanged: handleConfigChanged,
    }),
    [handleUpdate, handleConfigChanged],
  );

  useSSE(handlers);
}
