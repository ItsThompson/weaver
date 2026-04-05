import { renderHook, act } from "@testing-library/react";
import { useAudioDevices } from "./useAudioDevices";

function mockDevice(overrides: Partial<MediaDeviceInfo> = {}): MediaDeviceInfo {
  return {
    deviceId: "device-1234-abcd",
    groupId: "group-1",
    kind: "audioinput",
    label: "Built-in Microphone",
    toJSON: () => ({}),
    ...overrides,
  };
}

let mockDevices: MediaDeviceInfo[] = [];

beforeEach(() => {
  mockDevices = [];
  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      enumerateDevices: vi.fn(async () => mockDevices),
    },
    writable: true,
    configurable: true,
  });
});

describe("useAudioDevices", () => {
  it("enumerates audio input devices on mount", async () => {
    mockDevices = [
      mockDevice({ deviceId: "mic-1", label: "USB Mic" }),
      mockDevice({
        deviceId: "out-1",
        kind: "audiooutput",
        label: "Speakers",
      }),
    ];

    const { result } = renderHook(() => useAudioDevices());

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.devices).toEqual([
      { deviceId: "mic-1", label: "USB Mic" },
    ]);
  });

  it("excludes the synthetic default device", async () => {
    mockDevices = [
      mockDevice({ deviceId: "default", label: "Default" }),
      mockDevice({ deviceId: "mic-1", label: "USB Mic" }),
    ];

    const { result } = renderHook(() => useAudioDevices());

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.devices).toEqual([
      { deviceId: "mic-1", label: "USB Mic" },
    ]);
  });

  it("disambiguates duplicate labels with short device ID", async () => {
    mockDevices = [
      mockDevice({ deviceId: "aaa11111-long", label: "USB Mic" }),
      mockDevice({ deviceId: "bbb22222-long", label: "USB Mic" }),
    ];

    const { result } = renderHook(() => useAudioDevices());

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.devices).toEqual([
      { deviceId: "aaa11111-long", label: "USB Mic (aaa11111)" },
      { deviceId: "bbb22222-long", label: "USB Mic (bbb22222)" },
    ]);
  });

  it("labels devices with empty label as Unknown Device", async () => {
    mockDevices = [mockDevice({ deviceId: "xyz98765-long", label: "" })];

    const { result } = renderHook(() => useAudioDevices());

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.devices).toEqual([
      { deviceId: "xyz98765-long", label: "Unknown Device (xyz98765)" },
    ]);
  });

  it("refresh re-enumerates devices", async () => {
    mockDevices = [mockDevice({ deviceId: "mic-1", label: "Old Mic" })];

    const { result } = renderHook(() => useAudioDevices());

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    mockDevices = [mockDevice({ deviceId: "mic-2", label: "New Mic" })];

    await act(async () => {
      result.current.refresh();
    });

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.devices).toEqual([
      { deviceId: "mic-2", label: "New Mic" },
    ]);
  });

  it("returns empty devices when enumerateDevices is unavailable", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {},
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useAudioDevices());

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.devices).toEqual([]);
  });
});
