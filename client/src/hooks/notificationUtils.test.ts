import { deriveActivity, resolveNotification } from './notificationUtils';

describe('deriveActivity', () => {
  it('maps agentSpawn to starting', () => expect(deriveActivity('agentSpawn')).toBe('starting'));
  it('maps stop to idle', () => expect(deriveActivity('stop')).toBe('idle'));
  it('maps preToolUse to running_tool', () => expect(deriveActivity('preToolUse')).toBe('running_tool'));
  it('maps userPromptSubmit to processing', () => expect(deriveActivity('userPromptSubmit')).toBe('processing'));
  it('maps postToolUse to processing', () => expect(deriveActivity('postToolUse')).toBe('processing'));
});

describe('resolveNotification', () => {
  let lastActivity: Map<string, string>;

  beforeEach(() => { lastActivity = new Map(); });

  it('notifies on agentSpawn (starting)', () => {
    const msg = resolveNotification('s1', 'agentSpawn', 'My Session', lastActivity);
    expect(msg).toBe('My Session → Starting');
  });

  it('notifies on stop (idle)', () => {
    const msg = resolveNotification('s1', 'stop', 'My Session', lastActivity);
    expect(msg).toBe('My Session → Idle');
  });

  it('suppresses processing (userPromptSubmit)', () => {
    const msg = resolveNotification('s1', 'userPromptSubmit', 'My Session', lastActivity);
    expect(msg).toBeNull();
  });

  it('suppresses running_tool (preToolUse)', () => {
    const msg = resolveNotification('s1', 'preToolUse', 'My Session', lastActivity);
    expect(msg).toBeNull();
  });

  it('suppresses postToolUse (processing)', () => {
    const msg = resolveNotification('s1', 'postToolUse', 'My Session', lastActivity);
    expect(msg).toBeNull();
  });

  it('deduplicates same state', () => {
    resolveNotification('s1', 'stop', 'X', lastActivity);
    const msg = resolveNotification('s1', 'stop', 'X', lastActivity);
    expect(msg).toBeNull();
  });

  it('notifies again after state change', () => {
    resolveNotification('s1', 'agentSpawn', 'X', lastActivity);
    // processing and running_tool are suppressed
    resolveNotification('s1', 'userPromptSubmit', 'X', lastActivity);
    resolveNotification('s1', 'preToolUse', 'X', lastActivity);
    resolveNotification('s1', 'postToolUse', 'X', lastActivity);
    const msg = resolveNotification('s1', 'stop', 'X', lastActivity);
    expect(msg).toBe('X → Idle');
  });

  it('tracks sessions independently', () => {
    resolveNotification('s1', 'stop', 'A', lastActivity);
    const msg = resolveNotification('s2', 'stop', 'B', lastActivity);
    expect(msg).toBe('B → Idle');
  });

  it('falls back to truncated session ID when no name', () => {
    const msg = resolveNotification('abcdefgh-1234', 'agentSpawn', undefined, lastActivity);
    expect(msg).toBe('abcdefgh → Starting');
  });

  it('simulates full session lifecycle with minimal notifications', () => {
    const notifications: string[] = [];
    const events = [
      'agentSpawn', 'userPromptSubmit', 'preToolUse', 'postToolUse',
      'preToolUse', 'postToolUse', 'stop', 'userPromptSubmit',
      'preToolUse', 'postToolUse', 'stop',
    ];
    for (const e of events) {
      const msg = resolveNotification('s1', e, 'Test', lastActivity);
      if (msg) notifications.push(msg);
    }
    expect(notifications).toEqual([
      'Test → Starting',
      'Test → Idle',
      // Second stop deduped — already idle
    ]);
  });
});
