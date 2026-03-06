import { BrowserWindow, ipcMain } from "electron";
import { resolve } from "node:path";
import type { WeaverConfig } from "@weaver/shared/types";

let win: BrowserWindow | null = null;
let miniMode = false;
let visible = false;
let ghostEnabled = false;
let ghostOpacityValue = 1;

const MAIN_SIZE = { width: 900, height: 600 };
const MINI_WIDTH = 300;
const MINI_MIN_HEIGHT = 60;

/** Apply opacity + mouse-event passthrough based on visible and ghost state. */
function applyVisualState(): void {
  if (!win) return;
  if (!visible) {
    win.setOpacity(0);
    win.setIgnoreMouseEvents(true);
  } else if (ghostEnabled) {
    win.setOpacity(ghostOpacityValue);
    win.setIgnoreMouseEvents(true);
  } else {
    win.setOpacity(1);
    win.setIgnoreMouseEvents(false);
  }
}

export function createWindow(url: string, config: WeaverConfig): void {
  win = new BrowserWindow({
    width: MAIN_SIZE.width,
    height: MAIN_SIZE.height,
    show: false,
    backgroundColor: config.dark_mode ? "#161d26" : "#ffffff",
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    type: "panel",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: resolve(__dirname, "preload.cjs"),
    },
  });

  win.loadURL(url);

  if (config.ghost_mode) {
    ghostEnabled = true;
    ghostOpacityValue = config.ghost_opacity;
  }

  // Show the window once so it permanently exists in the OS window list.
  // Visibility is then controlled purely via opacity to avoid triggering
  // AeroSpace's window-added/removed focus logic.
  win.once("ready-to-show", () => {
    win?.showInactive();
    applyVisualState();
  });

  win.webContents.on("did-navigate-in-page", (_event, url) => {
    const isMini = new URL(url).pathname === "/mini";
    if (isMini === miniMode) return;
    miniMode = isMini;
    if (!win) return;
    const [x, y] = win.getPosition();
    if (isMini) {
      win.setBounds({ x, y, width: MINI_WIDTH, height: MINI_MIN_HEIGHT });
    } else {
      win.setBounds({ x, y, width: MAIN_SIZE.width, height: MAIN_SIZE.height });
    }
  });

  ipcMain.on("mini-resize", (_event, height: number) => {
    if (!win || !miniMode) return;
    const clamped = Math.max(MINI_MIN_HEIGHT, Math.round(height));
    const [x, y] = win.getPosition();
    win.setBounds({ x, y, width: MINI_WIDTH, height: clamped });
  });

  win.on("close", (e) => {
    e.preventDefault();
    visible = false;
    applyVisualState();
  });
}

export function setGhostMode(enabled: boolean, opacity: number): void {
  ghostEnabled = enabled;
  ghostOpacityValue = opacity;
  applyVisualState();
}

export function toggleWindow(): boolean {
  if (!win) return false;
  visible = !visible;
  applyVisualState();
  return visible;
}

export function isWindowVisible(): boolean {
  return visible;
}

export function showWindow(): void {
  visible = true;
  applyVisualState();
}

export function isMiniMode(): boolean {
  return miniMode;
}

export async function navigateToMini(serverUrl: string): Promise<void> {
  await fetch(`${serverUrl}/api/navigate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page: "mini" }),
  });
}

export function _getTestState() {
  return { visible, ghostEnabled, ghostOpacityValue, miniMode };
}

export async function navigateToMain(serverUrl: string): Promise<void> {
  await fetch(`${serverUrl}/api/navigate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page: "sessions" }),
  });
}
