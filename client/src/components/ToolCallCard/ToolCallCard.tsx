import ExpandableSection from '@cloudscape-design/components/expandable-section';
import Badge from '@cloudscape-design/components/badge';
import Box from '@cloudscape-design/components/box';
import type { ToolCallPair } from '@weaver/shared/types';
import { JsonBlock } from './JsonBlock';
import { formatDuration } from './utils';

export function ToolCallCard({ toolCall }: { toolCall: ToolCallPair }) {
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