import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Table, { type TableProps } from '@cloudscape-design/components/table';
import Header from '@cloudscape-design/components/header';
import Tabs from '@cloudscape-design/components/tabs';
import Button from '@cloudscape-design/components/button';
import Input from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import TextFilter from '@cloudscape-design/components/text-filter';
import Box from '@cloudscape-design/components/box';
import type { SessionWithStatus } from '@shared/types';
import { useSessions } from '../context/SessionsContext';

const COLUMN_DEFINITIONS: TableProps.ColumnDefinition<SessionWithStatus>[] = [
  {
    id: 'customName',
    header: 'Name',
    cell: (item) => <EditableName session={item} />,
    sortingField: 'customName',
    width: 200,
  },
  { id: 'id', header: 'Session ID', cell: (item) => item.id.slice(0, 8), width: 100 },
  { id: 'cwd', header: 'CWD', cell: (item) => item.cwd, sortingField: 'cwd' },
  { id: 'agentName', header: 'Agent', cell: (item) => item.agentName ?? '—' },
  { id: 'startTime', header: 'Started', cell: (item) => new Date(item.startTime).toLocaleString(), sortingField: 'startTime' },
  { id: 'lastEventTime', header: 'Last Event', cell: (item) => new Date(item.lastEventTime).toLocaleString(), sortingField: 'lastEventTime' },
];

function EditableName({ session }: { session: SessionWithStatus }) {
  const { renameSession } = useSessions();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(session.customName ?? '');

  const save = async () => {
    setEditing(false);
    if (value !== (session.customName ?? '')) {
      await renameSession(session.id, value);
    }
  };

  if (editing) {
    return (
      <Input
        value={value}
        onChange={({ detail }) => setValue(detail.value)}
        onBlur={save}
        onKeyDown={({ detail }) => { if (detail.key === 'Enter') save(); }}
        autoFocus
      />
    );
  }

  return (
    <span onClick={() => setEditing(true)} style={{ cursor: 'pointer' }}>
      {session.customName || <Box color="text-status-inactive">Click to name</Box>}
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
      variant="embedded"
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
