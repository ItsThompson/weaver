import { useState, useEffect } from "react";
import { DEFAULT_CONFIG, type WeaverConfig } from "@weaver/shared/types";
import { useConfigQuery, revalidateConfig } from "../../../hooks/queries";
import { updateConfig } from "../../../utils/api";

export interface SettingsState {
  config: WeaverConfig;
  saving: boolean;
  isLoading: boolean;
  warnings: string[];
  hasWarnings: boolean;
}

export interface SettingsActions {
  setConfig: React.Dispatch<React.SetStateAction<WeaverConfig>>;
  handleSave: () => void;
}

export function useSettings(
  addNotification: (
    content: string,
    type?: "info" | "success" | "warning" | "error",
  ) => void,
): {
  state: SettingsState;
  actions: SettingsActions;
} {
  const { data, isLoading: fetching } = useConfigQuery();
  const serverConfig = data?.config;
  const [config, setConfig] = useState<WeaverConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);

  const warnings = data?.warnings ?? [];
  const hasWarnings = warnings.length > 0;

  useEffect(() => {
    if (serverConfig) {
      setConfig(serverConfig);
    }
  }, [serverConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateConfig(config);
      await revalidateConfig();
      addNotification("Settings saved", "success");
    } catch (err) {
      addNotification(
        err instanceof Error ? err.message : "Failed to save",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  return {
    state: {
      config,
      saving,
      isLoading: fetching || !serverConfig,
      warnings,
      hasWarnings,
    },
    actions: { setConfig, handleSave },
  };
}
