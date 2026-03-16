import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { DEFAULT_CONFIG, type WeaverConfig } from "@weaver/shared/types";
import { FIELD_VALIDATORS } from "./validators";

const CONFIG_PATH = () => join(homedir(), ".weaver", "config.json");

export async function readConfig(): Promise<{
  config: WeaverConfig;
  warnings: string[];
  fieldErrors: Record<string, Record<string, string>>;
}> {
  const filePath = CONFIG_PATH();
  if (!existsSync(filePath)) {
    await writeConfig(DEFAULT_CONFIG);
    return { config: { ...DEFAULT_CONFIG }, warnings: [], fieldErrors: {} };
  }

  const raw = await readFile(filePath, "utf-8");
  return parseAndValidateConfig(raw);
}

export function parseAndValidateConfig(raw: string): {
  config: WeaverConfig;
  warnings: string[];
  fieldErrors: Record<string, Record<string, string>>;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      config: { ...DEFAULT_CONFIG },
      warnings: ["Config file contains invalid JSON"],
      fieldErrors: {},
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      config: { ...DEFAULT_CONFIG },
      warnings: ["Config must be a JSON object"],
      fieldErrors: {},
    };
  }

  const obj = parsed as Record<string, unknown>;
  const warnings: string[] = [];
  const fieldErrors: Record<string, Record<string, string>> = {};
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
    if (result.fieldErrors) {
      fieldErrors[key] = result.fieldErrors;
    }
    if (result.value !== undefined) {
      config[key] = result.value;
    }
  });

  return { config, warnings, fieldErrors };
}

export async function writeConfig(config: WeaverConfig): Promise<void> {
  await writeFile(
    CONFIG_PATH(),
    JSON.stringify(config, null, 2) + "\n",
    "utf-8",
  );
}
