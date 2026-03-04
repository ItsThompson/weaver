import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { deriveActivity, resolveNotification } from '../hooks/notificationUtils';
import type { ActivityStatus } from '@weaver/shared/types';

const MAX_ENTRIES = 20;

export interface ActivityLogEntry {
  id: number;
  message: string;
  activity: ActivityStatus;
  timestamp: number;
}

interface ActivityLogContextValue {
  entries: ActivityLogEntry[];
}

const ActivityLogContext = createContext<ActivityLogContextValue>({ entries: [] });

export function ActivityLogProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const counterRef = useRef(0);
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
        if (!message) return;

        const entry: ActivityLogEntry = {
          id: ++counterRef.current,
          message,
          activity: deriveActivity(eventName),
          timestamp: Date.now(),
        };

        setEntries((prev) => [entry, ...prev].slice(0, MAX_ENTRIES));
      } catch { /* ignore */ }
    });

    return () => source.close();
  }, []);

  return (
    <ActivityLogContext.Provider value={{ entries }}>
      {children}
    </ActivityLogContext.Provider>
  );
}

export function useActivityLog(): ActivityLogContextValue {
  return useContext(ActivityLogContext);
}
