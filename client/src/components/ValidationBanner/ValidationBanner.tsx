import { useState } from 'react';
import ExpandableSection from '@cloudscape-design/components/expandable-section';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import type { ValidationResult } from '@weaver/shared/types';

const OUTPUT_LINE_LIMIT = 20;

function ResultItem({ result }: { result: ValidationResult }) {
  const [expanded, setExpanded] = useState(false);
  const lines = result.output?.split('\n') ?? [];
  const truncated = lines.length > OUTPUT_LINE_LIMIT;
  const displayOutput = truncated && !expanded ? lines.slice(0, OUTPUT_LINE_LIMIT).join('\n') : result.output;

  if (result.skipped_reason) {
    return (
      <Box padding={{ vertical: 'xxs' }}>
        <StatusIndicator type="stopped">{result.name} — skipped: {result.skipped_reason}</StatusIndicator>
      </Box>
    );
  }

  const duration = result.timed_out
    ? `${(result.duration_ms / 1000).toFixed(1)}s, timed out`
    : `${(result.duration_ms / 1000).toFixed(1)}s`;

  return (
    <Box padding={{ vertical: 'xxs' }}>
      <StatusIndicator type={result.passed ? 'success' : 'error'}>
        {result.name} ({duration})
      </StatusIndicator>
      {result.output && (
        <Box margin={{ left: 'l' }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '12px' }}><code>{displayOutput}</code></pre>
          {truncated && (
            <Button variant="inline-link" onClick={() => setExpanded(!expanded)}>
              {expanded ? 'show less' : 'show more'}
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}

export function ValidationBanner({ results }: { results: ValidationResult[] }) {
  if (!results.length) return null;

  const passed = results.filter(r => r.passed && !r.skipped_reason).length;
  const failed = results.filter(r => !r.passed && !r.skipped_reason).length;
  const allPassed = failed === 0;

  const header = allPassed
    ? <StatusIndicator type="success">Validation passed ({passed}/{results.length})</StatusIndicator>
    : <StatusIndicator type="error">Validation: {failed}/{results.length} failed</StatusIndicator>;

  return (
    <ExpandableSection variant="footer" headerText={header}>
      {results.map((r) => <ResultItem key={r.name} result={r} />)}
    </ExpandableSection>
  );
}
