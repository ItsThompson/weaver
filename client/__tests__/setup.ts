import { TextEncoder, TextDecoder } from 'node:util';

Object.assign(globalThis, { TextEncoder, TextDecoder });

// Mock EventSource for SSE tests
class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  private listeners: Record<string, ((event: MessageEvent) => void)[]> = {};
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    (this.listeners[type] ??= []).push(listener);
  }
  close() {}
}
Object.assign(globalThis, { EventSource: MockEventSource });
