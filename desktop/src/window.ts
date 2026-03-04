import { BrowserWindow, ipcMain } from "electron";
import { resolve } from "node:path";
import type { WeaverConfig } from "@weaver/shared/types";

let win: BrowserWindow | null = null;
let miniMode = false;

const MAIN_SIZE = { width: 900, height: 600 };
const MINI_WIDTH = 300;
const MINI_MIN_HEIGHT = 60;

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
      preload: resolve(__dirname, "preload.js"),
    },
  });

  win.loadURL(url);

  if (config.ghost_mode) {
    setGhostMode(true, config.ghost_opacity);
  }

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
    win?.hide();
  });
}

export function setGhostMode(enabled: boolean, opacity: number): void {
  if (!win) return;
  win.setOpacity(enabled ? opacity : 1);
  win.setIgnoreMouseEvents(enabled);
}

export function toggleWindow(): boolean {
  if (!win) return false;
  if (win.isVisible()) {
    win.hide();
    return false;
  } else {
    win.show();
    win.focus();
    return true;
  }
}

export function isWindowVisible(): boolean {
  return win?.isVisible() ?? false;
}

export function showWindow(): void {
  win?.show();
  win?.focus();
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

export async function navigateToMain(serverUrl: string): Promise<void> {
  await fetch(`${serverUrl}/api/navigate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page: "sessions" }),
  });
}
