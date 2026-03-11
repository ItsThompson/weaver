import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import TextFilter from "@cloudscape-design/components/text-filter";
import Pagination from "@cloudscape-design/components/pagination";
import Box from "@cloudscape-design/components/box";
import CollectionPreferences, {
  type CollectionPreferencesProps,
} from "@cloudscape-design/components/collection-preferences";
import { useCollection } from "@cloudscape-design/collection-hooks";
import type { SessionWithStatus } from "@weaver/shared/types";
import { DEFAULT_CONFIG } from "@weaver/shared/types";
import { useConfigQuery, revalidateConfig } from "../../../hooks/queries";
import { updateConfig } from "../../../utils/api";
import { toContentDisplay, toVisibleIds } from "../utils";

type ContentDisplayItem = CollectionPreferencesProps.ContentDisplayItem;

const PAGE_SIZE_OPTIONS = [
  { value: 10, label: "10 sessions" },
  { value: 25, label: "25 sessions" },
  { value: 50, label: "50 sessions" },
];

interface SessionTableProps {
  sessions: SessionWithStatus[];
  columnDefinitions: TableProps.ColumnDefinition<SessionWithStatus>[];
  contentDisplayOptions: CollectionPreferencesProps.ContentDisplayOption[];
  defaultContentDisplay: ContentDisplayItem[];
  configKey: "open_display_options" | "close_display_options";
}

function filteringFunction(
  item: SessionWithStatus,
  filterText: string,
): boolean {
  const lower = filterText.toLowerCase();
  return (
    (item.customName?.toLowerCase().includes(lower) ?? false) ||
    item.cwd.toLowerCase().includes(lower) ||
    item.id.toLowerCase().includes(lower)
  );
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
  const [contentDisplay, setContentDisplay] = useState<ContentDisplayItem[]>(
    defaultContentDisplay,
  );
  const [pageSize, setPageSize] = useState(DEFAULT_CONFIG.page_size);

  const { items, filterProps, paginationProps, collectionProps } =
    useCollection(sessions, {
      filtering: {
        filteringFunction,
        empty: (
          <Box textAlign="center" color="inherit">
            No sessions
          </Box>
        ),
        noMatch: (
          <Box textAlign="center" color="inherit">
            No matching sessions
          </Box>
        ),
      },
      pagination: { pageSize },
    });

  useEffect(() => {
    if (!configData?.config) return;
    const stored = configData.config[configKey];
    if (stored?.length)
      setContentDisplay(toContentDisplay(stored, defaultContentDisplay));
    if (configData.config.page_size) setPageSize(configData.config.page_size);
  }, [configData, configKey, defaultContentDisplay]);

  const handleConfirm = async ({
    detail,
  }: {
    detail: CollectionPreferencesProps.Preferences;
  }) => {
    const next = [...(detail.contentDisplay ?? defaultContentDisplay)];
    const nextPageSize = detail.pageSize ?? pageSize;
    setContentDisplay(next);
    setPageSize(nextPageSize);

    if (configData?.config) {
      try {
        await updateConfig({
          ...configData.config,
          [configKey]: toVisibleIds(next),
          page_size: nextPageSize,
        });
        await revalidateConfig();
      } catch (e) {
        console.warn("Failed to save preferences:", e);
      }
    }
  };

  return (
    <Table
      {...collectionProps}
      items={items}
      columnDefinitions={columnDefinitions}
      columnDisplay={contentDisplay}
      stickyColumns={{ last: 1 }}
      variant="borderless"
      filter={<TextFilter {...filterProps} />}
      pagination={<Pagination {...paginationProps} />}
      preferences={
        <CollectionPreferences
          title="Preferences"
          confirmLabel="Confirm"
          cancelLabel="Cancel"
          preferences={{ pageSize, contentDisplay }}
          pageSizePreference={{
            title: "Page size",
            options: PAGE_SIZE_OPTIONS,
          }}
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
