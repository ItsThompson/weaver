import SpaceBetween from '@cloudscape-design/components/space-between';
import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import Button from '@cloudscape-design/components/button';
import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import FileUpload from '@cloudscape-design/components/file-upload';
import { parseConversation } from '../../utils/conversation-parser';
import { useCherrypick } from './hooks/useCherrypick';
import { ExchangeSection } from './components/ExchangeSection';
import { ExchangeSummaryLine } from './components/ExchangeSummaryLine';

export function CherrypickPage() {
  const { state, actions } = useCherrypick();
  const { pageState, error, deleteMainIds, deleteTangentIds, totalSelected } = state;

  if (pageState.phase === 'upload') {
    return (
      <SpaceBetween size="l">
        <Header variant="h1">Cherrypick</Header>
        {error && <Alert type="error">{error}</Alert>}
        <Container header={<Header variant="h2">Upload conversation</Header>}>
          <Box textAlign="center">
            <FileUpload
              accept=".json"
              value={[]}
              onChange={({ detail }) => detail.value[0] && actions.handleFile(detail.value[0])}
              constraintText="Upload a /chat save JSON file"
              i18nStrings={{
                uploadButtonText: () => 'Choose file',
                dropzoneText: () => 'Drop file to upload',
                removeFileAriaLabel: (_i, name) => `Remove file ${name}`,
              }}
            />
          </Box>
        </Container>
      </SpaceBetween>
    );
  }

  if (pageState.phase === 'edit') {
    const { parsed } = pageState;
    return (
      <SpaceBetween size="l">
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={actions.handleReset}>Reset</Button>
              <Button variant="primary" onClick={actions.handlePreview} disabled={totalSelected === 0}>
                Preview ({totalSelected} selected)
              </Button>
            </SpaceBetween>
          }
        >
          Cherrypick — {pageState.fileName}
        </Header>
        {error && <Alert type="error">{error}</Alert>}

        <ExchangeSection
          title="Main Conversation"
          exchanges={parsed.mainExchanges}
          selectedIds={deleteMainIds}
          onToggle={actions.toggleMainId}
          onToggleAll={() => actions.toggleAllMain(parsed.mainExchanges)}
        />

        {parsed.isInTangent && parsed.tangentExchanges && (
          <ExchangeSection
            title="Tangent"
            exchanges={parsed.tangentExchanges}
            selectedIds={deleteTangentIds}
            onToggle={actions.toggleTangentId}
            onToggleAll={() => actions.toggleAllTangent(parsed.tangentExchanges!)}
          />
        )}
      </SpaceBetween>
    );
  }

  // Preview phase
  const { parsed, pruned } = pageState;
  const mainTurnCount = parsed.mainExchanges.filter((ex) => deleteMainIds.has(ex.id)).reduce((sum, ex) => sum + ex.turns.length, 0);
  const tangentTurnCount = (parsed.tangentExchanges ?? []).filter((ex) => deleteTangentIds.has(ex.id)).reduce((sum, ex) => sum + ex.turns.length, 0);
  const prunedParsed = parseConversation(pruned);

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={actions.goBackToEdit}>Back</Button>
            <Button variant="primary" onClick={actions.handleDownload}>Download pruned JSON</Button>
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
            {prunedParsed.mainExchanges.map((ex) => (
              <ExchangeSummaryLine key={`main-${ex.id}`} label="Main" exchange={ex} />
            ))}
            {prunedParsed.tangentExchanges?.map((ex) => (
              <ExchangeSummaryLine key={`tangent-${ex.id}`} label="Tangent" exchange={ex} />
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
