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

export interface EventBus {
  subscribe(listener: Listener): () => void;
  broadcast(
    sessionId: string,
    eventName?: HookEventName,
    sessionName?: string,
  ): void;
  emit(msg: SSEMessage): void;
  sseReply(reply: SSETarget): () => void;
}

export function createEventBus(): EventBus {
  const listeners = new Set<Listener>();

  const bus: EventBus = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    broadcast(sessionId, eventName?, sessionName?) {
      bus.emit({
        event: "update",
        data: { sessionId, eventName, sessionName },
      });
    },
    emit(msg) {
      listeners.forEach((listener) => {
        try {
          listener(msg);
        } catch {
          /* prevent one broken listener from blocking others */
        }
      });
    },
    sseReply(reply) {
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const unsubscribe = bus.subscribe((msg) => {
        reply.raw.write(
          `event: ${msg.event}\ndata: ${JSON.stringify(msg.data)}\n\n`,
        );
      });

      reply.raw.on("close", unsubscribe);
      return unsubscribe;
    },
  };

  return bus;
}

const defaultBus = createEventBus();

export const { subscribe, broadcast, emit, sseReply } = defaultBus;
