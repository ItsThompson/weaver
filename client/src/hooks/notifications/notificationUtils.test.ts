import { deriveActivity, resolveNotification } from './notificationUtils';

describe('deriveActivity', () => {
  it.each([
    ['agentSpawn', 'starting'],
    ['stop', 'idle'],
    ['preToolUse', 'running_tool'],
    ['userPromptSubmit', 'processing'],
    ['postToolUse', 'processing'],
  ])('maps %s to %s', (eventName, expected) => {
    expect(deriveActivity(eventName)).toBe(expected);
  });
});

describe('resolveNotification', () => {
  let lastActivity: Map<string, string>;

  beforeEach(() => { lastActivity = new Map(); });

  it.each([
    ['agentSpawn', 'My Session → Starting'],
    ['stop', 'My Session → Idle'],
    ['userPromptSubmit', 'My Session → Processing'],
    ['preToolUse', 'My Session → Running tool'],
    ['postToolUse', 'My Session → Processing'],
  ])('notifies on first %s event', (eventName, expected) => {
    expect(resolveNotification('s1', eventName, 'My Session', lastActivity)).toBe(expected);
  });

  it.each([
    ['processing → running_tool', 'userPromptSubmit', 'preToolUse'],
    ['running_tool → processing', 'preToolUse', 'postToolUse'],
  ])('silences %s', (_label, setup, event) => {
    resolveNotification('s1', setup, 'X', lastActivity);
    expect(resolveNotification('s1', event, 'X', lastActivity)).toBeNull();
  });

  it('deduplicates same state', () => {
    resolveNotification('s1', 'stop', 'X', lastActivity);
    expect(resolveNotification('s1', 'stop', 'X', lastActivity)).toBeNull();
  });

  it('tracks sessions independently', () => {
    resolveNotification('s1', 'stop', 'A', lastActivity);
    expect(resolveNotification('s2', 'stop', 'B', lastActivity)).toBe('B → Idle');
  });

  it('falls back to truncated session ID when no name', () => {
    expect(resolveNotification('abcdefgh-1234', 'agentSpawn', undefined, lastActivity)).toBe('abcdefgh → Starting');
  });

  it('returns validation message for validation event', () => {
    expect(resolveNotification('s1', 'validation', 'My Session', lastActivity)).toBe('My Session → Validation complete');
  });

  it('always shows validation even when activity is unchanged', () => {
    resolveNotification('s1', 'userPromptSubmit', 'X', lastActivity);
    // validation bypasses dedup — would normally be silenced as processing → processing
    expect(resolveNotification('s1', 'validation', 'X', lastActivity)).toBe('X → Validation complete');
  });

  it('simulates full session lifecycle', () => {
    const events = [
      'agentSpawn', 'userPromptSubmit', 'preToolUse', 'postToolUse',
      'preToolUse', 'postToolUse', 'stop', 'userPromptSubmit',
      'preToolUse', 'postToolUse', 'stop',
    ];
    const notifications = events
      .map((e) => resolveNotification('s1', e, 'Test', lastActivity))
      .filter(Boolean);

    expect(notifications).toEqual([
      'Test → Starting',
      'Test → Processing',
      'Test → Idle',
      'Test → Processing',
      'Test → Idle',
    ]);
  });
});
