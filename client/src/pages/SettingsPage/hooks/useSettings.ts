import { useState, useEffect, useMemo } from "react";
import {
  DEFAULT_CONFIG,
  SERVICE_RESTART_FIELDS,
  type WeaverConfig,
} from "@weaver/shared/types";
import { useConfigQuery, revalidateConfig } from "../../../hooks/queries";
import { updateConfig } from "../../../utils/api";

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (current, key) =>
        current !== null && typeof current === "object"
          ? (current as Record<string, unknown>)[key]
          : undefined,
      obj,
    );
}

export interface SettingsState {
  config: WeaverConfig;
  saving: boolean;
  isLoading: boolean;
  warnings: string[];
  hasWarnings: boolean;
  needsServiceRestart: boolean;
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

  const needsServiceRestart = useMemo(() => {
    if (!serverConfig) {
      return false;
    }
    return SERVICE_RESTART_FIELDS.some(
      (field) =>
        getNestedValue(
          serverConfig as unknown as Record<string, unknown>,
          field,
        ) !==
        getNestedValue(config as unknown as Record<string, unknown>, field),
    );
  }, [serverConfig, config]);

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
      needsServiceRestart,
    },
    actions: { setConfig, handleSave },
  };
}
