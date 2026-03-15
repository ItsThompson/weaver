import React from "react";
import { render, screen } from "@testing-library/react";
import type { ActivityLogEntry } from "../../context/ActivityLogContext";

const mockEntries: ActivityLogEntry[] = [];

vi.mock("../../context/ActivityLogContext", () => ({
  useActivityLog: () => ({ entries: mockEntries }),
}));

import { MiniActivityLog } from "./MiniActivityLog";

beforeEach(() => {
  mockEntries.length = 0;
});

describe("MiniActivityLog", () => {
  it("renders nothing when there are no entries", () => {
    const { container } = render(<MiniActivityLog />);
    expect(container.innerHTML).toBe("");
  });

  it("renders entry messages", () => {
    mockEntries.push(
      { id: 1, message: "Session started", activity: "idle", timestamp: 1 },
      { id: 2, message: "Running tests", activity: "processing", timestamp: 2 },
    );
    render(<MiniActivityLog />);
    expect(screen.getByText("Session started")).toBeInTheDocument();
    expect(screen.getByText("Running tests")).toBeInTheDocument();
  });

  it("limits visible entries to 10", () => {
    for (let i = 0; i < 15; i++) {
      mockEntries.push({
        id: i,
        message: `Entry ${i}`,
        activity: "idle",
        timestamp: i,
      });
    }
    render(<MiniActivityLog />);
    expect(screen.getByText("Entry 0")).toBeInTheDocument();
    expect(screen.getByText("Entry 9")).toBeInTheDocument();
    expect(screen.queryByText("Entry 10")).not.toBeInTheDocument();
  });

  it("uses theme border color", () => {
    mockEntries.push({
      id: 1,
      message: "test",
      activity: "idle",
      timestamp: 1,
    });
    const { container } = render(<MiniActivityLog />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.borderTop).toBeTruthy();
  });
});
