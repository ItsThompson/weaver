import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import { NOTIFICATION_AUTO_DISMISS_MS, NOTIFICATION_MAX_VISIBLE } from '../constants';
import { playNotificationSound, type NotificationSound } from '../hooks/notifications/soundUtils';

interface Notification {
  id: string;
  content: string;
  type: 'info' | 'success' | 'warning';
  timestamp: number;
}

interface NotificationContextValue {
  notifications: Notification[];
  addNotification: (content: string, type?: Notification['type'], sound?: NotificationSound) => void;
  dismissNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const counterRef = useRef(0);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const addNotification = useCallback((content: string, type: Notification['type'] = 'info', sound?: NotificationSound) => {
    const id = `notif-${++counterRef.current}`;
    const notification: Notification = { id, content, type, timestamp: Date.now() };

    setNotifications((prev) => {
      const next = [...prev, notification];
      // Trim oldest if exceeding max
      while (next.length > NOTIFICATION_MAX_VISIBLE) next.shift();
      return next;
    });

    if (sound) playNotificationSound(sound);
    setTimeout(() => dismissNotification(id), NOTIFICATION_AUTO_DISMISS_MS);
  }, [dismissNotification]);

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, dismissNotification }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
