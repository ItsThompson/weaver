import { jest } from "@jest/globals";
import { subscribe, broadcast, emit } from "./event-bus";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("subscribe", () => {
  it("returns an unsubscribe function", () => {
    const listener = jest.fn();
    const unsub = subscribe(listener);
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("delivers messages to subscribed listeners", () => {
    const listener = jest.fn();
    const unsub = subscribe(listener);
    emit({ event: "test", data: { a: 1 } });
    expect(listener).toHaveBeenCalledWith({ event: "test", data: { a: 1 } });
    unsub();
  });

  it("stops delivering after unsubscribe", () => {
    const listener = jest.fn();
    const unsub = subscribe(listener);
    unsub();
    emit({ event: "test", data: {} });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("emit", () => {
  it("fans out to all listeners", () => {
    const a = jest.fn();
    const b = jest.fn();
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
    const listener = jest.fn();
    const unsub = subscribe(listener);
    broadcast("sess-1", "agentSpawn", "my-project");
    expect(listener).toHaveBeenCalledWith({
      event: "update",
      data: {
        sessionId: "sess-1",
        eventName: "agentSpawn",
        sessionName: "my-project",
      },
    });
    unsub();
  });

  it("passes undefined for optional fields when omitted", () => {
    const listener = jest.fn();
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
  // sseReply depends on FastifyReply internals (raw.writeHead, raw.write, raw.on)
  // which are tightly coupled to the HTTP layer. Testing it here would require
  // a full mock of the Node HTTP response. The route-level tests in events.test.ts
  // already cover SSE delivery end-to-end, so we skip duplicating that here.
});
