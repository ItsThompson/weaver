import SpaceBetween from "@cloudscape-design/components/space-between";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import FileUpload from "@cloudscape-design/components/file-upload";

interface UploadPhaseProps {
  error: string | null;
  onFile: (file: File) => void;
}

export function UploadPhase({ error, onFile }: UploadPhaseProps) {
  return (
    <SpaceBetween size="l">
      <Header variant="h1">Cherrypick</Header>
      <Alert type="info">
        Cherrypick currently supports kiro-cli only. It relies on kiro-cli's{" "}
        <code>/chat save</code> and <code>/chat load</code> commands.
      </Alert>
      {error && <Alert type="error">{error}</Alert>}
      <Container header={<Header variant="h2">Upload conversation</Header>}>
        <Box textAlign="center">
          <FileUpload
            accept=".json"
            value={[]}
            onChange={({ detail }) =>
              detail.value[0] && onFile(detail.value[0])
            }
            constraintText="Upload a /chat save JSON file"
            i18nStrings={{
              uploadButtonText: () => "Choose file",
              dropzoneText: () => "Drop file to upload",
              removeFileAriaLabel: (_i, name) => `Remove file ${name}`,
            }}
          />
        </Box>
      </Container>
    </SpaceBetween>
  );
}
