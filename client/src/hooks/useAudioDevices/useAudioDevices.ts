import { useCallback, useEffect, useState } from "react";

export interface AudioDevice {
  deviceId: string;
  label: string;
}

export interface UseAudioDevicesResult {
  devices: AudioDevice[];
  loading: boolean;
  refresh: () => void;
}

function formatLabels(devices: MediaDeviceInfo[]): AudioDevice[] {
  const audioInputs = devices.filter(
    (device) => device.kind === "audioinput" && device.deviceId !== "default",
  );

  const labelCounts = audioInputs.reduce<Record<string, number>>(
    (acc, device) => {
      const label = device.label || "";
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    },
    {},
  );

  return audioInputs.map((device) => {
    const shortId = device.deviceId.slice(0, 8);
    if (!device.label) {
      return {
        deviceId: device.deviceId,
        label: `Unknown Device (${shortId})`,
      };
    }
    if (labelCounts[device.label] > 1) {
      return {
        deviceId: device.deviceId,
        label: `${device.label} (${shortId})`,
      };
    }
    return { deviceId: device.deviceId, label: device.label };
  });
}

export function useAudioDevices(): UseAudioDevicesResult {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [loading, setLoading] = useState(true);

  const enumerate = useCallback(async () => {
    setLoading(true);
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(formatLabels(all));
    } catch {
      setDevices([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setLoading(false);
      return;
    }
    enumerate();
  }, [enumerate]);

  return { devices, loading, refresh: enumerate };
}
