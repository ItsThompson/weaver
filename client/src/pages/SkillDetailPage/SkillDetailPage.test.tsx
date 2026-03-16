import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import createWrapper from "@cloudscape-design/components/test-utils/dom";

import "../../__tests__/mocks/api";
import { SWRWrapper } from "../../__tests__/helpers/swr-wrapper";

import * as api from "../../utils/api";
import { SkillDetailPage } from "./SkillDetailPage";

const mockGetSkillDetail = vi.mocked(api.getSkillDetail);
const mockGetSkillGraph = vi.mocked(api.getSkillGraph);

function renderWithRoute(
  skillName: string,
  options?: { state?: { from: string }; search?: string },
) {
  const pathname = `/skills/${skillName}`;
  const search = options?.search ?? "";
  const { container } = render(
    <SWRWrapper>
      <MemoryRouter
        initialEntries={[{ pathname, search, state: options?.state }]}
      >
        <SkillDetailPage />
      </MemoryRouter>
    </SWRWrapper>,
  );
  return createWrapper(container);
}

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ skillName: "typescript" }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSkillGraph.mockResolvedValue({ nodes: [], edges: [] });
});

describe("SkillDetailPage", () => {
  it("shows project badge when skill has a project", async () => {
    mockGetSkillDetail.mockResolvedValue({
      frontmatter: { name: "typescript", description: "TS" },
      body: "# TS",
      source: "workspace" as const,
      category: null,
      project: "my-app",
    });

    renderWithRoute("typescript", { search: "?project=my-app" });

    await vi.waitFor(() => {
      expect(screen.getByRole("heading", { name: "typescript" })).toBeTruthy();
    });

    expect(screen.getByText("my-app")).toBeTruthy();
    expect(screen.getByText("Workspace")).toBeTruthy();
  });

  it("shows Global badge for source=global", async () => {
    mockGetSkillDetail.mockResolvedValue({
      frontmatter: { name: "typescript", description: "TS" },
      body: "# TS",
      source: "global" as const,
      category: null,
      project: null,
    });

    renderWithRoute("typescript", { search: "?source=global" });

    await vi.waitFor(() => {
      expect(screen.getByRole("heading", { name: "typescript" })).toBeTruthy();
    });

    expect(screen.getByText("Global")).toBeTruthy();
  });
});

describe("SkillDetailPage breadcrumbs", () => {
  it("shows Skills breadcrumb when navigated directly", async () => {
    mockGetSkillDetail.mockResolvedValue({
      frontmatter: { name: "typescript", description: "TS" },
      body: "# TS",
      source: "global" as const,
      category: null,
      project: null,
    });

    const wrapper = renderWithRoute("typescript");

    await vi.waitFor(() => {
      expect(screen.getByRole("heading", { name: "typescript" })).toBeTruthy();
    });

    const breadcrumbs = wrapper.findBreadcrumbGroup()!;
    const items = breadcrumbs.findBreadcrumbLinks();
    expect(items[0].getElement().textContent).toBe("Skills");
    expect(items[0].getElement().getAttribute("href")).toBe("/skills");
  });

  it("shows Sessions breadcrumb when navigated from a session", async () => {
    mockGetSkillDetail.mockResolvedValue({
      frontmatter: { name: "typescript", description: "TS" },
      body: "# TS",
      source: "global" as const,
      category: null,
      project: null,
    });

    const wrapper = renderWithRoute("typescript", {
      state: { from: "/sessions/abc-123" },
    });

    await vi.waitFor(() => {
      expect(screen.getByRole("heading", { name: "typescript" })).toBeTruthy();
    });

    const breadcrumbs = wrapper.findBreadcrumbGroup()!;
    const items = breadcrumbs.findBreadcrumbLinks();
    expect(items[0].getElement().textContent).toBe("Sessions");
    expect(items[0].getElement().getAttribute("href")).toBe("/");
    expect(items[1].getElement().textContent).toBe("Session");
    expect(items[1].getElement().getAttribute("href")).toBe(
      "/sessions/abc-123",
    );
  });
});
