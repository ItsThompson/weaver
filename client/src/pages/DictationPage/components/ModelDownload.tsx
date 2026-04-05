import SpaceBetween from "@cloudscape-design/components/space-between";
import Header from "@cloudscape-design/components/header";
import Button from "@cloudscape-design/components/button";
import ProgressBar from "@cloudscape-design/components/progress-bar";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Table from "@cloudscape-design/components/table";
import { useModelDownload } from "../hooks/useModelDownload";

interface ModelDownloadProps {
  onComplete: () => void;
}

export function ModelDownload({ onComplete }: ModelDownloadProps) {
  const {
    available,
    local,
    downloading,
    progress,
    error,
    fetchModels,
    handleDownload,
  } = useModelDownload(onComplete);

  return (
    <SpaceBetween size="l">
      <Header variant="h2">Download Speech Recognition Model</Header>
      <Box>
        A speech recognition model is required for dictation. Select a model to
        download.
      </Box>

      {error && (
        <Alert
          type="error"
          action={<Button onClick={fetchModels}>Retry</Button>}
        >
          {error}
        </Alert>
      )}

      {downloading && (
        <ProgressBar
          value={progress}
          label={`Downloading ${downloading}`}
          description={`${progress}%`}
        />
      )}

      <Table
        items={available}
        columnDefinitions={[
          { id: "name", header: "Model", cell: (item) => item.name },
          { id: "size", header: "Size", cell: (item) => item.size },
          {
            id: "action",
            header: "Action",
            cell: (item) =>
              local.includes(item.filename) ? (
                <Box color="text-status-success">Downloaded</Box>
              ) : (
                <Button
                  onClick={() => handleDownload(item.filename)}
                  disabled={!!downloading}
                  loading={downloading === item.filename}
                >
                  Download
                </Button>
              ),
          },
        ]}
        empty={<Box textAlign="center">No models available</Box>}
      />
    </SpaceBetween>
  );
}
