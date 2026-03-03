import { useState, useCallback } from 'react';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import Button from '@cloudscape-design/components/button';
import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Checkbox from '@cloudscape-design/components/checkbox';
import type { SavedConversation, ParsedConversation, ConversationExchange } from '@weaver/shared/types';
import { parseConversation, pruneConversation } from '../utils/conversation-parser';
import { ExchangeCard } from '../components/ExchangeCard';

type PageState =
  | { phase: 'upload' }
  | { phase: 'edit'; parsed: ParsedConversation; fileName: string }
  | { phase: 'preview'; parsed: ParsedConversation; fileName: string; pruned: SavedConversation };

export function CherrypickPage() {
  const [state, setState] = useState<PageState>({ phase: 'upload' });
  const [error, setError] = useState<string | null>(null);
  const [deleteMainIds, setDeleteMainIds] = useState<Set<number>>(new Set());
  const [deleteTangentIds, setDeleteTangentIds] = useState<Set<number>>(new Set());

  const handleFile = useCallback((file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string) as SavedConversation;
        if (!json.history || !json.conversation_id) {
          setError('Invalid file: missing history or conversation_id');
          return;
        }
        const parsed = parseConversation(json);
        setDeleteMainIds(new Set());
        setDeleteTangentIds(new Set());
        setState({ phase: 'edit', parsed, fileName: file.name });
      } catch {
        setError('Failed to parse JSON file');
      }
    };
    reader.readAsText(file);
  }, []);

  const toggleId = (set: Set<number>, setFn: (s: Set<number>) => void, id: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFn(next);
  };

  const toggleAllInSection = (exchanges: ConversationExchange[], selected: Set<number>, setFn: (s: Set<number>) => void) => {
    const allSelected = exchanges.every((ex) => selected.has(ex.id));
    setFn(allSelected ? new Set() : new Set(exchanges.map((ex) => ex.id)));
  };

  const totalSelected = deleteMainIds.size + deleteTangentIds.size;

  const handlePreview = () => {
    if (state.phase !== 'edit') return;
    const pruned = pruneConversation(state.parsed.raw, deleteMainIds, deleteTangentIds);
    setState({ ...state, phase: 'preview', pruned });
  };

  const handleDownload = () => {
    if (state.phase !== 'preview') return;
    const blob = new Blob([JSON.stringify(state.pruned, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = state.fileName.replace(/\.json$/, '-pruned.json');
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setDeleteMainIds(new Set());
    setDeleteTangentIds(new Set());
    setState({ phase: 'upload' });
    setError(null);
  };

  // -- Upload phase --
  if (state.phase === 'upload') {
    return (
      <SpaceBetween size="l">
        <Header variant="h1">Cherrypick</Header>
        {error && <Alert type="error">{error}</Alert>}
        <Container header={<Header variant="h2">Upload conversation</Header>}>
          <Box padding="l" textAlign="center">
            <input
              type="file"
              accept=".json"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Box variant="p" color="text-body-secondary" padding={{ top: 's' }}>
              Upload a <code>/chat save</code> JSON file
            </Box>
          </Box>
        </Container>
      </SpaceBetween>
    );
  }

  // -- Edit phase --
  if (state.phase === 'edit') {
    const { parsed } = state;
    return (
      <SpaceBetween size="l">
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={handleReset}>Reset</Button>
              <Button variant="primary" onClick={handlePreview} disabled={totalSelected === 0}>
                Preview ({totalSelected} selected)
              </Button>
            </SpaceBetween>
          }
        >
          Cherrypick — {state.fileName}
        </Header>
        {error && <Alert type="error">{error}</Alert>}

        <ExchangeSection
          title="Main Conversation"
          exchanges={parsed.mainExchanges}
          selectedIds={deleteMainIds}
          onToggle={(id) => toggleId(deleteMainIds, setDeleteMainIds, id)}
          onToggleAll={() => toggleAllInSection(parsed.mainExchanges, deleteMainIds, setDeleteMainIds)}
        />

        {parsed.isInTangent && parsed.tangentExchanges && (
          <ExchangeSection
            title="Tangent"
            exchanges={parsed.tangentExchanges}
            selectedIds={deleteTangentIds}
            onToggle={(id) => toggleId(deleteTangentIds, setDeleteTangentIds, id)}
            onToggleAll={() => toggleAllInSection(parsed.tangentExchanges!, deleteTangentIds, setDeleteTangentIds)}
          />
        )}
      </SpaceBetween>
    );
  }

  // -- Preview phase --
  const { parsed, pruned } = state;
  const mainTurnCount = parsed.mainExchanges.filter((ex) => deleteMainIds.has(ex.id)).reduce((sum, ex) => sum + ex.turns.length, 0);
  const tangentTurnCount = (parsed.tangentExchanges ?? []).filter((ex) => deleteTangentIds.has(ex.id)).reduce((sum, ex) => sum + ex.turns.length, 0);

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={() => setState({ phase: 'edit', parsed, fileName: state.fileName })}>Back</Button>
            <Button variant="primary" onClick={handleDownload}>Download pruned JSON</Button>
          </SpaceBetween>
        }
      >
        Preview
      </Header>

      <Alert type="info">
        Removing {totalSelected} exchange(s) ({mainTurnCount + tangentTurnCount} turns).
        Remaining: {pruned.history.length} turns.
      </Alert>

      <Container header={<Header variant="h2">Remaining exchanges</Header>}>
        {pruned.history.length === 0 ? (
          <Box color="text-body-secondary">All exchanges removed — conversation will be empty.</Box>
        ) : (
          <SpaceBetween size="s">
            {parseConversation(pruned).mainExchanges.map((ex) => (
              <Box key={ex.id} variant="p">
                <Box variant="strong">Exchange {ex.id}: </Box>
                {ex.userPrompt.slice(0, 100)}{ex.userPrompt.length > 100 ? '…' : ''}
                {ex.toolsUsed.length > 0 && <Box variant="span" color="text-body-secondary"> [{ex.toolsUsed.join(', ')}]</Box>}
              </Box>
            ))}
          </SpaceBetween>
        )}
      </Container>

      <Container header={<Header variant="h2">Updated transcript</Header>}>
        <Box variant="pre" fontSize="body-s">
          {pruned.transcript.map((line, i) => `[${i}] ${line}`).join('\n')}
        </Box>
      </Container>
    </SpaceBetween>
  );
}

// -- Section subcomponent --

function ExchangeSection({
  title,
  exchanges,
  selectedIds,
  onToggle,
  onToggleAll,
}: {
  title: string;
  exchanges: ConversationExchange[];
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
}) {
  const allSelected = exchanges.length > 0 && exchanges.every((ex) => selectedIds.has(ex.id));

  return (
    <SpaceBetween size="s">
      <Header
        variant="h2"
        actions={
          <Checkbox checked={allSelected} onChange={onToggleAll}>
            {allSelected ? 'Deselect all' : 'Select all'}
          </Checkbox>
        }
      >
        {title} ({selectedIds.size} of {exchanges.length} selected)
      </Header>
      {exchanges.map((ex) => (
        <ExchangeCard
          key={ex.id}
          exchange={ex}
          selected={selectedIds.has(ex.id)}
          onToggle={onToggle}
        />
      ))}
    </SpaceBetween>
  );
}
