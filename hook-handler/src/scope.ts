import { realpathSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import type { StopValidationHook } from '@weaver/shared/types';

export function resolveTestDirs(
  changedFiles: string[],
  scope: StopValidationHook['scope'],
  cwd: string,
  agentTestedDirs: string[],
): string[] {
  const dirs = new Set<string>();

  for (const file of changedFiles) {
    let abs: string;
    try {
      abs = realpathSync(resolve(cwd, file));
      if (!abs.startsWith(cwd)) { dirs.add('.'); continue; }
    } catch {
      dirs.add('.'); continue;
    }

    const rel = relative(cwd, abs);
    let dir = applyScope(rel, scope);
    if (dir.startsWith('..')) dir = '.';
    dirs.add(dir || '.');
  }

  const deduped = collapseSubdirs([...dirs]);
  return deduped.filter((d) => !agentTestedDirs.some((a) => d === a || d.startsWith(a + '/')));
}

function applyScope(rel: string, scope: StopValidationHook['scope']): string {
  if (scope === undefined || scope === 'cwd') return '.';
  const dir = dirname(rel);
  const depth = scope === 'file' ? 0 : scope === 'parent' ? 1 : scope;
  let result = dir;
  for (let i = 0; i < depth; i++) {
    const parent = dirname(result);
    if (parent === result) break;
    result = parent;
  }
  return result;
}

function collapseSubdirs(dirs: string[]): string[] {
  dirs.sort((a, b) => (a === '.' ? -1 : b === '.' ? 1 : a.split('/').length - b.split('/').length));
  const kept: string[] = [];
  for (const d of dirs) {
    if (!kept.some((k) => d === k || d.startsWith(k + '/'))) kept.push(d);
  }
  return kept;
}
