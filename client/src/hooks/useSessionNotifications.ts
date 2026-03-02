import { useEffect, useRef } from 'react';
import { useNotifications } from '../context/NotificationContext';
import { deriveActivity, resolveNotification } from './notificationUtils';
import type { NotificationSound } from './soundUtils';
import type { ActivityStatus } from '@weaver/shared/types';

const ACTIVITY_SOUND: Record<ActivityStatus, NotificationSound> = {
  idle: 'chime',
  starting: 'beep',
  processing: 'beep',
  running_tool: 'beep',
  pending_approval: 'beep',
};

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

        const message = resolveNotification(sessionId, eventName, sessionName, lastActivity.current);
        if (message) {
          const activity = deriveActivity(eventName);
          addNotification(message, 'info', ACTIVITY_SOUND[activity]);
        }
      } catch { /* ignore */ }
    });

    return () => source.close();
  }, [addNotification]);
}
