import React from 'react';
import type { TableProps } from '@cloudscape-design/components/table';
import type { SessionWithStatus, ActivityStatus } from '@shared/types';
import { ActionsCell } from './components/ActionsCell';

const ACTIVITY_LABELS: Record<ActivityStatus, { text: string; color: string }> = {
  starting: { text: 'Starting', color: '#888' },
  idle: { text: 'Idle', color: '#2ea043' },
  processing: { text: 'Processing', color: '#d29922' },
  running_tool: { text: 'Running tool', color: '#58a6ff' },
};

const BASE_COLUMNS: TableProps.ColumnDefinition<SessionWithStatus>[] = [
  { id: 'customName', header: 'Name', cell: (item) => item.customName || item.id.slice(0, 8), sortingField: 'customName', width: 200 },
  { id: 'cwd', header: 'CWD', cell: (item) => item.cwd, sortingField: 'cwd' },
  { id: 'agentName', header: 'Agent', cell: (item) => item.agentName ?? '—' },
  { id: 'startTime', header: 'Started', cell: (item) => new Date(item.startTime).toLocaleString(), sortingField: 'startTime' },
  { id: 'lastEventTime', header: 'Last Event', cell: (item) => new Date(item.lastEventTime).toLocaleString(), sortingField: 'lastEventTime' },
  { id: 'actions', header: '', cell: (item) => React.createElement(ActionsCell, { session: item }), width: 70, minWidth: 70 },
];

const ACTIVITY_COLUMN: TableProps.ColumnDefinition<SessionWithStatus> = {
  id: 'activity',
  header: 'Activity',
  cell: (item) => {
    const info = ACTIVITY_LABELS[item.activity ?? 'idle'];
    return React.createElement('span', { style: { color: info.color, fontWeight: 500 } }, `● ${info.text}`);
  },
  width: 130,
};

// Open tab gets the activity column after Name
export const OPEN_COLUMNS: TableProps.ColumnDefinition<SessionWithStatus>[] = [
  BASE_COLUMNS[0],
  ACTIVITY_COLUMN,
  ...BASE_COLUMNS.slice(1),
];

export const CLOSED_COLUMNS: TableProps.ColumnDefinition<SessionWithStatus>[] = BASE_COLUMNS;
