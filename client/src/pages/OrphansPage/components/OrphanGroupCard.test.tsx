import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import type { OrphanGroup } from "@weaver/shared/types";
import { OrphanGroupCard } from "./OrphanGroupCard";

vi.mock("../../SessionDetailPage/components/TurnContainer", () => ({
  TurnContainer: ({ turn }: any) => (
    <div data-testid={`turn-${turn.id}`}>Turn {turn.id}</div>
  ),
}));

const group: OrphanGroup = {
  pid: 100,
  eventCount: 3,
  turns: [
    {
      id: 0,
      userPrompt: "test prompt",
      events: [],
      toolCalls: [],
      startTime: "2026-01-01T00:00:00Z",
      endTime: "2026-01-01T00:01:00Z",
      validationResults: [],
    },
  ],
  timeRange: {
    start: "2026-01-01T00:00:00Z",
    end: "2026-01-01T00:01:00Z",
  },
};

describe("OrphanGroupCard", () => {
  const onSelectSession = vi.fn();
  const onAssign = vi.fn();
  const onDelete = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  it("renders PID and event count", () => {
    render(
      <OrphanGroupCard
        group={group}
        sessionOptions={[]}
        selectedOption={null}
        assigning={false}
        onSelectSession={onSelectSession}
        onAssign={onAssign}
        onDelete={onDelete}
      />,
    );
    expect(screen.getByText("PID 100")).toBeInTheDocument();
    expect(screen.getByText("3 events")).toBeInTheDocument();
  });

  it("renders turns", () => {
    render(
      <OrphanGroupCard
        group={group}
        sessionOptions={[]}
        selectedOption={null}
        assigning={false}
        onSelectSession={onSelectSession}
        onAssign={onAssign}
        onDelete={onDelete}
      />,
    );
    expect(screen.getByTestId("turn-0")).toBeInTheDocument();
  });

  it("calls onAssign with PID when Assign is clicked", () => {
    render(
      <OrphanGroupCard
        group={group}
        sessionOptions={[]}
        selectedOption={{ value: "aaa", label: "Session A" }}
        assigning={false}
        onSelectSession={onSelectSession}
        onAssign={onAssign}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByText("Assign"));
    expect(onAssign).toHaveBeenCalledWith(100);
  });

  it("disables Assign when no session selected", () => {
    render(
      <OrphanGroupCard
        group={group}
        sessionOptions={[]}
        selectedOption={null}
        assigning={false}
        onSelectSession={onSelectSession}
        onAssign={onAssign}
        onDelete={onDelete}
      />,
    );
    const assignButton = screen.getByText("Assign").closest("button");
    expect(assignButton).toBeDisabled();
  });

  it("calls onDelete with target when Delete is clicked", () => {
    render(
      <OrphanGroupCard
        group={group}
        sessionOptions={[]}
        selectedOption={null}
        assigning={false}
        onSelectSession={onSelectSession}
        onAssign={onAssign}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalledWith({ pid: 100, eventCount: 3 });
  });
});
