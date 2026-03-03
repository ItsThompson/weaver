import SpaceBetween from '@cloudscape-design/components/space-between';
import Header from '@cloudscape-design/components/header';
import Button from '@cloudscape-design/components/button';
import Alert from '@cloudscape-design/components/alert';
import type { ParsedConversation } from '@weaver/shared/types';
import { ExchangeSection } from './ExchangeSection';

interface EditPhaseProps {
  parsed: ParsedConversation;
  fileName: string;
  error: string | null;
  deleteMainIds: Set<number>;
  deleteTangentIds: Set<number>;
  totalSelected: number;
  onToggleMainId: (id: number) => void;
  onToggleTangentId: (id: number) => void;
  onToggleAllMain: () => void;
  onToggleAllTangent: () => void;
  onReset: () => void;
  onPreview: () => void;
}

export function EditPhase({
  parsed,
  fileName,
  error,
  deleteMainIds,
  deleteTangentIds,
  totalSelected,
  onToggleMainId,
  onToggleTangentId,
  onToggleAllMain,
  onToggleAllTangent,
  onReset,
  onPreview,
}: EditPhaseProps) {
  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={onReset}>Reset</Button>
            <Button variant="primary" onClick={onPreview} disabled={totalSelected === 0}>
              Preview ({totalSelected} selected)
            </Button>
          </SpaceBetween>
        }
      >
        Cherrypick — {fileName}
      </Header>
      {error && <Alert type="error">{error}</Alert>}

      <ExchangeSection
        title="Main Conversation"
        exchanges={parsed.mainExchanges}
        selectedIds={deleteMainIds}
        onToggle={onToggleMainId}
        onToggleAll={onToggleAllMain}
      />

      {parsed.isInTangent && parsed.tangentExchanges && (
        <ExchangeSection
          title="Tangent"
          exchanges={parsed.tangentExchanges}
          selectedIds={deleteTangentIds}
          onToggle={onToggleTangentId}
          onToggleAll={onToggleAllTangent}
        />
      )}
    </SpaceBetween>
  );
}
