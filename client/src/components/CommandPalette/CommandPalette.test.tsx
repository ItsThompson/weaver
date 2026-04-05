import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import createWrapper from "@cloudscape-design/components/test-utils/dom";
import { SWRConfig } from "swr";

import "../../__tests__/mocks/api";

import * as api from "../../utils/api";
import type { WindowEntry } from "./types";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

const mockWindows: WindowEntry[] = [
  { label: "Sessions", href: "/", searchableText: "sessions" },
  { label: "Settings", href: "/settings", searchableText: "settings" },
  { label: "Orphans", href: "/orphans", searchableText: "orphans" },
];

vi.mock("../../context/WindowContext", () => ({
  useWindows: () => mockWindows,
}));

import { CommandPalette } from "./CommandPalette";

const mockGetConfig = vi.mocked(api.getConfig);

function renderPalette() {
  const result = render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CommandPalette />
    </SWRConfig>,
  );
  return { ...result, wrapper: createWrapper(result.container) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetConfig.mockResolvedValue({
    config: { ghost_mode: false } as any,
    warnings: [],
  });
});

describe("CommandPalette", () => {
  it("is not visible by default", () => {
    renderPalette();
    expect(
      screen.queryByPlaceholderText("Search pages and sessions..."),
    ).not.toBeInTheDocument();
  });

  it("opens on Cmd+K", async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.keyboard("{Meta>}k{/Meta}");
    expect(
      screen.getByPlaceholderText("Search pages and sessions..."),
    ).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.keyboard("{Meta>}k{/Meta}");
    expect(
      screen.getByPlaceholderText("Search pages and sessions..."),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(
      screen.queryByPlaceholderText("Search pages and sessions..."),
    ).not.toBeInTheDocument();
  });

  it("closes when clicking the overlay backdrop", async () => {
    const user = userEvent.setup();
    const { container } = renderPalette();
    await user.keyboard("{Meta>}k{/Meta}");
    expect(
      screen.getByPlaceholderText("Search pages and sessions..."),
    ).toBeInTheDocument();

    // The overlay is the first fixed-position div
    const overlay = container.querySelector<HTMLElement>(
      "div[style*='position: fixed'][style*='inset']",
    )!;
    await user.click(overlay);
    expect(
      screen.queryByPlaceholderText("Search pages and sessions..."),
    ).not.toBeInTheDocument();
  });

  it("renders autosuggest options from window list", async () => {
    const user = userEvent.setup();
    const { wrapper } = renderPalette();
    await user.keyboard("{Meta>}k{/Meta}");

    const autosuggest = wrapper.findAutosuggest()!;
    expect(autosuggest).toBeTruthy();
  });
});
