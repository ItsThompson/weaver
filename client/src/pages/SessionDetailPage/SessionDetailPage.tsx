import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Spinner from '@cloudscape-design/components/spinner';
import type { SessionWithStatus, TurnGroup } from '@shared/types';
import { getSession, updateSessionName } from '../../utils/api';
import { RenameSession } from '../../components/RenameSession';
import { TurnContainer } from './components/TurnContainer';

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionWithStatus | null>(null);
  const [turns, setTurns] = useState<TurnGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSession = useCallback(() => {
    if (!id) return;
    setLoading(true);
    getSession(id)
      .then(({ session, turns }) => { setSession(session); setTurns(turns); })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { fetchSession(); }, [fetchSession]);

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
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" onClick={fetchSession} loading={loading} />
                <RenameSession currentName={session?.customName ?? null} onRename={handleRename} />
              </SpaceBetween>
            }
          >
            {displayName}
          </Header>
          <Box fontSize="body-s" color="text-body-secondary">
            Assistant responses are not available in this view. Use <a href="/cherrypick">Cherrypick</a> to export and analyze full conversations.
          </Box>
          {turns.map((turn) => (
            <TurnContainer key={turn.id} turn={turn} />
          ))}
        </SpaceBetween>
      )}
    </SpaceBetween>
  );
}