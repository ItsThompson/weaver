import { app, globalShortcut } from "electron";
import { DEFAULT_CONFIG, type WeaverConfig } from "@weaver/shared/types";
import * as server from "./server";
import {
  createWindow,
  toggleWindow,
  showWindow,
  setGhostMode,
  isWindowVisible,
  isMiniMode,
  navigateToMini,
  navigateToMain,
  _getTestState,
} from "./window";
import { createTray } from "./tray";
import { fetchConfig, putConfig } from "./config";
import { subscribeSSE } from "./sse";
import { installCli } from "./install-cli";
import { setupDictation, handleDictationHotkey } from "./dictation";
import { log } from "./utils/logger";

let currentConfig: WeaverConfig = { ...DEFAULT_CONFIG };

app.on("ready", async () => {
  if (app.dock) {
    app.dock.hide();
  }

  server.killPortOccupant();
  server.start();

  try {
    await server.waitForReady();
  } catch {
    log({
      timestamp: new Date().toISOString(),
      event: "server_connect_failed",
    });
    app.exit(1);
    return;
  }

  currentConfig = await fetchConfig(server.SERVER_URL);
  installCli();

  createWindow(server.SERVER_URL, currentConfig);
  createTray(
    toggleWindow,
    isWindowVisible,
    () => {
      currentConfig.ghost_mode = !currentConfig.ghost_mode;
      setGhostMode(currentConfig.ghost_mode, currentConfig.ghost_opacity);
      putConfig(server.SERVER_URL, currentConfig);
      return currentConfig.ghost_mode;
    },
    () => currentConfig.ghost_mode,
    () => {
      if (isMiniMode()) {
        navigateToMain(server.SERVER_URL);
      } else {
        navigateToMini(server.SERVER_URL);
      }
    },
    isMiniMode,
  );
  globalShortcut.register("F5", toggleWindow);
  globalShortcut.register("F4", handleDictationHotkey);
  setupDictation();
  showWindow(); // marks visible=true; actual show happens on ready-to-show

  subscribeSSE(server.SERVER_URL, (event, data) => {
    if (event === "configChanged") {
      const newConfig = data as WeaverConfig;
      currentConfig = newConfig;
      setGhostMode(currentConfig.ghost_mode, currentConfig.ghost_opacity);
    }
  });

  if (process.env.WEAVER_TEST) {
    (global as any).__weaverTest = {
      toggleWindow,
      showWindow,
      setGhostMode,
      isWindowVisible,
      isMiniMode,
      getState: _getTestState,
      toggleGhost: () => {
        currentConfig.ghost_mode = !currentConfig.ghost_mode;
        setGhostMode(currentConfig.ghost_mode, currentConfig.ghost_opacity);
        return currentConfig.ghost_mode;
      },
    };
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  server.stop();
});

app.on("window-all-closed", () => {
  // No-op: keep app alive via tray
});
