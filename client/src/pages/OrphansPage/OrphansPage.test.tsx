import React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MemoryRouter } from "react-router-dom";
import { SWRConfig } from "swr";

import "../../__tests__/mocks/api";

import * as api from "../../utils/api";
import { OrphansPage } from "./OrphansPage";

const mockGetOrphans = vi.mocked(api.getOrphans);
const mockDeleteOrphans = vi.mocked(api.deleteOrphans);

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MemoryRouter>
        <OrphansPage />
      </MemoryRouter>
    </SWRConfig>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("OrphansPage", () => {
  it("renders empty state when no orphans", async () => {
    mockGetOrphans.mockResolvedValue({ groups: [] });
    await act(async () => {
      renderPage();
    });

    expect(screen.getAllByText("Orphaned Events").length).toBeGreaterThan(0);
    expect(screen.getByText("No orphaned events")).toBeInTheDocument();
  });

  it("renders orphan groups", async () => {
    mockGetOrphans.mockResolvedValue({
      groups: [
        {
          pid: 100,
          turns: [],
          eventCount: 3,
          timeRange: {
            start: "2026-01-01T00:00:00Z",
            end: "2026-01-01T01:00:00Z",
          },
        },
      ],
    });
    await act(async () => {
      renderPage();
    });

    expect(screen.getByText("PID 100")).toBeInTheDocument();
    expect(screen.getByText("3 events")).toBeInTheDocument();
  });

  it("delete action calls API and refreshes", async () => {
    const user = userEvent.setup();
    mockGetOrphans.mockResolvedValue({
      groups: [
        {
          pid: 100,
          turns: [],
          eventCount: 2,
          timeRange: {
            start: "2026-01-01T00:00:00Z",
            end: "2026-01-01T01:00:00Z",
          },
        },
      ],
    });
    mockDeleteOrphans.mockResolvedValue({ ok: true });

    await act(async () => {
      renderPage();
    });

    // Click Delete on the group
    const deleteBtns = screen.getAllByText("Delete");
    await user.click(deleteBtns[0]);

    // Confirm in the modal
    const confirmBtns = screen.getAllByText("Delete");
    await user.click(confirmBtns[confirmBtns.length - 1]);

    expect(mockDeleteOrphans).toHaveBeenCalledWith(100);
  });
});
