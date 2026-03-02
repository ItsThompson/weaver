import React from 'react';
import type { TableProps } from '@cloudscape-design/components/table';
import type { SessionWithStatus } from '@shared/types';
import { ActionsCell } from './components/ActionsCell';
import { ActivityIndicator } from '../../components/ActivityIndicator';

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
  cell: (item) => React.createElement(ActivityIndicator, { activity: item.activity }),
  width: 130,
};

export const OPEN_COLUMNS: TableProps.ColumnDefinition<SessionWithStatus>[] = [
  BASE_COLUMNS[0],
  ACTIVITY_COLUMN,
  ...BASE_COLUMNS.slice(1),
];

export const CLOSED_COLUMNS: TableProps.ColumnDefinition<SessionWithStatus>[] = BASE_COLUMNS;
