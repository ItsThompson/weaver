import SpaceBetween from "@cloudscape-design/components/space-between";
import Header from "@cloudscape-design/components/header";
import Button from "@cloudscape-design/components/button";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import Alert from "@cloudscape-design/components/alert";
import { useSnippetsPage } from "./hooks/useSnippetsPage";
import { SnippetCard } from "./components/SnippetCard";
import { SnippetForm } from "./components/SnippetForm";

export function SnippetsPage() {
  const {
    snippets,
    isLoading,
    error,
    formMode,
    saving,
    openAdd,
    openEdit,
    closeForm,
    handleSave,
    handleDelete,
  } = useSnippetsPage();

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        actions={
          <Button
            variant="primary"
            onClick={openAdd}
            disabled={formMode.type !== "closed"}
          >
            Add Snippet
          </Button>
        }
      >
        Snippets
      </Header>

      <Alert type="info">
        Snippets are triggered when your entire dictation matches the trigger
        phrase exactly. Choose unique phrases that won't appear in regular
        speech.
      </Alert>

      {isLoading && <Spinner size="large" />}
      {error && <Box color="text-status-error">{error.message}</Box>}

      {formMode.type === "add" && (
        <SnippetForm onSave={handleSave} onCancel={closeForm} />
      )}

      {!isLoading && snippets.length === 0 && formMode.type !== "add" && (
        <Box color="text-status-inactive" textAlign="center" padding="l">
          No snippets yet. Click "Add Snippet" to create one.
        </Box>
      )}

      {snippets.map((snippet) =>
        formMode.type === "edit" && formMode.snippet.id === snippet.id ? (
          <SnippetForm
            key={snippet.id}
            initial={snippet}
            onSave={handleSave}
            onCancel={closeForm}
          />
        ) : (
          <SnippetCard
            key={snippet.id}
            snippet={snippet}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        ),
      )}
    </SpaceBetween>
  );
}
