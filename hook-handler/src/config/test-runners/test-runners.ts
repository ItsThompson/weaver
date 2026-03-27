import { readFileSync, existsSync } from "node:fs";
import { configPath } from "@weaver/shared/paths";
import type { WeaverConfig, WeaverProjectConfig } from "@weaver/shared/types";
import { DEFAULT_TEST_RUNNERS } from "@weaver/shared/types";

export function resolveTestRunners(
  projectConfig: WeaverProjectConfig | null,
): string[] {
  const globalRunners = readGlobalTestRunners();
  const projectRunners = projectConfig?.validation?.test_runners;

  if (!globalRunners.length && !projectRunners?.length) {
    return DEFAULT_TEST_RUNNERS;
  }

  const base = globalRunners.length ? globalRunners : DEFAULT_TEST_RUNNERS;
  const combined = base.concat(projectRunners ?? []);
  return [...new Set(combined)];
}

function readGlobalTestRunners(): string[] {
  const path = configPath();
  if (!existsSync(path)) {
    return [];
  }
  try {
    const parsed = JSON.parse(
      readFileSync(path, "utf-8"),
    ) as Partial<WeaverConfig>;
    if (Array.isArray(parsed.test_runners)) {
      return parsed.test_runners.filter(
        (r): r is string => typeof r === "string" && r.trim().length > 0,
      );
    }
  } catch (e) {
    console.error("Failed to parse ~/.weaver/config.json:", e);
  }
  return [];
}
