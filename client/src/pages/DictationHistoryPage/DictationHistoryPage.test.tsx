import React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SWRConfig } from "swr";
import createWrapper from "@cloudscape-design/components/test-utils/dom";

import "../../__tests__/mocks/api";

import * as api from "../../utils/api";
import { DictationHistoryPage } from "./DictationHistoryPage";

const mockGetDictationHistory = vi.mocked(api.getDictationHistory);

function renderPage() {
  const result = render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MemoryRouter>
        <DictationHistoryPage />
      </MemoryRouter>
    </SWRConfig>,
  );
  return { ...result, wrapper: createWrapper(result.container) };
}

beforeEach(() => vi.clearAllMocks());

describe("DictationHistoryPage", () => {
  it("renders breadcrumb with Dictation and Dictation History", async () => {
    mockGetDictationHistory.mockResolvedValue({ entries: [] });
    let wrapper: ReturnType<typeof createWrapper>;
    await act(async () => {
      ({ wrapper } = renderPage());
    });

    const breadcrumbs = wrapper!.findBreadcrumbGroup()!;
    const links = breadcrumbs.findBreadcrumbLinks();
    expect(links).toHaveLength(2);
    expect(links[0].getElement().textContent).toBe("Dictation");
    expect(links[1].getElement().textContent).toBe("Dictation History");
  });

  it("shows empty state when no entries exist", async () => {
    mockGetDictationHistory.mockResolvedValue({ entries: [] });
    await act(async () => {
      renderPage();
    });

    expect(
      screen.getByRole("heading", { name: "Dictation History" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/No dictation history yet/)).toBeInTheDocument();
  });

  it("renders cards for each entry with processed text visible", async () => {
    mockGetDictationHistory.mockResolvedValue({
      entries: [
        {
          timestamp: "2026-04-05T18:01:00.000Z",
          rawTranscript: "um hello",
          processedText: "Hello.",
        },
        {
          timestamp: "2026-04-05T18:00:00.000Z",
          rawTranscript: "goodbye",
          processedText: "Goodbye.",
        },
      ],
    });
    await act(async () => {
      renderPage();
    });

    expect(screen.getByText("Hello.")).toBeInTheDocument();
    expect(screen.getByText("Goodbye.")).toBeInTheDocument();
  });

  it("hides raw transcript by default and reveals via ExpandableSection", async () => {
    const user = userEvent.setup();
    mockGetDictationHistory.mockResolvedValue({
      entries: [
        {
          timestamp: "2026-04-05T18:01:00.000Z",
          rawTranscript: "um hello raw",
          processedText: "Hello.",
        },
      ],
    });
    let wrapper: ReturnType<typeof createWrapper>;
    await act(async () => {
      ({ wrapper } = renderPage());
    });

    const expandable = wrapper!.findExpandableSection()!;
    expect(expandable.findExpandedContent()).toBeNull();

    await user.click(screen.getByText("Raw transcript"));

    expect(expandable.findExpandedContent()).not.toBeNull();
    expect(screen.getByText("um hello raw")).toBeInTheDocument();
  });

  it("shows error state when API fails", async () => {
    mockGetDictationHistory.mockRejectedValue(new Error("Network error"));
    await act(async () => {
      renderPage();
    });

    expect(screen.getByText("Network error")).toBeInTheDocument();
  });
});
