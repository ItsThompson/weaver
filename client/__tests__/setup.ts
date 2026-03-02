import { TextEncoder, TextDecoder } from 'node:util';

Object.assign(globalThis, { TextEncoder, TextDecoder });

// Mock EventSource for SSE tests
class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  close() {}
}
Object.assign(globalThis, { EventSource: MockEventSource });
