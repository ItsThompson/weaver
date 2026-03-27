import { renderHook } from "@testing-library/react";
import { WindowProvider, useWindows } from "./WindowContext";
import type { ReactNode } from "react";

const mockUseWindowList = vi.fn();
vi.mock("../../hooks/useWindowList", () => ({
  useWindowList: () => mockUseWindowList(),
}));

describe("WindowContext", () => {
  it("exposes useWindowList output to children", () => {
    const entries = [
      { label: "Sessions", href: "/", searchableText: "Sessions" },
    ];
    mockUseWindowList.mockReturnValue(entries);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <WindowProvider>{children}</WindowProvider>
    );

    const { result } = renderHook(() => useWindows(), { wrapper });

    expect(result.current).toEqual(entries);
  });
});
