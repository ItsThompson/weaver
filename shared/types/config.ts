import { DEFAULT_TEST_RUNNERS } from "./validation";

export interface SkillGraphCategoryConfig {
  color?: string;
  skills: string[];
}

export interface SkillGraphConfig {
  categories: Record<string, SkillGraphCategoryConfig>;
}

// Settings stored in ~/.weaver/config.json
export interface WeaverConfig {
  enable_notification_sounds: boolean;
  open_display_options: string[];
  close_display_options: string[];
  page_size: number;
  dark_mode: boolean;
  ghost_mode: boolean;
  ghost_opacity: number;
  webhook_url: string;
  webhook_format: "simple" | "advanced";
  test_runners: string[];
  skill_graph: SkillGraphConfig;
  skill_paths: string[];
}

export const VALID_OPEN_DISPLAY_OPTIONS = [
  "pid",
  "customName",
  "activity",
  "cwd",
  "agentName",
  "startTime",
  "lastEventTime",
  "actions",
] as const;
export const VALID_CLOSE_DISPLAY_OPTIONS = [
  "customName",
  "cwd",
  "agentName",
  "startTime",
  "lastEventTime",
  "actions",
] as const;

export const DEFAULT_CONFIG: WeaverConfig = {
  enable_notification_sounds: true,
  open_display_options: [...VALID_OPEN_DISPLAY_OPTIONS],
  close_display_options: [...VALID_CLOSE_DISPLAY_OPTIONS],
  page_size: 25,
  dark_mode: true,
  ghost_mode: false,
  ghost_opacity: 0.5,
  webhook_url: "",
  webhook_format: "simple" as const,
  test_runners: [...DEFAULT_TEST_RUNNERS],
  skill_graph: { categories: {} },
  skill_paths: [],
};
