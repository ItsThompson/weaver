import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Container from '@cloudscape-design/components/container';
import Select, { type SelectProps } from '@cloudscape-design/components/select';
import Button from '@cloudscape-design/components/button';
import Box from '@cloudscape-design/components/box';
import Badge from '@cloudscape-design/components/badge';
import Spinner from '@cloudscape-design/components/spinner';
import type { OrphanGroup, SessionWithStatus } from '@weaver/shared/types';
import { getOrphans, getSessions, assignOrphans } from '../../utils/api';
import { TurnContainer } from '../SessionDetailPage/components/TurnContainer';

export function OrphansPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<OrphanGroup[]>([]);
  const [sessions, setSessions] = useState<SessionWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSessions, setSelectedSessions] = useState<Record<number, SelectProps.Option | null>>({});
  const [assigning, setAssigning] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [orphanData, sessionData] = await Promise.all([getOrphans(), getSessions()]);
      setGroups(orphanData.groups);
      setSessions(sessionData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sessionOptions: SelectProps.Options = sessions
    .sort((a, b) => b.startTime.localeCompare(a.startTime))
    .map((s) => ({
      value: s.id,
      label: s.customName || `Session ${s.id.slice(0, 8)}`,
      description: `${s.cwd} · PID ${s.pid}`,
      tags: [s.status],
    }));

  const handleAssign = async (pid: number) => {
    const selected = selectedSessions[pid];
    if (!selected?.value) return;
    setAssigning(pid);
    try {
      await assignOrphans(selected.value, pid);
      await fetchData();
      setSelectedSessions((prev) => { const next = { ...prev }; delete next[pid]; return next; });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAssigning(null);
    }
  };

  return (
    <SpaceBetween size="l">
      <BreadcrumbGroup
        items={[
          { text: 'Sessions', href: '/' },
          { text: 'Orphaned Events', href: '#' },
        ]}
        onFollow={(e) => { e.preventDefault(); navigate(e.detail.href); }}
      />
      <Header
        variant="h1"
        description="Events that lost their session mapping due to a PID change mid-session. Assign each group to the correct session."
      >
        Orphaned Events
      </Header>

      {loading && <Spinner size="large" />}
      {error && <Box color="text-status-error">{error}</Box>}

      {!loading && groups.length === 0 && (
        <Box color="text-status-inactive" textAlign="center" padding="l">No orphaned events</Box>
      )}

      {groups.map((group) => (
        <Container
          key={group.pid}
          header={
            <Header
              variant="h2"
              counter={`${group.eventCount} events`}
              description={`${new Date(group.timeRange.start).toLocaleString()} — ${new Date(group.timeRange.end).toLocaleString()}`}
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <Select
                    selectedOption={selectedSessions[group.pid] ?? null}
                    onChange={({ detail }) => setSelectedSessions((prev) => ({ ...prev, [group.pid]: detail.selectedOption }))}
                    options={sessionOptions}
                    placeholder="Select target session"
                    filteringType="auto"
                  />
                  <Button
                    variant="primary"
                    onClick={() => handleAssign(group.pid)}
                    disabled={!selectedSessions[group.pid]}
                    loading={assigning === group.pid}
                  >
                    Assign
                  </Button>
                </SpaceBetween>
              }
            >
              <SpaceBetween direction="horizontal" size="xs">
                <span>PID {group.pid}</span>
                <Badge color="red">orphaned</Badge>
              </SpaceBetween>
            </Header>
          }
        >
          <SpaceBetween size="m">
            {group.turns.map((turn) => (
              <TurnContainer key={turn.id} turn={turn} showTools />
            ))}
          </SpaceBetween>
        </Container>
      ))}
    </SpaceBetween>
  );
}
