import { validateBoolean, validateDisplayOptions } from "./factory";

describe("validateBoolean", () => {
  const validate = validateBoolean("test_field");

  it("accepts true", () => {
    expect(validate(true)).toEqual({ value: true });
  });

  it("accepts false", () => {
    expect(validate(false)).toEqual({ value: false });
  });

  it.each(["yes", 1, null, undefined, []])(
    "rejects non-boolean: %p",
    (input) => {
      expect(validate(input)).toEqual({
        warning: "test_field must be a boolean",
      });
    },
  );

  it("includes field name in warning", () => {
    const other = validateBoolean("dark_mode");
    expect(other("string")).toEqual({ warning: "dark_mode must be a boolean" });
  });
});

describe("validateDisplayOptions", () => {
  const valid = ["a", "b", "c"] as const;
  const validate = validateDisplayOptions("test_options", valid);

  it("accepts valid options", () => {
    expect(validate(["a", "b"])).toEqual({ value: ["a", "b"] });
  });

  it("accepts empty array", () => {
    expect(validate([])).toEqual({ value: [] });
  });

  it("rejects non-array", () => {
    expect(validate("a")).toEqual({
      warning: "test_options must be an array of strings",
    });
  });

  it("rejects array with non-string elements", () => {
    expect(validate(["a", 123])).toEqual({
      warning: "test_options must contain only strings",
    });
  });

  it("rejects invalid option values", () => {
    expect(validate(["a", "x", "y"])).toEqual({
      warning: "test_options contains invalid options: x, y",
    });
  });
});
