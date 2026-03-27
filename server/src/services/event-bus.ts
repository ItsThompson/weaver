import type { HookEventName } from "@weaver/shared/types";

export interface SSETarget {
  raw: {
    writeHead(statusCode: number, headers: Record<string, string>): void;
    write(chunk: string): boolean;
    on(event: string, listener: () => void): void;
  };
}

interface SSEMessage {
  event: string;
  data: Record<string, unknown>;
}

type Listener = (msg: SSEMessage) => void;

const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function broadcast(
  sessionId: string,
  eventName?: HookEventName,
  sessionName?: string,
): void {
  emit({ event: "update", data: { sessionId, eventName, sessionName } });
}

export function emit(msg: SSEMessage): void {
  listeners.forEach((listener) => listener(msg));
}

export function sseReply(reply: SSETarget): () => void {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const unsubscribe = subscribe((msg) => {
    reply.raw.write(
      `event: ${msg.event}\ndata: ${JSON.stringify(msg.data)}\n\n`,
    );
  });

  reply.raw.on("close", unsubscribe);
  return unsubscribe;
}
