import { useEffect } from 'react';
import Header from '@cloudscape-design/components/header';
import Tabs from '@cloudscape-design/components/tabs';
import Button from '@cloudscape-design/components/button';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Box from '@cloudscape-design/components/box';
import { useSessions } from '../../context/SessionsContext';
import { SessionTable } from './components/SessionTable';
import { OPEN_COLUMNS, CLOSED_COLUMNS } from './constants';

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
          { id: 'open', label: `Open (${open.length})`, content: <SessionTable sessions={open} columnDefinitions={OPEN_COLUMNS} /> },
          { id: 'closed', label: `Closed (${closed.length})`, content: <SessionTable sessions={closed} columnDefinitions={CLOSED_COLUMNS} /> },
        ]}
      />
    </SpaceBetween>
  );
}
