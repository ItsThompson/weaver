import {
  validatePageSize,
  validateGhostOpacity,
  validateWebhookUrl,
  validateWebhookFormat,
  validateTestRunners,
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
