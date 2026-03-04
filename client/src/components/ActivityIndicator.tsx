import type { ActivityStatus } from '@weaver/shared/types';
import { ACTIVITY_COLORS } from '../utils/activityColors';

const ACTIVITY_LABELS: Record<ActivityStatus, string> = {
  starting: 'Starting',
  idle: 'Idle',
  processing: 'Processing',
  running_tool: 'Running tool',
  pending_approval: 'Pending approval',
};

export function ActivityIndicator({ activity }: { activity?: ActivityStatus }) {
  const status = activity ?? 'idle';
  return <span style={{ color: ACTIVITY_COLORS[status], fontWeight: 500 }}>● {ACTIVITY_LABELS[status]}</span>;
}
