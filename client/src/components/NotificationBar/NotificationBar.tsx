import Flashbar from '@cloudscape-design/components/flashbar';
import { useNotifications } from '../../context/NotificationContext';

export function NotificationBar() {
  const { notifications, dismissNotification } = useNotifications();

  if (notifications.length === 0) return null;

  return (
    <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 9999, maxWidth: 400 }}>
      <Flashbar
        items={notifications.map((n) => ({
          id: n.id,
          content: n.content,
          type: n.type,
          dismissible: true,
          onDismiss: () => dismissNotification(n.id),
        }))}
      />
    </div>
  );
}
