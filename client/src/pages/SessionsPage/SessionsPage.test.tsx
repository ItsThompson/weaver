import React from "react";
import { render, screen, act } from "@testing-library/react";

import { MemoryRouter } from "react-router-dom";
import { SWRConfig } from "swr";
import type { SessionWithStatus } from "@weaver/shared/types";

vi.mock("../../utils/api", () => ({
  apiFetch: vi.fn(),
  getSessions: vi.fn(),
  getSession: vi.fn(),
  updateSessionName: vi.fn(),
  getOrphanCount: vi
    .fn<() => Promise<{ count: number }>>()
    .mockResolvedValue({ count: 0 }),
  getOrphans: vi.fn(),
  assignOrphans: vi.fn(),
  getConfig: vi
    .fn<() => Promise<{ config: object; warnings: string[] }>>()
    .mockResolvedValue({ config: {}, warnings: [] }),
  updateConfig: vi.fn(),
  deleteSession: vi.fn(),
}));

import * as api from "../../utils/api";
import { SessionsPage } from ".";

const mockGetSessions = vi.mocked(api.getSessions);

const OPEN_SESSION: SessionWithStatus = {
  id: "open-1",
  pid: 100,
  customName: "My Session",
  cwd: "/projects/app",
  agentName: "dev",
  startTime: "2026-01-02T00:00:00Z",
  lastEventTime: "2026-01-02T00:05:00Z",
  status: "open",
};

const CLOSED_SESSION: SessionWithStatus = {
  id: "closed-1",
  pid: 200,
  customName: null,
  cwd: "/tmp",
  agentName: null,
  startTime: "2026-01-01T00:00:00Z",
  lastEventTime: "2026-01-01T00:10:00Z",
  status: "closed",
};

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MemoryRouter>
        <SessionsPage />
      </MemoryRouter>
    </SWRConfig>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("SessionsPage", () => {
  it("renders header and tabs", async () => {
    mockGetSessions.mockResolvedValue([]);
    await act(async () => {
      renderPage();
    });

    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(screen.getByText(/Open/)).toBeInTheDocument();
    expect(screen.getByText(/Closed/)).toBeInTheDocument();
  });

  it("displays sessions after fetch", async () => {
    mockGetSessions.mockResolvedValue([OPEN_SESSION, CLOSED_SESSION]);
    await act(async () => {
      renderPage();
    });

    expect(screen.getAllByText("My Session").length).toBeGreaterThan(0);
  });

  it("shows tab counts", async () => {
    mockGetSessions.mockResolvedValue([OPEN_SESSION, CLOSED_SESSION]);
    await act(async () => {
      renderPage();
    });

    expect(screen.getByText("Open (1)")).toBeInTheDocument();
    expect(screen.getByText("Closed (1)")).toBeInTheDocument();
  });
});
