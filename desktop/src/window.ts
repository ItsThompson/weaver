import { BrowserWindow } from 'electron';
import type { WeaverConfig } from '@weaver/shared/types';

let win: BrowserWindow | null = null;

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

export function toggleWindow(): void {
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
  } else {
    win.show();
    win.focus();
  }
}

export function showWindow(): void {
  win?.show();
  win?.focus();
}
