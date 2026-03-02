import { useEffect, useRef } from 'react';
import { useNotifications } from '../context/NotificationContext';
import type { ActivityStatus } from '@shared/types';

const ACTIVITY_LABELS: Record<string, string> = {
  starting: 'Starting',
  idle: 'Idle',
  processing: 'Processing',
  running_tool: 'Running tool',
  pending_approval: 'Pending approval',
};

function deriveActivity(eventName: string): ActivityStatus {
  switch (eventName) {
    case 'agentSpawn': return 'starting';
    case 'stop': return 'idle';
    case 'preToolUse': return 'running_tool';
    default: return 'processing';
  }
}

export function useSessionNotifications(): void {
  const { addNotification } = useNotifications();
  const lastActivity = useRef(new Map<string, string>());

  useEffect(() => {
    const source = new EventSource('/api/events');

    source.addEventListener('update', (event: MessageEvent) => {
      try {
        const { sessionId, eventName, sessionName } = JSON.parse(event.data) as {
          sessionId: string;
          eventName?: string;
          sessionName?: string;
        };

        if (!eventName) return;

        const activity = deriveActivity(eventName);
        const prev = lastActivity.current.get(sessionId);

        // Only notify on state change
        if (activity === prev) return;
        lastActivity.current.set(sessionId, activity);

        const name = sessionName || sessionId.slice(0, 8);
        const label = ACTIVITY_LABELS[activity] ?? activity;
        addNotification(`${name} → ${label}`);
      } catch { /* ignore */ }
    });

    return () => source.close();
  }, [addNotification]);
}
