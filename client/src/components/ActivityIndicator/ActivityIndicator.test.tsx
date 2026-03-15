import React from "react";
import { render, screen } from "@testing-library/react";
import { ActivityIndicator } from "./ActivityIndicator";
import type { ActivityStatus } from "@weaver/shared/types";

describe("ActivityIndicator", () => {
  it("renders label for each activity status", () => {
    const statuses: Array<{ status: ActivityStatus; label: string }> = [
      { status: "starting", label: "Starting" },
      { status: "idle", label: "Idle" },
      { status: "processing", label: "Processing" },
      { status: "running_tool", label: "Running tool" },
      { status: "pending_approval", label: "Pending approval" },
    ];

    statuses.forEach(({ status, label }) => {
      const { unmount } = render(<ActivityIndicator activity={status} />);
      expect(screen.getByText(`● ${label}`)).toBeInTheDocument();
      unmount();
    });
  });

  it("defaults to idle when no activity prop is provided", () => {
    render(<ActivityIndicator />);
    expect(screen.getByText("● Idle")).toBeInTheDocument();
  });

  it("applies a color style for the given status", () => {
    const { container } = render(<ActivityIndicator activity="processing" />);
    const span = container.querySelector("span")!;
    expect(span.style.color).toBeTruthy();
  });
});
