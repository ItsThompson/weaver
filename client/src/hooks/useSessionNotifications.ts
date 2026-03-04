import { useEffect, useRef } from 'react';
import { useNotifications } from '../context/NotificationContext';
import { useActivityLog, type ActivityLogEntry } from '../context/ActivityLogContext';
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
  const { entries } = useActivityLog();
  const seenRef = useRef(0);

  useEffect(() => {
    const unseen = entries.filter((e) => e.id > seenRef.current);
    if (unseen.length === 0) return;
    seenRef.current = entries[0].id;

    for (const entry of unseen) {
      addNotification(entry.message, 'info', ACTIVITY_SOUND[entry.activity]);
    }
  }, [entries, addNotification]);
}
