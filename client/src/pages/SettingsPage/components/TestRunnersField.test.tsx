import { jest } from "@jest/globals";
import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { DEFAULT_CONFIG, type WeaverConfig } from "@weaver/shared/types";

const { TestRunnersField } = await import("./TestRunnersField");

function renderField(overrides?: {
  config?: WeaverConfig;
  disabled?: boolean;
}) {
  const setConfig =
    jest.fn<React.Dispatch<React.SetStateAction<WeaverConfig>>>();
  const config = overrides?.config ?? DEFAULT_CONFIG;
  const disabled = overrides?.disabled ?? false;

  render(
    <TestRunnersField
      config={config}
      setConfig={setConfig}
      disabled={disabled}
    />,
  );

  return { setConfig };
}

describe("TestRunnersField", () => {
  it("renders label and description", () => {
    renderField();

    expect(screen.getByText("Test runners")).toBeInTheDocument();
    expect(
      screen.getByText(/Patterns used to detect agent-run tests/),
    ).toBeInTheDocument();
  });

  it("renders with empty test_runners", () => {
    renderField({
      config: { ...DEFAULT_CONFIG, test_runners: [] },
    });

    expect(screen.getByText("Test runners")).toBeInTheDocument();
  });

  it("renders with custom test_runners", () => {
    renderField({
      config: { ...DEFAULT_CONFIG, test_runners: ["jest", "pytest"] },
    });

    expect(screen.getByText("Test runners")).toBeInTheDocument();
  });
});
