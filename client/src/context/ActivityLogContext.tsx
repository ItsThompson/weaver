import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import {
  deriveActivity,
  resolveNotification,
} from "../hooks/notifications/notificationUtils";
import type { ActivityStatus } from "@weaver/shared/types";
import { NOTIFICATION_AUTO_DISMISS_MS } from "../constants";

const MAX_ENTRIES = 10;

export interface ActivityLogEntry {
  id: number;
  message: string;
  activity: ActivityStatus;
  timestamp: number;
}

interface ActivityLogContextValue {
  entries: ActivityLogEntry[];
}

const ActivityLogContext = createContext<ActivityLogContextValue>({
  entries: [],
});

export function ActivityLogProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const counterRef = useRef(0);
  const lastActivity = useRef(new Map<string, string>());

  const dismissEntry = useCallback((id: number) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/events");

    source.addEventListener("update", (event: MessageEvent) => {
      try {
        const { sessionId, eventName, sessionName } = JSON.parse(
          event.data,
        ) as {
          sessionId: string;
          eventName?: string;
          sessionName?: string;
        };
        if (!eventName) return;

        const message = resolveNotification(
          sessionId,
          eventName,
          sessionName,
          lastActivity.current,
        );
        if (!message) return;

        const id = ++counterRef.current;
        const entry: ActivityLogEntry = {
          id,
          message,
          activity: deriveActivity(eventName),
          timestamp: Date.now(),
        };

        setEntries((prev) => [entry, ...prev].slice(0, MAX_ENTRIES));
        setTimeout(() => dismissEntry(id), NOTIFICATION_AUTO_DISMISS_MS);
      } catch {
        /* ignore */
      }
    });

    return () => source.close();
  }, [dismissEntry]);

  return (
    <ActivityLogContext.Provider value={{ entries }}>
      {children}
    </ActivityLogContext.Provider>
  );
}

export function useActivityLog(): ActivityLogContextValue {
  return useContext(ActivityLogContext);
}
