import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import type { DictationLogEntry } from "@weaver/shared/types";

interface DictationHistoryCardProps {
  entry: DictationLogEntry;
}

export function DictationHistoryCard({ entry }: DictationHistoryCardProps) {
  const date = new Date(entry.timestamp);
  const heading = date.toLocaleString();

  return (
    <Container header={<Box variant="h4">{heading}</Box>}>
      <SpaceBetween size="s">
        <Box variant="p">{entry.processedText}</Box>
        <ExpandableSection headerText="Raw transcript">
          <Box variant="p" color="text-body-secondary">
            {entry.rawTranscript}
          </Box>
        </ExpandableSection>
      </SpaceBetween>
    </Container>
  );
}
