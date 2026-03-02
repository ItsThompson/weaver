import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import ButtonDropdown from '@cloudscape-design/components/button-dropdown';
import Badge from '@cloudscape-design/components/badge';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Spinner from '@cloudscape-design/components/spinner';
import type { SessionWithStatus, TurnGroup } from '@shared/types';
import { getSession, updateSessionName } from '../../utils/api';
import { useSessionEvents } from '../../hooks/useSessionEvents';
import { RenameSession } from '../../components/RenameSession';
import { ActivityIndicator } from '../../components/ActivityIndicator';
import { TurnContainer } from './components/TurnContainer';

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionWithStatus | null>(null);
  const [turns, setTurns] = useState<TurnGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTools, setShowTools] = useState(true);
  const [expandedTurns, setExpandedTurns] = useState<Set<number>>(new Set());

  const fetchSession = useCallback((silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    getSession(id)
      .then(({ session, turns }) => { setSession(session); setTurns(turns); setError(null); })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => { if (!silent) setLoading(false); });
  }, [id]);

  useEffect(() => { fetchSession(); }, [fetchSession]);

  useSessionEvents({
    onUpdate: (sessionId) => { if (sessionId === id) fetchSession(true); },
  });

  const handleRename = async (name: string) => {
    if (!id || !session) return;
    await updateSessionName(id, name);
    setSession({ ...session, customName: name });
  };

  const togglePageTools = () => {
    setShowTools((prev) => !prev);
    setExpandedTurns(new Set());
  };

  const toggleTurn = (turnId: number) => {
    setExpandedTurns((prev) => {
      const next = new Set(prev);
      if (next.has(turnId)) next.delete(turnId);
      else next.add(turnId);
      return next;
    });
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
      {!loading && !error && session && (
        <SpaceBetween size="m">
          <Header
            variant="h1"
            description={
              <SpaceBetween direction="horizontal" size="xs">
                <span>{session.cwd} · PID {session.pid}</span>
                <Badge color={session.status === 'open' ? 'green' : 'grey'}>{session.status}</Badge>
                {session.status === 'open' && <ActivityIndicator activity={session.activity} />}
              </SpaceBetween>
            }
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" onClick={() => fetchSession()} loading={loading} />
                <ButtonDropdown
                  items={[{
                    id: 'toggle-tools',
                    text: showTools ? 'Hide tool execution' : 'View tool execution',
                  }]}
                  onItemClick={togglePageTools}
                  expandToViewport
                >
                  Display
                </ButtonDropdown>
                <RenameSession currentName={session.customName} onRename={handleRename} />
              </SpaceBetween>
            }
          >
            {displayName}
          </Header>
          <Box fontSize="body-s" color="text-body-secondary">
            Assistant responses are not available in this view. Use <a href="/cherrypick">Cherrypick</a> to export and analyze full conversations.
          </Box>
          {[...turns].reverse().map((turn) => (
            <TurnContainer
              key={turn.id}
              turn={turn}
              showTools={expandedTurns.has(turn.id) ? !showTools : showTools}
              onToggleTools={turn.toolCalls.length > 0 ? () => toggleTurn(turn.id) : undefined}
            />
          ))}
        </SpaceBetween>
      )}
    </SpaceBetween>
  );
}
