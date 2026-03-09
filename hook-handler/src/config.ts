import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  WeaverProjectConfig,
  StopValidationHook,
  PostToolValidationHook,
} from '@weaver/shared/types';

function isValidStopHook(h: unknown): h is StopValidationHook {
  return typeof h === 'object' && h !== null && typeof (h as any).name === 'string' && typeof (h as any).command === 'string';
}

function isValidPostToolHook(h: unknown): h is PostToolValidationHook {
  return typeof h === 'object' && h !== null && typeof (h as any).name === 'string' && typeof (h as any).command === 'string' && typeof (h as any).matcher === 'string';
}

export function readProjectConfig(cwd: string): WeaverProjectConfig | null {
  const configPath = join(cwd, '.weaver');
  if (!existsSync(configPath)) return null;

  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf-8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error('weaver: invalid JSON in .weaver config');
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    console.error('weaver: .weaver config must be a JSON object');
    return null;
  }

  const config = parsed as Record<string, unknown>;
  const result: WeaverProjectConfig = {};

  if (config.validation === undefined) return result;

  if (typeof config.validation !== 'object' || config.validation === null) {
    console.error('weaver: .weaver validation must be an object');
    return result;
  }

  const v = config.validation as Record<string, unknown>;
  result.validation = {};

  if (v.stop !== undefined) {
    if (!Array.isArray(v.stop)) {
      console.error('weaver: .weaver validation.stop must be an array');
    } else {
      const valid = v.stop.filter((h) => {
        if (!isValidStopHook(h)) {
          console.error(`weaver: invalid stop hook (missing name or command), skipping`);
          return false;
        }
        return true;
      });
      result.validation.stop = valid;
    }
  }

  if (v.postToolUse !== undefined) {
    if (!Array.isArray(v.postToolUse)) {
      console.error('weaver: .weaver validation.postToolUse must be an array');
    } else {
      const valid = v.postToolUse.filter((h) => {
        if (!isValidPostToolHook(h)) {
          console.error(`weaver: invalid postToolUse hook (missing name, command, or matcher), skipping`);
          return false;
        }
        return true;
      });
      result.validation.postToolUse = valid;
    }
  }

  return result;
}
