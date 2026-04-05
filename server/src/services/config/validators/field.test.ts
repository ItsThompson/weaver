import {
  FIELD_VALIDATORS,
  validatePageSize,
  validateGhostOpacity,
  validateWebhookUrl,
  validateWebhookFormat,
  validateTestRunners,
  validateSkillGraph,
  validateSkillPaths,
  validateDictation,
} from "./field";
import { DEFAULT_CONFIG } from "@weaver/shared/types";

describe("validatePageSize", () => {
  it.each([10, 25, 50])("accepts %d", (size) => {
    expect(validatePageSize(size)).toEqual({ value: size });
  });

  it.each([0, 15, 100, -1])("rejects invalid number %d", (size) => {
    expect(validatePageSize(size)).toEqual({
      warning: "page_size must be 10, 25, or 50",
    });
  });

  it("rejects non-number", () => {
    expect(validatePageSize("25")).toEqual({
      warning: "page_size must be 10, 25, or 50",
    });
  });
});

describe("validateGhostOpacity", () => {
  it.each([0, 0.5, 1])("accepts %d", (opacity) => {
    expect(validateGhostOpacity(opacity)).toEqual({ value: opacity });
  });

  it.each([-0.1, 1.1])("rejects out-of-range %d", (opacity) => {
    expect(validateGhostOpacity(opacity)).toEqual({
      warning: "ghost_opacity must be a number between 0 and 1",
    });
  });

  it("rejects non-number", () => {
    expect(validateGhostOpacity("half")).toEqual({
      warning: "ghost_opacity must be a number between 0 and 1",
    });
  });
});

describe("validateWebhookUrl", () => {
  it("accepts empty string", () => {
    expect(validateWebhookUrl("")).toEqual({ value: "" });
  });

  it("accepts https URL", () => {
    expect(validateWebhookUrl("https://example.com")).toEqual({
      value: "https://example.com",
    });
  });

  it("accepts http URL", () => {
    expect(validateWebhookUrl("http://localhost:9000")).toEqual({
      value: "http://localhost:9000",
    });
  });

  it("rejects non-string", () => {
    expect(validateWebhookUrl(123)).toEqual({
      warning: "webhook_url must be a string",
    });
  });

  it("rejects invalid protocol", () => {
    expect(validateWebhookUrl("ftp://example.com")).toEqual({
      warning: "webhook_url must start with http:// or https://",
    });
  });

  it("rejects bare domain", () => {
    expect(validateWebhookUrl("example.com")).toEqual({
      warning: "webhook_url must start with http:// or https://",
    });
  });
});

describe("validateWebhookFormat", () => {
  it.each(["simple", "advanced"] as const)("accepts %s", (format) => {
    expect(validateWebhookFormat(format)).toEqual({ value: format });
  });

  it("rejects invalid format", () => {
    expect(validateWebhookFormat("verbose")).toEqual({
      warning: 'webhook_format must be "simple" or "advanced"',
    });
  });
});

describe("validateTestRunners", () => {
  it("accepts valid string array", () => {
    expect(validateTestRunners(["jest", "pytest"])).toEqual({
      value: ["jest", "pytest"],
    });
  });

  it("trims whitespace from entries", () => {
    expect(validateTestRunners(["  jest  ", "pytest  "])).toEqual({
      value: ["jest", "pytest"],
    });
  });

  it("filters empty and whitespace-only entries with warning", () => {
    const result = validateTestRunners(["jest", "  ", "", "pytest"]);
    expect(result.value).toEqual(["jest", "pytest"]);
    expect(result.warning).toMatch(/removed 2 empty/);
  });

  it("rejects non-array", () => {
    expect(validateTestRunners("jest")).toEqual({
      warning: "test_runners must be an array of strings",
    });
  });

  it("rejects array with non-string elements", () => {
    expect(validateTestRunners(["jest", 123])).toEqual({
      warning: "test_runners must contain only strings",
    });
  });

  it("accepts empty array", () => {
    expect(validateTestRunners([])).toEqual({ value: [] });
  });
});

