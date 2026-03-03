import { app, globalShortcut } from 'electron';
import * as server from './server';
import { createWindow, toggleWindow, showWindow } from './window';
import { createTray } from './tray';

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

  createWindow(server.SERVER_URL);
  createTray(toggleWindow);
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
