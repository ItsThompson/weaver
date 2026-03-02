import { useState } from 'react';
import ExpandableSection from '@cloudscape-design/components/expandable-section';
import Badge from '@cloudscape-design/components/badge';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import type { ToolCallPair } from '@shared/types';

const TRUNCATE_LENGTH = 500;

function JsonBlock({ data, label }: { data: unknown; label: string }) {
  const text = JSON.stringify(data, null, 2);
  const [expanded, setExpanded] = useState(false);
  const truncated = text.length > TRUNCATE_LENGTH && !expanded;

  return (
    <Box margin={{ top: 'xxs' }}>
      <Box fontSize="body-s" color="text-label">{label}</Box>
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '12px', maxHeight: expanded ? 'none' : '200px', overflow: 'hidden' }}>
        {truncated ? text.slice(0, TRUNCATE_LENGTH) + '…' : text}
      </pre>
      {text.length > TRUNCATE_LENGTH && (
        <Button variant="inline-link" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show less' : 'Show full response'}
        </Button>
      )}
    </Box>
  );
}

function formatDuration(start: string, end?: string): string {
  if (!end) return 'pending';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function ToolCallCard({ toolCall }: { toolCall: ToolCallPair }) {
  const summary = `${toolCall.toolName} (${formatDuration(toolCall.startTime, toolCall.endTime)})`;

  return (
    <ExpandableSection
      variant="footer"
      headerText={<><Badge color="blue">{toolCall.toolName}</Badge> <Box variant="span" fontSize="body-s" color="text-body-secondary">{formatDuration(toolCall.startTime, toolCall.endTime)}</Box></>}
    >
      <JsonBlock data={toolCall.input} label="Input" />
      {toolCall.response && <JsonBlock data={toolCall.response} label="Response" />}
    </ExpandableSection>
  );
}
