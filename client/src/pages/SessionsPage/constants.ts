import type { TableProps } from '@cloudscape-design/components/table';
import type { SessionWithStatus } from '@shared/types';
import { ActionsCell } from './components/ActionsCell';

export const COLUMN_DEFINITIONS: TableProps.ColumnDefinition<SessionWithStatus>[] = [
  { id: 'customName', header: 'Name', cell: (item) => item.customName || item.id.slice(0, 8), sortingField: 'customName', width: 200 },
  { id: 'cwd', header: 'CWD', cell: (item) => item.cwd, sortingField: 'cwd' },
  { id: 'agentName', header: 'Agent', cell: (item) => item.agentName ?? '—' },
  { id: 'startTime', header: 'Started', cell: (item) => new Date(item.startTime).toLocaleString(), sortingField: 'startTime' },
  { id: 'lastEventTime', header: 'Last Event', cell: (item) => new Date(item.lastEventTime).toLocaleString(), sortingField: 'lastEventTime' },
  { id: 'actions', header: '', cell: (item) => <ActionsCell session={item} />, width: 70, minWidth: 70 },
];