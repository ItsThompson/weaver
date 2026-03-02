import { useState } from 'react';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';

export const TRUNCATE_LENGTH = 500;

export function JsonBlock({ data, label }: { data: unknown; label: string }) {
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