import { parseAndValidateConfig } from './config.js';
import { DEFAULT_CONFIG } from '@weaver/shared/types';

describe('parseAndValidateConfig', () => {
  it('returns defaults for invalid JSON', () => {
    const { config, warnings } = parseAndValidateConfig('not json');
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(warnings).toContain('Config file contains invalid JSON');
  });

  it('returns defaults for non-object JSON', () => {
    const { config, warnings } = parseAndValidateConfig('"string"');
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(warnings).toContain('Config must be a JSON object');
  });

  it('accepts valid ghost_mode boolean', () => {
    const { config, warnings } = parseAndValidateConfig(JSON.stringify({ ghost_mode: true }));
    expect(config.ghost_mode).toBe(true);
    expect(warnings).toHaveLength(0);
  });

  it('rejects non-boolean ghost_mode', () => {
    const { config, warnings } = parseAndValidateConfig(JSON.stringify({ ghost_mode: 'yes' }));
    expect(config.ghost_mode).toBe(DEFAULT_CONFIG.ghost_mode);
    expect(warnings).toContain('ghost_mode must be a boolean');
  });

  it('accepts valid ghost_opacity in range', () => {
    for (const val of [0, 0.5, 1]) {
      const { config, warnings } = parseAndValidateConfig(JSON.stringify({ ghost_opacity: val }));
      expect(config.ghost_opacity).toBe(val);
      expect(warnings).toHaveLength(0);
    }
  });

  it('rejects ghost_opacity out of range', () => {
    for (const val of [-0.1, 1.1]) {
      const { config, warnings } = parseAndValidateConfig(JSON.stringify({ ghost_opacity: val }));
      expect(config.ghost_opacity).toBe(DEFAULT_CONFIG.ghost_opacity);
      expect(warnings).toContain('ghost_opacity must be a number between 0 and 1');
    }
  });

  it('rejects non-number ghost_opacity', () => {
    const { config, warnings } = parseAndValidateConfig(JSON.stringify({ ghost_opacity: 'half' }));
    expect(config.ghost_opacity).toBe(DEFAULT_CONFIG.ghost_opacity);
    expect(warnings).toContain('ghost_opacity must be a number between 0 and 1');
  });
});
