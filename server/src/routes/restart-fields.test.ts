import { needsServiceRestart } from "./restart-fields";
import { DEFAULT_CONFIG, type WeaverConfig } from "@weaver/shared/types";

function config(overrides: Partial<WeaverConfig> = {}): WeaverConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

describe("needsServiceRestart", () => {
  it("returns true when enable_dictation changes", () => {
    expect(
      needsServiceRestart(config(), config({ enable_dictation: true })),
    ).toBe(true);
  });

  it("returns true when dictation.llm_cleanup changes", () => {
    expect(
      needsServiceRestart(
        config(),
        config({
          dictation: { ...DEFAULT_CONFIG.dictation, llm_cleanup: false },
        }),
      ),
    ).toBe(true);
  });

  it("returns true when dictation.ollama_url changes", () => {
    expect(
      needsServiceRestart(
        config(),
        config({
          dictation: {
            ...DEFAULT_CONFIG.dictation,
            ollama_url: "http://other:11434",
          },
        }),
      ),
    ).toBe(true);
  });

  it("returns true when dictation.ollama_model changes", () => {
    expect(
      needsServiceRestart(
        config(),
        config({
          dictation: { ...DEFAULT_CONFIG.dictation, ollama_model: "gemma3:1b" },
        }),
      ),
    ).toBe(true);
  });

  it("returns false when no restart fields change", () => {
    expect(needsServiceRestart(config(), config({ dark_mode: false }))).toBe(
      false,
    );
  });

  it("returns false when configs are identical", () => {
    expect(needsServiceRestart(config(), config())).toBe(false);
  });

  it("returns false when only microphone_device_id changes", () => {
    expect(
      needsServiceRestart(
        config(),
        config({
          dictation: {
            ...DEFAULT_CONFIG.dictation,
            microphone_device_id: "device-123",
          },
        }),
      ),
    ).toBe(false);
  });
});
