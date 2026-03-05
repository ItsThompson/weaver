import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Header from '@cloudscape-design/components/header';
import Box from '@cloudscape-design/components/box';
import Spinner from '@cloudscape-design/components/spinner';
import Badge from '@cloudscape-design/components/badge';
import Button from '@cloudscape-design/components/button';
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group';
import { updateSessionName, toggleSessionWebhook } from '../../utils/api';
import { useSessionQuery } from '../../hooks/queries';
import { ActivityIndicator } from '../../components/ActivityIndicator';
import { SessionActions } from './components/SessionActions';
import { TurnContainer } from './components/TurnContainer';

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, error, isLoading, mutate } = useSessionQuery(id);
  const [showTools, setShowTools] = useState(true);
  const [expandedTurns, setExpandedTurns] = useState<Set<number>>(new Set());

  const session = data?.session ?? null;
  const turns = data?.turns ?? [];
  const webhookEnabled = data?.webhookEnabled ?? false;

  const handleRename = async (name: string) => {
    if (!id || !data) return;
    await updateSessionName(id, name);
    mutate();
  };

  const handleToggleWebhook = async () => {
    if (!id) return;
    await toggleSessionWebhook(id, !webhookEnabled);
    mutate();
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
      {isLoading && <Spinner size="large" />}
      {error && <Box color="text-status-error">{error.message}</Box>}
      {!isLoading && !error && session && (
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
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap' }}>
                <Button iconName="refresh" onClick={() => mutate()} loading={isLoading} />
                <SessionActions
                  showTools={showTools}
                  onToggleTools={togglePageTools}
                  currentName={session.customName}
                  sessionPid={session.pid}
                  onRename={handleRename}
                  webhookEnabled={webhookEnabled}
                  onToggleWebhook={handleToggleWebhook}
                />
              </div>
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
