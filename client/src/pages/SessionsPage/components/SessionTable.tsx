import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import TextFilter from "@cloudscape-design/components/text-filter";
import Box from "@cloudscape-design/components/box";
import CollectionPreferences, {
  type CollectionPreferencesProps,
} from "@cloudscape-design/components/collection-preferences";
import type { SessionWithStatus } from "@weaver/shared/types";

interface SessionTableProps {
  sessions: SessionWithStatus[];
  columnDefinitions: TableProps.ColumnDefinition<SessionWithStatus>[];
  contentDisplayOptions: CollectionPreferencesProps.ContentDisplayOption[];
  defaultContentDisplay: CollectionPreferencesProps.ContentDisplayItem[];
}

export function SessionTable({
  sessions,
  columnDefinitions,
  contentDisplayOptions,
  defaultContentDisplay,
}: SessionTableProps) {
  const navigate = useNavigate();
  const [filterText, setFilterText] = useState("");
  const [contentDisplay, setContentDisplay] =
    useState<CollectionPreferencesProps.ContentDisplayItem[]>(
      defaultContentDisplay
    );

  const filtered = sessions.filter((s) => {
    if (!filterText) return true;
    const lower = filterText.toLowerCase();
    return (
      s.customName?.toLowerCase().includes(lower) ||
      s.cwd.toLowerCase().includes(lower) ||
      s.id.toLowerCase().includes(lower)
    );
  });

  return (
    <Table
      items={filtered}
      columnDefinitions={columnDefinitions}
      columnDisplay={contentDisplay}
      stickyColumns={{ last: 1 }}
      variant="borderless"
      empty={
        <Box textAlign="center" color="inherit">
          No sessions
        </Box>
      }
      filter={
        <TextFilter
          filteringText={filterText}
          onChange={({ detail }) => setFilterText(detail.filteringText)}
        />
      }
      preferences={
        <CollectionPreferences
          title="Preferences"
          confirmLabel="Confirm"
          cancelLabel="Cancel"
          preferences={{ contentDisplay }}
          contentDisplayPreference={{
            title: "Column preferences",
            description: "Customize the columns visibility.",
            options: contentDisplayOptions,
          }}
          onConfirm={({ detail }) =>
            setContentDisplay(
              [...(detail.contentDisplay ?? defaultContentDisplay)]
            )
          }
        />
      }
      onRowClick={({ detail }) => navigate(`/sessions/${detail.item.id}`)}
      trackBy="id"
    />
  );
}
