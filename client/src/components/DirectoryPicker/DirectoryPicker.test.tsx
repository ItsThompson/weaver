import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DirectoryPicker } from "./DirectoryPicker";

vi.mock("../../utils/isElectron", () => ({
  isElectron: vi.fn(),
}));

import { isElectron } from "../../utils/isElectron";

beforeEach(() => vi.clearAllMocks());

describe("DirectoryPicker", () => {
  it("renders Browse button in Electron mode", () => {
    vi.mocked(isElectron).mockReturnValue(true);
    render(<DirectoryPicker onSelect={vi.fn()} />);
    expect(screen.getByText("Browse")).toBeTruthy();
  });

  it("is hidden in browser mode", () => {
    vi.mocked(isElectron).mockReturnValue(false);
    const { container } = render(<DirectoryPicker onSelect={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("calls onSelect with selected path", async () => {
    vi.mocked(isElectron).mockReturnValue(true);
    const mockSelect = vi.fn();
    window.weaver = {
      resizeMini: vi.fn(),
      selectDirectory: vi.fn().mockResolvedValue("/selected/path"),
    };

    render(<DirectoryPicker onSelect={mockSelect} />);
    await userEvent.click(screen.getByText("Browse"));

    await waitFor(() => {
      expect(mockSelect).toHaveBeenCalledWith("/selected/path");
    });
  });

  it("does not call onSelect when cancelled", async () => {
    vi.mocked(isElectron).mockReturnValue(true);
    const mockSelect = vi.fn();
    window.weaver = {
      resizeMini: vi.fn(),
      selectDirectory: vi.fn().mockResolvedValue(null),
    };

    render(<DirectoryPicker onSelect={mockSelect} />);
    await userEvent.click(screen.getByText("Browse"));

    await waitFor(() => {
      expect(window.weaver!.selectDirectory).toHaveBeenCalled();
    });
    expect(mockSelect).not.toHaveBeenCalled();
  });
});
