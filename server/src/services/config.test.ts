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

  it('accepts empty webhook_url', () => {
    const { config, warnings } = parseAndValidateConfig(JSON.stringify({ webhook_url: '' }));
    expect(config.webhook_url).toBe('');
    expect(warnings).toHaveLength(0);
  });

  it('accepts valid https webhook_url', () => {
    const { config, warnings } = parseAndValidateConfig(JSON.stringify({ webhook_url: 'https://hooks.slack.com/services/T00/B00/xxx' }));
    expect(config.webhook_url).toBe('https://hooks.slack.com/services/T00/B00/xxx');
    expect(warnings).toHaveLength(0);
  });

  it('accepts valid http webhook_url', () => {
    const { config, warnings } = parseAndValidateConfig(JSON.stringify({ webhook_url: 'http://localhost:9000/hook' }));
    expect(config.webhook_url).toBe('http://localhost:9000/hook');
    expect(warnings).toHaveLength(0);
  });

  it('rejects non-string webhook_url', () => {
    const { config, warnings } = parseAndValidateConfig(JSON.stringify({ webhook_url: 123 }));
    expect(config.webhook_url).toBe(DEFAULT_CONFIG.webhook_url);
    expect(warnings).toContain('webhook_url must be a string');
  });

  it('rejects webhook_url without http(s) protocol', () => {
    const { config, warnings } = parseAndValidateConfig(JSON.stringify({ webhook_url: 'ftp://example.com' }));
    expect(config.webhook_url).toBe(DEFAULT_CONFIG.webhook_url);
    expect(warnings).toContain('webhook_url must start with http:// or https://');
  });

  it('rejects bare domain webhook_url', () => {
    const { config, warnings } = parseAndValidateConfig(JSON.stringify({ webhook_url: 'hooks.slack.com' }));
    expect(config.webhook_url).toBe(DEFAULT_CONFIG.webhook_url);
    expect(warnings).toContain('webhook_url must start with http:// or https://');
  });
});
