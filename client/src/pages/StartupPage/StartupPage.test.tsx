import { render, screen, act, waitFor } from "@testing-library/react";
import { StartupPage } from "./StartupPage";
import type { ServicesStatusResponse } from "@weaver/shared/types";

const mockGetServicesStatus = vi.fn<() => Promise<ServicesStatusResponse>>();

vi.mock("../../utils/api", () => ({
  getServicesStatus: (...args: unknown[]) => mockGetServicesStatus(...args),
}));

describe("StartupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state before status is fetched", () => {
    mockGetServicesStatus.mockReturnValue(new Promise(() => {}));
    render(<StartupPage onReady={vi.fn()} />);

    expect(screen.getByText("Connecting to server...")).toBeInTheDocument();
  });

  it("shows service status indicators", async () => {
    mockGetServicesStatus.mockResolvedValue({
      ready: false,
      services: {
        whisper: { state: "starting" },
        ollama: { state: "running" },
      },
    });

    render(<StartupPage onReady={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Whisper")).toBeInTheDocument();
    });
    expect(screen.getByText("Ollama")).toBeInTheDocument();
  });

  it("calls onReady when all services are ready", async () => {
    mockGetServicesStatus.mockResolvedValue({
      ready: true,
      services: {
        whisper: { state: "running" },
        ollama: { state: "running" },
      },
    });

    const onReady = vi.fn();
    render(<StartupPage onReady={onReady} />);

    await waitFor(() => expect(onReady).toHaveBeenCalledOnce());
  });

  it("calls onReady when services are in error state (terminal)", async () => {
    mockGetServicesStatus.mockResolvedValue({
      ready: true,
      services: {
        whisper: { state: "error", error: "Failed" },
        ollama: { state: "not_configured" },
      },
    });

    const onReady = vi.fn();
    render(<StartupPage onReady={onReady} />);

    await waitFor(() => expect(onReady).toHaveBeenCalledOnce());
  });

  it("shows skip link after 30 seconds", async () => {
    vi.useFakeTimers();
    mockGetServicesStatus.mockResolvedValue({
      ready: false,
      services: {
        whisper: { state: "starting" },
        ollama: { state: "starting" },
      },
    });

    render(<StartupPage onReady={vi.fn()} />);
    await vi.advanceTimersByTimeAsync(0);

    expect(screen.queryByText("Skip and continue")).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(screen.getByText("Skip and continue")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("shows error message alongside service name", async () => {
    mockGetServicesStatus.mockResolvedValue({
      ready: true,
      services: {
        whisper: { state: "error", error: "Whisper failed to start" },
        ollama: { state: "running" },
      },
    });

    render(<StartupPage onReady={vi.fn()} />);

    await waitFor(() => {
      expect(
        screen.getByText("Whisper: Whisper failed to start"),
      ).toBeInTheDocument();
    });
  });
});