describe("validateSkillGraph", () => {
  it("accepts valid config with color and skills", () => {
    const input = {
      categories: {
        core: { color: "#ff6b6b", skills: ["coding-practices"] },
        language: { skills: ["typescript-standards"] },
      },
    };
    expect(validateSkillGraph(input)).toEqual({ value: input });
  });

  it("defaults missing categories to empty object", () => {
    expect(validateSkillGraph({})).toEqual({
      value: { categories: {} },
    });
  });

  it("rejects non-object input", () => {
    expect(validateSkillGraph("bad")).toEqual({
      warning: "skill_graph must be an object",
    });
  });

  it("rejects non-object categories", () => {
    expect(validateSkillGraph({ categories: "bad" })).toEqual({
      warning: "skill_graph.categories must be an object",
    });
  });

  it("rejects invalid hex color", () => {
    const input = {
      categories: { core: { color: "red", skills: [] } },
    };
    expect(validateSkillGraph(input)).toEqual({
      warning:
        "skill_graph.categories.core.color must be a hex string (e.g. #ff6b6b)",
    });
  });

  it("rejects non-string skill names", () => {
    const input = {
      categories: { core: { skills: [123] } },
    };
    expect(validateSkillGraph(input)).toEqual({
      warning: "skill_graph.categories.core.skills must be an array of strings",
    });
  });

  it("rejects duplicate skill across categories", () => {
    const input = {
      categories: {
        core: { skills: ["coding-practices"] },
        domain: { skills: ["coding-practices"] },
      },
    };
    expect(validateSkillGraph(input)).toEqual({
      warning: 'skill "coding-practices" is assigned to multiple categories',
    });
  });

  it("accepts categories without color", () => {
    const input = {
      categories: {
        lang: { skills: ["typescript-standards"] },
      },
    };
    expect(validateSkillGraph(input)).toEqual({ value: input });
  });
});

describe("validateSkillPaths", () => {
  it("accepts valid string array", () => {
    expect(validateSkillPaths(["/path/a", "/path/b"])).toEqual({
      value: ["/path/a", "/path/b"],
    });
  });

  it("accepts empty array", () => {
    expect(validateSkillPaths([])).toEqual({ value: [] });
  });

  it("trims whitespace from entries", () => {
    expect(validateSkillPaths(["  /path/a  ", "/path/b  "])).toEqual({
      value: ["/path/a", "/path/b"],
    });
  });

  it("filters empty and whitespace-only entries with warning", () => {
    const result = validateSkillPaths(["/path/a", "  ", "", "/path/b"]);
    expect(result.value).toEqual(["/path/a", "/path/b"]);
    expect(result.warning).toMatch(/removed 2 empty/);
  });

  it("rejects non-array", () => {
    expect(validateSkillPaths("/path/a")).toEqual({
      warning: "skill_paths must be an array of strings",
    });
  });

  it("rejects array with non-string elements", () => {
    expect(validateSkillPaths(["/path/a", 123])).toEqual({
      warning: "skill_paths must contain only strings",
    });
  });
});

describe("FIELD_VALIDATORS boolean fields", () => {
  it.each(["dark_mode", "ghost_mode", "enable_notification_sounds"])(
    "%s accepts true",
    (field) => {
      expect(FIELD_VALIDATORS[field](true)).toEqual({ value: true });
    },
  );

  it.each(["dark_mode", "ghost_mode", "enable_notification_sounds"])(
    "%s accepts false",
    (field) => {
      expect(FIELD_VALIDATORS[field](false)).toEqual({ value: false });
    },
  );

  it.each(["yes", 1, null, undefined, []])(
    "rejects non-boolean: %p",
    (input) => {
      expect(FIELD_VALIDATORS.dark_mode(input)).toEqual({
        warning: "dark_mode must be a boolean",
      });
    },
  );

  it("includes field name in warning", () => {
    expect(FIELD_VALIDATORS.enable_notification_sounds("yes")).toEqual({
      warning: "enable_notification_sounds must be a boolean",
    });
  });
});

