import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("calls onConfirm when Delete is clicked", async () => {
    const user = userEvent.setup();
    render(
      <DeleteOrphanModal
        target={{ pid: 100, eventCount: 5 }}
        deleting={false}
        onDismiss={onDismiss}
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByText("Delete"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(
      <DeleteOrphanModal
        target={{ pid: 100, eventCount: 5 }}
        deleting={false}
        onDismiss={onDismiss}
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByText("Cancel"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
