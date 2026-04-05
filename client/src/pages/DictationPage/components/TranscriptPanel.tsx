import SpaceBetween from "@cloudscape-design/components/space-between";
import FormField from "@cloudscape-design/components/form-field";
import Textarea from "@cloudscape-design/components/textarea";
import Spinner from "@cloudscape-design/components/spinner";
import Box from "@cloudscape-design/components/box";
import type { TranscriptPanelProps } from "../types";

export function TranscriptPanel({
  rawTranscript,
  processedText,
  phase,
}: TranscriptPanelProps) {
  return (
    <SpaceBetween size="m">
      <FormField label="Raw Transcript">
        <Textarea
          value={rawTranscript}
          readOnly
          rows={6}
          placeholder="Transcript will appear here during recording..."
        />
      </FormField>
      {phase === "processing" && (
        <Box>
          <Spinner /> Processing...
        </Box>
      )}
      <FormField label="Processed Output">
        <Textarea
          value={processedText}
          readOnly
          rows={6}
          placeholder="Processed text will appear here after recording..."
        />
      </FormField>
    </SpaceBetween>
  );
}
