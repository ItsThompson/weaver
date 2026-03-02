import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '@cloudscape-design/components/header';
import Tabs from '@cloudscape-design/components/tabs';
import Button from '@cloudscape-design/components/button';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Badge from '@cloudscape-design/components/badge';
import Box from '@cloudscape-design/components/box';
import { useSessions } from '../../context/SessionsContext';
import { useSessionEvents } from '../../hooks/useSessionEvents';
import { getOrphanCount } from '../../utils/api';
import { SessionTable } from './components/SessionTable';
import { OPEN_COLUMNS, CLOSED_COLUMNS } from './constants';

export function SessionsPage() {
  const { state, fetchSessions } = useSessions();
  const navigate = useNavigate();
  const [orphanCount, setOrphanCount] = useState(0);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);
  useSessionEvents({ onUpdate: () => fetchSessions(true) });

  useEffect(() => {
    getOrphanCount().then(({ count }) => setOrphanCount(count)).catch(() => {});
  }, []);

  const open = state.sessions.filter((s) => s.status === 'open');
  const closed = state.sessions.filter((s) => s.status === 'closed');

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            {orphanCount > 0 && (
              <Button onClick={() => navigate('/sessions/orphans')}>
                <SpaceBetween direction="horizontal" size="xxs">
                  <Badge color="red">{orphanCount}</Badge>
                  <span>Orphaned events</span>
                </SpaceBetween>
              </Button>
            )}
            <Button iconName="refresh" onClick={() => fetchSessions()} loading={state.loading}>Refresh</Button>
          </SpaceBetween>
        }
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
