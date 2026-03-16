import {
  validatePageSize,
  validateGhostOpacity,
  validateWebhookUrl,
  validateWebhookFormat,
  validateTestRunners,
  validateSkillGraph,
  validateSkillPaths,
} from "./field";

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
