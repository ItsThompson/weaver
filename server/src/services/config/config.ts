import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { DEFAULT_CONFIG, type WeaverConfig } from "@weaver/shared/types";
import { configPath } from "@weaver/shared/paths";
import { FIELD_VALIDATORS } from "./validators";
import { atomicWriteFile } from "../../utils/atomic-write";

export async function readConfig(): Promise<{
  config: WeaverConfig;
  warnings: string[];
}> {
  const filePath = configPath();
  if (!existsSync(filePath)) {
    await writeConfig(DEFAULT_CONFIG);
    return { config: { ...DEFAULT_CONFIG }, warnings: [] };
  }

  const raw = await readFile(filePath, "utf-8");
  return parseAndValidateConfig(raw);
}

export function parseAndValidateConfig(raw: string): {
  config: WeaverConfig;
  warnings: string[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      config: { ...DEFAULT_CONFIG },
      warnings: ["Config file contains invalid JSON"],
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      config: { ...DEFAULT_CONFIG },
      warnings: ["Config must be a JSON object"],
    };
  }

  const obj = parsed as Record<string, unknown>;
  const warnings: string[] = [];
  const config = { ...DEFAULT_CONFIG } as Record<string, unknown> &
    WeaverConfig;

  Object.keys(obj).forEach((key) => {
    const validator = FIELD_VALIDATORS[key];
    if (!validator) {
      return;
    }

    const result = validator(obj[key]);
    if (result.warning) {
      warnings.push(result.warning);
    }
    if (result.value !== undefined) {
      config[key] = result.value;
    }
  });

  return { config, warnings };
}

export async function writeConfig(config: WeaverConfig): Promise<void> {
  await atomicWriteFile(configPath(), JSON.stringify(config, null, 2) + "\n");
}
