import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockFs } from '../__test-helpers__/index';

const { existsSync, readFileSync } = await mockFs();
const { resolveTestRunners } = await import('./test-runners');

beforeEach(() => { jest.clearAllMocks(); });

describe('resolveTestRunners', () => {
  it('returns defaults when no project or global config', () => {
    existsSync.mockReturnValue(false);
    const runners = resolveTestRunners(null);
    expect(runners).toContain('jest');
    expect(runners).toContain('rspec');
  });

  it('merges project runners with defaults', () => {
    existsSync.mockReturnValue(false);
    const runners = resolveTestRunners({ validation: { test_runners: ['mix test'] } });
    expect(runners).toContain('jest');
    expect(runners).toContain('mix test');
  });

  it('merges global runners with project runners', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({ test_runners: ['custom-global'] }));
    const runners = resolveTestRunners({ validation: { test_runners: ['custom-project'] } });
    expect(runners).toContain('custom-global');
    expect(runners).toContain('custom-project');
  });

  it('deduplicates runners', () => {
    existsSync.mockReturnValue(false);
    const runners = resolveTestRunners({ validation: { test_runners: ['jest'] } });
    expect(runners.filter((r) => r === 'jest').length).toBe(1);
  });
});
