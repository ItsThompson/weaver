import { render, screen } from "@testing-library/react";
import { DEFAULT_CONFIG, type WeaverConfig } from "@weaver/shared/types";
import { SkillPathsField } from "./SkillPathsField";

vi.mock("../../../../utils/isElectron", () => ({
  isElectron: () => false,
}));

function renderField(config?: Partial<WeaverConfig>) {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const setConfig = vi.fn();
  render(
    <SkillPathsField
      config={fullConfig}
      setConfig={setConfig}
      disabled={false}
    />,
  );
  return { setConfig };
}

describe("SkillPathsField", () => {
  it("renders empty state when no paths configured", () => {
    renderField();
    expect(screen.getByText(/no skill paths configured/i)).toBeTruthy();
  });

  it("renders configured paths as input fields", () => {
    renderField({ skill_paths: ["/path/a", "/path/b"] });
    const inputs = screen.getAllByDisplayValue(/\/path\//);
    expect(inputs).toHaveLength(2);
  });

  it("shows add button", () => {
    renderField();
    expect(screen.getByText("Add skill path")).toBeTruthy();
  });
});
