import { renderHook, act } from "@testing-library/react";
import { useNavigateOnView } from "./useNavigateOnView";
import { dispatchSSE } from "../../__tests__/helpers/dispatch-sse";

const mockNavigate = vi.fn();
let mockPathname = "/";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: mockPathname }),
  };
});

describe("useNavigateOnView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = "/";
  });

  it("navigates to session route on navigate event with sessionId", () => {
    renderHook(() => useNavigateOnView());

    act(() => dispatchSSE("navigate", { sessionId: "abc" }));
    expect(mockNavigate).toHaveBeenCalledWith("/sessions/abc");
  });

  it("navigates to page route on navigate event with page", () => {
    renderHook(() => useNavigateOnView());

    act(() => dispatchSSE("navigate", { page: "sessions" }));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("toggles from main to mini when current path is /", () => {
    mockPathname = "/";
    renderHook(() => useNavigateOnView());

    act(() => dispatchSSE("navigate", { page: "toggle" }));
    expect(mockNavigate).toHaveBeenCalledWith("/mini");
  });

  it("toggles from mini to main when current path is /mini", () => {
    mockPathname = "/mini";
    renderHook(() => useNavigateOnView());

    act(() => dispatchSSE("navigate", { page: "toggle" }));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });
});
