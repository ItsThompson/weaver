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
  saveResult: { type: "success" | "error"; message: string } | null;
}

export interface SettingsActions {
  setConfig: React.Dispatch<React.SetStateAction<WeaverConfig>>;
  handleSave: () => void;
  dismissSaveResult: () => void;
}

export function useSettings(): {
  state: SettingsState;
  actions: SettingsActions;
} {
  const { data, isLoading } = useConfigQuery();
  const [config, setConfig] = useState<WeaverConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] =
    useState<SettingsState["saveResult"]>(null);

  const warnings = data?.warnings ?? [];
  const hasWarnings = warnings.length > 0;

  useEffect(() => {
    if (data?.config) {
      setConfig(data.config);
    }
  }, [data]);

  const handleSave = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      await updateConfig(config);
      await revalidateConfig();
      setSaveResult({ type: "success", message: "Settings saved" });
    } catch (err) {
      setSaveResult({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to save",
      });
    } finally {
      setSaving(false);
    }
  };

  return {
    state: { config, saving, isLoading, warnings, hasWarnings, saveResult },
    actions: {
      setConfig,
      handleSave,
      dismissSaveResult: () => setSaveResult(null),
    },
  };
}
