import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ToolCallCard } from ".";
import type { ToolCallPair } from "@weaver/shared/types";

const TOOL_CALL: ToolCallPair = {
  toolName: "fs_read",
  input: { path: "/tmp/test.txt" },
  response: { success: true, result: ["file contents"] },
  startTime: "2026-01-01T00:00:00.000Z",
  endTime: "2026-01-01T00:00:01.500Z",
};

describe("ToolCallCard", () => {
  it("renders tool name as badge", () => {
    render(<ToolCallCard toolCall={TOOL_CALL} />);
    expect(screen.getByText("fs_read")).toBeInTheDocument();
  });

  it("renders duration", () => {
    render(<ToolCallCard toolCall={TOOL_CALL} />);
    expect(screen.getByText("1.5s")).toBeInTheDocument();
  });

  it("shows pending for tool calls without endTime", () => {
    const pending = { ...TOOL_CALL, endTime: undefined, response: undefined };
    render(<ToolCallCard toolCall={pending} />);
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("renders input JSON", () => {
    render(<ToolCallCard toolCall={TOOL_CALL} />);
    expect(screen.getByText("Input")).toBeInTheDocument();
  });

  it("shows expand button for large responses", () => {
    const largeResponse = { success: true, result: ["x".repeat(600)] };
    const tc = { ...TOOL_CALL, response: largeResponse };
    render(<ToolCallCard toolCall={tc} />);
    expect(screen.getByText("Show full response")).toBeInTheDocument();
  });
});
