import { WeaverEventName } from "@weaver/shared/types";
import {
  subscribe,
  broadcast,
  emit,
  sseReply,
  createEventBus,
} from "./event-bus";
import type { SSETarget } from "./event-bus";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("subscribe", () => {
  it("returns an unsubscribe function", () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("delivers messages to subscribed listeners", () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    emit({ event: "test", data: { a: 1 } });
    expect(listener).toHaveBeenCalledWith({ event: "test", data: { a: 1 } });
    unsub();
  });

  it("stops delivering after unsubscribe", () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    unsub();
    emit({ event: "test", data: {} });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("emit", () => {
  it("fans out to all listeners", () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribe(a);
    const unsubB = subscribe(b);
    emit({ event: "ping", data: { x: true } });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    unsubA();
    unsubB();
  });

  it("does nothing with no listeners", () => {
    expect(() => emit({ event: "noop", data: {} })).not.toThrow();
  });
});

describe("broadcast", () => {
  it("emits an update event with session data", () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    broadcast("sess-1", WeaverEventName.AGENT_SPAWN, "my-project");
    expect(listener).toHaveBeenCalledWith({
      event: "update",
      data: {
        sessionId: "sess-1",
        eventName: WeaverEventName.AGENT_SPAWN,
        sessionName: "my-project",
      },
    });
    unsub();
  });

  it("passes undefined for optional fields when omitted", () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    broadcast("sess-1");
    expect(listener).toHaveBeenCalledWith({
      event: "update",
      data: {
        sessionId: "sess-1",
        eventName: undefined,
        sessionName: undefined,
      },
    });
    unsub();
  });
});

describe("sseReply", () => {
  function mockReply(): SSETarget {
    return {
      raw: {
        writeHead: vi.fn(),
        write: vi.fn<() => boolean>(),
        on: vi.fn(),
      },
    };
  }

  it("sets SSE headers", () => {
    const reply = mockReply();
    sseReply(reply);
    expect(reply.raw.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
  });

  it("writes SSE-formatted data on broadcast", () => {
    const reply = mockReply();
    const unsub = sseReply(reply);
    emit({ event: "update", data: { sessionId: "s1" } });
    expect(reply.raw.write).toHaveBeenCalledWith(
      'event: update\ndata: {"sessionId":"s1"}\n\n',
    );
    unsub();
  });

  it("stops writing after unsubscribe", () => {
    const reply = mockReply();
    const unsub = sseReply(reply);
    unsub();
    emit({ event: "update", data: { sessionId: "s1" } });
    expect(reply.raw.write).not.toHaveBeenCalled();
  });

  it("unsubscribes when the connection closes", () => {
    const reply = mockReply();
    sseReply(reply);
    const onClose = (reply.raw.on as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => call[0] === "close",
    );
    expect(onClose).toBeDefined();

    // Simulate connection close
    const closeHandler = onClose![1] as () => void;
    closeHandler();

    emit({ event: "update", data: { sessionId: "s1" } });
    expect(reply.raw.write).not.toHaveBeenCalled();
  });
});

describe("createEventBus", () => {
  it("returns isolated instances with separate listener sets", () => {
    const busA = createEventBus();
    const busB = createEventBus();
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    busA.subscribe(listenerA);
    busB.subscribe(listenerB);

    busB.emit({ event: "test", data: {} });

    expect(listenerA).not.toHaveBeenCalled();
    expect(listenerB).toHaveBeenCalledTimes(1);
  });

  it("removes listener when unsubscribe is called", () => {
    const bus = createEventBus();
    const listener = vi.fn();
    const unsub = bus.subscribe(listener);

    unsub();
    bus.emit({ event: "test", data: {} });

    expect(listener).not.toHaveBeenCalled();
  });

  it("delivers to remaining listeners when one throws", () => {
    const bus = createEventBus();
    const throwing = vi.fn(() => {
      throw new Error("boom");
    });
    const healthy = vi.fn();

    bus.subscribe(throwing);
    bus.subscribe(healthy);

    bus.emit({ event: "test", data: { x: 1 } });

    expect(throwing).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledWith({ event: "test", data: { x: 1 } });
  });
});
