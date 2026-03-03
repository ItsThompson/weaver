import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import TextFilter from "@cloudscape-design/components/text-filter";
import Box from "@cloudscape-design/components/box";
import CollectionPreferences, {
  type CollectionPreferencesProps,
} from "@cloudscape-design/components/collection-preferences";
import type { SessionWithStatus } from "@weaver/shared/types";
import { useConfigQuery, revalidateConfig } from "../../../hooks/queries";
import { updateConfig } from "../../../utils/api";
import { toContentDisplay, toVisibleIds } from "../utils";

type ContentDisplayItem = CollectionPreferencesProps.ContentDisplayItem;

interface SessionTableProps {
  sessions: SessionWithStatus[];
  columnDefinitions: TableProps.ColumnDefinition<SessionWithStatus>[];
  contentDisplayOptions: CollectionPreferencesProps.ContentDisplayOption[];
  defaultContentDisplay: ContentDisplayItem[];
  configKey: 'open_display_options' | 'close_display_options';
}

export function SessionTable({
  sessions,
  columnDefinitions,
  contentDisplayOptions,
  defaultContentDisplay,
  configKey,
}: SessionTableProps) {
  const navigate = useNavigate();
  const { data: configData } = useConfigQuery();
  const [filterText, setFilterText] = useState("");
  const [contentDisplay, setContentDisplay] = useState<ContentDisplayItem[]>(defaultContentDisplay);

  useEffect(() => {
    if (!configData?.config) return;
    const stored = configData.config[configKey];
    if (stored?.length) setContentDisplay(toContentDisplay(stored, defaultContentDisplay));
  }, [configData, configKey, defaultContentDisplay]);

  const handleConfirm = async ({ detail }: { detail: CollectionPreferencesProps.Preferences }) => {
    const next = [...(detail.contentDisplay ?? defaultContentDisplay)];
    setContentDisplay(next);

    if (configData?.config) {
      try {
        await updateConfig({ ...configData.config, [configKey]: toVisibleIds(next) });
        await revalidateConfig();
      } catch { /* preference save is best-effort */ }
    }
  };

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
          onConfirm={handleConfirm}
        />
      }
      onRowClick={({ detail }) => navigate(`/sessions/${detail.item.id}`)}
      trackBy="id"
    />
  );
}
