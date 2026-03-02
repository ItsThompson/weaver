import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Table, { type TableProps } from '@cloudscape-design/components/table';
import Header from '@cloudscape-design/components/header';
import Tabs from '@cloudscape-design/components/tabs';
import Button from '@cloudscape-design/components/button';
import SpaceBetween from '@cloudscape-design/components/space-between';
import TextFilter from '@cloudscape-design/components/text-filter';
import Box from '@cloudscape-design/components/box';
import type { SessionWithStatus } from '@shared/types';
import { useSessions } from '../context/SessionsContext';
import { RenameSession } from '../components/RenameSession';

const COLUMN_DEFINITIONS: TableProps.ColumnDefinition<SessionWithStatus>[] = [
  {
    id: 'customName',
    header: 'Name',
    cell: (item) => item.customName || item.id.slice(0, 8),
    sortingField: 'customName',
    width: 200,
  },
  { id: 'cwd', header: 'CWD', cell: (item) => item.cwd, sortingField: 'cwd' },
  { id: 'agentName', header: 'Agent', cell: (item) => item.agentName ?? '—' },
  { id: 'startTime', header: 'Started', cell: (item) => new Date(item.startTime).toLocaleString(), sortingField: 'startTime' },
  { id: 'lastEventTime', header: 'Last Event', cell: (item) => new Date(item.lastEventTime).toLocaleString(), sortingField: 'lastEventTime' },
  {
    id: 'actions',
    header: '',
    cell: (item) => <ActionsCell session={item} />,
    width: 70,
    minWidth: 70,
  },
];

function ActionsCell({ session }: { session: SessionWithStatus }) {
  const { renameSession } = useSessions();
  return (
    <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', paddingRight: 8 }}>
      <RenameSession currentName={session.customName} onRename={(name) => renameSession(session.id, name)} />
    </span>
  );
}

function SessionTable({ sessions }: { sessions: SessionWithStatus[] }) {
  const navigate = useNavigate();
  const [filterText, setFilterText] = useState('');

  const filtered = sessions.filter((s) => {
    if (!filterText) return true;
    const lower = filterText.toLowerCase();
    return (
      (s.customName?.toLowerCase().includes(lower)) ||
      s.cwd.toLowerCase().includes(lower) ||
      s.id.toLowerCase().includes(lower)
    );
  });

  return (
    <Table
      items={filtered}
      columnDefinitions={COLUMN_DEFINITIONS}
      variant="borderless"
      empty={<Box textAlign="center" color="inherit">No sessions</Box>}
      filter={<TextFilter filteringText={filterText} onChange={({ detail }) => setFilterText(detail.filteringText)} />}
      onRowClick={({ detail }) => navigate(`/sessions/${detail.item.id}`)}
      trackBy="id"
    />
  );
}

export function SessionsPage() {
  const { state, fetchSessions } = useSessions();

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const open = state.sessions.filter((s) => s.status === 'open');
  const closed = state.sessions.filter((s) => s.status === 'closed');

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        actions={<Button iconName="refresh" onClick={fetchSessions} loading={state.loading}>Refresh</Button>}
      >
        Sessions
      </Header>
      {state.error && <Box color="text-status-error">{state.error}</Box>}
      <Tabs
        tabs={[
          { id: 'open', label: `Open (${open.length})`, content: <SessionTable sessions={open} /> },
          { id: 'closed', label: `Closed (${closed.length})`, content: <SessionTable sessions={closed} /> },
        ]}
      />
    </SpaceBetween>
  );
}
