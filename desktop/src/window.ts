import { BrowserWindow } from 'electron';
import { execFile, type ChildProcess } from 'child_process';
import type { WeaverConfig } from '@weaver/shared/types';

let win: BrowserWindow | null = null;
let previousAppId: string | null = null;
let pendingActivation: ChildProcess | null = null;

function getFrontmostAppId(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('osascript', ['-e',
      'tell application "System Events" to get bundle identifier of first application process whose frontmost is true',
    ], (err, stdout) => resolve(err ? null : stdout.trim() || null));
  });
}

function activateApp(bundleId: string): void {
  pendingActivation?.kill();
  pendingActivation = execFile('osascript', ['-e',
    `tell application id "${bundleId}" to activate`,
  ], () => { pendingActivation = null; });
}

export function createWindow(url: string, config: WeaverConfig): void {
  win = new BrowserWindow({
    width: 900,
    height: 600,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: false,
    skipTaskbar: true,
    type: 'panel',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadURL(url);

  if (config.ghost_mode) {
    setGhostMode(true, config.ghost_opacity);
  }

  win.on('close', (e) => {
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
    if (previousAppId) activateApp(previousAppId);
    return false;
  } else {
    pendingActivation?.kill();
    pendingActivation = null;
    getFrontmostAppId().then((id) => { previousAppId = id; });
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
