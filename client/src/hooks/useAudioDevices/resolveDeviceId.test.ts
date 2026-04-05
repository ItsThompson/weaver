import { resolveDeviceId } from "./resolveDeviceId";

function mockDevice(deviceId: string): MediaDeviceInfo {
  return {
    deviceId,
    groupId: "group-1",
    kind: "audioinput",
    label: "Mic",
    toJSON: () => ({}),
  };
}

beforeEach(() => {
  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      enumerateDevices: vi.fn(async () => [
        mockDevice("mic-1"),
        mockDevice("mic-2"),
      ]),
    },
    writable: true,
    configurable: true,
  });
});

describe("resolveDeviceId", () => {
  it("returns undefined deviceId and not stale when savedId is empty", async () => {
    const result = await resolveDeviceId("");
    expect(result).toEqual({ deviceId: undefined, isStale: false });
  });

  it("returns savedId when device is available", async () => {
    const result = await resolveDeviceId("mic-1");
    expect(result).toEqual({ deviceId: "mic-1", isStale: false });
  });

  it("returns undefined deviceId and stale when device is unavailable", async () => {
    const result = await resolveDeviceId("gone-device");
    expect(result).toEqual({ deviceId: undefined, isStale: true });
  });

  it("returns undefined deviceId and not stale when enumerateDevices fails", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        enumerateDevices: vi.fn(async () => {
          throw new Error("Permission denied");
        }),
      },
      writable: true,
      configurable: true,
    });

    const result = await resolveDeviceId("mic-1");
    expect(result).toEqual({ deviceId: undefined, isStale: false });
  });
});
