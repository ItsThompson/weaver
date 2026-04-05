import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MicrophoneSelector } from "./MicrophoneSelector";

const mockRefresh = vi.fn();
let mockDevices: { deviceId: string; label: string }[] = [];
let mockLoading = false;

vi.mock("../../hooks/useAudioDevices", () => ({
  useAudioDevices: () => ({
    get devices() {
      return mockDevices;
    },
    get loading() {
      return mockLoading;
    },
    refresh: mockRefresh,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockDevices = [
    { deviceId: "mic-1", label: "USB Microphone" },
    { deviceId: "mic-2", label: "Built-in Mic" },
  ];
  mockLoading = false;
});

describe("MicrophoneSelector", () => {
  it("renders System Default as the selected option when selectedDeviceId is empty", () => {
    render(<MicrophoneSelector selectedDeviceId="" onChange={vi.fn()} />);

    expect(screen.getByText("System Default")).toBeInTheDocument();
  });

  it("renders the selected device label when selectedDeviceId matches", () => {
    render(<MicrophoneSelector selectedDeviceId="mic-1" onChange={vi.fn()} />);

    expect(screen.getByText("USB Microphone")).toBeInTheDocument();
  });

  it("falls back to System Default when selectedDeviceId does not match any device", () => {
    render(
      <MicrophoneSelector selectedDeviceId="gone-device" onChange={vi.fn()} />,
    );

    expect(screen.getByText("System Default")).toBeInTheDocument();
  });

  it("calls refresh when refresh button is clicked", async () => {
    const user = userEvent.setup();
    render(<MicrophoneSelector selectedDeviceId="" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Refresh devices" }));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("disables select and refresh button when disabled is true", () => {
    render(
      <MicrophoneSelector selectedDeviceId="" onChange={vi.fn()} disabled />,
    );

    expect(
      screen.getByRole("button", { name: "Refresh devices" }),
    ).toHaveAttribute("disabled");
  });
});
