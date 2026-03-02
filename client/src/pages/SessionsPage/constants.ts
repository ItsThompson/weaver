import React from "react";
import type { TableProps } from "@cloudscape-design/components/table";
import type { SessionWithStatus } from "@weaver/shared/types";
import { ActionsCell } from "./components/ActionsCell";
import { ActivityIndicator } from "../../components/ActivityIndicator";

const PID_COLUMN: TableProps.ColumnDefinition<SessionWithStatus> = {
  id: "pid",
  header: "PID",
  cell: (item) => item.pid,
  sortingField: "pid",
  width: 80,
};

const BASE_COLUMNS: TableProps.ColumnDefinition<SessionWithStatus>[] = [
  PID_COLUMN,
  {
    id: "customName",
    header: "Name",
    cell: (item) => {
      const name = item.customName || item.id.slice(0, 8);
      return React.createElement(
        "span",
        {
          title: name,
          style: {
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "block",
          },
        },
        name,
      );
    },
    sortingField: "customName",
    width: 10,
  },
  {
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
  },
  {
    id: "agentName",
    header: "Agent",
    cell: (item) => item.agentName ?? "—",
    width: 120,
  },
  {
    id: "startTime",
    header: "Started",
    cell: (item) => new Date(item.startTime).toLocaleString(),
    sortingField: "startTime",
    width: 200,
  },
  {
    id: "lastEventTime",
    header: "Last Event",
    cell: (item) => new Date(item.lastEventTime).toLocaleString(),
    sortingField: "lastEventTime",
    width: 200,
  },
  {
    id: "actions",
    header: "",
    cell: (item) => React.createElement(ActionsCell, { session: item }),
    width: 90,
    minWidth: 90,
    maxWidth: 90,
  },
];

const ACTIVITY_COLUMN: TableProps.ColumnDefinition<SessionWithStatus> = {
  id: "activity",
  header: "Activity",
  cell: (item) =>
    React.createElement(ActivityIndicator, { activity: item.activity }),
  width: 130,
};

export const OPEN_COLUMNS: TableProps.ColumnDefinition<SessionWithStatus>[] = [
  BASE_COLUMNS[0], // PID
  BASE_COLUMNS[1], // Name
  ACTIVITY_COLUMN,
  ...BASE_COLUMNS.slice(2),
];

export const CLOSED_COLUMNS: TableProps.ColumnDefinition<SessionWithStatus>[] =
  BASE_COLUMNS;
