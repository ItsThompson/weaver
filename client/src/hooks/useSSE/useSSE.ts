import { useEffect } from "react";

type SSEHandlers = Record<string, (data: Record<string, unknown>) => void>;

export function useSSE(handlers: SSEHandlers): void {
  useEffect(() => {
    const source = new EventSource("/api/events");

    Object.entries(handlers).forEach(([event, handler]) => {
      source.addEventListener(event, (e: MessageEvent) => {
        try {
          handler(JSON.parse(e.data));
        } catch {
          /* malformed event data */
        }
      });
    });

    return () => source.close();
  }, [handlers]);
}
