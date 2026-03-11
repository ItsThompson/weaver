import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { WeaverProjectConfig } from "@weaver/shared/types";
import { DEFAULT_TEST_RUNNERS } from "@weaver/shared/types";

export function resolveTestRunners(
  projectConfig: WeaverProjectConfig | null,
): string[] {
  const globalRunners = readGlobalTestRunners();
  const projectRunners = projectConfig?.validation?.test_runners;

  if (!globalRunners.length && !projectRunners?.length)
    return DEFAULT_TEST_RUNNERS;

  const base = globalRunners.length ? globalRunners : DEFAULT_TEST_RUNNERS;
  const combined = base.concat(projectRunners ?? []);
  return [...new Set(combined)];
}

function readGlobalTestRunners(): string[] {
  const configPath = join(homedir(), ".weaver", "config.json");
  if (!existsSync(configPath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf-8"));
    if (Array.isArray(parsed?.test_runners)) {
      return parsed.test_runners.filter((r: unknown) => typeof r === "string");
    }
  } catch (e) {
    console.error("Failed to parse ~/.weaver/config.json:", e);
  }
  return [];
}
