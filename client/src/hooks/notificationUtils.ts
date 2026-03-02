import type { ActivityStatus } from '@shared/types';

export const ACTIVITY_LABELS: Record<string, string> = {
  starting: 'Starting',
  idle: 'Idle',
  processing: 'Processing',
  running_tool: 'Running tool',
  pending_approval: 'Pending approval',
};

export const NOTIFY_STATES = new Set<ActivityStatus>(['starting', 'idle', 'pending_approval']);

export function deriveActivity(eventName: string): ActivityStatus {
  switch (eventName) {
    case 'agentSpawn': return 'starting';
    case 'stop': return 'idle';
    case 'preToolUse': return 'running_tool';
    default: return 'processing';
  }
}

/**
 * Determines whether a notification should be shown for a session update.
 * Returns the notification message, or null if suppressed.
 */
export function resolveNotification(
  sessionId: string,
  eventName: string,
  sessionName: string | undefined,
  lastActivity: Map<string, string>,
): string | null {
  const activity = deriveActivity(eventName);
  const prev = lastActivity.get(sessionId);

  if (activity === prev || !NOTIFY_STATES.has(activity)) return null;

  lastActivity.set(sessionId, activity);
  const name = sessionName || sessionId.slice(0, 8);
  const label = ACTIVITY_LABELS[activity] ?? activity;
  return `${name} → ${label}`;
}
