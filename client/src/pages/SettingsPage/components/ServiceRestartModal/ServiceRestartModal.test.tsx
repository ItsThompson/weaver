import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ServiceRestartModal } from "./ServiceRestartModal";

describe("ServiceRestartModal", () => {
  it("calls onConfirm when save button is clicked", async () => {
    const onConfirm = vi.fn();
    render(
      <ServiceRestartModal visible onConfirm={onConfirm} onCancel={vi.fn()} />,
    );

    await userEvent.click(screen.getByText("Save and restart services"));

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const onCancel = vi.fn();
    render(
      <ServiceRestartModal visible onConfirm={vi.fn()} onCancel={onCancel} />,
    );

    await userEvent.click(screen.getByText("Cancel"));

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("renders warning text", () => {
    render(
      <ServiceRestartModal visible onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(
      screen.getByText(/require dictation services to restart/),
    ).toBeInTheDocument();
  });
});
