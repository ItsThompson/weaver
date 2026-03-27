import "@testing-library/jest-dom/vitest";
import { TextEncoder, TextDecoder } from "node:util";

Object.assign(globalThis, { TextEncoder, TextDecoder });

// jsdom does not implement URL.createObjectURL (needed by soundUtils)
URL.createObjectURL = () => "blob:mock";

// Mock EventSource for SSE tests
class MockEventSource {
  static lastInstance: MockEventSource | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  private listeners: Record<string, ((event: MessageEvent) => void)[]> = {};
  constructor(_url?: string) {
    MockEventSource.lastInstance = this;
  }
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    (this.listeners[type] ??= []).push(listener);
  }
  close() {}
  simulateEvent(type: string, data: Record<string, unknown>) {
    (this.listeners[type] ?? []).forEach((fn) =>
      fn(new MessageEvent(type, { data: JSON.stringify(data) })),
    );
  }
}
Object.assign(globalThis, { EventSource: MockEventSource });
