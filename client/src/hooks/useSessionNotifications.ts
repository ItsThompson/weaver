import { useEffect, useRef } from 'react';
import { useNotifications } from '../context/NotificationContext';
import { resolveNotification } from './notificationUtils';

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
        if (message) addNotification(message);
      } catch { /* ignore */ }
    });

    return () => source.close();
  }, [addNotification]);
}
