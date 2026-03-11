import { useCherrypick } from "./hooks/useCherrypick";
import { UploadPhase } from "./components/UploadPhase";
import { EditPhase } from "./components/EditPhase";
import { PreviewPhase } from "./components/PreviewPhase";

export function CherrypickPage() {
  const { state, actions } = useCherrypick();
  const { pageState, error, deleteMainIds, deleteTangentIds, totalSelected } =
    state;

  if (pageState.phase === "upload") {
    return <UploadPhase error={error} onFile={actions.handleFile} />;
  }

  if (pageState.phase === "edit") {
    return (
      <EditPhase
        parsed={pageState.parsed}
        fileName={pageState.fileName}
        error={error}
        deleteMainIds={deleteMainIds}
        deleteTangentIds={deleteTangentIds}
        totalSelected={totalSelected}
        onToggleMainId={actions.toggleMainId}
        onToggleTangentId={actions.toggleTangentId}
        onToggleAllMain={() =>
          actions.toggleAllMain(pageState.parsed.mainExchanges)
        }
        onToggleAllTangent={() =>
          actions.toggleAllTangent(pageState.parsed.tangentExchanges!)
        }
        onReset={actions.handleReset}
        onPreview={actions.handlePreview}
      />
    );
  }

  return (
    <PreviewPhase
      parsed={pageState.parsed}
      pruned={pageState.pruned}
      deleteMainIds={deleteMainIds}
      deleteTangentIds={deleteTangentIds}
      totalSelected={totalSelected}
      onBack={actions.goBackToEdit}
      onDownload={actions.handleDownload}
    />
  );
}
