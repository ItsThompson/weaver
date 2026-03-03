import { useNavigate } from 'react-router-dom';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Header from '@cloudscape-design/components/header';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Badge from '@cloudscape-design/components/badge';
import Tabs from '@cloudscape-design/components/tabs';
import { useSessionsQuery, useOrphanCountQuery, revalidateSessions } from '../../hooks/queries';
import { SessionTable } from './components/SessionTable';
import { OPEN_COLUMNS, CLOSED_COLUMNS, OPEN_DISPLAY_OPTIONS, CLOSED_DISPLAY_OPTIONS, OPEN_DEFAULT_CONTENT_DISPLAY, CLOSED_DEFAULT_CONTENT_DISPLAY } from './constants';

export function SessionsPage() {
  const { data: sessions = [], error, isLoading } = useSessionsQuery();
  const { data: orphanData } = useOrphanCountQuery();
  const navigate = useNavigate();

  const orphanCount = orphanData?.count ?? 0;
  const open = sessions.filter((s) => s.status === 'open');
  const closed = sessions.filter((s) => s.status === 'closed');

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
            <Button iconName="refresh" onClick={() => revalidateSessions()} loading={isLoading}>Refresh</Button>
          </SpaceBetween>
        }
      >
        Sessions
      </Header>
      {error && <Box color="text-status-error">{error.message}</Box>}
      <Tabs
        tabs={[
          { id: 'open', label: `Open (${open.length})`, content: <SessionTable sessions={open} columnDefinitions={OPEN_COLUMNS} contentDisplayOptions={OPEN_DISPLAY_OPTIONS} defaultContentDisplay={OPEN_DEFAULT_CONTENT_DISPLAY} configKey="open_display_options" /> },
          { id: 'closed', label: `Closed (${closed.length})`, content: <SessionTable sessions={closed} columnDefinitions={CLOSED_COLUMNS} contentDisplayOptions={CLOSED_DISPLAY_OPTIONS} defaultContentDisplay={CLOSED_DEFAULT_CONTENT_DISPLAY} configKey="close_display_options" /> },
        ]}
      />
    </SpaceBetween>
  );
}
