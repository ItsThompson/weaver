import { useEffect, useRef } from "react";

type SSEHandlers = Record<string, (data: Record<string, unknown>) => void>;

export function useSSE(handlers: SSEHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const source = new EventSource("/api/events");

    Object.keys(handlersRef.current).forEach((event) => {
      source.addEventListener(event, (e: MessageEvent) => {
        try {
          handlersRef.current[event]?.(JSON.parse(e.data));
        } catch {
          /* malformed event data */
        }
      });
    });

    return () => source.close();
  }, []);
}
