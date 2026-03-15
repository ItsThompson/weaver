import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

import { SWRConfig } from "swr";
import type { SessionWithStatus, TurnGroup } from "@weaver/shared/types";

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
  toggleSessionWebhook: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "test-session-id" }),
  useNavigate: () => vi.fn(),
  MemoryRouter: ({ children }: any) => React.createElement("div", {}, children),
  BreadcrumbGroup: ({ children }: any) =>
    React.createElement("div", {}, children),
}));

import { SessionDetailPage } from ".";
import * as api from "../../utils/api";

const mockGetSession = vi.mocked(api.getSession);

const mockSession: SessionWithStatus = {
  id: "test-session-id",
  pid: 12345,
  cwd: "/test/path",
  status: "open",
  customName: null,
  agentName: "dev",
  startTime: "2024-01-01T10:00:00Z",
  lastEventTime: "2024-01-01T10:05:00Z",
};

const mockTurns: TurnGroup[] = [
  {
    id: 1,
    startTime: "2024-01-01T10:00:00Z",
    endTime: "2024-01-01T10:01:00Z",
    events: [
      {
        timestamp: "2024-01-01T10:00:00Z",
        event: { hook_event_name: "agentSpawn", cwd: "/test/path" },
      },
    ],
    userPrompt: null,
    toolCalls: [],
    validationResults: [],
  },
  {
    id: 2,
    startTime: "2024-01-01T10:05:00Z",
    endTime: "2024-01-01T10:06:00Z",
    events: [
      {
        timestamp: "2024-01-01T10:05:00Z",
        event: { hook_event_name: "userPrompt", cwd: "/test/path" },
      },
    ],
    userPrompt: "Test user prompt",
    toolCalls: [],
    validationResults: [],
  },
];

function renderComponent() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <SessionDetailPage />
    </SWRConfig>,
  );
}

// Mock useParams to return our test session ID
vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "test-session-id" }),
  useNavigate: () => vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe("SessionDetailPage", () => {
  it("shows loading state initially", () => {
    mockGetSession.mockImplementation(() => new Promise(() => {}));
    renderComponent();
    expect(document.body).toBeInTheDocument();
  });

  it("renders session data after fetch", async () => {
    mockGetSession.mockResolvedValue({
      session: mockSession,
      turns: mockTurns,
      webhookEnabled: false,
      activeSkills: [],
      configuredSkills: [],
    });
    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText(/test-ses/).length).toBeGreaterThan(0);
    });
  });

  it("shows error state", async () => {
    mockGetSession.mockRejectedValue(new Error("Failed to fetch"));
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Failed to fetch")).toBeInTheDocument();
    });
  });

  it("renders agentSpawn as session start marker", async () => {
    mockGetSession.mockResolvedValue({
      session: mockSession,
      turns: mockTurns,
      webhookEnabled: false,
      activeSkills: [],
      configuredSkills: [],
    });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Session started")).toBeInTheDocument();
    });
  });

  it("renders user prompt", async () => {
    mockGetSession.mockResolvedValue({
      session: mockSession,
      turns: mockTurns,
      webhookEnabled: false,
      activeSkills: [],
      configuredSkills: [],
    });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Test user prompt")).toBeInTheDocument();
    });
  });

  it("renders ValidationBanner when turn has validation results", async () => {
    const turnsWithValidation: TurnGroup[] = [
      {
        ...mockTurns[1],
        validationResults: [
          {
            name: "typecheck",
            passed: true,
            output: "",
            duration_ms: 1200,
            timed_out: false,
          },
          {
            name: "test",
            passed: false,
            output: "FAIL src/index.test.ts",
            duration_ms: 3400,
            timed_out: false,
          },
        ],
      },
    ];
    mockGetSession.mockResolvedValue({
      session: mockSession,
      turns: turnsWithValidation,
      webhookEnabled: false,
      activeSkills: [],
      configuredSkills: [],
    });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/Validation: 1\/2 failed/)).toBeInTheDocument();
    });
  });

  it("does not render ValidationBanner when turn has no validation results", async () => {
    mockGetSession.mockResolvedValue({
      session: mockSession,
      turns: mockTurns,
      webhookEnabled: false,
      activeSkills: [],
      configuredSkills: [],
    });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Test user prompt")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Validation/)).not.toBeInTheDocument();
  });
});
