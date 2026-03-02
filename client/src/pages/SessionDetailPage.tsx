import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Badge from '@cloudscape-design/components/badge';
import Box from '@cloudscape-design/components/box';
import Spinner from '@cloudscape-design/components/spinner';
import type { SessionWithStatus, TurnGroup } from '@shared/types';
import { getSession, updateSessionName } from '../utils/api';
import { ToolCallCard } from '../components/ToolCallCard';
import { RenameSession } from '../components/RenameSession';

function TurnContainer({ turn }: { turn: TurnGroup }) {
  const firstEvent = turn.events[0]?.event.hook_event_name;

  if (firstEvent === 'agentSpawn') {
    return (
      <Box textAlign="center" margin={{ vertical: 's' }}>
        <Badge color="grey">Session started</Badge>
        <Box fontSize="body-s" color="text-body-secondary">{new Date(turn.startTime).toLocaleString()}</Box>
      </Box>
    );
  }

  return (
    <Container
      header={
        <Header
          variant="h3"
          description={new Date(turn.startTime).toLocaleString()}
          counter={turn.toolCalls.length > 0 ? `${turn.toolCalls.length} tool call${turn.toolCalls.length > 1 ? 's' : ''}` : undefined}
        >
          Turn {turn.id}
        </Header>
      }
    >
      <SpaceBetween size="m">
        {turn.userPrompt && (
          <Box>
            <Box fontSize="body-s" fontWeight="bold" color="text-label">User prompt</Box>
            <Box variant="p">{turn.userPrompt}</Box>
          </Box>
        )}
        {turn.toolCalls.map((tc, i) => (
          <ToolCallCard key={`${tc.toolName}-${i}`} toolCall={tc} />
        ))}
        {!turn.userPrompt && turn.toolCalls.length === 0 && (
          <Box color="text-status-inactive" fontSize="body-s">No hook data captured for this turn</Box>
        )}
      </SpaceBetween>
    </Container>
  );
}

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionWithStatus | null>(null);
  const [turns, setTurns] = useState<TurnGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getSession(id)
      .then(({ session, turns }) => { setSession(session); setTurns(turns); })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [id]);

  const handleRename = async (name: string) => {
    if (!id || !session) return;
    await updateSessionName(id, name);
    setSession({ ...session, customName: name });
  };

  const displayName = session?.customName || `Session ${id?.slice(0, 8)}`;

  return (
    <SpaceBetween size="l">
      <BreadcrumbGroup
        items={[
          { text: 'Sessions', href: '/' },
          { text: displayName, href: '#' },
        ]}
        onFollow={(e) => { e.preventDefault(); navigate(e.detail.href); }}
      />
      {loading && <Spinner size="large" />}
      {error && <Box color="text-status-error">{error}</Box>}
      {!loading && !error && (
        <SpaceBetween size="m">
          <Header
            variant="h1"
            description={`${session?.cwd} · PID ${session?.pid} · ${session?.status}`}
            actions={<RenameSession currentName={session?.customName ?? null} onRename={handleRename} />}
          >
            {displayName}
          </Header>
          <Box fontSize="body-s" color="text-body-secondary">
            Assistant text responses are not captured by hooks.
          </Box>
          {turns.map((turn) => (
            <TurnContainer key={turn.id} turn={turn} />
          ))}
        </SpaceBetween>
      )}
    </SpaceBetween>
  );
}
