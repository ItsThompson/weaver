import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModelDownload } from "./ModelDownload";
import { getModels } from "../../../utils/api";

vi.mock("../../../utils/api", () => ({
  getModels: vi.fn(),
}));

const mockGetModels = vi.mocked(getModels);

const MODELS = [
  {
    name: "Tiny (English)",
    size: "75 MB",
    filename: "ggml-tiny.en.bin",
    url: "https://example.com/tiny.bin",
  },
  {
    name: "Base (English)",
    size: "142 MB",
    filename: "ggml-base.en.bin",
    url: "https://example.com/base.bin",
  },
];

function createSSEStream(events: Array<Record<string, unknown>>) {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < events.length) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(events[index])}\n\n`),
        );
        index++;
      } else {
        controller.close();
      }
    },
  });
}

describe("ModelDownload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetModels.mockResolvedValue({ available: MODELS, local: [] });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows available models on load", async () => {
    render(<ModelDownload onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Tiny (English)")).toBeInTheDocument();
    });
    expect(screen.getByText("75 MB")).toBeInTheDocument();
    expect(screen.getByText("Base (English)")).toBeInTheDocument();
    expect(screen.getByText("142 MB")).toBeInTheDocument();
    expect(
      screen.getByText("Download Speech Recognition Model"),
    ).toBeInTheDocument();
  });

  it("marks already-downloaded models", async () => {
    mockGetModels.mockResolvedValue({
      available: MODELS,
      local: ["ggml-tiny.en.bin"],
    });

    render(<ModelDownload onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Downloaded")).toBeInTheDocument();
    });
    // Only one Download button (for the non-downloaded model)
    const buttons = screen.getAllByRole("button", { name: "Download" });
    expect(buttons).toHaveLength(1);
  });

  it("shows progress bar during download", async () => {
    const user = userEvent.setup();
    const stream = createSSEStream([{ progress: 42 }]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(stream, { status: 200 }),
    );

    render(<ModelDownload onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Tiny (English)")).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole("button", { name: "Download" });
    await user.click(buttons[0]);

    await waitFor(() => {
      expect(
        screen.getByText("Downloading ggml-tiny.en.bin"),
      ).toBeInTheDocument();
    });
  });

  it("calls onComplete after successful download", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const stream = createSSEStream([{ progress: 100 }, { complete: true }]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(stream, { status: 200 }),
    );

    render(<ModelDownload onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText("Tiny (English)")).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole("button", { name: "Download" });
    await user.click(buttons[0]);

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it("shows error alert when download fails", async () => {
    const user = userEvent.setup();
    const stream = createSSEStream([{ error: "Network error" }]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(stream, { status: 200 }),
    );

    render(<ModelDownload onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Tiny (English)")).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole("button", { name: "Download" });
    await user.click(buttons[0]);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shows error when fetching models fails", async () => {
    mockGetModels.mockRejectedValue(new Error("fetch failed"));

    render(<ModelDownload onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Failed to fetch models")).toBeInTheDocument();
    });
  });
});
