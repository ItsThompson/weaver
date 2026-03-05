import { jest } from '@jest/globals';

export function mockServices() {
  jest.unstable_mockModule('../../services/storage/index', () => ({
    readSessions: jest.fn(),
    writeSessions: jest.fn(),
    isProcessRunning: jest.fn(),
    ensureDataDir: jest.fn(),
    appendSession: jest.fn(),
    startStaleSessionCleanup: jest.fn(),
    stopStaleSessionCleanup: jest.fn(),
    cleanStaleSessions: jest.fn(),
  }));

  jest.unstable_mockModule('../../services/log-parser/index', () => ({
    parseLogFile: jest.fn(),
    groupEventsByTurn: jest.fn(),
    getLastEvent: jest.fn<() => Promise<{ name: string; timestamp: string } | null>>()
      .mockResolvedValue({ name: 'stop', timestamp: new Date().toISOString() }),
    deriveActivity: jest.fn().mockReturnValue('idle'),
  }));

  jest.unstable_mockModule('../../services/event-bus', () => ({
    broadcast: jest.fn(),
    emit: jest.fn(),
    sseReply: jest.fn(),
  }));

  jest.unstable_mockModule('../../services/webhook/index', () => ({
    handleWebhookEvent: jest.fn(),
    isWebhookEnabled: jest.fn().mockReturnValue(false),
    setWebhookEnabled: jest.fn(),
    stopWebhookTimers: jest.fn(),
  }));

  jest.unstable_mockModule('../../utils/logger', () => ({
    log: jest.fn(),
  }));
}