describe("FIELD_VALIDATORS display options", () => {
  it("open_display_options accepts valid options", () => {
    expect(FIELD_VALIDATORS.open_display_options(["pid", "activity"])).toEqual({
      value: ["pid", "activity"],
    });
  });

  it("close_display_options accepts valid options", () => {
    expect(
      FIELD_VALIDATORS.close_display_options(["customName", "cwd"]),
    ).toEqual({ value: ["customName", "cwd"] });
  });

  it("accepts empty array", () => {
    expect(FIELD_VALIDATORS.open_display_options([])).toEqual({ value: [] });
  });

  it("rejects non-array", () => {
    expect(FIELD_VALIDATORS.open_display_options("pid")).toEqual({
      warning: "open_display_options must be an array of strings",
    });
  });

  it("rejects array with non-string elements", () => {
    expect(FIELD_VALIDATORS.close_display_options(["customName", 123])).toEqual(
      { warning: "close_display_options must contain only strings" },
    );
  });

  it("rejects invalid option values", () => {
    expect(
      FIELD_VALIDATORS.open_display_options(["pid", "invalid", "fake"]),
    ).toEqual({
      warning: "open_display_options contains invalid options: invalid, fake",
    });
  });
});

describe("validateDictation", () => {
  it("accepts valid dictation config", () => {
    const input = {
      ollama_url: "http://localhost:11434",
      ollama_model: "phi4-mini",
    };
    expect(validateDictation(input)).toEqual({
      value: { ...DEFAULT_CONFIG.dictation, ...input },
    });
  });

  it("merges partial config with defaults", () => {
    expect(validateDictation({ ollama_model: "llama3" })).toEqual({
      value: {
        ...DEFAULT_CONFIG.dictation,
        ollama_model: "llama3",
      },
    });
  });

  it("falls back to all defaults for empty object", () => {
    expect(validateDictation({})).toEqual({
      value: DEFAULT_CONFIG.dictation,
    });
  });

  it("rejects non-object", () => {
    expect(validateDictation("bad")).toEqual({
      warning: "dictation must be an object",
    });
  });

  it("rejects array", () => {
    expect(validateDictation([])).toEqual({
      warning: "dictation must be an object",
    });
  });

  it("rejects null", () => {
    expect(validateDictation(null)).toEqual({
      warning: "dictation must be an object",
    });
  });

  it("rejects non-string ollama_url", () => {
    expect(validateDictation({ ollama_url: 123 })).toEqual({
      warning: "dictation.ollama_url must be a non-empty string",
    });
  });

  it("rejects empty ollama_url", () => {
    expect(validateDictation({ ollama_url: "  " })).toEqual({
      warning: "dictation.ollama_url must be a non-empty string",
    });
  });

  it("rejects non-string ollama_model", () => {
    expect(validateDictation({ ollama_model: 42 })).toEqual({
      warning: "dictation.ollama_model must be a non-empty string",
    });
  });

  it("rejects empty ollama_model", () => {
    expect(validateDictation({ ollama_model: "" })).toEqual({
      warning: "dictation.ollama_model must be a non-empty string",
    });
  });

  it("ignores unknown keys", () => {
    const input = {
      ollama_url: "http://example.com",
      ollama_model: "test",
      future_key: true,
    };
    expect(validateDictation(input)).toEqual({
      value: {
        ...DEFAULT_CONFIG.dictation,
        ollama_url: "http://example.com",
        ollama_model: "test",
      },
    });
  });

  it("is registered in FIELD_VALIDATORS", () => {
    expect(FIELD_VALIDATORS.dictation).toBe(validateDictation);
  });
});
