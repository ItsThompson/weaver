import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { DeleteOrphanModal } from "./DeleteOrphanModal";

describe("DeleteOrphanModal", () => {
  const onDismiss = vi.fn();
  const onConfirm = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  it("renders warning with PID and event count when target is set", () => {
    render(
      <DeleteOrphanModal
        target={{ pid: 100, eventCount: 5 }}
        deleting={false}
        onDismiss={onDismiss}
        onConfirm={onConfirm}
      />,
    );
    expect(
      screen.getByText(/permanently delete 5 orphaned events/),
    ).toBeInTheDocument();
    expect(screen.getByText("PID 100")).toBeInTheDocument();
  });

  it("is not visible when target is null", () => {
    const { container } = render(
      <DeleteOrphanModal
        target={null}
        deleting={false}
        onDismiss={onDismiss}
        onConfirm={onConfirm}
      />,
    );
    expect(container.querySelector("[class*='modal']")).toBeNull();
  });

  it("calls onConfirm when Delete is clicked", () => {
    render(
      <DeleteOrphanModal
        target={{ pid: 100, eventCount: 5 }}
        deleting={false}
        onDismiss={onDismiss}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText("Delete"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss when Cancel is clicked", () => {
    render(
      <DeleteOrphanModal
        target={{ pid: 100, eventCount: 5 }}
        deleting={false}
        onDismiss={onDismiss}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
