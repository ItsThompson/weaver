import type { ActivityStatus } from "@weaver/shared/types";

export const colors = {
  // Backgrounds
  backgroundPage: "#161d26",
  backgroundContainer: "#0f1b2a",
  backgroundOverlay: "rgba(0,0,0,0.5)",

  // Text
  textPrimary: "#d1d5db",
  textMuted: "#6b7280",
  textSecondary: "#8d99a8",

  // Borders
  borderDivider: "#2a2f38",
  borderDefault: "#414d5c",

  // Destructive
  destructiveDefault: "#d91515",
  destructiveHover: "#b80000",
  destructiveActive: "#a10000",

  // Neutral
  neutral: "#888",
} as const;

export const ACTIVITY_COLORS: Record<ActivityStatus, string> = {
  starting: colors.neutral,
  idle: "#2ea043",
  processing: "#d29922",
  running_tool: "#58a6ff",
  pending_approval: "#f85149",
};

export const DEFAULT_PALETTE = [
  "#ff6b6b",
  "#4ecdc4",
  "#45b7d1",
  "#96ceb4",
  "#feca57",
  "#ff9ff3",
  "#54a0ff",
  "#5f27cd",
];

export const UNCATEGORIZED_COLOR = "#888";
