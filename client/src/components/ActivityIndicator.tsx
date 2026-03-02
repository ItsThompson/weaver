import type { ActivityStatus } from '@shared/types';

const ACTIVITY_LABELS: Record<ActivityStatus, { text: string; color: string }> = {
  starting: { text: 'Starting', color: '#888' },
  idle: { text: 'Idle', color: '#2ea043' },
  processing: { text: 'Processing', color: '#d29922' },
  running_tool: { text: 'Running tool', color: '#58a6ff' },
};

export function ActivityIndicator({ activity }: { activity?: ActivityStatus }) {
  const info = ACTIVITY_LABELS[activity ?? 'idle'];
  return <span style={{ color: info.color, fontWeight: 500 }}>● {info.text}</span>;
}
