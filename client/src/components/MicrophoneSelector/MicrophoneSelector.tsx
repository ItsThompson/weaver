import Select from "@cloudscape-design/components/select";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useAudioDevices } from "../../hooks/useAudioDevices";

const SYSTEM_DEFAULT_OPTION = { value: "", label: "System Default" };

interface MicrophoneSelectorProps {
  selectedDeviceId: string;
  onChange: (deviceId: string) => void;
  disabled?: boolean;
}

export function MicrophoneSelector({
  selectedDeviceId,
  onChange,
  disabled,
}: MicrophoneSelectorProps) {
  const { devices, loading, refresh } = useAudioDevices();

  const deviceOptions = devices.map((device) => ({
    value: device.deviceId,
    label: device.label,
  }));

  const options = [SYSTEM_DEFAULT_OPTION, ...deviceOptions];

  const selectedOption =
    options.find((option) => option.value === selectedDeviceId) ??
    SYSTEM_DEFAULT_OPTION;

  return (
    <SpaceBetween direction="horizontal" size="xs">
      <Select
        selectedOption={selectedOption}
        onChange={({ detail }) => onChange(detail.selectedOption.value ?? "")}
        options={options}
        disabled={disabled}
        loadingText="Loading devices..."
        statusType={loading ? "loading" : "finished"}
      />
      <Button
        iconName="refresh"
        onClick={refresh}
        disabled={disabled}
        ariaLabel="Refresh devices"
      />
    </SpaceBetween>
  );
}
