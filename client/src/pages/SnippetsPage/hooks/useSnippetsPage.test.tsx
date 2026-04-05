import React from "react";
import { renderHook, act } from "@testing-library/react";
import { SWRConfig } from "swr";

import "../../../__tests__/mocks/api";

import * as api from "../../../utils/api";
import { useSnippetsPage } from "./useSnippetsPage";

const mockGetSnippets = vi.mocked(api.getSnippets);
const mockCreateSnippet = vi.mocked(api.createSnippet);
const mockUpdateSnippet = vi.mocked(api.updateSnippet);
const mockDeleteSnippetApi = vi.mocked(api.deleteSnippetApi);

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {children}
    </SWRConfig>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("useSnippetsPage", () => {
  it("returns loading state initially", () => {
    mockGetSnippets.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useSnippetsPage(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.snippets).toEqual([]);
  });

  it("returns snippets after loading", async () => {
    const snippets = [
      { id: "1", trigger: "sig", expansion: "Best regards,\nJohn" },
    ];
    mockGetSnippets.mockResolvedValue({ snippets });
    const { result } = renderHook(() => useSnippetsPage(), { wrapper });

    await vi.waitFor(() => {
      expect(result.current.snippets).toEqual(snippets);
    });
  });

  it("openAdd sets formMode to add", async () => {
    mockGetSnippets.mockResolvedValue({ snippets: [] });
    const { result } = renderHook(() => useSnippetsPage(), { wrapper });

    act(() => result.current.openAdd());
    expect(result.current.formMode).toEqual({ type: "add" });
  });

  it("openEdit sets formMode to edit with snippet", async () => {
    mockGetSnippets.mockResolvedValue({ snippets: [] });
    const { result } = renderHook(() => useSnippetsPage(), { wrapper });
    const snippet = { id: "1", trigger: "sig", expansion: "text" };

    act(() => result.current.openEdit(snippet));
    expect(result.current.formMode).toEqual({ type: "edit", snippet });
  });

  it("closeForm resets formMode", async () => {
    mockGetSnippets.mockResolvedValue({ snippets: [] });
    const { result } = renderHook(() => useSnippetsPage(), { wrapper });

    act(() => result.current.openAdd());
    act(() => result.current.closeForm());
    expect(result.current.formMode).toEqual({ type: "closed" });
  });

  it("handleSave creates snippet when in add mode", async () => {
    mockGetSnippets.mockResolvedValue({ snippets: [] });
    mockCreateSnippet.mockResolvedValue({
      snippet: { id: "1", trigger: "sig", expansion: "text" },
    });
    const { result } = renderHook(() => useSnippetsPage(), { wrapper });

    act(() => result.current.openAdd());

    await act(async () => {
      await result.current.handleSave("sig", "text");
    });

    expect(mockCreateSnippet).toHaveBeenCalledWith("sig", "text");
    expect(result.current.formMode).toEqual({ type: "closed" });
  });

  it("handleSave updates snippet when in edit mode", async () => {
    mockGetSnippets.mockResolvedValue({ snippets: [] });
    mockUpdateSnippet.mockResolvedValue({
      snippet: { id: "1", trigger: "sig2", expansion: "text2" },
    });
    const { result } = renderHook(() => useSnippetsPage(), { wrapper });
    const snippet = { id: "1", trigger: "sig", expansion: "text" };

    act(() => result.current.openEdit(snippet));

    await act(async () => {
      await result.current.handleSave("sig2", "text2");
    });

    expect(mockUpdateSnippet).toHaveBeenCalledWith("1", "sig2", "text2");
    expect(result.current.formMode).toEqual({ type: "closed" });
  });

  it("handleDelete calls API", async () => {
    mockGetSnippets.mockResolvedValue({ snippets: [] });
    mockDeleteSnippetApi.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSnippetsPage(), { wrapper });

    await act(async () => {
      await result.current.handleDelete({
        id: "1",
        trigger: "sig",
        expansion: "text",
      });
    });

    expect(mockDeleteSnippetApi).toHaveBeenCalledWith("1");
  });
});
