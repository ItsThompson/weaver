import { parseAndValidateConfig } from "./config";
import { DEFAULT_CONFIG } from "@weaver/shared/types";

describe("parseAndValidateConfig", () => {
  it("returns defaults for invalid JSON", () => {
    const { config, warnings } = parseAndValidateConfig("not json");
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(warnings).toContain("Config file contains invalid JSON");
  });

  it("returns defaults for non-object JSON", () => {
    const { config, warnings } = parseAndValidateConfig('"string"');
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(warnings).toContain("Config must be a JSON object");
  });

  it("accepts valid ghost_mode boolean", () => {
    const { config, warnings } = parseAndValidateConfig(
      JSON.stringify({ ghost_mode: true }),
    );
    expect(config.ghost_mode).toBe(true);
    expect(warnings).toHaveLength(0);
  });

  it("rejects non-boolean ghost_mode", () => {
    const { config, warnings } = parseAndValidateConfig(
      JSON.stringify({ ghost_mode: "yes" }),
    );
    expect(config.ghost_mode).toBe(DEFAULT_CONFIG.ghost_mode);
    expect(warnings).toContain("ghost_mode must be a boolean");
  });

  test.each([0, 0.5, 1])("accepts ghost_opacity %s", (val) => {
    const { config, warnings } = parseAndValidateConfig(
      JSON.stringify({ ghost_opacity: val }),
    );
    expect(config.ghost_opacity).toBe(val);
    expect(warnings).toHaveLength(0);
  });

  test.each([-0.1, 1.1])("rejects ghost_opacity %s (out of range)", (val) => {
    const { config, warnings } = parseAndValidateConfig(
      JSON.stringify({ ghost_opacity: val }),
    );
    expect(config.ghost_opacity).toBe(DEFAULT_CONFIG.ghost_opacity);
    expect(warnings).toContain(
      "ghost_opacity must be a number between 0 and 1",
    );
  });

  it("rejects non-number ghost_opacity", () => {
    const { config, warnings } = parseAndValidateConfig(
      JSON.stringify({ ghost_opacity: "half" }),
    );
    expect(config.ghost_opacity).toBe(DEFAULT_CONFIG.ghost_opacity);
    expect(warnings).toContain(
      "ghost_opacity must be a number between 0 and 1",
    );
  });

  test.each([
    ["empty string", ""],
    ["https URL", "https://hooks.slack.com/services/T00/B00/xxx"],
    ["http URL", "http://localhost:9000/hook"],
  ])("accepts webhook_url: %s", (_label, url) => {
    const { config, warnings } = parseAndValidateConfig(
      JSON.stringify({ webhook_url: url }),
    );
    expect(config.webhook_url).toBe(url);
    expect(warnings).toHaveLength(0);
  });

  it("rejects non-string webhook_url", () => {
    const { config, warnings } = parseAndValidateConfig(
      JSON.stringify({ webhook_url: 123 }),
    );
    expect(config.webhook_url).toBe(DEFAULT_CONFIG.webhook_url);
    expect(warnings).toContain("webhook_url must be a string");
  });

  test.each([
    ["ftp protocol", "ftp://example.com"],
    ["bare domain", "hooks.slack.com"],
  ])("rejects webhook_url with %s", (_label, url) => {
    const { config, warnings } = parseAndValidateConfig(
      JSON.stringify({ webhook_url: url }),
    );
    expect(config.webhook_url).toBe(DEFAULT_CONFIG.webhook_url);
    expect(warnings).toContain(
      "webhook_url must start with http:// or https://",
    );
  });

  test.each(["simple", "advanced"] as const)(
    "accepts webhook_format %s",
    (format) => {
      const { config, warnings } = parseAndValidateConfig(
        JSON.stringify({ webhook_format: format }),
      );
      expect(config.webhook_format).toBe(format);
      expect(warnings).toHaveLength(0);
    },
  );

  it("rejects invalid webhook_format", () => {
    const { config, warnings } = parseAndValidateConfig(
      JSON.stringify({ webhook_format: "verbose" }),
    );
    expect(config.webhook_format).toBe(DEFAULT_CONFIG.webhook_format);
    expect(warnings).toContain('webhook_format must be "simple" or "advanced"');
  });
});
