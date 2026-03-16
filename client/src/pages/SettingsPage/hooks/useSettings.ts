import { useState, useEffect } from "react";
import { DEFAULT_CONFIG, type WeaverConfig } from "@weaver/shared/types";
import { useConfigQuery, revalidateConfig } from "../../../hooks/queries";
import { updateConfig, ApiResponseError } from "../../../utils/api";

export interface SettingsState {
  config: WeaverConfig;
  saving: boolean;
  isLoading: boolean;
  warnings: string[];
  hasWarnings: boolean;
  fieldErrors: Record<string, Record<string, string>>;
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
  const { data, isLoading } = useConfigQuery();
  const [config, setConfig] = useState<WeaverConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, Record<string, string>>
  >({});

  const warnings = data?.warnings ?? [];
  const hasWarnings = warnings.length > 0;

  useEffect(() => {
    if (data?.config) {
      setConfig(data.config);
    }
  }, [data]);

  useEffect(() => {
    if (data?.fieldErrors && Object.keys(data.fieldErrors).length > 0) {
      setFieldErrors(data.fieldErrors);
    }
  }, [data]);

  const handleSave = async () => {
    setSaving(true);
    setFieldErrors({});
    try {
      await updateConfig(config);
      await revalidateConfig();
      addNotification("Settings saved", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save";
      addNotification(message, "error");

      if (err instanceof ApiResponseError && err.fieldErrors) {
        setFieldErrors(err.fieldErrors);
      }
    } finally {
      setSaving(false);
    }
  };

  return {
    state: { config, saving, isLoading, warnings, hasWarnings, fieldErrors },
    actions: { setConfig, handleSave },
  };
}
