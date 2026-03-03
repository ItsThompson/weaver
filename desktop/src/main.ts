import { app, globalShortcut } from 'electron';
import { DEFAULT_CONFIG, type WeaverConfig } from '@weaver/shared/types';
import * as server from './server';
import { createWindow, toggleWindow, showWindow, setGhostMode } from './window';
import { createTray } from './tray';
import { fetchConfig, putConfig } from './config';

let currentConfig: WeaverConfig = { ...DEFAULT_CONFIG };

app.on('ready', async () => {
  if (app.dock) app.dock.hide();

  server.killPortOccupant();
  server.start();

  try {
    await server.waitForReady();
  } catch {
    console.error('Could not connect to server');
    app.exit(1);
    return;
  }

  currentConfig = await fetchConfig(server.SERVER_URL);

  createWindow(server.SERVER_URL, currentConfig);
  createTray(toggleWindow, () => {
    currentConfig.ghost_mode = !currentConfig.ghost_mode;
    setGhostMode(currentConfig.ghost_mode, currentConfig.ghost_opacity);
    putConfig(server.SERVER_URL, currentConfig);
    return currentConfig.ghost_mode;
  });
  globalShortcut.register('F5', toggleWindow);
  showWindow();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  server.stop();
});

app.on('window-all-closed', () => {
  // No-op: keep app alive via tray
});
