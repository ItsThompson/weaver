import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  DEFAULT_CONFIG,
  VALID_OPEN_DISPLAY_OPTIONS,
  VALID_CLOSE_DISPLAY_OPTIONS,
  type WeaverConfig,
} from '@weaver/shared/types';

const CONFIG_PATH = () => join(homedir(), '.weaver', 'config.json');

export async function readConfig(): Promise<{ config: WeaverConfig; warnings: string[] }> {
  const filePath = CONFIG_PATH();
  if (!existsSync(filePath)) {
    await writeConfig(DEFAULT_CONFIG);
    return { config: { ...DEFAULT_CONFIG }, warnings: [] };
  }

  const raw = await readFile(filePath, 'utf-8');
  return parseAndValidateConfig(raw);
}

export function parseAndValidateConfig(raw: string): { config: WeaverConfig; warnings: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { config: { ...DEFAULT_CONFIG }, warnings: ['Config file contains invalid JSON'] };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { config: { ...DEFAULT_CONFIG }, warnings: ['Config must be a JSON object'] };
  }

  const obj = parsed as Record<string, unknown>;
  const warnings: string[] = [];
  const config = { ...DEFAULT_CONFIG };

  if ('enable_notification_sounds' in obj) {
    if (typeof obj.enable_notification_sounds === 'boolean') {
      config.enable_notification_sounds = obj.enable_notification_sounds;
    } else {
      warnings.push('enable_notification_sounds must be a boolean');
    }
  }

  if ('dark_mode' in obj) {
    if (typeof obj.dark_mode === 'boolean') {
      config.dark_mode = obj.dark_mode;
    } else {
      warnings.push('dark_mode must be a boolean');
    }
  }

  if ('open_display_options' in obj) {
    const result = validateDisplayOptions(obj.open_display_options, 'open_display_options', VALID_OPEN_DISPLAY_OPTIONS);
    if (result.error) warnings.push(result.error);
    else config.open_display_options = result.value!;
  }

  if ('close_display_options' in obj) {
    const result = validateDisplayOptions(obj.close_display_options, 'close_display_options', VALID_CLOSE_DISPLAY_OPTIONS);
    if (result.error) warnings.push(result.error);
    else config.close_display_options = result.value!;
  }

  return { config, warnings };
}

function validateDisplayOptions(
  value: unknown,
  field: string,
  valid: readonly string[],
): { value?: string[]; error?: string } {
  if (!Array.isArray(value)) return { error: `${field} must be an array of strings` };
  if (!value.every((v) => typeof v === 'string')) return { error: `${field} must contain only strings` };

  const invalid = value.filter((v: string) => !valid.includes(v));
  if (invalid.length > 0) return { error: `${field} contains invalid options: ${invalid.join(', ')}` };

  return { value: value as string[] };
}

export async function writeConfig(config: WeaverConfig): Promise<void> {
  await writeFile(CONFIG_PATH(), JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
