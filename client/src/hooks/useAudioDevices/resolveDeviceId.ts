export interface ResolvedDevice {
  deviceId: string | undefined;
  isStale: boolean;
}

export async function resolveDeviceId(
  savedId: string,
): Promise<ResolvedDevice> {
  if (!savedId) {
    return { deviceId: undefined, isStale: false };
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const found = devices.some(
      (device) => device.kind === "audioinput" && device.deviceId === savedId,
    );
    return found
      ? { deviceId: savedId, isStale: false }
      : { deviceId: undefined, isStale: true };
  } catch {
    return { deviceId: undefined, isStale: false };
  }
}
