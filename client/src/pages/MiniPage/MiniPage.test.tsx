import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import type { SessionWithStatus } from "@weaver/shared/types";

import "../../__tests__/mocks/api";

import * as api from "../../utils/api";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("./MiniActivityLog", () => ({
  MiniActivityLog: () => <div data-testid="mini-activity-log" />,
}));

import { MiniPage } from "./MiniPage";

const mockGetSessions = vi.mocked(api.getSessions);

const openSession: SessionWithStatus = {
  id: "sess-1",
  pid: 100,
  customName: "My Project",
  cwd: "/projects/app",
  agentName: "dev",
  startTime: "2026-01-02T00:00:00Z",
  lastEventTime: "2026-01-02T00:05:00Z",
  status: "open",
  activity: "processing",
};

const closedSession: SessionWithStatus = {
  id: "sess-2",
  pid: 200,
  customName: null,
  cwd: "/tmp/other",
  agentName: null,
  startTime: "2026-01-01T00:00:00Z",
  lastEventTime: "2026-01-01T00:10:00Z",
  status: "closed",
};

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MiniPage />
    </SWRConfig>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("MiniPage", () => {
  it("shows empty state when no open sessions", async () => {
    mockGetSessions.mockResolvedValue([closedSession]);
    renderPage();
    await vi.waitFor(() => {
      expect(screen.getByText("No open sessions")).toBeInTheDocument();
    });
  });

  it("renders open session names", async () => {
    mockGetSessions.mockResolvedValue([openSession]);
    renderPage();
    await vi.waitFor(() => {
      expect(screen.getByText("My Project")).toBeInTheDocument();
    });
  });

  it("falls back to cwd basename when customName is null", async () => {
    const noName: SessionWithStatus = {
      ...openSession,
      id: "sess-3",
      customName: null,
      cwd: "/projects/fallback-name",
    };
    mockGetSessions.mockResolvedValue([noName]);
    renderPage();
    await vi.waitFor(() => {
      expect(screen.getByText("fallback-name")).toBeInTheDocument();
    });
  });

  it("excludes closed sessions", async () => {
    mockGetSessions.mockResolvedValue([openSession, closedSession]);
    renderPage();
    await vi.waitFor(() => {
      expect(screen.getByText("My Project")).toBeInTheDocument();
    });
    expect(screen.queryByText("other")).not.toBeInTheDocument();
  });

  it("navigates to session detail on click", async () => {
    const user = userEvent.setup();
    mockGetSessions.mockResolvedValue([openSession]);
    renderPage();
    await vi.waitFor(() => {
      expect(screen.getByText("My Project")).toBeInTheDocument();
    });
    await user.click(screen.getByText("My Project"));
    expect(mockNavigate).toHaveBeenCalledWith("/sessions/sess-1");
  });

  it("uses theme background and text colors", async () => {
    mockGetSessions.mockResolvedValue([]);
    const { container } = renderPage();
    await vi.waitFor(() => {
      expect(screen.getByText("No open sessions")).toBeInTheDocument();
    });
    const root = container.firstChild as HTMLElement;
    expect(root.style.background).toBeTruthy();
    expect(root.style.color).toBeTruthy();
  });

  it("renders MiniActivityLog", async () => {
    mockGetSessions.mockResolvedValue([]);
    renderPage();
    await vi.waitFor(() => {
      expect(screen.getByTestId("mini-activity-log")).toBeInTheDocument();
    });
  });
});
