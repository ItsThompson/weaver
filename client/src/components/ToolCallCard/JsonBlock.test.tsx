import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JsonBlock, TRUNCATE_LENGTH } from "./JsonBlock";

describe("JsonBlock", () => {
  it("renders label", () => {
    render(<JsonBlock data={{ test: "data" }} label="Test Label" />);
    expect(screen.getByText("Test Label")).toBeInTheDocument();
  });

  it("renders JSON data", () => {
    render(<JsonBlock data={{ test: "data" }} label="Test" />);
    expect(screen.getByText(/"test": "data"/)).toBeInTheDocument();
  });

  it("shows expand button for long content", () => {
    const longData = { data: "x".repeat(TRUNCATE_LENGTH + 100) };
    render(<JsonBlock data={longData} label="Test" />);
    expect(screen.getByText("Show full response")).toBeInTheDocument();
  });

  it("truncates long content initially", () => {
    const longData = { data: "x".repeat(TRUNCATE_LENGTH + 100) };
    render(<JsonBlock data={longData} label="Test" />);
    const content = screen.getByText(/…$/);
    expect(content).toBeInTheDocument();
  });

  it("expands content when button clicked", async () => {
    const user = userEvent.setup();
    const longData = { data: "x".repeat(TRUNCATE_LENGTH + 100) };
    render(<JsonBlock data={longData} label="Test" />);

    await user.click(screen.getByText("Show full response"));
    expect(screen.getByText("Show less")).toBeInTheDocument();
  });

  it("does not show expand button for short content", () => {
    render(<JsonBlock data={{ short: "data" }} label="Test" />);
    expect(screen.queryByText("Show full response")).not.toBeInTheDocument();
  });
});
