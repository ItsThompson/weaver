import { BrowserWindow } from 'electron';

let win: BrowserWindow | null = null;

export function createWindow(url: string): void {
  win = new BrowserWindow({
    width: 900,
    height: 600,
    show: false,
    alwaysOnTop: false,
    titleBarStyle: 'hidden',
    skipTaskbar: true,
    type: 'panel',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadURL(url);

  win.on('close', (e) => {
    e.preventDefault();
    win?.hide();
  });
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
