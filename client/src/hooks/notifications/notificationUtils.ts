import type { ActivityStatus } from '@weaver/shared/types';

const ACTIVITY_LABELS: Record<string, string> = {
  starting: 'Starting',
  idle: 'Idle',
  processing: 'Processing',
  running_tool: 'Running tool',
  pending_approval: 'Pending approval',
};

export function deriveActivity(eventName: string): ActivityStatus {
  switch (eventName) {
    case 'agentSpawn': return 'starting';
    case 'stop': return 'idle';
    case 'preToolUse': return 'running_tool';
    default: return 'processing';
  }
}

/**
 * Returns a notification message for every activity change, or null if the activity is unchanged.
 */
export function resolveNotification(
  sessionId: string,
  eventName: string,
  sessionName: string | undefined,
  lastActivity: Map<string, string>,
): string | null {
  const activity = deriveActivity(eventName);
  const prev = lastActivity.get(sessionId);
  lastActivity.set(sessionId, activity);

  if (activity === prev) return null;

  const skip = (prev === 'processing' && activity === 'running_tool')
    || (prev === 'running_tool' && activity === 'processing');
  if (skip) return null;

  const name = sessionName || sessionId.slice(0, 8);
  const label = ACTIVITY_LABELS[activity] ?? activity;
  return `${name} → ${label}`;
}
