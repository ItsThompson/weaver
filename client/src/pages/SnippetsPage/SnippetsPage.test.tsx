import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { SWRConfig } from "swr";

import "../../__tests__/mocks/api";

import * as api from "../../utils/api";
import { SnippetsPage } from "./SnippetsPage";

const mockGetSnippets = vi.mocked(api.getSnippets);
const mockCreateSnippet = vi.mocked(api.createSnippet);
const mockDeleteSnippetApi = vi.mocked(api.deleteSnippetApi);

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <SnippetsPage />
    </SWRConfig>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("SnippetsPage", () => {
  it("shows empty state when no snippets", async () => {
    mockGetSnippets.mockResolvedValue({ snippets: [] });
    await act(async () => {
      renderPage();
    });

    expect(screen.getByText("Snippets")).toBeInTheDocument();
    expect(screen.getByText(/No snippets yet/)).toBeInTheDocument();
  });

  it("shows guidance text", async () => {
    mockGetSnippets.mockResolvedValue({ snippets: [] });
    await act(async () => {
      renderPage();
    });

    expect(
      screen.getByText(/Snippets are triggered when your entire dictation/),
    ).toBeInTheDocument();
  });

  it("renders snippet cards when snippets exist", async () => {
    mockGetSnippets.mockResolvedValue({
      snippets: [
        { id: "1", trigger: "sig", expansion: "Best regards" },
        { id: "2", trigger: "addr", expansion: "123 Main St" },
      ],
    });
    await act(async () => {
      renderPage();
    });

    expect(screen.getByText("sig")).toBeInTheDocument();
    expect(screen.getByText("addr")).toBeInTheDocument();
  });

  it("opens add form when Add Snippet is clicked", async () => {
    mockGetSnippets.mockResolvedValue({ snippets: [] });
    await act(async () => {
      renderPage();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Add Snippet"));
    });

    expect(screen.getByText("Trigger phrase")).toBeInTheDocument();
    expect(screen.getByText("Expansion")).toBeInTheDocument();
  });

  it("shows validation error for empty trigger", async () => {
    mockGetSnippets.mockResolvedValue({ snippets: [] });
    await act(async () => {
      renderPage();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Add Snippet"));
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });

    expect(screen.getByText("Trigger is required")).toBeInTheDocument();
  });

  it("creates snippet via form", async () => {
    mockGetSnippets.mockResolvedValue({ snippets: [] });
    mockCreateSnippet.mockResolvedValue({
      snippet: { id: "1", trigger: "sig", expansion: "Best regards" },
    });
    await act(async () => {
      renderPage();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Add Snippet"));
    });

    const inputs = screen.getAllByRole("textbox");
    await act(async () => {
      fireEvent.change(inputs[0], { target: { value: "sig" } });
      fireEvent.change(inputs[1], { target: { value: "Best regards" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });

    expect(mockCreateSnippet).toHaveBeenCalledWith("sig", "Best regards");
  });

  it("deletes snippet when Delete is clicked", async () => {
    mockGetSnippets.mockResolvedValue({
      snippets: [{ id: "1", trigger: "sig", expansion: "Best regards" }],
    });
    mockDeleteSnippetApi.mockResolvedValue(undefined);
    await act(async () => {
      renderPage();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Delete"));
    });

    expect(mockDeleteSnippetApi).toHaveBeenCalledWith("1");
  });

  it("opens edit form pre-populated when Edit is clicked", async () => {
    mockGetSnippets.mockResolvedValue({
      snippets: [{ id: "1", trigger: "sig", expansion: "Best regards" }],
    });
    await act(async () => {
      renderPage();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Edit"));
    });

    expect(screen.getByText("Trigger phrase")).toBeInTheDocument();
    // The form should be pre-populated with existing values
    const inputs = screen.getAllByRole("textbox");
    expect(inputs[0]).toHaveValue("sig");
    expect(inputs[1]).toHaveValue("Best regards");
  });
});
