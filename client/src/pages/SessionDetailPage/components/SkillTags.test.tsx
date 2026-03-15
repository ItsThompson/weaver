import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SkillTags } from "./SkillTags";

function renderComponent(props: {
  activeSkills: string[];
  configuredSkills: string[];
}) {
  return render(
    <MemoryRouter>
      <SkillTags {...props} />
    </MemoryRouter>,
  );
}

describe("SkillTags", () => {
  it("renders active skill badges as links to /skills/:skillName", () => {
    renderComponent({
      activeSkills: ["typescript", "react"],
      configuredSkills: [],
    });

    const tsLink = screen.getByText("typescript").closest("a");
    expect(tsLink).toHaveAttribute("href", "/skills/typescript");

    const reactLink = screen.getByText("react").closest("a");
    expect(reactLink).toHaveAttribute("href", "/skills/react");
  });

  it("renders configured skill badges as links to /skills/:skillName", () => {
    renderComponent({ activeSkills: [], configuredSkills: ["docker", "aws"] });

    const dockerLink = screen.getByText("docker").closest("a");
    expect(dockerLink).toHaveAttribute("href", "/skills/docker");

    const awsLink = screen.getByText("aws").closest("a");
    expect(awsLink).toHaveAttribute("href", "/skills/aws");
  });

  it("returns null when both arrays are empty", () => {
    const { container } = renderComponent({
      activeSkills: [],
      configuredSkills: [],
    });
    expect(container.innerHTML).toBe("");
  });

  it("renders links with correct href attributes for mixed skills", () => {
    renderComponent({ activeSkills: ["node"], configuredSkills: ["python"] });

    const nodeLink = screen.getByText("node").closest("a");
    expect(nodeLink).toHaveAttribute("href", "/skills/node");

    const pythonLink = screen.getByText("python").closest("a");
    expect(pythonLink).toHaveAttribute("href", "/skills/python");
  });
});
