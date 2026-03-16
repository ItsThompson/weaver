import React from "react";
import { render, screen } from "@testing-library/react";

import { DEFAULT_CONFIG, type WeaverConfig } from "@weaver/shared/types";

import { SkillPathsField } from "./SkillPathsField";

function renderField(overrides?: {
  config?: WeaverConfig;
  disabled?: boolean;
  pathErrors?: Record<string, string>;
}) {
  const setConfig = vi.fn<React.Dispatch<React.SetStateAction<WeaverConfig>>>();
  const config = overrides?.config ?? DEFAULT_CONFIG;
  const disabled = overrides?.disabled ?? false;
  const pathErrors = overrides?.pathErrors ?? {};

  render(
    <SkillPathsField
      config={config}
      setConfig={setConfig}
      disabled={disabled}
      pathErrors={pathErrors}
    />,
  );

  return { setConfig };
}

describe("SkillPathsField", () => {
  it("renders label and description", () => {
    renderField();

    expect(screen.getByText("Skill directories")).toBeInTheDocument();
    expect(
      screen.getByText(/Full paths to directories containing skill/),
    ).toBeInTheDocument();
  });

  it("renders with empty skill_paths", () => {
    renderField({
      config: { ...DEFAULT_CONFIG, skill_paths: [] },
    });

    expect(screen.getByText("Skill directories")).toBeInTheDocument();
  });

  it("renders with configured paths", () => {
    renderField({
      config: {
        ...DEFAULT_CONFIG,
        skill_paths: ["~/projects/my-app/.kiro/skills"],
      },
    });

    expect(screen.getByText("Skill directories")).toBeInTheDocument();
  });

  it("shows inline errors when pathErrors is provided", () => {
    renderField({
      config: {
        ...DEFAULT_CONFIG,
        skill_paths: ["/bad/path"],
      },
      pathErrors: { "0": "/bad/path does not exist or is not a directory" },
    });

    expect(
      screen.getByText("/bad/path does not exist or is not a directory"),
    ).toBeInTheDocument();
  });
});
