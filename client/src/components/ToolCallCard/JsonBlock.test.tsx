import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
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

  it("expands content when button clicked", () => {
    const longData = { data: "x".repeat(TRUNCATE_LENGTH + 100) };
    render(<JsonBlock data={longData} label="Test" />);

    const expandButton = screen.getByText("Show full response");
    fireEvent.click(expandButton);
    expect(screen.getByText("Show less")).toBeInTheDocument();
  });

  it("does not show expand button for short content", () => {
    render(<JsonBlock data={{ short: "data" }} label="Test" />);
    expect(screen.queryByText("Show full response")).not.toBeInTheDocument();
  });
});
