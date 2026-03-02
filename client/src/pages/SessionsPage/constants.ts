import React from 'react';
import type { TableProps } from '@cloudscape-design/components/table';
import type { SessionWithStatus } from '@weaver/shared/types';
import { ActionsCell } from './components/ActionsCell';
import { ActivityIndicator } from '../../components/ActivityIndicator';

const PID_COLUMN: TableProps.ColumnDefinition<SessionWithStatus> = {
  id: 'pid', header: 'PID', cell: (item) => item.pid, sortingField: 'pid', width: 80,
};

const BASE_COLUMNS: TableProps.ColumnDefinition<SessionWithStatus>[] = [
  PID_COLUMN,
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
  cell: (item) => React.createElement(ActivityIndicator, { activity: item.activity }),
  width: 130,
};

export const OPEN_COLUMNS: TableProps.ColumnDefinition<SessionWithStatus>[] = [
  BASE_COLUMNS[0],  // PID
  BASE_COLUMNS[1],  // Name
  ACTIVITY_COLUMN,
  ...BASE_COLUMNS.slice(2),
];

export const CLOSED_COLUMNS: TableProps.ColumnDefinition<SessionWithStatus>[] = BASE_COLUMNS;
