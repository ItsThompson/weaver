import React from "react";
import { render, screen, act } from "@testing-library/react";
import createWrapper from "@cloudscape-design/components/test-utils/dom";
import { DEFAULT_CONFIG, type WeaverConfig } from "@weaver/shared/types";

import "../../../../__tests__/mocks/queries";
import { CONFIG_WITH_CATEGORIES } from "../../../../__tests__/fixtures/config";

import { SkillGraphCategoriesField } from "./SkillGraphCategoriesField";

function renderField(overrides?: {
  config?: WeaverConfig;
  disabled?: boolean;
}) {
  const setConfig = vi.fn<React.Dispatch<React.SetStateAction<WeaverConfig>>>();
  const config = overrides?.config ?? CONFIG_WITH_CATEGORIES;
  const disabled = overrides?.disabled ?? false;

  const { container } = render(
    <SkillGraphCategoriesField
      config={config}
      setConfig={setConfig}
      disabled={disabled}
    />,
  );

  return { setConfig, wrapper: createWrapper(container) };
}

beforeEach(() => vi.clearAllMocks());

describe("SkillGraphCategoriesField", () => {
  it("renders label and description", () => {
    renderField();

    expect(screen.getByText("Skill graph categories")).toBeInTheDocument();
    expect(
      screen.getByText(/Define categories with optional colors/),
    ).toBeInTheDocument();
  });

  it("renders existing categories from config", () => {
    renderField();

    const inputs = screen.getAllByRole("textbox");
    const values = inputs.map((input) => (input as HTMLInputElement).value);

    expect(values).toContain("core");
    expect(values).toContain("#ff6b6b");
    expect(values).toContain("language");
  });

  it("shows empty state when no categories configured", () => {
    renderField({ config: DEFAULT_CONFIG });

    expect(screen.getByText("No categories configured.")).toBeInTheDocument();
  });

  it("calls setConfig when add button is clicked", async () => {
    const { wrapper, setConfig } = renderField({ config: DEFAULT_CONFIG });

    const editor = wrapper.findAttributeEditor()!;
    await act(async () => {
      editor.findAddButton().click();
    });

    expect(setConfig).toHaveBeenCalled();
    expect(
      screen.queryByText("No categories configured."),
    ).not.toBeInTheDocument();
  });

  it("calls setConfig when a row is removed", async () => {
    const { wrapper, setConfig } = renderField();

    const editor = wrapper.findAttributeEditor()!;
    const row = editor.findRow(1)!;

    await act(async () => {
      row.findRemoveButton()!.click();
    });

    expect(setConfig).toHaveBeenCalled();
  });

  it("disables inputs when disabled prop is true", () => {
    renderField({ disabled: true });

    const inputs = screen.getAllByRole("textbox");
    inputs.forEach((input) => {
      expect(input).toBeDisabled();
    });
  });
});
