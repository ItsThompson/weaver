import React from "react";
import type { TableProps } from "@cloudscape-design/components/table";
import type { CollectionPreferencesProps } from "@cloudscape-design/components/collection-preferences";
import type { SessionWithStatus } from "@weaver/shared/types";
import { ActionsCell } from "./components/ActionsCell";
import { ActivityIndicator } from "../../components/ActivityIndicator";

type Column = TableProps.ColumnDefinition<SessionWithStatus>;
type ContentDisplayOption = CollectionPreferencesProps.ContentDisplayOption;
type ContentDisplayItem = CollectionPreferencesProps.ContentDisplayItem;

const PID: Column = {
  id: "pid",
  header: "PID",
  cell: (item) => item.pid,
  sortingField: "pid",
  width: 80,
};

const NAME: Column = {
  id: "customName",
  header: "Name",
  cell: (item) => item.customName || item.id.slice(0, 8),
  sortingField: "customName",
  width: 200,
};

const ACTIVITY: Column = {
  id: "activity",
  header: "Activity",
  cell: (item) =>
    React.createElement(ActivityIndicator, { activity: item.activity }),
  width: 130,
};

const DIRECTORY: Column = {
  id: "cwd",
  header: "Directory",
  cell: (item) =>
    React.createElement(
      "span",
      { title: item.cwd },
      item.cwd.split("/").pop() || item.cwd,
    ),
  sortingField: "cwd",
  width: 200,
};

const AGENT: Column = {
  id: "agentName",
  header: "Agent",
  cell: (item) => item.agentName ?? "—",
  width: 120,
};

const STARTED: Column = {
  id: "startTime",
  header: "Started",
  cell: (item) => new Date(item.startTime).toLocaleString(),
  sortingField: "startTime",
  width: 200,
};

const LAST_EVENT: Column = {
  id: "lastEventTime",
  header: "Last Event",
  cell: (item) => new Date(item.lastEventTime).toLocaleString(),
  sortingField: "lastEventTime",
  width: 200,
};

const ACTIONS: Column = {
  id: "actions",
  header: "",
  cell: (item) => React.createElement(ActionsCell, { session: item }),
  width: 90,
  minWidth: 90,
  maxWidth: 90,
};

export const OPEN_COLUMNS: Column[] = [
  PID,
  NAME,
  ACTIVITY,
  DIRECTORY,
  AGENT,
  STARTED,
  LAST_EVENT,
  ACTIONS,
];

export const CLOSED_COLUMNS: Column[] = [
  NAME,
  DIRECTORY,
  AGENT,
  STARTED,
  LAST_EVENT,
  ACTIONS,
];

function toDisplayOptions(columns: Column[]): ContentDisplayOption[] {
  return columns.map((col) => ({
    id: col.id!,
    label: (col.header as string) || col.id!,
    alwaysVisible:
      col.id === "pid" || col.id === "customName" || col.id === "actions",
  }));
}

function toDefaultContentDisplay(columns: Column[]): ContentDisplayItem[] {
  return columns.map((col) => ({ id: col.id!, visible: true }));
}

export const OPEN_DISPLAY_OPTIONS = toDisplayOptions(OPEN_COLUMNS);
export const CLOSED_DISPLAY_OPTIONS = toDisplayOptions(CLOSED_COLUMNS);
export const OPEN_DEFAULT_CONTENT_DISPLAY =
  toDefaultContentDisplay(OPEN_COLUMNS);
export const CLOSED_DEFAULT_CONTENT_DISPLAY =
  toDefaultContentDisplay(CLOSED_COLUMNS);
