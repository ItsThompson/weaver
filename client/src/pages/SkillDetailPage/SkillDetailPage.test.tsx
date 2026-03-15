import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import createWrapper from "@cloudscape-design/components/test-utils/dom";

import "../../__tests__/mocks/api";
import { SWRWrapper } from "../../__tests__/helpers/swr-wrapper";

import * as api from "../../utils/api";
import { SkillDetailPage } from "./SkillDetailPage";

const mockGetSkillDetail = vi.mocked(api.getSkillDetail);

function renderWithRoute(skillName: string, state?: { from: string }) {
  const { container } = render(
    <SWRWrapper>
      <MemoryRouter
        initialEntries={[{ pathname: `/skills/${skillName}`, state }]}
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

beforeEach(() => vi.clearAllMocks());

describe("SkillDetailPage breadcrumbs", () => {
  it("shows Skills breadcrumb when navigated directly", async () => {
    mockGetSkillDetail.mockResolvedValue({
      frontmatter: { name: "typescript", description: "TS" },
      body: "# TS",
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
    });

    const wrapper = renderWithRoute("typescript", {
      from: "/sessions/abc-123",
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
