import { useNavigate } from "react-router-dom";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Header from "@cloudscape-design/components/header";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import BreadcrumbGroup from "@cloudscape-design/components/breadcrumb-group";
import { useOrphansPage } from "./hooks/useOrphansPage";
import { OrphanGroupCard } from "./components/OrphanGroupCard";
import { DeleteOrphanModal } from "./components/DeleteOrphanModal";

export function OrphansPage() {
  const navigate = useNavigate();
  const {
    groups,
    loading,
    error,
    sessionOptions,
    selectedSessions,
    assigning,
    deleteTarget,
    deleting,
    handleAssign,
    handleDelete,
    selectSession,
    setDeleteTarget,
  } = useOrphansPage();

  return (
    <SpaceBetween size="l">
      <BreadcrumbGroup
        items={[
          { text: "Sessions", href: "/" },
          { text: "Orphaned Events", href: "#" },
        ]}
        onFollow={(e) => {
          e.preventDefault();
          navigate(e.detail.href);
        }}
      />
      <Header
        variant="h1"
        description="Events that lost their session mapping due to a PID change mid-session. Assign each group to the correct session."
      >
        Orphaned Events
      </Header>

      {loading && <Spinner size="large" />}
      {error && <Box color="text-status-error">{error.message}</Box>}

      {!loading && groups.length === 0 && (
        <Box color="text-status-inactive" textAlign="center" padding="l">
          No orphaned events
        </Box>
      )}

      {groups.map((group) => (
        <OrphanGroupCard
          key={group.pid}
          group={group}
          sessionOptions={sessionOptions}
          selectedOption={selectedSessions[group.pid] ?? null}
          assigning={assigning === group.pid}
          onSelectSession={selectSession}
          onAssign={handleAssign}
          onDelete={setDeleteTarget}
        />
      ))}

      <DeleteOrphanModal
        target={deleteTarget}
        deleting={deleting}
        onDismiss={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </SpaceBetween>
  );
}
